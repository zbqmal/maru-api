import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QuestionType } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '../../src/common/interceptors/logging.interceptor';
import { PrismaService } from '../../src/modules/database/prisma.service';
import { EmailService } from '../../src/modules/email/email.service';

describe('DiaryController (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  const TEST_DATE = '2026-08-26';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn().mockResolvedValue(undefined) })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new LoggingInterceptor());
    await app.init();

    prismaService = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prismaService.answer.deleteMany();
    await prismaService.diaryEntry.deleteMany();
    await prismaService.groupQuestion.deleteMany();
    await prismaService.group.deleteMany();
    await prismaService.session.deleteMany();
    await prismaService.passwordResetToken.deleteMany();
    await prismaService.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndLogin(
    email: string,
    password = 'Str0ngPassword!',
    name = 'Diary User',
  ): Promise<{ sessionCookie: string; userId: string }> {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/register')
      .send({ email, password, name });

    const userId = (response.body as { id: string }).id;
    const rawSetCookie = (response.headers as Record<string, unknown>)[
      'set-cookie'
    ];
    const setCookie = Array.isArray(rawSetCookie)
      ? rawSetCookie.filter(
          (cookie): cookie is string => typeof cookie === 'string',
        )
      : typeof rawSetCookie === 'string'
        ? [rawSetCookie]
        : [];

    if (setCookie.length === 0) {
      throw new Error('Register response did not include a session cookie.');
    }

    return {
      sessionCookie: setCookie[0].split(';')[0],
      userId,
    };
  }

  async function createGroupAsLeader(
    sessionCookie: string,
    name = 'Diary Test Group',
  ): Promise<string> {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/groups')
      .set('Cookie', sessionCookie)
      .send({ name });

    return (response.body as { id: string }).id;
  }

  async function createQuestionAsLeader(
    groupId: string,
    sessionCookie: string,
    question: string,
  ): Promise<string> {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/questions`)
      .set('Cookie', sessionCookie)
      .send({ question });

    return (response.body as { id: string }).id;
  }

  it('returns empty questions and null entry when user has no diary entry for the given date', async () => {
    const leader = await registerAndLogin('diary-no-entry@example.com');
    const groupId = await createGroupAsLeader(leader.sessionCookie);

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/diary/context`)
      .query({ date: TEST_DATE })
      .set('Cookie', leader.sessionCookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      questions: [],
      entry: null,
    });
  });

  it('returns active questions and null entry when group has questions but no diary entry', async () => {
    const leader = await registerAndLogin('diary-questions@example.com');
    const groupId = await createGroupAsLeader(leader.sessionCookie);

    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post(`/groups/${groupId}/questions`)
      .set('Cookie', leader.sessionCookie)
      .send({ question: 'What made you smile today?' });

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/diary/context`)
      .query({ date: TEST_DATE })
      .set('Cookie', leader.sessionCookie);

    expect(response.status).toBe(200);

    const body = response.body as {
      questions: { id: string; question: string }[];
      entry: null;
    };
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0].question).toBe('What made you smile today?');
    expect(body.entry).toBeNull();
  });

  it('returns entry with answers when current user has a diary entry for the given date', async () => {
    const leader = await registerAndLogin('diary-with-entry@example.com');
    const groupId = await createGroupAsLeader(leader.sessionCookie);

    const questionRes = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/questions`)
      .set('Cookie', leader.sessionCookie)
      .send({ question: 'How are you?' });

    const questionId = (questionRes.body as { id: string }).id;

    const diaryDate = new Date(`${TEST_DATE}T00:00:00.000Z`);

    const entry = await prismaService.diaryEntry.create({
      data: {
        groupId,
        userId: leader.userId,
        diaryDate,
      },
    });

    await prismaService.answer.create({
      data: {
        diaryEntryId: entry.id,
        questionType: 'CUSTOM',
        groupQuestionId: questionId,
        questionSnapshot: 'How are you?',
        body: 'Doing great!',
      },
    });

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/diary/context`)
      .query({ date: TEST_DATE })
      .set('Cookie', leader.sessionCookie);

    expect(response.status).toBe(200);

    const body = response.body as {
      questions: { id: string }[];
      entry: {
        id: string;
        diaryDate: string;
        answers: {
          body: string;
          groupQuestionId: string;
          questionSnapshot: string;
        }[];
      };
    };
    expect(body.entry).not.toBeNull();
    expect(body.entry.id).toBe(entry.id);
    expect(body.entry.answers).toHaveLength(1);
    expect(body.entry.answers[0].body).toBe('Doing great!');
    expect(body.entry.answers[0].groupQuestionId).toBe(questionId);
    expect(body.entry.answers[0].questionSnapshot).toBe('How are you?');
  });

  it('returns entry only for the specific date provided, not another date', async () => {
    const leader = await registerAndLogin('diary-date-isolation@example.com');
    const groupId = await createGroupAsLeader(leader.sessionCookie);

    const otherDate = new Date('2026-08-25T00:00:00.000Z');
    const otherEntry = await prismaService.diaryEntry.create({
      data: { groupId, userId: leader.userId, diaryDate: otherDate },
    });
    await prismaService.answer.create({
      data: {
        diaryEntryId: otherEntry.id,
        questionType: 'CUSTOM',
        groupQuestionId: null,
        questionSnapshot: 'Yesterday question',
        body: 'Yesterday answer',
      },
    });

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/diary/context`)
      .query({ date: TEST_DATE })
      .set('Cookie', leader.sessionCookie);

    expect(response.status).toBe(200);
    expect((response.body as { entry: null }).entry).toBeNull();
  });

  it('returns 400 when date query param is missing', async () => {
    const leader = await registerAndLogin('diary-missing-date@example.com');
    const groupId = await createGroupAsLeader(leader.sessionCookie);

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/diary/context`)
      .set('Cookie', leader.sessionCookie);

    expect(response.status).toBe(400);
  });

  it('returns 400 when date query param is not a valid date string', async () => {
    const leader = await registerAndLogin('diary-bad-date@example.com');
    const groupId = await createGroupAsLeader(leader.sessionCookie);

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/diary/context`)
      .query({ date: 'not-a-date' })
      .set('Cookie', leader.sessionCookie);

    expect(response.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get('/groups/some-group-id/diary/context')
      .query({ date: TEST_DATE });

    expect(response.status).toBe(401);
  });

  it('returns 403 when user is not a group member', async () => {
    const [leader, nonMember] = await Promise.all([
      registerAndLogin('diary-leader-access@example.com'),
      registerAndLogin('diary-nonmember-access@example.com'),
    ]);

    const groupId = await createGroupAsLeader(leader.sessionCookie);

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/diary/context`)
      .query({ date: TEST_DATE })
      .set('Cookie', nonMember.sessionCookie);

    expect(response.status).toBe(403);
  });

  it('creates an answer and auto-creates today diary entry when missing', async () => {
    const leader = await registerAndLogin('diary-create-answer@example.com');
    const groupId = await createGroupAsLeader(leader.sessionCookie);
    const questionId = await createQuestionAsLeader(
      groupId,
      leader.sessionCookie,
      'What made you smile today?',
    );

    const createResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/diary/answers`)
      .set('Cookie', leader.sessionCookie)
      .send({
        date: TEST_DATE,
        questionType: QuestionType.CUSTOM,
        groupQuestionId: questionId,
        body: 'Had a great walk.',
      });

    expect(createResponse.status).toBe(201);
    expect((createResponse.body as { body: string }).body).toBe(
      'Had a great walk.',
    );

    const contextResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/diary/context`)
      .query({ date: TEST_DATE })
      .set('Cookie', leader.sessionCookie);

    expect(contextResponse.status).toBe(200);
    const entry = (
      contextResponse.body as {
        entry: { answers: Array<{ id: string }> } | null;
      }
    ).entry;
    expect(entry).not.toBeNull();
    expect(entry!.answers).toHaveLength(1);
  });

  it('returns 409 when creating duplicate answer for same diary question', async () => {
    const leader = await registerAndLogin('diary-duplicate-answer@example.com');
    const groupId = await createGroupAsLeader(leader.sessionCookie);
    const questionId = await createQuestionAsLeader(
      groupId,
      leader.sessionCookie,
      'How was your day?',
    );

    const payload = {
      date: TEST_DATE,
      questionType: QuestionType.CUSTOM,
      groupQuestionId: questionId,
      body: 'Good day.',
    };

    const first = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/diary/answers`)
      .set('Cookie', leader.sessionCookie)
      .send(payload);
    expect(first.status).toBe(201);

    const second = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/diary/answers`)
      .set('Cookie', leader.sessionCookie)
      .send(payload);

    expect(second.status).toBe(409);
  });

  it('allows owner to update answer and forbids another member from updating it', async () => {
    const [leader, member] = await Promise.all([
      registerAndLogin('diary-update-owner@example.com'),
      registerAndLogin('diary-update-member@example.com'),
    ]);

    const groupId = await createGroupAsLeader(leader.sessionCookie);
    const questionId = await createQuestionAsLeader(
      groupId,
      leader.sessionCookie,
      'What was meaningful today?',
    );

    await prismaService.groupMember.create({
      data: { groupId, userId: member.userId, role: 'MEMBER' },
    });

    const createResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/diary/answers`)
      .set('Cookie', leader.sessionCookie)
      .send({
        date: TEST_DATE,
        questionType: QuestionType.CUSTOM,
        groupQuestionId: questionId,
        body: 'Initial answer',
      });
    expect(createResponse.status).toBe(201);
    const answerId = (createResponse.body as { id: string }).id;

    const ownerUpdate = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .patch(`/groups/${groupId}/diary/answers/${answerId}`)
      .set('Cookie', leader.sessionCookie)
      .send({ body: 'Updated by owner' });
    expect(ownerUpdate.status).toBe(200);
    expect((ownerUpdate.body as { body: string }).body).toBe(
      'Updated by owner',
    );

    const nonOwnerUpdate = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .patch(`/groups/${groupId}/diary/answers/${answerId}`)
      .set('Cookie', member.sessionCookie)
      .send({ body: 'Attempted hijack' });
    expect(nonOwnerUpdate.status).toBe(403);
  });

  it("does not return another member's diary entry", async () => {
    const [leader, member] = await Promise.all([
      registerAndLogin('diary-isolation-leader@example.com'),
      registerAndLogin('diary-isolation-member@example.com'),
    ]);

    const groupId = await createGroupAsLeader(leader.sessionCookie);

    const inv = await prismaService.groupInvitation.findFirst({
      where: { groupId },
    });

    await prismaService.groupMember.create({
      data: { groupId, userId: member.userId, role: 'MEMBER' },
    });

    if (inv) {
      await prismaService.groupInvitation.delete({ where: { id: inv.id } });
    }

    const diaryDate = new Date(`${TEST_DATE}T00:00:00.000Z`);
    const memberEntry = await prismaService.diaryEntry.create({
      data: { groupId, userId: member.userId, diaryDate },
    });

    await prismaService.answer.create({
      data: {
        diaryEntryId: memberEntry.id,
        questionType: 'CUSTOM',
        groupQuestionId: null,
        questionSnapshot: 'Private question',
        body: "Member's private answer",
      },
    });

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/diary/context`)
      .query({ date: TEST_DATE })
      .set('Cookie', leader.sessionCookie);

    expect(response.status).toBe(200);
    const body = response.body as { entry: null };
    expect(body.entry).toBeNull();
  });

  // ────────────────────────────────────────────────────────────
  // GET /groups/:groupId/diary/feed
  // ────────────────────────────────────────────────────────────

  it('returns all members with entries for the given date', async () => {
    const [leader, member] = await Promise.all([
      registerAndLogin('feed-leader@example.com'),
      registerAndLogin('feed-member@example.com'),
    ]);

    const groupId = await createGroupAsLeader(leader.sessionCookie);
    const questionId = await createQuestionAsLeader(
      groupId,
      leader.sessionCookie,
      'How was your day?',
    );

    await prismaService.groupMember.create({
      data: { groupId, userId: member.userId, role: 'MEMBER' },
    });

    // Leader writes an answer
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post(`/groups/${groupId}/diary/answers`)
      .set('Cookie', leader.sessionCookie)
      .send({
        date: TEST_DATE,
        questionType: 'CUSTOM',
        groupQuestionId: questionId,
        body: 'Leader had a great day.',
      });

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/diary/feed`)
      .query({ date: TEST_DATE })
      .set('Cookie', leader.sessionCookie);

    expect(response.status).toBe(200);

    const body = response.body as {
      date: string;
      members: {
        userId: string;
        user: { id: string; name: string };
        entry: { answers: { body: string }[] } | null;
      }[];
    };

    expect(body.date).toBe(TEST_DATE);
    expect(body.members).toHaveLength(2);

    const leaderRow = body.members.find((m) => m.userId === leader.userId);
    const memberRow = body.members.find((m) => m.userId === member.userId);

    expect(leaderRow?.entry).not.toBeNull();
    expect(leaderRow?.entry?.answers).toHaveLength(1);
    expect(leaderRow?.entry?.answers[0].body).toBe('Leader had a great day.');
    expect(memberRow?.entry).toBeNull();
  });

  it('returns all members with null entries when no one has written', async () => {
    const leader = await registerAndLogin('feed-no-entries@example.com');
    const groupId = await createGroupAsLeader(leader.sessionCookie);

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/diary/feed`)
      .query({ date: TEST_DATE })
      .set('Cookie', leader.sessionCookie);

    expect(response.status).toBe(200);

    const body = response.body as {
      date: string;
      members: { entry: null }[];
    };
    expect(body.members).toHaveLength(1);
    expect(body.members[0].entry).toBeNull();
  });

  it('returns 401 when accessing feed unauthenticated', async () => {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get('/groups/some-group-id/diary/feed')
      .query({ date: TEST_DATE });

    expect(response.status).toBe(401);
  });

  it('returns 403 when non-member requests the feed', async () => {
    const [leader, nonMember] = await Promise.all([
      registerAndLogin('feed-403-leader@example.com'),
      registerAndLogin('feed-403-nonmember@example.com'),
    ]);

    const groupId = await createGroupAsLeader(leader.sessionCookie);

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/diary/feed`)
      .query({ date: TEST_DATE })
      .set('Cookie', nonMember.sessionCookie);

    expect(response.status).toBe(403);
  });

  it('returns 400 when date query param is missing from feed', async () => {
    const leader = await registerAndLogin('feed-missing-date@example.com');
    const groupId = await createGroupAsLeader(leader.sessionCookie);

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/diary/feed`)
      .set('Cookie', leader.sessionCookie);

    expect(response.status).toBe(400);
  });

  it('does not include entries from a different date in the feed', async () => {
    const leader = await registerAndLogin('feed-date-isolation@example.com');
    const groupId = await createGroupAsLeader(leader.sessionCookie);
    const questionId = await createQuestionAsLeader(
      groupId,
      leader.sessionCookie,
      'How was your day?',
    );

    // Write for a different date
    await request(app.getHttpServer() as Parameters<typeof request>[0])
      .post(`/groups/${groupId}/diary/answers`)
      .set('Cookie', leader.sessionCookie)
      .send({
        date: '2026-08-25',
        questionType: 'CUSTOM',
        groupQuestionId: questionId,
        body: 'Yesterday answer',
      });

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/diary/feed`)
      .query({ date: TEST_DATE })
      .set('Cookie', leader.sessionCookie);

    expect(response.status).toBe(200);
    const body = response.body as { members: { entry: null }[] };
    expect(body.members[0].entry).toBeNull();
  });
});

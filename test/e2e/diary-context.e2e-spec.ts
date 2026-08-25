import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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
        answers: { body: string; groupQuestionId: string }[];
      };
    };
    expect(body.entry).not.toBeNull();
    expect(body.entry.id).toBe(entry.id);
    expect(body.entry.answers).toHaveLength(1);
    expect(body.entry.answers[0].body).toBe('Doing great!');
    expect(body.entry.answers[0].groupQuestionId).toBe(questionId);
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
});

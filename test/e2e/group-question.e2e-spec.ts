import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GroupMemberRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '../../src/common/interceptors/logging.interceptor';
import { PrismaService } from '../../src/modules/database/prisma.service';
import { EmailService } from '../../src/modules/email/email.service';

describe('GroupQuestionController (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

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
    name = 'Question User',
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

  async function createGroupAsLeader(sessionCookie: string): Promise<string> {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/groups')
      .set('Cookie', sessionCookie)
      .send({ name: 'Question Group' });

    return (response.body as { id: string }).id;
  }

  it('lets leaders manage questions and members read the ordered set', async () => {
    const [leader, member] = await Promise.all([
      registerAndLogin(
        'group-question-leader@example.com',
        'Str0ngPassword!',
        'Question Leader',
      ),
      registerAndLogin(
        'group-question-member@example.com',
        'Str0ngPassword!',
        'Question Member',
      ),
    ]);

    const groupId = await createGroupAsLeader(leader.sessionCookie);

    await prismaService.groupMember.create({
      data: {
        groupId,
        userId: member.userId,
        role: GroupMemberRole.MEMBER,
      },
    });

    const firstCreate = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/questions`)
      .set('Cookie', leader.sessionCookie)
      .send({ question: '  What made you smile today?  ' });

    const secondCreate = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/questions`)
      .set('Cookie', leader.sessionCookie)
      .send({ question: 'What challenged you today?' });

    const thirdCreate = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/questions`)
      .set('Cookie', leader.sessionCookie)
      .send({ question: 'What are you grateful for today?' });

    expect(firstCreate.status).toBe(201);
    expect(secondCreate.status).toBe(201);
    expect(thirdCreate.status).toBe(201);
    expect((firstCreate.body as { question: string }).question).toBe(
      'What made you smile today?',
    );
    expect((thirdCreate.body as { displayOrder: number }).displayOrder).toBe(3);

    const updatedQuestion = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .patch(
        `/groups/${groupId}/questions/${(secondCreate.body as { id: string }).id}`,
      )
      .set('Cookie', leader.sessionCookie)
      .send({ question: 'What challenged you most today?' });

    expect(updatedQuestion.status).toBe(200);
    expect((updatedQuestion.body as { question: string }).question).toBe(
      'What challenged you most today?',
    );

    const reorderResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .patch(`/groups/${groupId}/questions/reorder`)
      .set('Cookie', leader.sessionCookie)
      .send({
        questionIds: [
          (thirdCreate.body as { id: string }).id,
          (firstCreate.body as { id: string }).id,
          (secondCreate.body as { id: string }).id,
        ],
      });

    expect(reorderResponse.status).toBe(200);
    expect(
      (reorderResponse.body as Array<{ displayOrder: number }>).map(
        (question) => question.displayOrder,
      ),
    ).toEqual([1, 2, 3]);

    const memberListResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/questions`)
      .set('Cookie', member.sessionCookie);

    expect(memberListResponse.status).toBe(200);
    expect(
      (memberListResponse.body as Array<{ question: string }>).map(
        (question) => question.question,
      ),
    ).toEqual([
      'What are you grateful for today?',
      'What made you smile today?',
      'What challenged you most today?',
    ]);

    const deleteResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .delete(
        `/groups/${groupId}/questions/${(firstCreate.body as { id: string }).id}`,
      )
      .set('Cookie', leader.sessionCookie);

    expect(deleteResponse.status).toBe(204);

    const finalListResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/questions`)
      .set('Cookie', leader.sessionCookie);

    expect(finalListResponse.status).toBe(200);
    expect(
      (finalListResponse.body as Array<{ displayOrder: number }>).map(
        (question) => question.displayOrder,
      ),
    ).toEqual([1, 2]);
  });

  it('forbids members from modifying questions and outsiders from reading them', async () => {
    const [leader, member, outsider] = await Promise.all([
      registerAndLogin(
        'group-question-auth-leader@example.com',
        'Str0ngPassword!',
        'Question Auth Leader',
      ),
      registerAndLogin(
        'group-question-auth-member@example.com',
        'Str0ngPassword!',
        'Question Auth Member',
      ),
      registerAndLogin(
        'group-question-auth-outsider@example.com',
        'Str0ngPassword!',
        'Question Auth Outsider',
      ),
    ]);

    const groupId = await createGroupAsLeader(leader.sessionCookie);

    await prismaService.groupMember.create({
      data: {
        groupId,
        userId: member.userId,
        role: GroupMemberRole.MEMBER,
      },
    });

    const createResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/questions`)
      .set('Cookie', leader.sessionCookie)
      .send({ question: 'Leader question' });

    const questionId = (createResponse.body as { id: string }).id;

    const memberWriteResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/questions`)
      .set('Cookie', member.sessionCookie)
      .send({ question: 'Member question' });

    expect(memberWriteResponse.status).toBe(403);
    expect((memberWriteResponse.body as { message: string }).message).toBe(
      'Group leader role required.',
    );

    const outsiderReadResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${groupId}/questions`)
      .set('Cookie', outsider.sessionCookie);

    expect(outsiderReadResponse.status).toBe(403);
    expect((outsiderReadResponse.body as { message: string }).message).toBe(
      'Group membership required.',
    );

    const memberDeleteResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .delete(`/groups/${groupId}/questions/${questionId}`)
      .set('Cookie', member.sessionCookie);

    expect(memberDeleteResponse.status).toBe(403);
  });

  it('rejects a fifth question and invalid payloads', async () => {
    const leader = await registerAndLogin(
      'group-question-limit-leader@example.com',
      'Str0ngPassword!',
      'Question Limit Leader',
    );

    const groupId = await createGroupAsLeader(leader.sessionCookie);

    for (const question of ['Question 1', 'Question 2', 'Question 3', 'Question 4']) {
      const response = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .post(`/groups/${groupId}/questions`)
        .set('Cookie', leader.sessionCookie)
        .send({ question });

      expect(response.status).toBe(201);
    }

    const limitResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/questions`)
      .set('Cookie', leader.sessionCookie)
      .send({ question: 'Question 5' });

    expect(limitResponse.status).toBe(400);
    expect((limitResponse.body as { message: string }).message).toContain(
      'at most four active custom questions',
    );

    const invalidCreateResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/questions`)
      .set('Cookie', leader.sessionCookie)
      .send({ question: '   ', extra: 'blocked' });

    expect(invalidCreateResponse.status).toBe(400);

    const reorderResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .patch(`/groups/${groupId}/questions/reorder`)
      .set('Cookie', leader.sessionCookie)
      .send({ questionIds: ['missing-question-id'] });

    expect(reorderResponse.status).toBe(400);
  });

  it('rejects unauthenticated question management requests', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const listResponse = await request(httpServer).get('/groups/group-1/questions');
    const createResponse = await request(httpServer)
      .post('/groups/group-1/questions')
      .send({ question: 'Question' });
    const reorderResponse = await request(httpServer)
      .patch('/groups/group-1/questions/reorder')
      .send({ questionIds: ['question-1'] });

    expect(listResponse.status).toBe(401);
    expect(createResponse.status).toBe(401);
    expect(reorderResponse.status).toBe(401);
  });
});

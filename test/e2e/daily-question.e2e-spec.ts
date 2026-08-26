import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '../../src/common/interceptors/logging.interceptor';
import { DailyQuestionService } from '../../src/modules/daily-question/daily-question.service';
import { OpenAiService } from '../../src/modules/daily-question/openai.service';
import { PrismaService } from '../../src/modules/database/prisma.service';
import { EmailService } from '../../src/modules/email/email.service';

const MOCK_QUESTION = '오늘 가장 감사한 일은 무엇인가요?';
const TEST_DATE = new Date().toISOString().split('T')[0];

describe('DailyQuestionController (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let dailyQuestionService: DailyQuestionService;

  const mockOpenAiService = {
    isAvailable: jest.fn().mockReturnValue(true),
    chat: jest.fn().mockResolvedValue(MOCK_QUESTION),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(OpenAiService)
      .useValue(mockOpenAiService)
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
    dailyQuestionService = app.get(DailyQuestionService);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOpenAiService.chat.mockResolvedValue(MOCK_QUESTION);

    await prismaService.answer.deleteMany();
    await prismaService.diaryEntry.deleteMany();
    await prismaService.dailyQuestion.deleteMany();
    await prismaService.groupQuestion.deleteMany();
    await prismaService.groupInvitation.deleteMany();
    await prismaService.groupMember.deleteMany();
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
    name = 'Daily User',
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

    return { sessionCookie: setCookie[0].split(';')[0], userId };
  }

  // ──────────────────────────────────────────────
  // GET /daily-question/today
  // ──────────────────────────────────────────────

  describe('GET /daily-question/today', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const response = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      ).get('/daily-question/today');

      expect(response.status).toBe(401);
    });

    it("returns 404 when today's question has not been generated", async () => {
      const { sessionCookie } = await registerAndLogin('dq-404@example.com');

      const response = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .get('/daily-question/today')
        .set('Cookie', sessionCookie);

      expect(response.status).toBe(404);
    });

    it("returns 200 with today's question after it has been generated", async () => {
      await dailyQuestionService.generateAndStoreTodaysQuestion();
      const { sessionCookie } = await registerAndLogin('dq-200@example.com');

      const response = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .get('/daily-question/today')
        .set('Cookie', sessionCookie);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: expect.any(String) as string,
        question: MOCK_QUESTION,
        questionDate: TEST_DATE,
        createdAt: expect.any(String) as string,
      });
    });
  });

  // ──────────────────────────────────────────────
  // POST /daily-question/generate
  // ──────────────────────────────────────────────

  describe('POST /daily-question/generate', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const response = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      ).post('/daily-question/generate');

      expect(response.status).toBe(401);
    });

    it('generates and returns the question on first call', async () => {
      const { sessionCookie } = await registerAndLogin('dq-gen@example.com');

      const response = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .post('/daily-question/generate')
        .set('Cookie', sessionCookie);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        question: MOCK_QUESTION,
        questionDate: TEST_DATE,
      });
      expect(mockOpenAiService.chat).toHaveBeenCalledTimes(1);
    });

    it('is idempotent — second call returns the same question without calling OpenAI again', async () => {
      const { sessionCookie } = await registerAndLogin(
        'dq-gen-idem@example.com',
      );

      const first = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .post('/daily-question/generate')
        .set('Cookie', sessionCookie);

      const second = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .post('/daily-question/generate')
        .set('Cookie', sessionCookie);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect((first.body as { id: string }).id).toBe(
        (second.body as { id: string }).id,
      );
      expect(mockOpenAiService.chat).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────
  // Diary context includes daily question
  // ──────────────────────────────────────────────

  describe('GET /groups/:groupId/diary/context — includes daily question', () => {
    async function createGroup(sessionCookie: string): Promise<string> {
      const response = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .post('/groups')
        .set('Cookie', sessionCookie)
        .send({ name: 'DQ Test Group' });

      return (response.body as { id: string }).id;
    }

    it('includes null dailyQuestion when not yet generated', async () => {
      const { sessionCookie } = await registerAndLogin(
        'dq-ctx-null@example.com',
      );
      const groupId = await createGroup(sessionCookie);

      const response = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .get(`/groups/${groupId}/diary/context`)
        .query({ date: TEST_DATE })
        .set('Cookie', sessionCookie);

      expect(response.status).toBe(200);
      expect(
        (response.body as { dailyQuestion: unknown }).dailyQuestion,
      ).toBeNull();
    });

    it('includes dailyQuestion in context after it has been generated', async () => {
      await dailyQuestionService.generateAndStoreTodaysQuestion();

      const { sessionCookie } = await registerAndLogin(
        'dq-ctx-present@example.com',
      );
      const groupId = await createGroup(sessionCookie);

      const response = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .get(`/groups/${groupId}/diary/context`)
        .query({ date: TEST_DATE })
        .set('Cookie', sessionCookie);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        dailyQuestion: {
          question: MOCK_QUESTION,
          questionDate: TEST_DATE,
        },
      });
    });
  });

  // ──────────────────────────────────────────────
  // POST /groups/:groupId/diary/answers — DAILY type
  // ──────────────────────────────────────────────

  describe('POST /groups/:groupId/diary/answers — DAILY question type', () => {
    async function createGroupAndGetId(sessionCookie: string): Promise<string> {
      const response = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .post('/groups')
        .set('Cookie', sessionCookie)
        .send({ name: 'Daily Answer Group' });

      return (response.body as { id: string }).id;
    }

    it('creates a DAILY answer when the daily question exists', async () => {
      await dailyQuestionService.generateAndStoreTodaysQuestion();

      const { sessionCookie } = await registerAndLogin('dq-answer@example.com');
      const groupId = await createGroupAndGetId(sessionCookie);

      const response = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .post(`/groups/${groupId}/diary/answers`)
        .set('Cookie', sessionCookie)
        .send({
          date: TEST_DATE,
          questionType: 'DAILY',
          body: '오늘 좋은 사람들과 함께했어요.',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        questionType: 'DAILY',
        questionSnapshot: MOCK_QUESTION,
        body: '오늘 좋은 사람들과 함께했어요.',
      });
    });

    it('returns 404 when trying to answer DAILY before it is generated', async () => {
      const { sessionCookie } = await registerAndLogin(
        'dq-answer-404@example.com',
      );
      const groupId = await createGroupAndGetId(sessionCookie);

      const response = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .post(`/groups/${groupId}/diary/answers`)
        .set('Cookie', sessionCookie)
        .send({
          date: TEST_DATE,
          questionType: 'DAILY',
          body: 'Answer without question.',
        });

      expect(response.status).toBe(404);
    });

    it('returns 409 on duplicate DAILY answer submission', async () => {
      await dailyQuestionService.generateAndStoreTodaysQuestion();

      const { sessionCookie } = await registerAndLogin('dq-dup@example.com');
      const groupId = await createGroupAndGetId(sessionCookie);

      await request(app.getHttpServer() as Parameters<typeof request>[0])
        .post(`/groups/${groupId}/diary/answers`)
        .set('Cookie', sessionCookie)
        .send({ date: TEST_DATE, questionType: 'DAILY', body: 'First.' });

      const second = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .post(`/groups/${groupId}/diary/answers`)
        .set('Cookie', sessionCookie)
        .send({ date: TEST_DATE, questionType: 'DAILY', body: 'Duplicate.' });

      expect(second.status).toBe(409);
    });
  });
});

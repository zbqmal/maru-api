import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor';
import { PrismaService } from '../src/modules/database/prisma.service';
import { EmailService } from '../src/modules/email/email.service';

describe('ProfileController (e2e)', () => {
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
    await prismaService.session.deleteMany();
    await prismaService.passwordResetToken.deleteMany();
    await prismaService.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndLogin(
    email = 'e2e@example.com',
    password = 'Str0ngPassword!',
    name = 'E2E User',
  ): Promise<{ sessionCookie: string; userId: string }> {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const registerRes = await request(httpServer)
      .post('/register')
      .send({ email, password, name });

    const userId = (registerRes.body as { id: string }).id;
    const rawSetCookie = (registerRes.headers as Record<string, unknown>)[
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
    const sessionCookie = setCookie[0].split(';')[0];
    return { sessionCookie, userId };
  }

  it('full profile flow: get → update name → update birthday → clear birthday', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const { sessionCookie, userId } = await registerAndLogin();

    // GET /profile
    const profileRes = await request(httpServer)
      .get('/profile')
      .set('Cookie', sessionCookie);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body).toMatchObject({
      id: userId,
      name: 'E2E User',
      birthday: null,
      profileImageKey: null,
    });

    // PATCH /profile/name
    const nameRes = await request(httpServer)
      .patch('/profile/name')
      .set('Cookie', sessionCookie)
      .send({ name: 'Updated E2E User' });
    expect(nameRes.status).toBe(200);
    expect(nameRes.body).toMatchObject({ name: 'Updated E2E User' });

    // PATCH /profile/birthday
    const birthdayRes = await request(httpServer)
      .patch('/profile/birthday')
      .set('Cookie', sessionCookie)
      .send({ birthday: '1995-08-15' });
    expect(birthdayRes.status).toBe(200);
    expect(birthdayRes.body).toMatchObject({ birthday: '1995-08-15' });

    // GET /profile reflects all updates
    const refreshedRes = await request(httpServer)
      .get('/profile')
      .set('Cookie', sessionCookie);
    expect(refreshedRes.status).toBe(200);
    expect(refreshedRes.body).toMatchObject({
      name: 'Updated E2E User',
      birthday: '1995-08-15',
    });

    // Clear birthday
    const clearBirthdayRes = await request(httpServer)
      .patch('/profile/birthday')
      .set('Cookie', sessionCookie)
      .send({ birthday: null });
    expect(clearBirthdayRes.status).toBe(200);
    expect(clearBirthdayRes.body).toMatchObject({ birthday: null });
  });

  it('unauthenticated user cannot access profile endpoints', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const getRes = await request(httpServer).get('/profile');
    expect(getRes.status).toBe(401);

    const nameRes = await request(httpServer)
      .patch('/profile/name')
      .send({ name: 'Hacker' });
    expect(nameRes.status).toBe(401);

    const birthdayRes = await request(httpServer)
      .patch('/profile/birthday')
      .send({ birthday: '2000-01-01' });
    expect(birthdayRes.status).toBe(401);
  });

  it('one user cannot access another user profile via own session', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const { sessionCookie: cookieA } = await registerAndLogin(
      'user-a@example.com',
      'Str0ngPassword!',
      'User A',
    );
    await registerAndLogin('user-b@example.com', 'Str0ngPassword!', 'User B');

    // User A's PATCH only affects their own record
    const nameRes = await request(httpServer)
      .patch('/profile/name')
      .set('Cookie', cookieA)
      .send({ name: 'User A Renamed' });
    expect(nameRes.status).toBe(200);
    expect(nameRes.body).toMatchObject({
      name: 'User A Renamed',
      email: 'user-a@example.com',
    });

    const userB = await prismaService.user.findUnique({
      where: { email: 'user-b@example.com' },
    });
    expect(userB?.name).toBe('User B');
  });
});

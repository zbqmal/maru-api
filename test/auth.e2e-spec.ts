import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './../src/common/interceptors/logging.interceptor';
import { PrismaService } from './../src/modules/database/prisma.service';
import { PasswordHashingService } from './../src/modules/auth/services/password-hashing.service';
import { EmailService } from './../src/modules/email/email.service';
import { SessionTokenService } from './../src/modules/auth/services/session-token.service';
import type { SendEmailOptions } from './../src/modules/email/types/email.types';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let passwordHashingService: PasswordHashingService;
  let sessionTokenService: SessionTokenService;
  let emailSendSpy: jest.SpiedFunction<
    (options: SendEmailOptions) => Promise<void>
  >;

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
    passwordHashingService = app.get(PasswordHashingService);
    sessionTokenService = app.get(SessionTokenService);

    const emailService = app.get<EmailService>(EmailService);
    emailSendSpy = jest.spyOn(emailService, 'send');
  });

  beforeEach(async () => {
    await prismaService.session.deleteMany();
    await prismaService.passwordResetToken.deleteMany();
    await prismaService.user.deleteMany();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a user, normalizes email, and sets a secure HttpOnly session cookie', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(httpServer).post('/register').send({
      email: '  NEW.USER@Example.com ',
      password: 'Str0ngPassword!',
      name: '  New User  ',
    });
    const body = response.body as Record<string, unknown>;
    const setCookie = response.headers['set-cookie'] ?? [];

    expect(response.status).toBe(201);
    expect(body['email']).toBe('new.user@example.com');
    expect(body['name']).toBe('New User');
    expect(body).not.toHaveProperty('passwordHash');
    expect(setCookie[0]).toContain('maru_session=');
    expect(setCookie[0]).toContain('HttpOnly');
    expect(setCookie[0]).not.toContain('Secure');

    const persistedUser = await prismaService.user.findUnique({
      where: { email: 'new.user@example.com' },
    });
    expect(persistedUser?.name).toBe('New User');

    const sessionCount = await prismaService.session.count({
      where: { userId: persistedUser?.id },
    });
    expect(sessionCount).toBe(1);
  });

  it('rejects duplicate registrations after email normalization', async () => {
    await prismaService.user.create({
      data: {
        email: 'user@example.com',
        passwordHash: 'placeholder-password-hash',
        name: 'Existing User',
      },
    });

    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(httpServer).post('/register').send({
      email: ' USER@example.com ',
      password: 'Str0ngPassword!',
      name: 'New User',
    });
    const body = response.body as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(body['message']).toBe('Account with this email already exists.');
  });

  it('rejects invalid registration payloads', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(httpServer).post('/register').send({
      email: 'not-an-email',
      password: 'short',
      name: 'Valid Name',
      extra: 'blocked',
    });
    const body = response.body as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body['message']).toEqual(
      expect.arrayContaining([
        'property extra should not exist',
        'email must be an email',
        'password must be longer than or equal to 8 characters',
      ]),
    );
  });

  it('logs in with valid credentials and sets a session cookie', async () => {
    const user = await prismaService.user.create({
      data: {
        email: 'login-user@example.com',
        passwordHash:
          await passwordHashingService.hashPassword('Str0ngPassword!'),
        name: 'Login User',
      },
    });

    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(httpServer).post('/login').send({
      email: ' LOGIN-USER@example.com ',
      password: 'Str0ngPassword!',
    });
    const body = response.body as Record<string, unknown>;
    const setCookie = response.headers['set-cookie'] ?? [];

    expect(response.status).toBe(200);
    expect(body['id']).toBe(user.id);
    expect(setCookie[0]).toContain('maru_session=');

    const sessionCount = await prismaService.session.count({
      where: { userId: user.id },
    });
    expect(sessionCount).toBe(1);
  });

  it('rejects invalid login credentials', async () => {
    await prismaService.user.create({
      data: {
        email: 'login-user@example.com',
        passwordHash:
          await passwordHashingService.hashPassword('Str0ngPassword!'),
        name: 'Login User',
      },
    });

    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(httpServer).post('/login').send({
      email: 'login-user@example.com',
      password: 'wrong-password',
    });
    const body = response.body as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body['message']).toBe('Invalid email or password.');
  });

  it('returns the current user for an authenticated request', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const registerResponse = await request(httpServer).post('/register').send({
      email: 'me-user@example.com',
      password: 'Str0ngPassword!',
      name: 'Me User',
    });

    const sessionCookie = registerResponse.headers['set-cookie'][0];
    const meResponse = await request(httpServer)
      .get('/me')
      .set('Cookie', sessionCookie);
    const body = meResponse.body as Record<string, unknown>;

    expect(meResponse.status).toBe(200);
    expect(body['email']).toBe('me-user@example.com');
    expect(body['name']).toBe('Me User');
  });

  it('rejects unauthenticated current-user requests', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(httpServer).get('/me');
    const body = response.body as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body['message']).toBe('Authentication required.');
  });

  it('logs out an authenticated user, revokes session, and clears the cookie', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const registerResponse = await request(httpServer).post('/register').send({
      email: 'logout-user@example.com',
      password: 'Str0ngPassword!',
      name: 'Logout User',
    });
    const sessionCookie = registerResponse.headers['set-cookie'][0];

    const logoutResponse = await request(httpServer)
      .post('/logout')
      .set('Cookie', sessionCookie);

    expect(logoutResponse.status).toBe(204);

    const rawSetCookieHeader = (
      logoutResponse.headers as Record<string, unknown>
    )['set-cookie'];
    const setCookieHeader = rawSetCookieHeader
      ? Array.isArray(rawSetCookieHeader)
        ? rawSetCookieHeader.filter(
            (cookie): cookie is string => typeof cookie === 'string',
          )
        : typeof rawSetCookieHeader === 'string'
          ? [rawSetCookieHeader]
          : []
      : [];
    const clearedCookie = setCookieHeader.find((c) =>
      c.startsWith('maru_session='),
    );
    expect(clearedCookie).toBeDefined();
    expect(clearedCookie).toContain('maru_session=;');

    const meResponse = await request(httpServer)
      .get('/me')
      .set('Cookie', sessionCookie);
    expect(meResponse.status).toBe(401);
  });

  it('rejects logout without a session cookie', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(httpServer).post('/logout');

    expect(response.status).toBe(401);
  });

  it('rejects /me requests after the session is revoked', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const registerResponse = await request(httpServer).post('/register').send({
      email: 'revoked-session-user@example.com',
      password: 'Str0ngPassword!',
      name: 'Revoked Session User',
    });
    const sessionCookie = registerResponse.headers['set-cookie'][0];

    await request(httpServer).post('/logout').set('Cookie', sessionCookie);

    const meResponse = await request(httpServer)
      .get('/me')
      .set('Cookie', sessionCookie);
    const body = meResponse.body as Record<string, unknown>;

    expect(meResponse.status).toBe(401);
    expect(body['message']).toBe('Authentication required.');
  });

  it('rejects /me requests with an expired session', async () => {
    const registerResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/register')
      .send({
        email: 'expired-session-user@example.com',
        password: 'Str0ngPassword!',
        name: 'Expired User',
      });
    const registeredBody = registerResponse.body as Record<string, unknown>;
    const userId = registeredBody['id'] as string;

    await prismaService.session.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const sessionCookie = registerResponse.headers['set-cookie'][0];
    const meResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get('/me')
      .set('Cookie', sessionCookie);
    const body = meResponse.body as Record<string, unknown>;

    expect(meResponse.status).toBe(401);
    expect(body['message']).toBe('Authentication required.');
  });

  // ─── Forgot / Reset Password ───────────────────────────────────────────────

  it('POST /forgot-password responds 204 even for an unknown email (no enumeration)', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(httpServer)
      .post('/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(response.status).toBe(204);
    expect(emailSendSpy).not.toHaveBeenCalled();
  });

  it('POST /forgot-password sends a reset email and stores a token for a real user', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const user = await prismaService.user.create({
      data: {
        email: 'reset-user@example.com',
        passwordHash:
          await passwordHashingService.hashPassword('OldPassword1!'),
        name: 'Reset User',
      },
    });

    const response = await request(httpServer)
      .post('/forgot-password')
      .send({ email: user.email });

    expect(response.status).toBe(204);
    expect(emailSendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email }),
    );

    const token = await prismaService.passwordResetToken.findFirst({
      where: { userId: user.id },
    });
    expect(token).not.toBeNull();
    expect(token?.usedAt).toBeNull();
  });

  it('POST /forgot-password rejects an invalid payload', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(httpServer)
      .post('/forgot-password')
      .send({ email: 'not-an-email' });

    expect(response.status).toBe(400);
  });

  it('POST /reset-password resets the password and revokes active sessions', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    // Register user and get a session
    const registerResponse = await request(httpServer).post('/register').send({
      email: 'full-reset-user@example.com',
      password: 'OldPassword1!',
      name: 'Full Reset User',
    });
    const sessionCookieBefore = registerResponse.headers['set-cookie'][0];
    const userId = (registerResponse.body as Record<string, unknown>)[
      'id'
    ] as string;

    // Request reset
    await request(httpServer)
      .post('/forgot-password')
      .send({ email: 'full-reset-user@example.com' });

    const sentEmail = emailSendSpy.mock.calls[0][0] as { html: string };
    const match = /token=([^"<\s]+)/.exec(sentEmail.html);
    expect(match).not.toBeNull();
    const rawToken = match![1];

    // Reset password
    const resetResponse = await request(httpServer)
      .post('/reset-password')
      .send({ token: rawToken, newPassword: 'NewPassword1!' });

    expect(resetResponse.status).toBe(204);

    // Old session should no longer work
    const meResponse = await request(httpServer)
      .get('/me')
      .set('Cookie', sessionCookieBefore);
    expect(meResponse.status).toBe(401);

    // New password should work for login
    const loginResponse = await request(httpServer).post('/login').send({
      email: 'full-reset-user@example.com',
      password: 'NewPassword1!',
    });
    expect(loginResponse.status).toBe(200);
    expect((loginResponse.body as Record<string, unknown>)['id']).toBe(userId);
  });

  it('POST /reset-password returns 400 for an expired token', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const user = await prismaService.user.create({
      data: {
        email: 'expired-token-user@example.com',
        passwordHash:
          await passwordHashingService.hashPassword('OldPassword1!'),
        name: 'Expired Token User',
      },
    });

    const rawToken = sessionTokenService.generateToken();
    const tokenHash = sessionTokenService.hashToken(rawToken);

    await prismaService.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() - 1),
      },
    });

    const response = await request(httpServer)
      .post('/reset-password')
      .send({ token: rawToken, newPassword: 'NewPassword1!' });

    expect(response.status).toBe(400);
  });

  it('POST /reset-password returns 400 when the token is reused', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await prismaService.user.create({
      data: {
        email: 'reuse-token-user@example.com',
        passwordHash:
          await passwordHashingService.hashPassword('OldPassword1!'),
        name: 'Reuse Token User',
      },
    });

    await request(httpServer)
      .post('/forgot-password')
      .send({ email: 'reuse-token-user@example.com' });

    const sentEmail = emailSendSpy.mock.calls[0][0] as { html: string };
    const match = /token=([^"<\s]+)/.exec(sentEmail.html);
    const rawToken = match![1];

    await request(httpServer)
      .post('/reset-password')
      .send({ token: rawToken, newPassword: 'FirstNew1!' });

    const secondResponse = await request(httpServer)
      .post('/reset-password')
      .send({ token: rawToken, newPassword: 'SecondNew1!' });

    expect(secondResponse.status).toBe(400);
  });

  it('POST /reset-password returns 400 for a bogus token', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(httpServer)
      .post('/reset-password')
      .send({ token: 'completely-fake', newPassword: 'NewPassword1!' });

    expect(response.status).toBe(400);
  });

  it('POST /reset-password rejects a payload missing required fields', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const response = await request(httpServer)
      .post('/reset-password')
      .send({ token: 'some-token' });

    expect(response.status).toBe(400);
  });

  it.each(['alllowercase1!', 'ALLUPPERCASE1!', 'NoNumber!', 'NoSpecial1'])(
    'POST /reset-password rejects a password missing a required character type',
    async (newPassword) => {
      const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

      await prismaService.user.create({
        data: {
          email: 'invalid-reset-password@example.com',
          passwordHash: 'existing-password-hash',
          name: 'Invalid Reset Password User',
        },
      });
      await request(httpServer)
        .post('/forgot-password')
        .send({ email: 'invalid-reset-password@example.com' });

      const sentEmail = emailSendSpy.mock.calls[0][0] as { html: string };
      const match = /token=([^"<\s]+)/.exec(sentEmail.html);
      expect(match).not.toBeNull();
      const rawToken = match![1];

      const response = await request(httpServer)
        .post('/reset-password')
        .send({ token: rawToken, newPassword });

      expect(response.status).toBe(400);
    },
  );
});

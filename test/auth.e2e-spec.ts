import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './../src/common/interceptors/logging.interceptor';
import { PrismaService } from './../src/modules/database/prisma.service';
import { PasswordHashingService } from './../src/modules/auth/services/password-hashing.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let passwordHashingService: PasswordHashingService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
  });

  beforeEach(async () => {
    await prismaService.session.deleteMany();
    await prismaService.user.deleteMany();
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
});

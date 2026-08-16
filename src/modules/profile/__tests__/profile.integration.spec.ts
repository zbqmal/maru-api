import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../app.module';
import { AllExceptionsFilter } from '../../../common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '../../../common/interceptors/logging.interceptor';
import { PrismaService } from '../../database/prisma.service';
import { PasswordHashingService } from '../../auth/services/password-hashing.service';
import { EmailService } from '../../email/email.service';

describe('ProfileController (integration)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let passwordHashingService: PasswordHashingService;
  let sessionCookie: string;
  let userId: string;

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
  });

  beforeEach(async () => {
    await prismaService.group.deleteMany();
    await prismaService.session.deleteMany();
    await prismaService.passwordResetToken.deleteMany();
    await prismaService.user.deleteMany();

    const passwordHash =
      await passwordHashingService.hashPassword('Str0ngPassword!');
    const user = await prismaService.user.create({
      data: {
        email: 'profile@example.com',
        passwordHash,
        name: 'Profile User',
      },
    });
    userId = user.id;

    const loginRes = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/login')
      .send({ email: 'profile@example.com', password: 'Str0ngPassword!' });

    const rawSetCookie = (loginRes.headers as Record<string, unknown>)[
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
      throw new Error('Login response did not include a session cookie.');
    }
    sessionCookie = setCookie[0].split(';')[0];
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /profile', () => {
    it('returns the current user profile', async () => {
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .get('/profile')
        .set('Cookie', sessionCookie);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: userId,
        email: 'profile@example.com',
        name: 'Profile User',
        birthday: null,
        profileImageKey: null,
      });
      expect(res.body).toHaveProperty('createdAt');
      expect(res.body).toHaveProperty('updatedAt');
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('returns 401 when not authenticated', async () => {
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      ).get('/profile');

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /profile/name', () => {
    it('updates the display name', async () => {
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .patch('/profile/name')
        .set('Cookie', sessionCookie)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Updated Name' });

      const persisted = await prismaService.user.findUnique({
        where: { id: userId },
      });
      expect(persisted?.name).toBe('Updated Name');
    });

    it('trims whitespace from name', async () => {
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .patch('/profile/name')
        .set('Cookie', sessionCookie)
        .send({ name: '  Trimmed Name  ' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Trimmed Name' });
    });

    it('rejects empty name', async () => {
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .patch('/profile/name')
        .set('Cookie', sessionCookie)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });

    it('rejects name exceeding 100 characters', async () => {
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .patch('/profile/name')
        .set('Cookie', sessionCookie)
        .send({ name: 'a'.repeat(101) });

      expect(res.status).toBe(400);
    });

    it('returns 401 when not authenticated', async () => {
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .patch('/profile/name')
        .send({ name: 'Someone' });

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /profile/birthday', () => {
    it('sets the birthday', async () => {
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .patch('/profile/birthday')
        .set('Cookie', sessionCookie)
        .send({ birthday: '1990-05-20' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ birthday: '1990-05-20' });

      const persisted = await prismaService.user.findUnique({
        where: { id: userId },
      });
      expect(persisted?.birthday?.toISOString().slice(0, 10)).toBe(
        '1990-05-20',
      );
    });

    it('clears the birthday when null is sent', async () => {
      await prismaService.user.update({
        where: { id: userId },
        data: { birthday: new Date('1990-05-20') },
      });

      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .patch('/profile/birthday')
        .set('Cookie', sessionCookie)
        .send({ birthday: null });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ birthday: null });
    });

    it('rejects an invalid date string', async () => {
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .patch('/profile/birthday')
        .set('Cookie', sessionCookie)
        .send({ birthday: 'not-a-date' });

      expect(res.status).toBe(400);
    });

    it('returns 401 when not authenticated', async () => {
      const res = await request(
        app.getHttpServer() as Parameters<typeof request>[0],
      )
        .patch('/profile/birthday')
        .send({ birthday: '1990-05-20' });

      expect(res.status).toBe(401);
    });
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '../../src/common/interceptors/logging.interceptor';
import { PrismaService } from '../../src/modules/database/prisma.service';
import { EmailService } from '../../src/modules/email/email.service';
import { MediaService } from '../../src/modules/media/media.service';

describe('Diary photo upload (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  const createDiaryPhotoUpload = jest.fn();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(MediaService)
      .useValue({ createDiaryPhotoUpload })
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
    jest.resetAllMocks();
    createDiaryPhotoUpload.mockResolvedValue({
      uploadUrl: 'https://example.com/presigned-upload',
      storageKey: 'diary-entries/entry/photos/photo.jpg',
    });
    await prismaService.photo.deleteMany();
    await prismaService.answer.deleteMany();
    await prismaService.diaryEntry.deleteMany();
    await prismaService.group.deleteMany();
    await prismaService.session.deleteMany();
    await prismaService.passwordResetToken.deleteMany();
    await prismaService.user.deleteMany();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function registerAndLogin(email: string): Promise<{
    sessionCookie: string;
    userId: string;
  }> {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/register')
      .send({ email, password: 'Str0ngPassword!', name: 'Photo User' });
    const setCookie = response.headers['set-cookie'];

    if (!setCookie?.[0]) {
      throw new Error('Register response did not include a session cookie.');
    }

    return {
      sessionCookie: setCookie[0].split(';')[0],
      userId: (response.body as { id: string }).id,
    };
  }

  async function createGroup(sessionCookie: string): Promise<string> {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/groups')
      .set('Cookie', sessionCookie)
      .send({ name: 'Photo Test Group' });

    return (response.body as { id: string }).id;
  }

  it('returns a presigned upload URL for a group member who owns the diary entry', async () => {
    const user = await registerAndLogin('photo-owner@example.com');
    const groupId = await createGroup(user.sessionCookie);
    const entry = await prismaService.diaryEntry.create({
      data: {
        groupId,
        userId: user.userId,
        diaryDate: new Date('2026-08-26T00:00:00.000Z'),
      },
    });

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/diary/entries/${entry.id}/photos/upload-url`)
      .set('Cookie', user.sessionCookie)
      .send({ mimeType: 'image/jpeg', sizeBytes: 1024 });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      uploadUrl: 'https://example.com/presigned-upload',
      storageKey: 'diary-entries/entry/photos/photo.jpg',
    });
    expect(createDiaryPhotoUpload).toHaveBeenCalledWith(entry.id, {
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    });
  });

  it('rejects unauthenticated, non-member, non-owner, and invalid upload requests', async () => {
    const [owner, member, nonMember] = await Promise.all([
      registerAndLogin('photo-access-owner@example.com'),
      registerAndLogin('photo-access-member@example.com'),
      registerAndLogin('photo-access-non-member@example.com'),
    ]);
    const groupId = await createGroup(owner.sessionCookie);
    const entry = await prismaService.diaryEntry.create({
      data: {
        groupId,
        userId: owner.userId,
        diaryDate: new Date('2026-08-26T00:00:00.000Z'),
      },
    });
    await prismaService.groupMember.create({
      data: { groupId, userId: member.userId, role: 'MEMBER' },
    });
    const path = `/groups/${groupId}/diary/entries/${entry.id}/photos/upload-url`;

    const unauthenticated = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(path)
      .send({ mimeType: 'image/jpeg', sizeBytes: 1024 });
    const nonOwner = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(path)
      .set('Cookie', member.sessionCookie)
      .send({ mimeType: 'image/jpeg', sizeBytes: 1024 });
    const groupNonMember = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(path)
      .set('Cookie', nonMember.sessionCookie)
      .send({ mimeType: 'image/jpeg', sizeBytes: 1024 });
    const invalidPayload = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(path)
      .set('Cookie', owner.sessionCookie)
      .send({ mimeType: 'image/gif', sizeBytes: 0 });

    expect(unauthenticated.status).toBe(401);
    expect(nonOwner.status).toBe(403);
    expect(groupNonMember.status).toBe(403);
    expect(invalidPayload.status).toBe(400);
    expect(createDiaryPhotoUpload).not.toHaveBeenCalled();
  });
});

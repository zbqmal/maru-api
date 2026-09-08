import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '../../src/common/interceptors/logging.interceptor';
import { PrismaService } from '../../src/modules/database/prisma.service';
import { EmailService } from '../../src/modules/email/email.service';
import { MediaService } from '../../src/modules/media/media.service';

describe('Profile and group media (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  const mediaService = {
    createProfileImageUpload: jest.fn(),
    createGroupImageUpload: jest.fn(),
    validateProfileImageStorageKey: jest.fn(),
    validateGroupImageStorageKey: jest.fn(),
    deleteObject: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn().mockResolvedValue(undefined) })
      .overrideProvider(MediaService)
      .useValue(mediaService)
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
    mediaService.createProfileImageUpload.mockResolvedValue({
      uploadUrl: 'https://example.com/profile-upload',
      storageKey: 'profiles/user/image.jpg',
    });
    mediaService.createGroupImageUpload.mockResolvedValue({
      uploadUrl: 'https://example.com/group-upload',
      storageKey: 'groups/group/image.png',
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

  async function register(
    email: string,
  ): Promise<{ cookie: string; userId: string }> {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/register')
      .send({ email, password: 'Str0ngPassword!', name: 'Media User' });
    const cookie = response.headers['set-cookie']?.[0]?.split(';')[0];
    if (!cookie)
      throw new Error('Register response did not include a session cookie.');
    return { cookie, userId: (response.body as { id: string }).id };
  }

  it('allows a user to upload, replace, and remove only their own profile image', async () => {
    const owner = await register('profile-media-owner@example.com');
    const upload = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/profile/image/upload-url')
      .set('Cookie', owner.cookie)
      .send({ mimeType: 'image/jpeg', sizeBytes: 1024 });
    expect(upload.status).toBe(201);
    expect(mediaService.createProfileImageUpload).toHaveBeenCalledWith(
      owner.userId,
      {
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      },
    );

    const key = `profiles/${owner.userId}/550e8400-e29b-41d4-a716-446655440000.jpg`;
    const set = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .patch('/profile/image')
      .set('Cookie', owner.cookie)
      .send({ storageKey: key, mimeType: 'image/jpeg' });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ profileImageKey: key });

    const remove = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .delete('/profile/image')
      .set('Cookie', owner.cookie);
    expect(remove.status).toBe(204);
    expect(mediaService.deleteObject).toHaveBeenCalledWith(key);
    await expect(
      prismaService.user.findUnique({ where: { id: owner.userId } }),
    ).resolves.toMatchObject({
      profileImageKey: null,
    });
  });

  it('allows only a group leader to set and remove the group image', async () => {
    const [leader, member] = await Promise.all([
      register('group-media-leader@example.com'),
      register('group-media-member@example.com'),
    ]);
    const created = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/groups')
      .set('Cookie', leader.cookie)
      .send({ name: 'Media Group' });
    const groupId = (created.body as { id: string }).id;
    await prismaService.groupMember.create({
      data: { groupId, userId: member.userId, role: 'MEMBER' },
    });
    const key = `groups/${groupId}/550e8400-e29b-41d4-a716-446655440000.png`;

    const unauthorized = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .patch(`/groups/${groupId}/image`)
      .set('Cookie', member.cookie)
      .send({ storageKey: key, mimeType: 'image/png' });
    expect(unauthorized.status).toBe(403);

    const upload = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/image/upload-url`)
      .set('Cookie', leader.cookie)
      .send({ mimeType: 'image/png', sizeBytes: 1024 });
    expect(upload.status).toBe(201);
    const set = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .patch(`/groups/${groupId}/image`)
      .set('Cookie', leader.cookie)
      .send({ storageKey: key, mimeType: 'image/png' });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ imageKey: key });

    const remove = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .delete(`/groups/${groupId}/image`)
      .set('Cookie', leader.cookie);
    expect(remove.status).toBe(204);
    expect(mediaService.deleteObject).toHaveBeenCalledWith(key);
  });
});

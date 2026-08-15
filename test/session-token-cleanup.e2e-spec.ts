import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';

import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './../src/common/interceptors/logging.interceptor';
import { PrismaService } from './../src/modules/database/prisma.service';
import { SessionTokenService } from './../src/modules/auth/services/session-token.service';
import { SessionTokenCleanupService } from './../src/modules/auth/services/session-token-cleanup.service';

describe('SessionTokenCleanupService (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let sessionTokenService: SessionTokenService;
  let sessionTokenCleanupService: SessionTokenCleanupService;

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
    sessionTokenService = app.get(SessionTokenService);
    sessionTokenCleanupService = app.get(SessionTokenCleanupService);
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

  it('runs cleanup through the application container and removes stale auth artifacts', async () => {
    const user = await prismaService.user.create({
      data: {
        email: 'cleanup-e2e-user@example.com',
        passwordHash: 'placeholder-password-hash',
        name: 'Cleanup E2E User',
      },
    });

    const now = new Date('2026-01-01T00:00:00.000Z');

    await prismaService.session.createMany({
      data: [
        {
          userId: user.id,
          tokenHash: sessionTokenService.hashToken('active-e2e-session-token'),
          expiresAt: new Date('2026-01-03T00:00:00.000Z'),
          revokedAt: null,
        },
        {
          userId: user.id,
          tokenHash: sessionTokenService.hashToken('expired-e2e-session-token'),
          expiresAt: new Date('2025-12-31T23:59:59.000Z'),
          revokedAt: null,
        },
      ],
    });

    await prismaService.passwordResetToken.createMany({
      data: [
        {
          userId: user.id,
          tokenHash: sessionTokenService.hashToken('active-e2e-reset-token'),
          expiresAt: new Date('2026-01-03T00:00:00.000Z'),
          usedAt: null,
        },
        {
          userId: user.id,
          tokenHash: sessionTokenService.hashToken('used-e2e-reset-token'),
          expiresAt: new Date('2026-01-03T00:00:00.000Z'),
          usedAt: new Date('2025-12-31T12:00:00.000Z'),
        },
      ],
    });

    await expect(
      sessionTokenCleanupService.cleanupExpiredAndRevokedAuthArtifacts(now),
    ).resolves.toEqual({
      deletedSessions: 1,
      deletedPasswordResetTokens: 1,
    });

    const [remainingSessions, remainingResetTokens] = await Promise.all([
      prismaService.session.findMany({ where: { userId: user.id } }),
      prismaService.passwordResetToken.findMany({ where: { userId: user.id } }),
    ]);

    expect(remainingSessions).toHaveLength(1);
    expect(remainingResetTokens).toHaveLength(1);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from '../../../../common/config/environment.validation';
import { AuthModule } from '../../auth.module';
import { PrismaService } from '../../../database/prisma.service';
import { SessionTokenService } from '../session-token.service';
import { SessionTokenCleanupService } from '../session-token-cleanup.service';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;

describe('SessionTokenCleanupService (integration)', () => {
  let prismaService: PrismaService;
  let sessionTokenService: SessionTokenService;
  let sessionTokenCleanupService: SessionTokenCleanupService;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error(
        'TEST_DATABASE_URL or DATABASE_URL must be set for tests.',
      );
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          ignoreEnvFile: true,
          validate: validateEnvironment,
        }),
        AuthModule,
      ],
    }).compile();

    prismaService = moduleRef.get(PrismaService);
    sessionTokenService = moduleRef.get(SessionTokenService);
    sessionTokenCleanupService = moduleRef.get(SessionTokenCleanupService);
  });

  beforeEach(async () => {
    await prismaService.group.deleteMany();
    await prismaService.session.deleteMany();
    await prismaService.passwordResetToken.deleteMany();
    await prismaService.user.deleteMany();
  });

  it('removes only expired/revoked sessions and used/expired reset tokens', async () => {
    const user = await prismaService.user.create({
      data: {
        email: 'cleanup-service-user@example.com',
        passwordHash: 'placeholder-password-hash',
        name: 'Cleanup Service User',
      },
    });

    const now = new Date('2026-01-01T00:00:00.000Z');

    await prismaService.session.createMany({
      data: [
        {
          userId: user.id,
          tokenHash: sessionTokenService.hashToken('active-session-token'),
          expiresAt: new Date('2026-01-03T00:00:00.000Z'),
          revokedAt: null,
        },
        {
          userId: user.id,
          tokenHash: sessionTokenService.hashToken('expired-session-token'),
          expiresAt: new Date('2025-12-31T23:59:59.000Z'),
          revokedAt: null,
        },
        {
          userId: user.id,
          tokenHash: sessionTokenService.hashToken('revoked-session-token'),
          expiresAt: new Date('2026-01-03T00:00:00.000Z'),
          revokedAt: new Date('2025-12-31T12:00:00.000Z'),
        },
      ],
    });

    await prismaService.passwordResetToken.createMany({
      data: [
        {
          userId: user.id,
          tokenHash: sessionTokenService.hashToken('active-reset-token'),
          expiresAt: new Date('2026-01-03T00:00:00.000Z'),
          usedAt: null,
        },
        {
          userId: user.id,
          tokenHash: sessionTokenService.hashToken('expired-reset-token'),
          expiresAt: new Date('2025-12-31T23:59:59.000Z'),
          usedAt: null,
        },
        {
          userId: user.id,
          tokenHash: sessionTokenService.hashToken('used-reset-token'),
          expiresAt: new Date('2026-01-03T00:00:00.000Z'),
          usedAt: new Date('2025-12-31T12:00:00.000Z'),
        },
      ],
    });

    await expect(
      sessionTokenCleanupService.cleanupExpiredAndRevokedAuthArtifacts(now),
    ).resolves.toEqual({
      deletedSessions: 2,
      deletedPasswordResetTokens: 2,
    });

    const remainingSessions = await prismaService.session.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(remainingSessions).toHaveLength(1);
    expect(remainingSessions[0].tokenHash).toBe(
      sessionTokenService.hashToken('active-session-token'),
    );

    const remainingResetTokens =
      await prismaService.passwordResetToken.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
      });
    expect(remainingResetTokens).toHaveLength(1);
    expect(remainingResetTokens[0].tokenHash).toBe(
      sessionTokenService.hashToken('active-reset-token'),
    );
  });
});

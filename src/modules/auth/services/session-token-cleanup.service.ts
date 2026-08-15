import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';

interface CleanupResult {
  deletedSessions: number;
  deletedPasswordResetTokens: number;
}

@Injectable()
export class SessionTokenCleanupService {
  private readonly logger = new Logger(SessionTokenCleanupService.name);

  constructor(private readonly prismaService: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyCleanup(): Promise<void> {
    await this.cleanupExpiredAndRevokedAuthArtifacts();
  }

  async cleanupExpiredAndRevokedAuthArtifacts(
    referenceTime: Date = new Date(),
  ): Promise<CleanupResult> {
    const [sessionsResult, passwordResetTokensResult] =
      await this.prismaService.$transaction([
        this.prismaService.session.deleteMany({
          where: {
            OR: [
              { expiresAt: { lte: referenceTime } },
              { revokedAt: { not: null } },
            ],
          },
        }),
        this.prismaService.passwordResetToken.deleteMany({
          where: {
            OR: [
              { expiresAt: { lte: referenceTime } },
              { usedAt: { not: null } },
            ],
          },
        }),
      ]);

    const result: CleanupResult = {
      deletedSessions: sessionsResult.count,
      deletedPasswordResetTokens: passwordResetTokensResult.count,
    };

    this.logger.log(
      `Cleanup completed: deleted ${result.deletedSessions} sessions and ${result.deletedPasswordResetTokens} password reset tokens.`,
    );

    return result;
  }
}

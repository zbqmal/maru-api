import { PrismaService } from '../../../database/prisma.service';
import { SessionTokenCleanupService } from '../session-token-cleanup.service';

describe('SessionTokenCleanupService', () => {
  type MockFunction = jest.MockedFunction<(...args: unknown[]) => unknown>;

  const prismaServiceMock = {
    session: {
      deleteMany: jest.fn(),
    },
    passwordResetToken: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as {
    session: { deleteMany: MockFunction };
    passwordResetToken: { deleteMany: MockFunction };
    $transaction: MockFunction;
  };

  let service: SessionTokenCleanupService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionTokenCleanupService(
      prismaServiceMock as unknown as PrismaService,
    );
  });

  it('deletes expired/revoked sessions and used/expired password reset tokens', async () => {
    (prismaServiceMock.session.deleteMany as jest.Mock).mockResolvedValue({
      count: 2,
    });
    (
      prismaServiceMock.passwordResetToken.deleteMany as jest.Mock
    ).mockResolvedValue({ count: 3 });
    (prismaServiceMock.$transaction as jest.Mock).mockImplementation(
      (operations: unknown[]) => Promise.all(operations),
    );

    const referenceTime = new Date('2026-01-01T00:00:00.000Z');

    await expect(
      service.cleanupExpiredAndRevokedAuthArtifacts(referenceTime),
    ).resolves.toEqual({
      deletedSessions: 2,
      deletedPasswordResetTokens: 3,
    });

    expect(prismaServiceMock.session.deleteMany.mock.calls[0]?.[0]).toEqual({
      where: {
        OR: [
          { expiresAt: { lte: referenceTime } },
          { revokedAt: { not: null } },
        ],
      },
    });
    expect(
      prismaServiceMock.passwordResetToken.deleteMany.mock.calls[0]?.[0],
    ).toEqual({
      where: {
        OR: [
          { expiresAt: { lte: referenceTime } },
          { usedAt: { not: null } },
        ],
      },
    });
    expect(prismaServiceMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('uses the cleanup method from the scheduled handler', async () => {
    const cleanupSpy = jest
      .spyOn(service, 'cleanupExpiredAndRevokedAuthArtifacts')
      .mockResolvedValue({
        deletedSessions: 0,
        deletedPasswordResetTokens: 0,
      });

    await service.handleDailyCleanup();

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });
});

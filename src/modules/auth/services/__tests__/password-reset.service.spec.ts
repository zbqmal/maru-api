import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../../../common/config/environment.variables';
import { PrismaService } from '../../../database/prisma.service';
import { EmailService } from '../../../email/email.service';
import { PasswordHashingService } from '../password-hashing.service';
import {
  InvalidOrExpiredTokenError,
  PasswordResetService,
} from '../password-reset.service';
import { SessionTokenService } from '../session-token.service';

describe('PasswordResetService', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');

  const user = {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Test User',
    passwordHash: 'old-hash',
    birthday: null,
    profileImageKey: null,
    createdAt: now,
    updatedAt: now,
  };

  const prismaServiceMock = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    passwordResetToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
    session: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as unknown as PrismaService;

  const sessionTokenServiceMock = {
    generateToken: jest.fn().mockReturnValue('raw-token'),
    hashToken: jest.fn().mockReturnValue('hashed-token'),
  } as unknown as SessionTokenService;

  const passwordHashingServiceMock = {
    hashPassword: jest.fn().mockResolvedValue('new-hash'),
  } as unknown as PasswordHashingService;

  const emailServiceMock = {
    send: jest.fn().mockResolvedValue(undefined),
  } as unknown as EmailService;

  const configServiceMock = {
    getOrThrow: jest.fn().mockReturnValue('http://localhost:3000'),
  } as unknown as ConfigService<EnvironmentVariables, true>;

  let service: PasswordResetService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PasswordResetService(
      prismaServiceMock,
      sessionTokenServiceMock,
      passwordHashingServiceMock,
      emailServiceMock,
      configServiceMock,
    );
  });

  describe('requestPasswordReset', () => {
    it('silently does nothing when the email is not registered', async () => {
      (prismaServiceMock.user.findUnique as jest.Mock).mockResolvedValue(null);

      await service.requestPasswordReset('unknown@example.com');

      expect(
        prismaServiceMock.passwordResetToken.create,
      ).not.toHaveBeenCalled();
      expect(emailServiceMock.send).not.toHaveBeenCalled();
    });

    it('invalidates existing tokens and creates a new one for a known user', async () => {
      (prismaServiceMock.user.findUnique as jest.Mock).mockResolvedValue(user);
      (
        prismaServiceMock.passwordResetToken.deleteMany as jest.Mock
      ).mockResolvedValue({ count: 1 });
      (
        prismaServiceMock.passwordResetToken.create as jest.Mock
      ).mockResolvedValue({});

      await service.requestPasswordReset(user.email);

      expect(
        prismaServiceMock.passwordResetToken.deleteMany,
      ).toHaveBeenCalledWith({
        where: { userId: user.id, usedAt: null },
      });
      expect(
        prismaServiceMock.passwordResetToken.create,
      ).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: user.id,
          tokenHash: 'hashed-token',
        }),
      });
      expect(emailServiceMock.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: user.email,
          subject: 'Reset your Maru password',
        }),
      );
    });

    it('includes the reset URL with the raw token in the email', async () => {
      (prismaServiceMock.user.findUnique as jest.Mock).mockResolvedValue(user);
      (
        prismaServiceMock.passwordResetToken.deleteMany as jest.Mock
      ).mockResolvedValue({ count: 0 });
      (
        prismaServiceMock.passwordResetToken.create as jest.Mock
      ).mockResolvedValue({});

      await service.requestPasswordReset(user.email);

      const sentEmail = (emailServiceMock.send as jest.Mock).mock
        .calls[0][0] as { html: string; text: string };
      expect(sentEmail.html).toContain('raw-token');
      expect(sentEmail.text).toContain('raw-token');
    });
  });

  describe('resetPassword', () => {
    const futureDate = new Date(Date.now() + 60_000 * 60);

    it('throws InvalidOrExpiredTokenError when token is not found', async () => {
      (
        prismaServiceMock.passwordResetToken.findUnique as jest.Mock
      ).mockResolvedValue(null);

      await expect(
        service.resetPassword('bad-token', 'NewPassword1!'),
      ).rejects.toBeInstanceOf(InvalidOrExpiredTokenError);
    });

    it('throws InvalidOrExpiredTokenError when token is already used', async () => {
      (
        prismaServiceMock.passwordResetToken.findUnique as jest.Mock
      ).mockResolvedValue({
        tokenHash: 'hashed-token',
        userId: user.id,
        usedAt: new Date(),
        expiresAt: futureDate,
      });

      await expect(
        service.resetPassword('raw-token', 'NewPassword1!'),
      ).rejects.toBeInstanceOf(InvalidOrExpiredTokenError);
    });

    it('throws InvalidOrExpiredTokenError when token is expired', async () => {
      (
        prismaServiceMock.passwordResetToken.findUnique as jest.Mock
      ).mockResolvedValue({
        tokenHash: 'hashed-token',
        userId: user.id,
        usedAt: null,
        expiresAt: new Date(Date.now() - 1),
      });

      await expect(
        service.resetPassword('raw-token', 'NewPassword1!'),
      ).rejects.toBeInstanceOf(InvalidOrExpiredTokenError);
    });

    it('marks token used, updates password, and revokes all sessions on success', async () => {
      (
        prismaServiceMock.passwordResetToken.findUnique as jest.Mock
      ).mockResolvedValue({
        tokenHash: 'hashed-token',
        userId: user.id,
        usedAt: null,
        expiresAt: futureDate,
      });

      (prismaServiceMock.$transaction as jest.Mock).mockImplementation(
        (ops: unknown[]) => Promise.all(ops),
      );
      (
        prismaServiceMock.passwordResetToken.update as jest.Mock
      ).mockResolvedValue({});
      (prismaServiceMock.user.update as jest.Mock).mockResolvedValue({});
      (prismaServiceMock.session.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      });

      await service.resetPassword('raw-token', 'NewPassword1!');

      expect(passwordHashingServiceMock.hashPassword).toHaveBeenCalledWith(
        'NewPassword1!',
      );
      expect(prismaServiceMock.$transaction).toHaveBeenCalledTimes(1);
      expect(
        prismaServiceMock.passwordResetToken.update,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: 'hashed-token' },
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      );
      expect(prismaServiceMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: user.id },
          data: { passwordHash: 'new-hash' },
        }),
      );
      expect(prismaServiceMock.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: user.id, revokedAt: null },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });
  });
});

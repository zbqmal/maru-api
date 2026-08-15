import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../../common/config/environment.variables';
import { PrismaService } from '../../database/prisma.service';
import { EmailService } from '../../email/email.service';
import { PasswordHashingService } from './password-hashing.service';
import { SessionTokenService } from './session-token.service';

const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly sessionTokenService: SessionTokenService,
    private readonly passwordHashingService: PasswordHashingService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prismaService.user.findUnique({ where: { email } });

    if (user === null) {
      // Do not reveal whether the account exists.
      return;
    }

    // Invalidate all existing unexpired/unused tokens for this user.
    await this.prismaService.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const rawToken = this.sessionTokenService.generateToken(32);
    const tokenHash = this.sessionTokenService.hashToken(rawToken);

    await this.prismaService.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const frontendUrl = this.configService.getOrThrow('FRONTEND_URL');
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    await this.emailService.send({
      to: user.email,
      subject: 'Reset your Maru password',
      html: buildPasswordResetEmail(user.name, resetUrl),
      text: `Hi ${user.name},\n\nReset your password by visiting:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, you can safely ignore this email.`,
    });
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = this.sessionTokenService.hashToken(rawToken);

    const resetToken = await this.prismaService.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (
      resetToken === null ||
      resetToken.usedAt !== null ||
      resetToken.expiresAt <= new Date()
    ) {
      throw new BadRequestException(
        'Password reset token is invalid or has expired.',
      );
    }

    const newPasswordHash =
      await this.passwordHashingService.hashPassword(newPassword);

    await this.prismaService.$transaction([
      // Mark token as used.
      this.prismaService.passwordResetToken.update({
        where: { tokenHash },
        data: { usedAt: new Date() },
      }),
      // Update user password.
      this.prismaService.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: newPasswordHash },
      }),
      // Revoke all active sessions so any compromised session is invalidated.
      this.prismaService.session.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}

function buildPasswordResetEmail(name: string, resetUrl: string): string {
  return `<!DOCTYPE html>
<html>
<body>
  <p>Hi ${name},</p>
  <p>You requested a password reset for your Maru account.</p>
  <p><a href="${resetUrl}">Reset your password</a></p>
  <p>This link expires in 1 hour.</p>
  <p>If you did not request this, you can safely ignore this email.</p>
</body>
</html>`;
}

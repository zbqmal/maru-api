import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from '../../../../common/config/environment.validation';
import { AuthModule } from '../../auth.module';
import { PrismaService } from '../../../database/prisma.service';
import { SessionTokenService } from '../session-token.service';
import {
  InvalidOrExpiredTokenError,
  PasswordResetService,
} from '../password-reset.service';
import { EmailService } from '../../../email/email.service';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;
process.env.APP_URL ??= 'http://localhost:3000';

describe('PasswordResetService (integration)', () => {
  let prismaService: PrismaService;
  let passwordResetService: PasswordResetService;
  let sessionTokenService: SessionTokenService;
  let emailServiceSendSpy: jest.SpyInstance;

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
    })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn().mockResolvedValue(undefined) })
      .compile();

    prismaService = moduleRef.get(PrismaService);
    passwordResetService = moduleRef.get(PasswordResetService);
    sessionTokenService = moduleRef.get(SessionTokenService);
    const emailService = moduleRef.get<EmailService>(EmailService);
    emailServiceSendSpy = jest.spyOn(emailService, 'send');
  });

  beforeEach(async () => {
    await prismaService.session.deleteMany();
    await prismaService.passwordResetToken.deleteMany();
    await prismaService.user.deleteMany();
    jest.clearAllMocks();
  });

  async function createUser(
    email = 'user@example.com',
    name = 'Test User',
    passwordHash = 'placeholder-hash',
  ) {
    return prismaService.user.create({ data: { email, name, passwordHash } });
  }

  it('does not reveal non-existent accounts and sends no email', async () => {
    await expect(
      passwordResetService.requestPasswordReset('nobody@example.com'),
    ).resolves.toBeUndefined();

    expect(emailServiceSendSpy).not.toHaveBeenCalled();
  });

  it('creates a token and sends a reset email for an existing user', async () => {
    const user = await createUser();

    await passwordResetService.requestPasswordReset(user.email);

    expect(emailServiceSendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: user.email }),
    );

    const token = await prismaService.passwordResetToken.findFirst({
      where: { userId: user.id },
    });
    expect(token).not.toBeNull();
    expect(token?.usedAt).toBeNull();
    expect(token?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('invalidates existing unused tokens when a new request is made', async () => {
    const user = await createUser();

    await passwordResetService.requestPasswordReset(user.email);
    await passwordResetService.requestPasswordReset(user.email);

    const tokens = await prismaService.passwordResetToken.findMany({
      where: { userId: user.id },
    });
    // Only the latest token should remain (unused ones were deleted before creating a new one)
    expect(tokens).toHaveLength(1);
    expect(tokens[0].usedAt).toBeNull();
  });

  it('resets the password, marks the token used, and revokes all sessions', async () => {
    const user = await createUser();

    // Create a session to verify it gets revoked
    await prismaService.session.create({
      data: {
        userId: user.id,
        tokenHash: 'existing-session-hash',
        expiresAt: new Date(Date.now() + 60_000 * 60 * 24),
      },
    });

    await passwordResetService.requestPasswordReset(user.email);

    const sentEmail = emailServiceSendSpy.mock.calls[0][0] as {
      html: string;
    };
    const match = /token=([^"<\s]+)/.exec(sentEmail.html);
    expect(match).not.toBeNull();
    const rawToken = match![1];

    await passwordResetService.resetPassword(rawToken, 'BrandNewPassword1!');

    // Token should be marked used
    const tokenHash = sessionTokenService.hashToken(rawToken);
    const usedToken = await prismaService.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    expect(usedToken?.usedAt).not.toBeNull();

    // Password should be updated
    const updatedUser = await prismaService.user.findUnique({
      where: { id: user.id },
    });
    expect(updatedUser?.passwordHash).not.toBe('placeholder-hash');

    // All sessions should be revoked
    const activeSessions = await prismaService.session.findMany({
      where: { userId: user.id, revokedAt: null },
    });
    expect(activeSessions).toHaveLength(0);
  });

  it('rejects reuse of an already-used token', async () => {
    const user = await createUser();
    await passwordResetService.requestPasswordReset(user.email);

    const sentEmail = emailServiceSendSpy.mock.calls[0][0] as { html: string };
    const match = /token=([^"<\s]+)/.exec(sentEmail.html);
    const rawToken = match![1];

    await passwordResetService.resetPassword(rawToken, 'FirstReset1!');

    await expect(
      passwordResetService.resetPassword(rawToken, 'SecondReset1!'),
    ).rejects.toBeInstanceOf(InvalidOrExpiredTokenError);
  });

  it('rejects an expired token', async () => {
    const user = await createUser();

    const rawToken = sessionTokenService.generateToken();
    const tokenHash = sessionTokenService.hashToken(rawToken);

    await prismaService.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() - 1),
      },
    });

    await expect(
      passwordResetService.resetPassword(rawToken, 'NewPassword1!'),
    ).rejects.toBeInstanceOf(InvalidOrExpiredTokenError);
  });

  it('rejects an unknown token', async () => {
    await expect(
      passwordResetService.resetPassword('totally-fake-token', 'NewPassword1!'),
    ).rejects.toBeInstanceOf(InvalidOrExpiredTokenError);
  });
});

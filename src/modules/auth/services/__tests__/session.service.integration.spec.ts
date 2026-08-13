import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from '../../../../common/config/environment.validation';
import { AuthModule } from '../../auth.module';
import { PrismaService } from '../../../database/prisma.service';
import { SessionService } from '../session.service';
import { SessionTokenService } from '../session-token.service';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;

describe('SessionService (integration)', () => {
  let prismaService: PrismaService;
  let sessionService: SessionService;
  let sessionTokenService: SessionTokenService;

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
    sessionService = moduleRef.get(SessionService);
    sessionTokenService = moduleRef.get(SessionTokenService);
  });

  beforeEach(async () => {
    await prismaService.session.deleteMany();
    await prismaService.user.deleteMany();
  });

  it('stores session token as hash and can fetch active session by token', async () => {
    const user = await prismaService.user.create({
      data: {
        email: 'session-owner@example.com',
        passwordHash: 'placeholder-password-hash',
        name: 'Session Owner',
      },
    });

    const { session, token } = await sessionService.createSession({
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(session.tokenHash).toBe(sessionTokenService.hashToken(token));
    expect(session.tokenHash).not.toBe(token);

    const activeSession = await sessionService.getActiveSessionByToken(token);

    expect(activeSession?.id).toBe(session.id);
    expect(activeSession?.userId).toBe(user.id);
  });

  it('does not return expired sessions', async () => {
    const user = await prismaService.user.create({
      data: {
        email: 'expired-session-owner@example.com',
        passwordHash: 'placeholder-password-hash',
        name: 'Expired Session Owner',
      },
    });

    const { token } = await sessionService.createSession({
      userId: user.id,
      expiresAt: new Date(Date.now() - 60_000),
    });

    const activeSession = await sessionService.getActiveSessionByToken(token);

    expect(activeSession).toBeNull();
  });

  it('revokes a session by token', async () => {
    const user = await prismaService.user.create({
      data: {
        email: 'revoked-session-owner@example.com',
        passwordHash: 'placeholder-password-hash',
        name: 'Revoked Session Owner',
      },
    });

    const { session, token } = await sessionService.createSession({
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const revoked = await sessionService.revokeSessionByToken(token);

    expect(revoked).toBe(true);

    const activeSession = await sessionService.getActiveSessionByToken(token);
    expect(activeSession).toBeNull();

    const revokedSession = await prismaService.session.findUnique({
      where: { id: session.id },
    });
    expect(revokedSession?.revokedAt).toEqual(expect.any(Date));
  });
});

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';
import { AuthService } from '../auth.service';
import { PasswordHashingService } from '../services/password-hashing.service';
import { SessionService } from '../services/session.service';
import { UserService } from '../../user/user.service';

describe('AuthService', () => {
  const user: User = {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'hashed-password',
    name: 'Maru User',
    birthday: null,
    profileImageKey: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const userServiceMock = {
    createUser: jest.fn(),
    findByEmail: jest.fn(),
    findById: jest.fn(),
  } satisfies Partial<Record<keyof UserService, jest.Mock>>;

  const passwordHashingServiceMock = {
    hashPassword: jest.fn(),
    verifyPassword: jest.fn(),
  } satisfies Partial<Record<keyof PasswordHashingService, jest.Mock>>;

  const sessionServiceMock = {
    createSession: jest.fn(),
  } satisfies Partial<Record<keyof SessionService, jest.Mock>>;

  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();

    authService = new AuthService(
      userServiceMock as unknown as UserService,
      passwordHashingServiceMock,
      sessionServiceMock as unknown as SessionService,
    );
  });

  it('registers a user with normalized email and trimmed name', async () => {
    userServiceMock.findByEmail.mockResolvedValue(null);
    passwordHashingServiceMock.hashPassword.mockResolvedValue(
      'hashed-password',
    );
    userServiceMock.createUser.mockResolvedValue(user);
    sessionServiceMock.createSession.mockResolvedValue({
      session: {
        id: 'session-1',
        userId: user.id,
        tokenHash: 'token-hash',
        expiresAt: new Date('2026-02-01T00:00:00.000Z'),
        revokedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      token: 'session-token',
    });

    const result = await authService.register({
      email: '  USER@Example.COM ',
      password: 'Str0ngPassword!',
      name: '  Maru User  ',
    });

    expect(userServiceMock.findByEmail).toHaveBeenCalledWith(
      'user@example.com',
    );
    expect(passwordHashingServiceMock.hashPassword).toHaveBeenCalledWith(
      'Str0ngPassword!',
    );
    expect(userServiceMock.createUser).toHaveBeenCalledWith({
      email: 'user@example.com',
      passwordHash: 'hashed-password',
      name: 'Maru User',
    });
    expect(sessionServiceMock.createSession).toHaveBeenCalledWith({
      userId: user.id,
    });
    expect(result.user).toBe(user);
    expect(result.token).toBe('session-token');
  });

  it('rejects duplicate registrations', async () => {
    userServiceMock.findByEmail.mockResolvedValue(user);

    await expect(
      authService.register({
        email: 'user@example.com',
        password: 'Str0ngPassword!',
        name: 'Maru User',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects invalid login credentials', async () => {
    userServiceMock.findByEmail.mockResolvedValue(user);
    passwordHashingServiceMock.verifyPassword.mockResolvedValue(false);

    await expect(
      authService.login({
        email: 'user@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

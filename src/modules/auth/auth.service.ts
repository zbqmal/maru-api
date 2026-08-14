import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { UserService } from '../user/user.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordHashingService } from './services/password-hashing.service';
import { SessionService } from './services/session.service';
import { normalizeEmail } from './utils/string.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly passwordHashingService: PasswordHashingService,
    private readonly sessionService: SessionService,
  ) {}

  async register(input: RegisterDto) {
    const email = normalizeEmail(input.email);
    const existingUser = await this.userService.findByEmail(email);

    if (existingUser !== null) {
      throw new ConflictException('Account with this email already exists.');
    }

    const passwordHash = await this.passwordHashingService.hashPassword(
      input.password,
    );

    let user: User;

    try {
      user = await this.userService.createUser({
        email,
        passwordHash,
        name: input.name.trim(),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Account with this email already exists.',
          );
        }
      }

      throw error;
    }

    const { session, token } = await this.sessionService.createSession({
      userId: user.id,
    });

    return { user, session, token };
  }

  async logout(token: string): Promise<void> {
    await this.sessionService.revokeSessionByToken(token);
  }

  async login(input: LoginDto) {
    const email = normalizeEmail(input.email);
    const user = await this.userService.findByEmail(email);

    if (user === null) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const isPasswordValid = await this.passwordHashingService.verifyPassword(
      input.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const { session, token } = await this.sessionService.createSession({
      userId: user.id,
    });

    return { user, session, token };
  }
}

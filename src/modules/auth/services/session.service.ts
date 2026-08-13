import { Injectable } from '@nestjs/common';
import { Session } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SessionTokenService } from './session-token.service';

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

interface CreateSessionInput {
  userId: string;
  expiresAt?: Date;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly sessionTokenService: SessionTokenService,
  ) {}

  async createSession(input: CreateSessionInput): Promise<{
    session: Session;
    token: string;
  }> {
    const token = this.sessionTokenService.generateToken();
    const tokenHash = this.sessionTokenService.hashToken(token);
    const session = await this.prismaService.session.create({
      data: {
        userId: input.userId,
        tokenHash,
        expiresAt:
          input.expiresAt ?? new Date(Date.now() + DEFAULT_SESSION_TTL_MS),
      },
    });

    return { session, token };
  }

  async getActiveSessionByToken(token: string): Promise<Session | null> {
    const tokenHash = this.sessionTokenService.hashToken(token);
    const session = await this.prismaService.session.findUnique({
      where: { tokenHash },
    });

    if (session === null) {
      return null;
    }

    if (session.revokedAt !== null || session.expiresAt <= new Date()) {
      return null;
    }

    return session;
  }

  async revokeSessionByToken(token: string): Promise<boolean> {
    const tokenHash = this.sessionTokenService.hashToken(token);
    const result = await this.prismaService.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return result.count > 0;
  }
}

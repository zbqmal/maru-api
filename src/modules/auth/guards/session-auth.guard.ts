import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserService } from '../../user/user.service';
import { SESSION_COOKIE_NAME } from '../constants/session-cookie.constants';
import { SessionService } from '../services/session.service';
import { AuthenticatedRequest } from '../types/authenticated-request.interface';
import { getCookieValue } from '../utils/cookie.util';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly sessionService: SessionService,
    private readonly userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = getCookieValue(request.headers.cookie, SESSION_COOKIE_NAME);

    if (token === undefined) {
      throw new UnauthorizedException('Authentication required.');
    }

    const session = await this.sessionService.getActiveSessionByToken(token);

    if (session === null) {
      throw new UnauthorizedException('Authentication required.');
    }

    const user = await this.userService.findById(session.userId);

    if (user === null) {
      throw new UnauthorizedException('Authentication required.');
    }

    request.auth = { session, user };
    return true;
  }
}

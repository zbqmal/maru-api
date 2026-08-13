import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { AuthenticatedRequest } from '../types/authenticated-request.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.auth?.user;

    if (user === undefined) {
      throw new InternalServerErrorException('Current user was not resolved.');
    }

    return user;
  },
);

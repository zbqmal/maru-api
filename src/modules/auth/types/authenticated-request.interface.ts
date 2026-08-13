import { Session, User } from '@prisma/client';
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  auth?: {
    session: Session;
    user: User;
  };
}

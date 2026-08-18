import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../../auth/types/authenticated-request.interface';
import { GroupMembershipService } from '../group-membership.service';

@Injectable()
export class GroupMemberGuard implements CanActivate {
  constructor(
    private readonly groupMembershipService: GroupMembershipService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.auth?.user.id;
    const { groupId } = request.params as { groupId?: string };

    if (userId === undefined || groupId === undefined) {
      throw new ForbiddenException('Group membership required.');
    }

    const isMember = await this.groupMembershipService.isMember(
      groupId,
      userId,
    );

    if (!isMember) {
      throw new ForbiddenException('Group membership required.');
    }

    return true;
  }
}

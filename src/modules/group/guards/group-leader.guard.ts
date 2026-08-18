import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../../auth/types/authenticated-request.interface';
import { GroupMembershipService } from '../group-membership.service';

@Injectable()
export class GroupLeaderGuard implements CanActivate {
  constructor(
    private readonly groupMembershipService: GroupMembershipService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.auth?.user.id;
    const { groupId } = request.params as { groupId?: string };

    if (userId === undefined || groupId === undefined) {
      throw new ForbiddenException('Group leader role required.');
    }

    const isLeader = await this.groupMembershipService.isLeader(
      groupId,
      userId,
    );

    if (!isLeader) {
      throw new ForbiddenException('Group leader role required.');
    }

    return true;
  }
}

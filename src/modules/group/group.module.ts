import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { DatabaseModule } from '../database/database.module';
import { UserModule } from '../user/user.module';
import { GroupController } from './group.controller';
import { GroupDeletionService } from './group-deletion.service';
import { GroupLeaderGuard } from './guards/group-leader.guard';
import { GroupMemberGuard } from './guards/group-member.guard';
import { GroupMembershipService } from './group-membership.service';
import { GroupService } from './group.service';

@Module({
  imports: [DatabaseModule, AuthModule, UserModule],
  controllers: [GroupController],
  providers: [
    GroupService,
    GroupMembershipService,
    GroupDeletionService,
    SessionAuthGuard,
    GroupMemberGuard,
    GroupLeaderGuard,
  ],
  exports: [GroupService, GroupMembershipService, GroupDeletionService],
})
export class GroupModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../email/email.module';
import { UserModule } from '../user/user.module';
import { GroupController } from './group.controller';
import { GroupDeletionService } from './group-deletion.service';
import { GroupInvitationController } from './group-invitation.controller';
import { GroupInvitationService } from './group-invitation.service';
import { GroupLeaderGuard } from './guards/group-leader.guard';
import { GroupMemberGuard } from './guards/group-member.guard';
import { GroupQuestionService } from './group-question.service';
import { GroupMembershipService } from './group-membership.service';
import { GroupService } from './group.service';

@Module({
  imports: [DatabaseModule, AuthModule, UserModule, EmailModule],
  controllers: [GroupController, GroupInvitationController],
  providers: [
    GroupService,
    GroupMembershipService,
    GroupDeletionService,
    GroupInvitationService,
    GroupQuestionService,
    SessionAuthGuard,
    GroupMemberGuard,
    GroupLeaderGuard,
  ],
  exports: [
    GroupService,
    GroupMembershipService,
    GroupDeletionService,
    GroupQuestionService,
  ],
})
export class GroupModule {}

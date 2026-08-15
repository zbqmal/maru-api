import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { GroupMembershipService } from './group-membership.service';
import { GroupService } from './group.service';

@Module({
  imports: [DatabaseModule],
  providers: [GroupService, GroupMembershipService],
  exports: [GroupService, GroupMembershipService],
})
export class GroupModule {}

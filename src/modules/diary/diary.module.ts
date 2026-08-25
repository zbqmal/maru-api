import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { DatabaseModule } from '../database/database.module';
import { GroupModule } from '../group/group.module';
import { GroupMemberGuard } from '../group/guards/group-member.guard';
import { DiaryController } from './diary.controller';
import { DiaryEntryService } from './diary-entry.service';

@Module({
  imports: [DatabaseModule, AuthModule, GroupModule],
  controllers: [DiaryController],
  providers: [DiaryEntryService, SessionAuthGuard, GroupMemberGuard],
  exports: [DiaryEntryService],
})
export class DiaryModule {}

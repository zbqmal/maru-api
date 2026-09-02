import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { DailyQuestionModule } from '../daily-question/daily-question.module';
import { DatabaseModule } from '../database/database.module';
import { GroupModule } from '../group/group.module';
import { GroupMemberGuard } from '../group/guards/group-member.guard';
import { MediaModule } from '../media/media.module';
import { UserModule } from '../user/user.module';
import { DiaryController } from './diary.controller';
import { DiaryEntryService } from './diary-entry.service';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UserModule,
    GroupModule,
    DailyQuestionModule,
    MediaModule,
  ],
  controllers: [DiaryController],
  providers: [DiaryEntryService, SessionAuthGuard, GroupMemberGuard],
  exports: [DiaryEntryService],
})
export class DiaryModule {}

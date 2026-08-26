import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { UserModule } from '../user/user.module';
import { DailyQuestionController } from './daily-question.controller';
import { DailyQuestionService } from './daily-question.service';
import { OpenAiService } from './openai.service';

@Module({
  imports: [DatabaseModule, AuthModule, UserModule],
  controllers: [DailyQuestionController],
  providers: [DailyQuestionService, OpenAiService],
  exports: [DailyQuestionService],
})
export class DailyQuestionModule {}

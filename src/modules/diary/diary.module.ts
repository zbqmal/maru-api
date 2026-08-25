import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DiaryEntryService } from './diary-entry.service';

@Module({
  imports: [DatabaseModule],
  providers: [DiaryEntryService],
  exports: [DiaryEntryService],
})
export class DiaryModule {}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Answer,
  DailyQuestion,
  DiaryEntry,
  GroupQuestion,
  Photo,
} from '@prisma/client';
import {
  GroupQuestionResponseDto,
  toGroupQuestionResponseDto,
} from '../../group/dto/group-question-response.dto';
import { AnswerResponseDto, toAnswerResponseDto } from './answer-response.dto';
import {
  DailyQuestionResponseDto,
  toDailyQuestionResponseDto,
} from '../../daily-question/dto/daily-question-response.dto';
import { PhotoResponseDto, toPhotoResponseDto } from './photo-response.dto';

export class DiaryEntryContextDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'ISO-8601 date string (date only)' })
  diaryDate!: string;

  @ApiProperty({ type: () => AnswerResponseDto, isArray: true })
  answers!: AnswerResponseDto[];

  @ApiProperty({ type: () => PhotoResponseDto, isArray: true })
  photos!: PhotoResponseDto[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class DiaryContextResponseDto {
  @ApiProperty({ type: () => GroupQuestionResponseDto, isArray: true })
  questions!: GroupQuestionResponseDto[];

  @ApiPropertyOptional({ type: () => DailyQuestionResponseDto, nullable: true })
  dailyQuestion!: DailyQuestionResponseDto | null;

  @ApiPropertyOptional({ type: () => DiaryEntryContextDto, nullable: true })
  entry!: DiaryEntryContextDto | null;
}

export function toDiaryContextResponseDto(
  questions: GroupQuestion[],
  dailyQuestion: DailyQuestion | null,
  entry: (DiaryEntry & { answers: Answer[]; photos: Photo[] }) | null,
): DiaryContextResponseDto {
  return {
    questions: questions.map(toGroupQuestionResponseDto),
    dailyQuestion: dailyQuestion
      ? toDailyQuestionResponseDto(dailyQuestion)
      : null,
    entry: entry
      ? {
          id: entry.id,
          diaryDate: entry.diaryDate.toISOString().split('T')[0],
          answers: entry.answers.map(toAnswerResponseDto),
          photos: entry.photos.map(toPhotoResponseDto),
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString(),
        }
      : null,
  };
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Answer, DiaryEntry, GroupQuestion } from '@prisma/client';
import {
  GroupQuestionResponseDto,
  toGroupQuestionResponseDto,
} from '../../group/dto/group-question-response.dto';
import { AnswerResponseDto, toAnswerResponseDto } from './answer-response.dto';

export class DiaryEntryContextDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'ISO-8601 date string (date only)' })
  diaryDate!: string;

  @ApiProperty({ type: () => AnswerResponseDto, isArray: true })
  answers!: AnswerResponseDto[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class DiaryContextResponseDto {
  @ApiProperty({ type: () => GroupQuestionResponseDto, isArray: true })
  questions!: GroupQuestionResponseDto[];

  @ApiPropertyOptional({ type: () => DiaryEntryContextDto, nullable: true })
  entry!: DiaryEntryContextDto | null;
}

export function toDiaryContextResponseDto(
  questions: GroupQuestion[],
  entry: (DiaryEntry & { answers: Answer[] }) | null,
): DiaryContextResponseDto {
  return {
    questions: questions.map(toGroupQuestionResponseDto),
    entry: entry
      ? {
          id: entry.id,
          diaryDate: entry.diaryDate.toISOString().split('T')[0],
          answers: entry.answers.map(toAnswerResponseDto),
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString(),
        }
      : null,
  };
}

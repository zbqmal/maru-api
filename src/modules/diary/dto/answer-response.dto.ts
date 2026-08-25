import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Answer, QuestionType } from '@prisma/client';

export class AnswerResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  diaryEntryId!: string;

  @ApiProperty({ enum: QuestionType })
  questionType!: QuestionType;

  @ApiPropertyOptional({ nullable: true })
  groupQuestionId!: string | null;

  @ApiProperty()
  body!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export function toAnswerResponseDto(answer: Answer): AnswerResponseDto {
  return {
    id: answer.id,
    diaryEntryId: answer.diaryEntryId,
    questionType: answer.questionType,
    groupQuestionId: answer.groupQuestionId,
    body: answer.body,
    createdAt: answer.createdAt.toISOString(),
    updatedAt: answer.updatedAt.toISOString(),
  };
}

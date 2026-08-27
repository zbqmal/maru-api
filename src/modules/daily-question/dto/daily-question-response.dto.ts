import { ApiProperty } from '@nestjs/swagger';
import type { DailyQuestion } from '@prisma/client';

export class DailyQuestionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  question!: string;

  @ApiProperty({
    description: 'ISO-8601 date string (date only)',
    example: '2026-08-26',
  })
  questionDate!: string;

  @ApiProperty()
  createdAt!: string;
}

export function toDailyQuestionResponseDto(
  q: DailyQuestion,
): DailyQuestionResponseDto {
  return {
    id: q.id,
    question: q.question,
    questionDate: q.questionDate.toISOString().split('T')[0],
    createdAt: q.createdAt.toISOString(),
  };
}

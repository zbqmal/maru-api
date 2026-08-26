import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAnswerDto {
  @ApiProperty({
    description: "The diary date in the user's local timezone (YYYY-MM-DD).",
    example: '2026-08-26',
    type: String,
    format: 'date',
  })
  @IsDateString()
  date!: string;

  @ApiProperty({
    enum: QuestionType,
    description:
      'Question type: CUSTOM for group questions, DAILY for the global daily question.',
    example: QuestionType.CUSTOM,
  })
  @IsEnum(QuestionType)
  questionType!: QuestionType;

  @ApiPropertyOptional({
    description: 'Group custom question id. Required for CUSTOM question type.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  groupQuestionId?: string;

  @ApiProperty({
    description: 'Answer text',
    maxLength: 2000,
    example: 'Today I enjoyed dinner with my family.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}

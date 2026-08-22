import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateGroupQuestionDto {
  @ApiPropertyOptional({
    description: 'Updated custom question content',
    example: 'What are you grateful for today?',
    maxLength: 200,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MaxLength(200)
  question?: string;
}

import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateGroupQuestionDto {
  @ApiProperty({
    description: 'Custom question content',
    example: 'What made you smile today?',
    maxLength: 200,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  question!: string;
}

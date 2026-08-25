import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class GetDiaryContextQueryDto {
  @ApiProperty({
    example: '2026-08-26',
    description: "The diary date in the user's local timezone (YYYY-MM-DD).",
    type: String,
    format: 'date',
  })
  @IsDateString()
  date!: string;
}

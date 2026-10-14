import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class GetMonthlyActivityQueryDto {
  @ApiProperty({
    example: '2026-08',
    description: 'The calendar month to retrieve in YYYY-MM format.',
    type: String,
  })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be in YYYY-MM format.',
  })
  month!: string;
}

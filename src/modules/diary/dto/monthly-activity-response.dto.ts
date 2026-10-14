import { ApiProperty } from '@nestjs/swagger';

export class MonthlyActivityResponseDto {
  @ApiProperty({ example: '2026-08', format: 'month' })
  month!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    isArray: true,
    description: 'Dates on which the current user recorded a diary entry.',
  })
  recordedDates!: string[];

  @ApiProperty({
    type: String,
    format: 'date',
    isArray: true,
    description: 'Dates on which every current group member recorded.',
  })
  allMembersRecordedDates!: string[];
}

export interface MonthlyActivityRow {
  date: string;
  currentUserRecorded: boolean;
  allMembersRecorded: boolean;
}

export function toMonthlyActivityResponseDto(
  month: string,
  rows: MonthlyActivityRow[],
): MonthlyActivityResponseDto {
  return {
    month,
    recordedDates: rows
      .filter((row) => row.currentUserRecorded)
      .map((row) => row.date),
    allMembersRecordedDates: rows
      .filter((row) => row.allMembersRecorded)
      .map((row) => row.date),
  };
}

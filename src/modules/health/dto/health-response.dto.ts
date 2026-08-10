import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-10T12:34:56.789Z',
  })
  timestamp!: string;

  @ApiProperty({ example: 123.45 })
  uptime!: number;
}

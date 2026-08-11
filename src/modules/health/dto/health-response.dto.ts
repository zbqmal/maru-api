import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok' | 'degraded';

  @ApiProperty({
    format: 'date-time',
    example: '2026-08-10T12:34:56.789Z',
  })
  timestamp!: string;

  @ApiProperty({ example: 123.45 })
  uptime!: number;

  @ApiProperty({
    example: {
      status: 'up',
    },
  })
  database!: {
    status: 'up' | 'down';
  };
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { HealthResponseDto } from './dto/health-response.dto';

@Injectable()
export class HealthService {
  constructor(private readonly prismaService: PrismaService) {}

  async getHealth(): Promise<HealthResponseDto> {
    const isDatabaseReachable = await this.prismaService.isDatabaseReachable();

    return {
      status: isDatabaseReachable ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: isDatabaseReachable ? 'up' : 'down',
      },
    };
  }
}

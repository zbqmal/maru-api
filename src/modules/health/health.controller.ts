import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @ApiOperation({ summary: 'Service health check' })
  @ApiOkResponse({
    description: 'Health status payload',
    type: HealthResponseDto,
  })
  @Get()
  getHealth(): Promise<HealthResponseDto> {
    return this.healthService.getHealth();
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../health.controller';
import { HealthService } from '../health.service';

describe('HealthController', () => {
  let healthController: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    healthController = module.get<HealthController>(HealthController);
  });

  it('returns an ok health payload', () => {
    const response = healthController.getHealth();

    expect(response.status).toBe('ok');
    expect(response.timestamp).toEqual(expect.any(String));
    expect(response.uptime).toBeGreaterThanOrEqual(0);
  });
});

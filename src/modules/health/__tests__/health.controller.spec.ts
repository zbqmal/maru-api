import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { HealthController } from '../health.controller';
import { HealthService } from '../health.service';

describe('HealthController', () => {
  let healthController: HealthController;
  const prismaServiceMock = {
    isDatabaseReachable: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: prismaServiceMock,
        },
      ],
    }).compile();

    healthController = module.get<HealthController>(HealthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns an ok health payload', async () => {
    const response = await healthController.getHealth();

    expect(response.status).toBe('ok');
    expect(response.timestamp).toEqual(expect.any(String));
    expect(response.uptime).toBeGreaterThanOrEqual(0);
    expect(response.database.status).toBe('up');
  });
});

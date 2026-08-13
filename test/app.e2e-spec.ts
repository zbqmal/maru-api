import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL ??=
  process.env.DATABASE_URL ??
  'postgresql://localhost:5432/maru_test?schema=public';

import { AppModule } from './../src/app.module';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './../src/common/interceptors/logging.interceptor';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new LoggingInterceptor());
    await app.init();
  });

  it('/health (GET)', () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    return request(httpServer)
      .get('/health')
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(['ok', 'degraded']).toContain(body.status);
        expect(typeof body.timestamp).toBe('string');
        expect(typeof body.uptime).toBe('number');
        expect(typeof body.database).toBe('object');
      });
  });

  it('unknown route returns structured 404 error', () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    return request(httpServer)
      .get('/does-not-exist')
      .expect(404)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body.statusCode).toBe(404);
        expect(typeof body.message).toBe('string');
        expect(body.path).toBe('/does-not-exist');
        expect(typeof body.timestamp).toBe('string');
      });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });
});

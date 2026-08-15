import { createRequire } from 'node:module';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { createSwaggerDocument } from '../swagger-document';

describe('createSwaggerDocument', () => {
  let app: INestApplication;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalResendApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;

  beforeAll(async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://localhost:5432/maru_dev';
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.EMAIL_FROM = 'noreply@example.com';
    const require = createRequire(__filename);
    const { AppModule } =
      require('../../../app.module') as typeof import('../../../app.module');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    process.env.NODE_ENV = originalNodeEnv;
    process.env.DATABASE_URL = originalDatabaseUrl;
    process.env.RESEND_API_KEY = originalResendApiKey;
    process.env.EMAIL_FROM = originalEmailFrom;
  });

  it('includes the current API metadata and session cookie auth', () => {
    const document = createSwaggerDocument(app);

    expect(document.info.title).toBe('MARU API');
    expect(document.info.description).toBe('MARU backend API documentation');
    expect(document.info.version).toBe('1.0.0');
    expect(document.components?.securitySchemes).toEqual({
      session: {
        in: 'cookie',
        name: 'maru_session',
        type: 'apiKey',
      },
    });
  });
});

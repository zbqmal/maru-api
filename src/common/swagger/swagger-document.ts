import { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  OpenAPIObject,
  SwaggerDocumentOptions,
  SwaggerModule,
} from '@nestjs/swagger';

export function createSwaggerDocumentOptions(): SwaggerDocumentOptions {
  return {};
}

export function createSwaggerDocument(app: INestApplication): OpenAPIObject {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('MARU API')
    .setDescription('MARU backend API documentation')
    .setVersion('1.0.0')
    .addCookieAuth('maru_session', { type: 'apiKey', in: 'cookie' }, 'session')
    .build();

  return SwaggerModule.createDocument(
    app,
    swaggerConfig,
    createSwaggerDocumentOptions(),
  );
}

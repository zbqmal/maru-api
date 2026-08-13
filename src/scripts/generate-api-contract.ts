import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { createSwaggerDocument } from '../common/swagger/swagger-document';

async function generateApiContract(): Promise<void> {
  process.env.NODE_ENV ??= 'development';
  process.env.DATABASE_URL ??= 'postgresql://localhost:5432/maru_dev';
  const require = createRequire(__filename);
  const { AppModule } =
    require('../app.module') as typeof import('../app.module');

  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });

  try {
    await app.init();

    const outputPath = resolve(
      process.cwd(),
      'docs',
      'api-contracts',
      'openapi.json',
    );
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify(createSwaggerDocument(app), null, 2)}\n`,
      'utf8',
    );
  } finally {
    await app.close();
  }
}

void generateApiContract().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

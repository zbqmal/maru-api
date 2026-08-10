import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { EnvironmentVariables } from './common/config/environment.variables';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService<EnvironmentVariables, true>);
  const port = configService.getOrThrow<number>('PORT');

  await app.listen(port);
}
void bootstrap();

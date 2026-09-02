import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { EnvironmentVariables } from '../../common/config/environment.variables';

@Injectable()
export class S3Service {
  readonly client: S3Client;
  readonly bucket: string;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    this.bucket = configService.getOrThrow('AWS_S3_BUCKET');
    this.client = new S3Client({
      region: configService.getOrThrow('AWS_REGION'),
      credentials: {
        accessKeyId: configService.getOrThrow('AWS_ACCESS_KEY_ID'),
        secretAccessKey: configService.getOrThrow('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }
}

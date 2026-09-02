import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import {
  maxImageSizeBytes,
  supportedImageMimeTypes,
} from '../../../lib/constants/media.constants';

export class RegisterDiaryPhotoDto {
  @ApiProperty({
    description: 'Server-generated S3 object key returned by upload-url.',
    example:
      'diary-entries/entry-id/photos/550e8400-e29b-41d4-a716-446655440000.jpg',
  })
  @IsString()
  @IsNotEmpty()
  storageKey!: string;

  @ApiProperty({
    description: 'Uploaded image MIME type.',
    enum: supportedImageMimeTypes,
    example: 'image/jpeg',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(supportedImageMimeTypes)
  mimeType!: string;

  @ApiProperty({
    description: 'Uploaded image width in pixels.',
    minimum: 1,
    example: 1200,
  })
  @IsInt()
  @Min(1)
  width!: number;

  @ApiProperty({
    description: 'Uploaded image height in pixels.',
    minimum: 1,
    example: 900,
  })
  @IsInt()
  @Min(1)
  height!: number;

  @ApiProperty({
    description: 'Uploaded image size in bytes.',
    minimum: 1,
    maximum: maxImageSizeBytes,
    example: 1048576,
  })
  @IsInt()
  @Min(1)
  @Max(maxImageSizeBytes)
  sizeBytes!: number;
}

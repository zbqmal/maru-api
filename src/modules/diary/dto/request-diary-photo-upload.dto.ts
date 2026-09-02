import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import {
  maxImageSizeBytes,
  supportedImageMimeTypes,
} from '../../../lib/constants/media.constants';

export class RequestDiaryPhotoUploadDto {
  @ApiProperty({
    description: 'Image MIME type.',
    enum: supportedImageMimeTypes,
    example: 'image/jpeg',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(supportedImageMimeTypes)
  mimeType!: string;

  @ApiProperty({
    description: 'Image size in bytes.',
    minimum: 1,
    maximum: maxImageSizeBytes,
    example: 1048576,
  })
  @IsInt()
  @Min(1)
  @Max(maxImageSizeBytes)
  sizeBytes!: number;
}

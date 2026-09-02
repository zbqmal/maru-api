import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import { MediaService } from '../../media/media.service';

export class RequestDiaryPhotoUploadDto {
  @ApiProperty({
    description: 'Image MIME type.',
    enum: MediaService.supportedImageMimeTypes,
    example: 'image/jpeg',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(MediaService.supportedImageMimeTypes)
  mimeType!: string;

  @ApiProperty({
    description: 'Image size in bytes.',
    minimum: 1,
    maximum: MediaService.maxImageSizeBytes,
    example: 1048576,
  })
  @IsInt()
  @Min(1)
  @Max(MediaService.maxImageSizeBytes)
  sizeBytes!: number;
}

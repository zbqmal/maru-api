import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { supportedImageMimeTypes } from '../../../lib/constants/media.constants';

export class UpdateProfileImageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  storageKey!: string;

  @ApiProperty({ enum: supportedImageMimeTypes })
  @IsString()
  @IsIn(supportedImageMimeTypes)
  mimeType!: string;
}

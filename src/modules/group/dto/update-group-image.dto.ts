import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { supportedImageMimeTypes } from '../../../lib/constants/media.constants';

export class UpdateGroupImageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  storageKey!: string;

  @ApiProperty({ enum: supportedImageMimeTypes })
  @IsString()
  @IsIn(supportedImageMimeTypes)
  mimeType!: string;
}

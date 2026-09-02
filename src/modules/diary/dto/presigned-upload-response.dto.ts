import { ApiProperty } from '@nestjs/swagger';

export class PresignedUploadResponseDto {
  @ApiProperty({
    description: 'Short-lived S3 URL for directly uploading the image.',
    format: 'uri',
  })
  uploadUrl!: string;

  @ApiProperty({
    description: 'Server-generated S3 object key for the uploaded image.',
  })
  storageKey!: string;
}

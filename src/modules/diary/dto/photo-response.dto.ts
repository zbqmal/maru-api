import { ApiProperty } from '@nestjs/swagger';
import { Photo } from '@prisma/client';

export class PhotoResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  diaryEntryId!: string;

  @ApiProperty()
  uploadedByUserId!: string;

  @ApiProperty()
  storageKey!: string;

  @ApiProperty({
    description: 'Presigned photo view URL (expires in 15 minutes).',
  })
  url!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  width!: number;

  @ApiProperty()
  height!: number;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty()
  displayOrder!: number;

  @ApiProperty()
  createdAt!: string;
}

export function toPhotoResponseDto(
  photo: Photo,
  url: string,
): PhotoResponseDto {
  return {
    id: photo.id,
    diaryEntryId: photo.diaryEntryId,
    uploadedByUserId: photo.uploadedByUserId,
    storageKey: photo.storageKey,
    url,
    mimeType: photo.mimeType,
    width: photo.width,
    height: photo.height,
    sizeBytes: photo.sizeBytes,
    displayOrder: photo.displayOrder,
    createdAt: photo.createdAt.toISOString(),
  };
}

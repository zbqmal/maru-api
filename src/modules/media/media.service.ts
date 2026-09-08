import { BadRequestException, Injectable } from '@nestjs/common';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Service } from './s3.service';
import { maxImageSizeBytes } from '../../lib/constants/media.constants';
import {
  extensionFor,
  generateDiaryPhotoStorageKey,
  isSupportedImageMimeType,
  validateIdentifier,
} from './media.utils';

export interface ImageUploadMetadata {
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

export interface PresignedUpload {
  uploadUrl: string;
  storageKey: string;
}

@Injectable()
export class MediaService {
  constructor(private readonly s3Service: S3Service) {}

  validateImageUpload({
    mimeType,
    sizeBytes,
    width,
    height,
  }: ImageUploadMetadata): void {
    if (!isSupportedImageMimeType(mimeType)) {
      throw new BadRequestException(
        'Only JPEG, PNG, and WebP images are supported.',
      );
    }

    if (!Number.isInteger(sizeBytes) || sizeBytes < 1) {
      throw new BadRequestException('Image size must be a positive integer.');
    }

    if (sizeBytes > maxImageSizeBytes) {
      throw new BadRequestException('Image size must not exceed 10 MiB.');
    }

    if (width !== undefined && (!Number.isInteger(width) || width < 1)) {
      throw new BadRequestException('Photo width must be a positive integer.');
    }

    if (height !== undefined && (!Number.isInteger(height) || height < 1)) {
      throw new BadRequestException('Photo height must be a positive integer.');
    }
  }

  async createDiaryPhotoUpload(
    diaryEntryId: string,
    metadata: ImageUploadMetadata,
  ): Promise<PresignedUpload> {
    this.validateImageUpload(metadata);

    const storageKey = generateDiaryPhotoStorageKey(
      diaryEntryId,
      metadata.mimeType,
    );
    const uploadUrl = await getSignedUrl(
      this.s3Service.client,
      new PutObjectCommand({
        Bucket: this.s3Service.bucket,
        Key: storageKey,
        ContentType: metadata.mimeType,
        ContentLength: metadata.sizeBytes,
      }),
      { expiresIn: 300 },
    );

    return { uploadUrl, storageKey };
  }

  async deleteObject(storageKey: string): Promise<void> {
    await this.s3Service.client.send(
      new DeleteObjectCommand({
        Bucket: this.s3Service.bucket,
        Key: storageKey,
      }),
    );
  }

  validateDiaryPhotoStorageKey(
    diaryEntryId: string,
    storageKey: string,
    mimeType: string,
  ): void {
    const safeDiaryEntryId = validateIdentifier(diaryEntryId, 'Diary entry');
    const extension = extensionFor(mimeType);
    const expectedPrefix = `diary-entries/${safeDiaryEntryId}/photos/`;

    if (!storageKey.startsWith(expectedPrefix)) {
      throw new BadRequestException(
        'Photo storage key does not belong to this diary entry.',
      );
    }

    const fileName = storageKey.slice(expectedPrefix.length);
    const expectedSuffix = `.${extension}`;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z]+$/.test(
        fileName,
      ) ||
      !fileName.endsWith(expectedSuffix)
    ) {
      throw new BadRequestException('Photo storage key is invalid.');
    }
  }
}

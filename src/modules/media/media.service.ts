import { BadRequestException, Injectable } from '@nestjs/common';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { S3Service } from './s3.service';
import { SupportedImageMimeType } from '../../lib/types/media.types';
import {
  maxImageSizeBytes,
  MIME_TYPE_EXTENSIONS,
} from '../../lib/constants/media.constants';

export interface ImageUploadMetadata {
  mimeType: string;
  sizeBytes: number;
}

export interface PresignedUpload {
  uploadUrl: string;
  storageKey: string;
}

@Injectable()
export class MediaService {
  constructor(private readonly s3Service: S3Service) {}

  validateImageUpload({ mimeType, sizeBytes }: ImageUploadMetadata): void {
    if (!this.isSupportedImageMimeType(mimeType)) {
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
  }

  generateDiaryPhotoStorageKey(diaryEntryId: string, mimeType: string): string {
    return `diary-entries/${this.validateIdentifier(diaryEntryId, 'Diary entry')}/photos/${randomUUID()}.${this.extensionFor(mimeType)}`;
  }

  generateProfileImageStorageKey(userId: string, mimeType: string): string {
    return `profiles/${this.validateIdentifier(userId, 'User')}/${randomUUID()}.${this.extensionFor(mimeType)}`;
  }

  async createDiaryPhotoUpload(
    diaryEntryId: string,
    metadata: ImageUploadMetadata,
  ): Promise<PresignedUpload> {
    this.validateImageUpload(metadata);

    const storageKey = this.generateDiaryPhotoStorageKey(
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
    const safeDiaryEntryId = this.validateIdentifier(diaryEntryId, 'Diary entry');
    const extension = this.extensionFor(mimeType);
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

  private extensionFor(mimeType: string): string {
    if (!this.isSupportedImageMimeType(mimeType)) {
      throw new BadRequestException(
        'Only JPEG, PNG, and WebP images are supported.',
      );
    }

    return MIME_TYPE_EXTENSIONS[mimeType];
  }

  private isSupportedImageMimeType(
    mimeType: string,
  ): mimeType is SupportedImageMimeType {
    return mimeType in MIME_TYPE_EXTENSIONS;
  }

  private validateIdentifier(identifier: string, label: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(identifier)) {
      throw new BadRequestException(`${label} ID is invalid.`);
    }

    return identifier;
  }
}

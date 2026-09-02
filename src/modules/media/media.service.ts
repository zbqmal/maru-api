import { BadRequestException, Injectable } from '@nestjs/common';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { S3Service } from './s3.service';

const MIME_TYPE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type SupportedImageMimeType = keyof typeof MIME_TYPE_EXTENSIONS;

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
  static readonly maxImageSizeBytes = 10 * 1024 * 1024;
  static readonly supportedImageMimeTypes = Object.keys(
    MIME_TYPE_EXTENSIONS,
  ) as SupportedImageMimeType[];

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

    if (sizeBytes > MediaService.maxImageSizeBytes) {
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

import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

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

@Injectable()
export class MediaService {
  static readonly maxImageSizeBytes = 10 * 1024 * 1024;
  static readonly supportedImageMimeTypes = Object.keys(
    MIME_TYPE_EXTENSIONS,
  ) as SupportedImageMimeType[];

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

import { BadRequestException, Injectable } from '@nestjs/common';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Service } from './s3.service';
import { maxImageSizeBytes } from '../../lib/constants/media.constants';
import {
  extensionFor,
  generateDiaryPhotoStorageKey,
  generateGroupImageStorageKey,
  generateProfileImageStorageKey,
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

  createProfileImageUpload(
    userId: string,
    metadata: ImageUploadMetadata,
  ): Promise<PresignedUpload> {
    return this.createImageUpload(
      generateProfileImageStorageKey(userId, metadata.mimeType),
      metadata,
    );
  }

  createGroupImageUpload(
    groupId: string,
    metadata: ImageUploadMetadata,
  ): Promise<PresignedUpload> {
    return this.createImageUpload(
      generateGroupImageStorageKey(groupId, metadata.mimeType),
      metadata,
    );
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

  validateProfileImageStorageKey(
    userId: string,
    storageKey: string,
    mimeType: string,
  ): void {
    this.validateImageStorageKey(
      'profiles',
      userId,
      'User',
      storageKey,
      mimeType,
    );
  }

  validateGroupImageStorageKey(
    groupId: string,
    storageKey: string,
    mimeType: string,
  ): void {
    this.validateImageStorageKey(
      'groups',
      groupId,
      'Group',
      storageKey,
      mimeType,
    );
  }

  private async createImageUpload(
    storageKey: string,
    metadata: ImageUploadMetadata,
  ): Promise<PresignedUpload> {
    this.validateImageUpload(metadata);
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

  private validateImageStorageKey(
    resource: 'profiles' | 'groups',
    resourceId: string,
    label: string,
    storageKey: string,
    mimeType: string,
  ): void {
    const safeResourceId = validateIdentifier(resourceId, label);
    const extension = extensionFor(mimeType);
    const expectedPrefix = `${resource}/${safeResourceId}/`;

    if (!storageKey.startsWith(expectedPrefix)) {
      throw new BadRequestException(
        `Image storage key does not belong to this ${label.toLowerCase()}.`,
      );
    }

    const fileName = storageKey.slice(expectedPrefix.length);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z]+$/.test(
        fileName,
      ) ||
      !fileName.endsWith(`.${extension}`)
    ) {
      throw new BadRequestException('Image storage key is invalid.');
    }
  }
}

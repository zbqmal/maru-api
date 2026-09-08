import { BadRequestException } from '@nestjs/common';
import { MIME_TYPE_EXTENSIONS } from '../../lib/constants/media.constants';
import { SupportedImageMimeType } from '../../lib/types/media.types';
import { randomUUID } from 'crypto';

export const isSupportedImageMimeType = (
  mimeType: string,
): mimeType is SupportedImageMimeType => {
  return mimeType in MIME_TYPE_EXTENSIONS;
};

export const validateIdentifier = (
  identifier: string,
  label: string,
): string => {
  if (!/^[A-Za-z0-9_-]+$/.test(identifier)) {
    throw new BadRequestException(`${label} ID is invalid.`);
  }

  return identifier;
};

export const extensionFor = (mimeType: string): string => {
  if (!isSupportedImageMimeType(mimeType)) {
    throw new BadRequestException(
      'Only JPEG, PNG, and WebP images are supported.',
    );
  }

  return MIME_TYPE_EXTENSIONS[mimeType];
};

export const generateDiaryPhotoStorageKey = (
  diaryEntryId: string,
  mimeType: string,
): string => {
  return `diary-entries/${validateIdentifier(diaryEntryId, 'Diary entry')}/photos/${randomUUID()}.${extensionFor(mimeType)}`;
};

export const generateProfileImageStorageKey = (
  userId: string,
  mimeType: string,
): string => {
  return `profiles/${validateIdentifier(userId, 'User')}/${randomUUID()}.${extensionFor(mimeType)}`;
};

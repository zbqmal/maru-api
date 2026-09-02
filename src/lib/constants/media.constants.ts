import { SupportedImageMimeType } from '../types/media.types';

export const maxImageSizeBytes = 10 * 1024 * 1024; // 10 MB

export const MIME_TYPE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export const supportedImageMimeTypes = Object.keys(
  MIME_TYPE_EXTENSIONS,
) as SupportedImageMimeType[];

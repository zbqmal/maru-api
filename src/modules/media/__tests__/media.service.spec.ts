import { BadRequestException } from '@nestjs/common';
import { MediaService } from '../media.service';

describe('MediaService', () => {
  let mediaService: MediaService;

  beforeEach(() => {
    mediaService = new MediaService();
  });

  describe('validateImageUpload', () => {
    it.each(['image/jpeg', 'image/png', 'image/webp'])(
      'accepts %s images within the size limit',
      (mimeType) => {
        expect(() =>
          mediaService.validateImageUpload({ mimeType, sizeBytes: 1024 }),
        ).not.toThrow();
      },
    );

    it('rejects unsupported MIME types', () => {
      expect(() =>
        mediaService.validateImageUpload({
          mimeType: 'image/gif',
          sizeBytes: 1024,
        }),
      ).toThrow(BadRequestException);
    });

    it.each([0, -1, 1.5, MediaService.maxImageSizeBytes + 1])(
      'rejects invalid image size %p',
      (sizeBytes) => {
        expect(() =>
          mediaService.validateImageUpload({
            mimeType: 'image/jpeg',
            sizeBytes,
          }),
        ).toThrow(BadRequestException);
      },
    );
  });

  describe('storage key generation', () => {
    it('creates a diary key that is isolated by entry and uses the MIME extension', () => {
      const key = mediaService.generateDiaryPhotoStorageKey(
        'entry_123',
        'image/jpeg',
      );

      expect(key).toMatch(
        /^diary-entries\/entry_123\/photos\/[0-9a-f-]{36}\.jpg$/,
      );
    });

    it('creates a profile key that is isolated by user and uses the MIME extension', () => {
      const key = mediaService.generateProfileImageStorageKey(
        'user-123',
        'image/webp',
      );

      expect(key).toMatch(/^profiles\/user-123\/[0-9a-f-]{36}\.webp$/);
    });

    it('rejects unsupported MIME types and unsafe resource IDs', () => {
      expect(() =>
        mediaService.generateDiaryPhotoStorageKey('entry', 'image/gif'),
      ).toThrow(BadRequestException);
      expect(() =>
        mediaService.generateProfileImageStorageKey('../user', 'image/png'),
      ).toThrow(BadRequestException);
    });
  });
});

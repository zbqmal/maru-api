import { BadRequestException } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MediaService } from '../media.service';
import { maxImageSizeBytes } from '../../../lib/constants/media.constants';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('MediaService', () => {
  let mediaService: MediaService;
  const s3Service = {
    bucket: 'maru-test-media',
    client: new S3Client({ region: 'ap-northeast-2' }),
  };

  beforeEach(() => {
    mediaService = new MediaService(s3Service);
    jest.resetAllMocks();
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

    it.each([0, -1, 1.5, maxImageSizeBytes + 1])(
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

    describe('createDiaryPhotoUpload', () => {
      it('returns a signed URL and a server-generated storage key', async () => {
        const signedUrl = 'https://maru-test-media.s3.amazonaws.com/upload';
        jest.mocked(getSignedUrl).mockResolvedValue(signedUrl);

        const result = await mediaService.createDiaryPhotoUpload('entry_123', {
          mimeType: 'image/png',
          sizeBytes: 1024,
        });

        expect(result.uploadUrl).toBe(signedUrl);
        expect(result.storageKey).toMatch(
          /^diary-entries\/entry_123\/photos\/[0-9a-f-]{36}\.png$/,
        );
        expect(getSignedUrl).toHaveBeenCalledWith(
          s3Service.client,
          expect.anything(),
          { expiresIn: 300 },
        );
      });

      it('rejects invalid image metadata before requesting a signed URL', async () => {
        await expect(
          mediaService.createDiaryPhotoUpload('entry_123', {
            mimeType: 'image/gif',
            sizeBytes: 1024,
          }),
        ).rejects.toThrow(BadRequestException);

        expect(getSignedUrl).not.toHaveBeenCalled();
      });
    });
  });
});

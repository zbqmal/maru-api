import { BadRequestException } from '@nestjs/common';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
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

    describe('validateDiaryPhotoStorageKey', () => {
      it('accepts keys generated for the requested diary entry and MIME type', () => {
        expect(() =>
          mediaService.validateDiaryPhotoStorageKey(
            'entry_123',
            'diary-entries/entry_123/photos/550e8400-e29b-41d4-a716-446655440000.png',
            'image/png',
          ),
        ).not.toThrow();
      });

      it('rejects arbitrary keys outside the diary entry photo prefix', () => {
        expect(() =>
          mediaService.validateDiaryPhotoStorageKey(
            'entry_123',
            'profiles/user-123/550e8400-e29b-41d4-a716-446655440000.png',
            'image/png',
          ),
        ).toThrow(BadRequestException);
      });

      it('rejects keys for another diary entry or mismatched extension', () => {
        expect(() =>
          mediaService.validateDiaryPhotoStorageKey(
            'entry_123',
            'diary-entries/other-entry/photos/550e8400-e29b-41d4-a716-446655440000.png',
            'image/png',
          ),
        ).toThrow(BadRequestException);

        expect(() =>
          mediaService.validateDiaryPhotoStorageKey(
            'entry_123',
            'diary-entries/entry_123/photos/550e8400-e29b-41d4-a716-446655440000.jpg',
            'image/png',
          ),
        ).toThrow(BadRequestException);
      });
    });

    describe('deleteObject', () => {
      it('deletes the requested S3 object from the media bucket', async () => {
        const send = jest.fn().mockResolvedValue({});
        mediaService = new MediaService({
          bucket: 'maru-test-media',
          client: { send },
        } as never);

        await mediaService.deleteObject('diary-entries/entry/photos/photo.jpg');

        expect(send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
      });
    });
  });
});

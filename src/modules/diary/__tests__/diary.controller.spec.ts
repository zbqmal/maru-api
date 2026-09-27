import type { User } from '@prisma/client';
import { DiaryController } from '../diary.controller';
import { DiaryEntryService } from '../diary-entry.service';
import { MediaService } from '../../media/media.service';

describe('DiaryController', () => {
  const registerPhotoForUser = jest.fn();
  const createDiaryPhotoViewUrl = jest.fn();
  const diaryEntryService = {
    registerPhotoForUser,
  } as unknown as DiaryEntryService;
  const mediaService = {
    createDiaryPhotoViewUrl,
  } as unknown as MediaService;
  const user = { id: 'user_1' } as User;

  let controller: DiaryController;

  beforeEach(() => {
    controller = new DiaryController(diaryEntryService, mediaService);
    jest.resetAllMocks();
  });

  describe('registerDiaryPhoto', () => {
    it('returns a photo response with a presigned view URL', async () => {
      const photo = {
        id: 'photo_1',
        diaryEntryId: 'entry_1',
        uploadedByUserId: user.id,
        storageKey:
          'diary-entries/entry_1/photos/550e8400-e29b-41d4-a716-446655440000.jpg',
        mimeType: 'image/jpeg',
        width: 1200,
        height: 900,
        sizeBytes: 1024,
        displayOrder: 0,
        createdAt: new Date('2026-08-26T00:00:00.000Z'),
      };
      const viewUrl = 'https://example.com/presigned-view';
      registerPhotoForUser.mockResolvedValue(photo);
      createDiaryPhotoViewUrl.mockResolvedValue(viewUrl);

      const result = await controller.registerDiaryPhoto(
        user,
        'group_1',
        'entry_1',
        {
          storageKey: photo.storageKey,
          mimeType: photo.mimeType,
          width: photo.width,
          height: photo.height,
          sizeBytes: photo.sizeBytes,
        },
      );

      expect(registerPhotoForUser).toHaveBeenCalledWith({
        groupId: 'group_1',
        diaryEntryId: 'entry_1',
        userId: user.id,
        storageKey: photo.storageKey,
        mimeType: photo.mimeType,
        width: photo.width,
        height: photo.height,
        sizeBytes: photo.sizeBytes,
      });
      expect(createDiaryPhotoViewUrl).toHaveBeenCalledWith(photo.storageKey);
      expect(result).toMatchObject({
        id: photo.id,
        diaryEntryId: photo.diaryEntryId,
        uploadedByUserId: photo.uploadedByUserId,
        storageKey: photo.storageKey,
        url: viewUrl,
      });
    });
  });
});

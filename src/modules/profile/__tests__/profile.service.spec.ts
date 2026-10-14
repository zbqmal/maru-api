import { User } from '@prisma/client';
import { ProfileService } from '../profile.service';
import { UserService } from '../../user/user.service';
import { MediaService } from '../../media/media.service';

const mockUser = (): User => ({
  id: 'user-1',
  email: 'test@example.com',
  passwordHash: 'hash',
  name: 'Test User',
  birthday: null,
  profileImageKey: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
});

describe('ProfileService', () => {
  let profileService: ProfileService;
  let userService: jest.Mocked<UserService>;
  let mediaService: jest.Mocked<MediaService>;

  beforeEach(() => {
    userService = {
      updateProfile: jest.fn(),
    } as unknown as jest.Mocked<UserService>;
    mediaService = {
      createProfileImageUpload: jest.fn(),
      validateProfileImageStorageKey: jest.fn(),
      deleteObject: jest.fn(),
    } as unknown as jest.Mocked<MediaService>;
    profileService = new ProfileService(userService, mediaService);
  });

  describe('getProfile', () => {
    it('returns the user unchanged', () => {
      const user = mockUser();
      expect(profileService.getProfile(user)).toBe(user);
    });

    describe('profile image', () => {
      const storageKey =
        'profiles/user-1/550e8400-e29b-41d4-a716-446655440000.jpg';

      it('creates a profile image upload for the current user', async () => {
        const user = mockUser();
        mediaService.createProfileImageUpload.mockResolvedValue({
          uploadUrl: 'https://example.com/upload',
          storageKey,
        });

        await expect(
          profileService.createImageUpload(user, {
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
          }),
        ).resolves.toEqual({
          uploadUrl: 'https://example.com/upload',
          storageKey,
        });
        expect(mediaService.createProfileImageUpload.mock.calls).toContainEqual(
          [
            user.id,
            {
              mimeType: 'image/jpeg',
              sizeBytes: 1024,
            },
          ],
        );
      });

      it('replaces an image and cleans up the prior object', async () => {
        const user = {
          ...mockUser(),
          profileImageKey: 'profiles/user-1/old.jpg',
        };
        userService.updateProfile.mockResolvedValue({
          ...user,
          profileImageKey: storageKey,
        });

        await profileService.updateImage(user, storageKey, 'image/jpeg');

        expect(
          mediaService.validateProfileImageStorageKey.mock.calls,
        ).toContainEqual([user.id, storageKey, 'image/jpeg']);
        expect(userService.updateProfile.mock.calls).toContainEqual([
          user.id,
          { profileImageKey: storageKey },
        ]);
        expect(mediaService.deleteObject.mock.calls).toContainEqual([
          user.profileImageKey,
        ]);
      });

      it('clears the image key and cleans up the old object', async () => {
        const user = {
          ...mockUser(),
          profileImageKey: 'profiles/user-1/old.jpg',
        };
        userService.updateProfile.mockResolvedValue({
          ...user,
          profileImageKey: null,
        });

        await profileService.removeImage(user);

        expect(userService.updateProfile.mock.calls).toContainEqual([
          user.id,
          { profileImageKey: null },
        ]);
        expect(mediaService.deleteObject.mock.calls).toContainEqual([
          user.profileImageKey,
        ]);
      });
    });
  });

  describe('updateName', () => {
    it('calls updateProfile with the trimmed name and returns updated user', async () => {
      const user = mockUser();
      const updated = { ...user, name: 'New Name' };
      userService.updateProfile.mockResolvedValue(updated);

      const result = await profileService.updateName(user, 'New Name');

      expect(userService.updateProfile.mock.calls[0]).toEqual([
        user.id,
        { name: 'New Name' },
      ]);
      expect(result.name).toBe('New Name');
    });
  });

  describe('updateBirthday', () => {
    it('converts ISO date string to Date and calls updateProfile', async () => {
      const user = mockUser();
      const updatedUser = { ...user, birthday: new Date('1990-05-20') };
      userService.updateProfile.mockResolvedValue(updatedUser);

      const result = await profileService.updateBirthday(user, '1990-05-20');

      expect(userService.updateProfile.mock.calls[0]).toEqual([
        user.id,
        { birthday: new Date('1990-05-20') },
      ]);
      expect(result.birthday).toEqual(new Date('1990-05-20'));
    });

    it('passes null birthday when clearing birthday', async () => {
      const user = mockUser();
      const updatedUser = { ...user, birthday: null };
      userService.updateProfile.mockResolvedValue(updatedUser);

      const result = await profileService.updateBirthday(user, null);

      expect(userService.updateProfile.mock.calls[0]).toEqual([
        user.id,
        { birthday: null },
      ]);
      expect(result.birthday).toBeNull();
    });
  });
});

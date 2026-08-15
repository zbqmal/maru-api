import { User } from '@prisma/client';
import { ProfileService } from '../profile.service';
import { UserService } from '../../user/user.service';

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

  beforeEach(() => {
    userService = {
      updateProfile: jest.fn(),
    } as unknown as jest.Mocked<UserService>;
    profileService = new ProfileService(userService);
  });

  describe('getProfile', () => {
    it('returns the user unchanged', () => {
      const user = mockUser();
      expect(profileService.getProfile(user)).toBe(user);
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

import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { UserService } from '../user/user.service';
import {
  ImageUploadMetadata,
  MediaService,
  PresignedUpload,
} from '../media/media.service';

@Injectable()
export class ProfileService {
  constructor(
    private readonly userService: UserService,
    private readonly mediaService: MediaService,
  ) {}

  getProfile(user: User): User {
    return user;
  }

  async updateName(user: User, name: string): Promise<User> {
    return this.userService.updateProfile(user.id, { name });
  }

  async updateBirthday(user: User, birthday: string | null): Promise<User> {
    const birthdayDate = birthday !== null ? new Date(birthday) : null;
    return this.userService.updateProfile(user.id, { birthday: birthdayDate });
  }

  createImageUpload(
    user: User,
    metadata: ImageUploadMetadata,
  ): Promise<PresignedUpload> {
    return this.mediaService.createProfileImageUpload(user.id, metadata);
  }

  async updateImage(
    user: User,
    storageKey: string,
    mimeType: string,
  ): Promise<User> {
    this.mediaService.validateProfileImageStorageKey(
      user.id,
      storageKey,
      mimeType,
    );
    const updated = await this.userService.updateProfile(user.id, {
      profileImageKey: storageKey,
    });

    if (user.profileImageKey && user.profileImageKey !== storageKey) {
      await this.mediaService.deleteObject(user.profileImageKey);
    }

    return updated;
  }

  async removeImage(user: User): Promise<User> {
    const updated = await this.userService.updateProfile(user.id, {
      profileImageKey: null,
    });

    if (user.profileImageKey) {
      await this.mediaService.deleteObject(user.profileImageKey);
    }

    return updated;
  }
}

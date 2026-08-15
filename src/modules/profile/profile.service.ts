import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { UserService } from '../user/user.service';

@Injectable()
export class ProfileService {
  constructor(private readonly userService: UserService) {}

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
}

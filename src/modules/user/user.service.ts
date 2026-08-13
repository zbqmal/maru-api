import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  birthday?: Date;
  profileImageKey?: string;
}

@Injectable()
export class UserService {
  constructor(private readonly prismaService: PrismaService) {}

  createUser(input: CreateUserInput) {
    return this.prismaService.user.create({ data: input });
  }

  findByEmail(email: string) {
    return this.prismaService.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prismaService.user.findUnique({ where: { id } });
  }
}

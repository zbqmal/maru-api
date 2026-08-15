import { ApiProperty } from '@nestjs/swagger';
import { User } from '@prisma/client';

export class ProfileResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String, format: 'date' })
  birthday!: string | null;

  @ApiProperty({ nullable: true })
  profileImageKey!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export function toProfileResponseDto(user: User): ProfileResponseDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    birthday: user.birthday?.toISOString().slice(0, 10) ?? null,
    profileImageKey: user.profileImageKey,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

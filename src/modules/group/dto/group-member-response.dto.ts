import { ApiProperty } from '@nestjs/swagger';
import { GroupMemberRole } from '@prisma/client';
import {
  GroupMembershipWithUser,
  GroupMemberUser,
} from '../../../lib/types/group.types';

export class GroupMemberUserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  profileImageKey!: string | null;
}

export class GroupMemberResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: GroupMemberRole })
  role!: GroupMemberRole;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({ type: GroupMemberUserResponseDto })
  user!: GroupMemberUserResponseDto;
}

function toGroupMemberUserResponseDto(
  user: GroupMemberUser,
): GroupMemberUserResponseDto {
  return {
    id: user.id,
    name: user.name,
    profileImageKey: user.profileImageKey,
  };
}

export function toGroupMemberResponseDto(
  membership: GroupMembershipWithUser,
): GroupMemberResponseDto {
  return {
    id: membership.id,
    userId: membership.userId,
    role: membership.role,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
    user: toGroupMemberUserResponseDto(membership.user),
  };
}

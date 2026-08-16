import { ApiProperty } from '@nestjs/swagger';
import {
  GroupMemberResponseDto,
  toGroupMemberResponseDto,
} from './group-member-response.dto';
import { GroupWithMemberships } from '../../../lib/types/group.types';

export class GroupResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({ type: GroupMemberResponseDto, isArray: true })
  memberships!: GroupMemberResponseDto[];
}

export function toGroupResponseDto(
  group: GroupWithMemberships,
): GroupResponseDto {
  return {
    id: group.id,
    name: group.name,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    memberships: group.memberships.map(toGroupMemberResponseDto),
  };
}

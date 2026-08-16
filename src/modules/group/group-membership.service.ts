import { Injectable } from '@nestjs/common';
import { GroupMember, GroupMemberRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

interface AddGroupMembershipInput {
  groupId: string;
  userId: string;
  role?: GroupMemberRole;
}

@Injectable()
export class GroupMembershipService {
  constructor(private readonly prismaService: PrismaService) {}

  addMember(input: AddGroupMembershipInput): Promise<GroupMember> {
    return this.prismaService.groupMember.create({
      data: {
        groupId: input.groupId,
        userId: input.userId,
        role: input.role ?? GroupMemberRole.MEMBER,
      },
    });
  }

  findMembership(groupId: string, userId: string): Promise<GroupMember | null> {
    return this.prismaService.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });
  }

  listMembers(groupId: string): Promise<GroupMember[]> {
    return this.prismaService.groupMember.findMany({
      where: { groupId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async isMember(groupId: string, userId: string): Promise<boolean> {
    return (await this.findMembership(groupId, userId)) !== null;
  }

  async isLeader(groupId: string, userId: string): Promise<boolean> {
    const membership = await this.findMembership(groupId, userId);
    return membership?.role === GroupMemberRole.LEADER;
  }

  findLeader(groupId: string): Promise<GroupMember | null> {
    return this.prismaService.groupMember.findFirst({
      where: {
        groupId,
        role: GroupMemberRole.LEADER,
      },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { Group, GroupMember, GroupMemberRole, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type GroupWithMemberships = Group & {
  memberships: GroupMember[];
};

interface CreateGroupWithLeaderInput {
  name: string;
  leaderUserId: string;
}

@Injectable()
export class GroupService {
  constructor(private readonly prismaService: PrismaService) {}

  async createGroupWithLeader(
    input: CreateGroupWithLeaderInput,
  ): Promise<GroupWithMemberships> {
    return this.prismaService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const group = await tx.group.create({
          data: {
            name: input.name,
          },
        });

        await tx.groupMember.create({
          data: {
            groupId: group.id,
            userId: input.leaderUserId,
            role: GroupMemberRole.LEADER,
          },
        });

        return tx.group.findUniqueOrThrow({
          where: { id: group.id },
          include: {
            memberships: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
          },
        });
      },
    );
  }

  findById(id: string): Promise<GroupWithMemberships | null> {
    return this.prismaService.group.findUnique({
      where: { id },
      include: {
        memberships: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
  }
}

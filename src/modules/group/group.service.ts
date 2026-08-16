import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Group,
  GroupMember,
  GroupMemberRole,
  Prisma,
  User,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const groupMemberUserSelect = {
  id: true,
  name: true,
  profileImageKey: true,
} satisfies Prisma.UserSelect;

const groupWithMembershipsInclude = {
  memberships: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      user: {
        select: groupMemberUserSelect,
      },
    },
  },
} satisfies Prisma.GroupInclude;

type GroupMemberUserSummary = Pick<User, 'id' | 'name' | 'profileImageKey'>;

export type GroupMembershipWithUser = GroupMember & {
  user: GroupMemberUserSummary;
};

export type GroupWithMemberships = Group & {
  memberships: GroupMembershipWithUser[];
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
          include: groupWithMembershipsInclude,
        });
      },
    );
  }

  findGroupsForUser(userId: string): Promise<GroupWithMemberships[]> {
    return this.prismaService.group.findMany({
      where: {
        memberships: {
          some: {
            userId,
          },
        },
      },
      include: groupWithMembershipsInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  findById(id: string): Promise<GroupWithMemberships | null> {
    return this.prismaService.group.findUnique({
      where: { id },
      include: groupWithMembershipsInclude,
    });
  }

  async findByIdForUser(id: string, userId: string): Promise<GroupWithMemberships> {
    const group = await this.findById(id);

    if (group === null) {
      throw new NotFoundException('Group not found.');
    }

    if (!group.memberships.some((membership) => membership.userId === userId)) {
      throw new ForbiddenException('Group membership required.');
    }

    return group;
  }

  async findMembersForUser(
    groupId: string,
    userId: string,
  ): Promise<GroupMembershipWithUser[]> {
    const group = await this.findByIdForUser(groupId, userId);
    return group.memberships;
  }
}

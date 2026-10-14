import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GroupMemberRole, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { GroupMembershipService } from './group-membership.service';
import {
  ImageUploadMetadata,
  MediaService,
  PresignedUpload,
} from '../media/media.service';
import {
  GroupMembershipWithUser,
  GroupWithMemberships,
} from '../../lib/types/group.types';

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

interface CreateGroupWithLeaderInput {
  name: string;
  leaderUserId: string;
}

interface UpdateGroupInput {
  name?: string;
  imageKey?: string | null;
}

@Injectable()
export class GroupService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly groupMembershipService: GroupMembershipService,
    private readonly mediaService?: MediaService,
  ) {}

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

  async findByIdForUser(
    id: string,
    userId: string,
  ): Promise<GroupWithMemberships> {
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

  async updateGroup(
    id: string,
    input: UpdateGroupInput,
  ): Promise<GroupWithMemberships> {
    return this.prismaService.group.update({
      where: { id },
      data: { name: input.name, imageKey: input.imageKey },
      include: groupWithMembershipsInclude,
    });
  }

  createImageUpload(
    groupId: string,
    metadata: ImageUploadMetadata,
  ): Promise<PresignedUpload> {
    return this.mediaService!.createGroupImageUpload(groupId, metadata);
  }

  async updateImage(
    group: GroupWithMemberships,
    storageKey: string,
    mimeType: string,
  ): Promise<GroupWithMemberships> {
    this.mediaService!.validateGroupImageStorageKey(
      group.id,
      storageKey,
      mimeType,
    );
    const updated = await this.updateGroup(group.id, { imageKey: storageKey });

    if (group.imageKey && group.imageKey !== storageKey) {
      await this.mediaService!.deleteObject(group.imageKey);
    }

    return updated;
  }

  async removeImage(
    group: GroupWithMemberships,
  ): Promise<GroupWithMemberships> {
    const updated = await this.updateGroup(group.id, { imageKey: null });

    if (group.imageKey) {
      await this.mediaService!.deleteObject(group.imageKey);
    }

    return updated;
  }

  async transferLeadership(
    groupId: string,
    currentLeaderId: string,
    newLeaderId: string,
  ): Promise<GroupWithMemberships> {
    return this.prismaService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const newLeaderMembership = await tx.groupMember.findUnique({
          where: { groupId_userId: { groupId, userId: newLeaderId } },
        });

        if (newLeaderMembership === null) {
          throw new NotFoundException('Target member not found in group.');
        }

        if (newLeaderMembership.role === GroupMemberRole.LEADER) {
          throw new BadRequestException('Target user is already the leader.');
        }

        // Demote current leader first to avoid hitting the unique partial index
        // on (group_id) WHERE role = 'LEADER'.
        await tx.groupMember.update({
          where: { groupId_userId: { groupId, userId: currentLeaderId } },
          data: { role: GroupMemberRole.MEMBER },
        });

        await tx.groupMember.update({
          where: { groupId_userId: { groupId, userId: newLeaderId } },
          data: { role: GroupMemberRole.LEADER },
        });

        return tx.group.findUniqueOrThrow({
          where: { id: groupId },
          include: groupWithMembershipsInclude,
        });
      },
    );
  }

  async leaveGroup(groupId: string, userId: string): Promise<void> {
    const membership = await this.groupMembershipService.findMembership(
      groupId,
      userId,
    );

    if (membership === null) {
      throw new ForbiddenException('Group membership required.');
    }

    if (membership.role !== GroupMemberRole.LEADER) {
      await this.prismaService.groupMember.delete({
        where: { groupId_userId: { groupId, userId } },
      });
      return;
    }

    // Leader is leaving — find the longest-standing remaining member.
    await this.prismaService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const successor = await tx.groupMember.findFirst({
          where: { groupId, userId: { not: userId } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });

        if (successor === null) {
          // Last member — delete the whole group (cascade removes membership).
          await tx.group.delete({ where: { id: groupId } });
          return;
        }

        // Demote current leader before promoting successor to avoid the unique
        // partial index violation on (group_id) WHERE role = 'LEADER'.
        await tx.groupMember.update({
          where: { groupId_userId: { groupId, userId } },
          data: { role: GroupMemberRole.MEMBER },
        });

        await tx.groupMember.update({
          where: { id: successor.id },
          data: { role: GroupMemberRole.LEADER },
        });

        await tx.groupMember.delete({
          where: { groupId_userId: { groupId, userId } },
        });
      },
    );
  }
}

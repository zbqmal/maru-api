import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GroupMemberRole, Prisma } from '@prisma/client';
import { GroupService } from '../group.service';

describe('GroupService', () => {
  const prismaService = {
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    prismaService.$transaction.mockReset();
  });

  it('creates the group and leader membership in a single transaction', async () => {
    const tx = {
      group: {
        create: jest.fn().mockResolvedValue({ id: 'group-1', name: 'Family' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'group-1',
          name: 'Family',
          memberships: [
            {
              id: 'membership-1',
              groupId: 'group-1',
              userId: 'user-1',
              role: GroupMemberRole.LEADER,
            },
          ],
        }),
      },
      groupMember: {
        create: jest.fn().mockResolvedValue({
          id: 'membership-1',
          groupId: 'group-1',
          userId: 'user-1',
          role: GroupMemberRole.LEADER,
        }),
      },
    };

    prismaService.$transaction.mockImplementation(
      async (
        callback: (
          transactionClient: Prisma.TransactionClient,
        ) => Promise<unknown>,
      ) => callback(tx as unknown as Prisma.TransactionClient),
    );

    const service = new GroupService(prismaService as never, {} as never);

    const result = await service.createGroupWithLeader({
      name: 'Family',
      leaderUserId: 'user-1',
    });

    expect(tx.group.create).toHaveBeenCalledWith({
      data: {
        name: 'Family',
      },
    });
    expect(tx.groupMember.create).toHaveBeenCalledWith({
      data: {
        groupId: 'group-1',
        userId: 'user-1',
        role: GroupMemberRole.LEADER,
      },
    });
    expect(tx.group.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      include: {
        memberships: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            user: {
              select: {
                id: true,
                name: true,
                profileImageKey: true,
              },
            },
          },
        },
      },
    });
    expect(result).toMatchObject({
      id: 'group-1',
      memberships: [{ userId: 'user-1', role: GroupMemberRole.LEADER }],
    });
  });

  it('loads a group with memberships ordered by join time', async () => {
    const groupFindUnique = jest.fn().mockResolvedValue(null);
    const service = new GroupService(
      {
        group: {
          findUnique: groupFindUnique,
        },
      } as never,
      {} as never,
    );

    await service.findById('group-1');

    expect(groupFindUnique).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      include: {
        memberships: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            user: {
              select: {
                id: true,
                name: true,
                profileImageKey: true,
              },
            },
          },
        },
      },
    });
  });

  it('lists groups scoped to a user membership', async () => {
    const groupFindMany = jest.fn().mockResolvedValue([]);
    const service = new GroupService(
      {
        group: {
          findMany: groupFindMany,
        },
      } as never,
      {} as never,
    );

    await service.findGroupsForUser('user-1');

    expect(groupFindMany).toHaveBeenCalledWith({
      where: {
        memberships: {
          some: {
            userId: 'user-1',
          },
        },
      },
      include: {
        memberships: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            user: {
              select: {
                id: true,
                name: true,
                profileImageKey: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('throws when a requested group does not exist', async () => {
    const service = new GroupService(
      {
        group: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      } as never,
      {} as never,
    );

    await expect(
      service.findByIdForUser('group-1', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when a user is not a member of the requested group', async () => {
    const service = new GroupService(
      {
        group: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'group-1',
            name: 'Family',
            memberships: [
              {
                id: 'membership-1',
                groupId: 'group-1',
                userId: 'user-2',
                role: GroupMemberRole.LEADER,
                createdAt: new Date(),
                updatedAt: new Date(),
                user: {
                  id: 'user-2',
                  name: 'Other User',
                  profileImageKey: null,
                },
              },
            ],
          }),
        },
      } as never,
      {} as never,
    );

    await expect(
      service.findByIdForUser('group-1', 'user-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns members for an authorized user', async () => {
    const membership = {
      id: 'membership-1',
      groupId: 'group-1',
      userId: 'user-1',
      role: GroupMemberRole.LEADER,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: 'user-1',
        name: 'Leader User',
        profileImageKey: null,
      },
    };
    const service = new GroupService(
      {
        group: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'group-1',
            name: 'Family',
            memberships: [membership],
          }),
        },
      } as never,
      {} as never,
    );

    await expect(
      service.findMembersForUser('group-1', 'user-1'),
    ).resolves.toEqual([membership]);
  });

  it('updates the group name via the database', async () => {
    const updatedGroup = {
      id: 'group-1',
      name: 'New Name',
      createdAt: new Date(),
      updatedAt: new Date(),
      memberships: [],
    };
    const groupUpdate = jest.fn().mockResolvedValue(updatedGroup);
    const service = new GroupService(
      {
        group: { update: groupUpdate },
      } as never,
      {} as never,
    );

    const result = await service.updateGroup('group-1', { name: 'New Name' });

    expect(groupUpdate).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: { name: 'New Name' },
      include: {
        memberships: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            user: {
              select: {
                id: true,
                name: true,
                profileImageKey: true,
              },
            },
          },
        },
      },
    });
    expect(result).toEqual(updatedGroup);
  });

  it('passes undefined name to the database when no name is provided', async () => {
    const updatedGroup = {
      id: 'group-1',
      name: 'Family',
      createdAt: new Date(),
      updatedAt: new Date(),
      memberships: [],
    };
    const groupUpdate = jest.fn().mockResolvedValue(updatedGroup);
    const service = new GroupService(
      {
        group: { update: groupUpdate },
      } as never,
      {} as never,
    );

    await service.updateGroup('group-1', {});

    expect(groupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: undefined } }),
    );
  });

  // ─── transferLeadership ───────────────────────────────────────────────────

  it('demotes the current leader and promotes the new leader in a transaction', async () => {
    const tx = {
      groupMember: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'membership-2',
          groupId: 'group-1',
          userId: 'user-2',
          role: GroupMemberRole.MEMBER,
        }),
        update: jest.fn(),
      },
      group: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'group-1',
          name: 'Family',
          memberships: [],
        }),
      },
    };

    prismaService.$transaction.mockImplementation(
      async (
        callback: (
          transactionClient: Prisma.TransactionClient,
        ) => Promise<unknown>,
      ) => callback(tx as unknown as Prisma.TransactionClient),
    );

    const service = new GroupService(prismaService as never, {} as never);

    await service.transferLeadership('group-1', 'user-1', 'user-2');

    expect(tx.groupMember.findUnique).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId: 'group-1', userId: 'user-2' } },
    });
    expect(tx.groupMember.update).toHaveBeenNthCalledWith(1, {
      where: { groupId_userId: { groupId: 'group-1', userId: 'user-1' } },
      data: { role: GroupMemberRole.MEMBER },
    });
    expect(tx.groupMember.update).toHaveBeenNthCalledWith(2, {
      where: { groupId_userId: { groupId: 'group-1', userId: 'user-2' } },
      data: { role: GroupMemberRole.LEADER },
    });
  });

  it('throws NotFoundException when the transfer target is not a group member', async () => {
    const tx = {
      groupMember: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    prismaService.$transaction.mockImplementation(
      async (
        callback: (
          transactionClient: Prisma.TransactionClient,
        ) => Promise<unknown>,
      ) => callback(tx as unknown as Prisma.TransactionClient),
    );

    const service = new GroupService(prismaService as never, {} as never);

    await expect(
      service.transferLeadership('group-1', 'user-1', 'user-99'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequestException when the transfer target is already the leader', async () => {
    const tx = {
      groupMember: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'membership-1',
          userId: 'user-1',
          role: GroupMemberRole.LEADER,
        }),
      },
    };

    prismaService.$transaction.mockImplementation(
      async (
        callback: (
          transactionClient: Prisma.TransactionClient,
        ) => Promise<unknown>,
      ) => callback(tx as unknown as Prisma.TransactionClient),
    );

    const service = new GroupService(prismaService as never, {} as never);

    await expect(
      service.transferLeadership('group-1', 'user-1', 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ─── leaveGroup ───────────────────────────────────────────────────────────

  it('removes a regular member from the group without a transaction', async () => {
    const groupMemberDelete = jest.fn().mockResolvedValue(undefined);
    const groupMembershipService = {
      findMembership: jest.fn().mockResolvedValue({
        id: 'membership-2',
        groupId: 'group-1',
        userId: 'user-2',
        role: GroupMemberRole.MEMBER,
      }),
    };
    const service = new GroupService(
      { groupMember: { delete: groupMemberDelete } } as never,
      groupMembershipService as never,
    );

    await service.leaveGroup('group-1', 'user-2');

    expect(groupMemberDelete).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId: 'group-1', userId: 'user-2' } },
    });
  });

  it('throws ForbiddenException when a non-member tries to leave', async () => {
    const groupMembershipService = {
      findMembership: jest.fn().mockResolvedValue(null),
    };
    const service = new GroupService(
      {} as never,
      groupMembershipService as never,
    );

    await expect(
      service.leaveGroup('group-1', 'user-99'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deletes the group when the last member (leader) leaves', async () => {
    const tx = {
      groupMember: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      group: {
        delete: jest.fn().mockResolvedValue(undefined),
      },
    };

    const prismaMock = {
      $transaction: jest
        .fn()
        .mockImplementation(
          async (
            callback: (
              transactionClient: Prisma.TransactionClient,
            ) => Promise<unknown>,
          ) => callback(tx as unknown as Prisma.TransactionClient),
        ),
    };

    const groupMembershipService = {
      findMembership: jest.fn().mockResolvedValue({
        id: 'membership-1',
        groupId: 'group-1',
        userId: 'user-1',
        role: GroupMemberRole.LEADER,
      }),
    };

    const service = new GroupService(
      prismaMock as never,
      groupMembershipService as never,
    );

    await service.leaveGroup('group-1', 'user-1');

    expect(tx.group.delete).toHaveBeenCalledWith({
      where: { id: 'group-1' },
    });
  });

  it('promotes the longest-standing member when the leader leaves with remaining members', async () => {
    const successor = {
      id: 'membership-2',
      groupId: 'group-1',
      userId: 'user-2',
      role: GroupMemberRole.MEMBER,
    };

    const tx = {
      groupMember: {
        findFirst: jest.fn().mockResolvedValue(successor),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      },
    };

    const prismaMock = {
      $transaction: jest
        .fn()
        .mockImplementation(
          async (
            callback: (
              transactionClient: Prisma.TransactionClient,
            ) => Promise<unknown>,
          ) => callback(tx as unknown as Prisma.TransactionClient),
        ),
    };

    const groupMembershipService = {
      findMembership: jest.fn().mockResolvedValue({
        id: 'membership-1',
        groupId: 'group-1',
        userId: 'user-1',
        role: GroupMemberRole.LEADER,
      }),
    };

    const service = new GroupService(
      prismaMock as never,
      groupMembershipService as never,
    );

    await service.leaveGroup('group-1', 'user-1');

    // Demote current leader first
    expect(tx.groupMember.update).toHaveBeenNthCalledWith(1, {
      where: { groupId_userId: { groupId: 'group-1', userId: 'user-1' } },
      data: { role: GroupMemberRole.MEMBER },
    });
    // Then promote successor
    expect(tx.groupMember.update).toHaveBeenNthCalledWith(2, {
      where: { id: successor.id },
      data: { role: GroupMemberRole.LEADER },
    });
    // Then delete the former leader
    expect(tx.groupMember.delete).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId: 'group-1', userId: 'user-1' } },
    });
  });

  it('selects the successor by earliest join date when the leader leaves', async () => {
    const tx = {
      groupMember: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'membership-oldest',
          groupId: 'group-1',
          userId: 'user-oldest',
          role: GroupMemberRole.MEMBER,
        }),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      },
    };

    const prismaMock = {
      $transaction: jest
        .fn()
        .mockImplementation(
          async (
            callback: (
              transactionClient: Prisma.TransactionClient,
            ) => Promise<unknown>,
          ) => callback(tx as unknown as Prisma.TransactionClient),
        ),
    };

    const groupMembershipService = {
      findMembership: jest.fn().mockResolvedValue({
        id: 'membership-1',
        groupId: 'group-1',
        userId: 'user-1',
        role: GroupMemberRole.LEADER,
      }),
    };

    const service = new GroupService(
      prismaMock as never,
      groupMembershipService as never,
    );

    await service.leaveGroup('group-1', 'user-1');

    expect(tx.groupMember.findFirst).toHaveBeenCalledWith({
      where: { groupId: 'group-1', userId: { not: 'user-1' } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });
});

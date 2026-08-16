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

    const service = new GroupService(prismaService as never);

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
    const service = new GroupService({
      group: {
        findUnique: groupFindUnique,
      },
    } as never);

    await service.findById('group-1');

    expect(groupFindUnique).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      include: {
        memberships: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
  });
});

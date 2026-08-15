import { GroupMemberRole } from '@prisma/client';
import { GroupMembershipService } from '../group-membership.service';

describe('GroupMembershipService', () => {
  it('defaults new memberships to MEMBER', async () => {
    const groupMemberCreate = jest.fn().mockResolvedValue({
      id: 'membership-1',
      groupId: 'group-1',
      userId: 'user-1',
      role: GroupMemberRole.MEMBER,
    });
    const service = new GroupMembershipService({
      groupMember: {
        create: groupMemberCreate,
      },
    } as never);

    await service.addMember({
      groupId: 'group-1',
      userId: 'user-1',
    });

    expect(groupMemberCreate).toHaveBeenCalledWith({
      data: {
        groupId: 'group-1',
        userId: 'user-1',
        role: GroupMemberRole.MEMBER,
      },
    });
  });

  it('uses the composite membership key for lookups', async () => {
    const groupMemberFindUnique = jest.fn().mockResolvedValue(null);
    const service = new GroupMembershipService({
      groupMember: {
        findUnique: groupMemberFindUnique,
      },
    } as never);

    await service.findMembership('group-1', 'user-1');

    expect(groupMemberFindUnique).toHaveBeenCalledWith({
      where: {
        groupId_userId: {
          groupId: 'group-1',
          userId: 'user-1',
        },
      },
    });
  });

  it('reports leader status from the stored membership role', async () => {
    const service = new GroupMembershipService({
      groupMember: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'membership-1',
            groupId: 'group-1',
            userId: 'user-1',
            role: GroupMemberRole.LEADER,
          })
          .mockResolvedValueOnce({
            id: 'membership-2',
            groupId: 'group-1',
            userId: 'user-2',
            role: GroupMemberRole.MEMBER,
          }),
      },
    } as never);

    await expect(service.isLeader('group-1', 'user-1')).resolves.toBe(true);
    await expect(service.isLeader('group-1', 'user-2')).resolves.toBe(false);
  });
});

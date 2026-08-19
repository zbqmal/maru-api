import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { GroupMemberRole } from '@prisma/client';
import { validateEnvironment } from '../../src/common/config/environment.validation';
import { PrismaService } from '../../src/modules/database/prisma.service';
import { GroupDeletionService } from '../../src/modules/group/group-deletion.service';
import { GroupMembershipService } from '../../src/modules/group/group-membership.service';
import { GroupModule } from '../../src/modules/group/group.module';
import { GroupService } from '../../src/modules/group/group.service';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;

describe('GroupModule (integration)', () => {
  let prismaService: PrismaService;
  let groupService: GroupService;
  let groupMembershipService: GroupMembershipService;
  let groupDeletionService: GroupDeletionService;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error(
        'TEST_DATABASE_URL or DATABASE_URL must be set for tests.',
      );
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          ignoreEnvFile: true,
          validate: validateEnvironment,
        }),
        GroupModule,
      ],
    }).compile();

    prismaService = moduleRef.get(PrismaService);
    groupService = moduleRef.get(GroupService);
    groupMembershipService = moduleRef.get(GroupMembershipService);
    groupDeletionService = moduleRef.get(GroupDeletionService);
  });

  beforeEach(async () => {
    await prismaService.group.deleteMany();
    await prismaService.session.deleteMany();
    await prismaService.passwordResetToken.deleteMany();
    await prismaService.user.deleteMany();
  });

  afterAll(async () => {
    await prismaService.$disconnect();
  });

  it('creates a group with exactly one leader membership', async () => {
    const leader = await prismaService.user.create({
      data: {
        email: 'leader@example.com',
        passwordHash: 'placeholder-password-hash',
        name: 'Leader User',
      },
    });

    const group = await groupService.createGroupWithLeader({
      name: 'Family',
      leaderUserId: leader.id,
    });

    expect(group.name).toBe('Family');
    expect(group.memberships).toHaveLength(1);
    expect(group.memberships[0]).toMatchObject({
      userId: leader.id,
      role: GroupMemberRole.LEADER,
    });

    await expect(
      groupMembershipService.findLeader(group.id),
    ).resolves.toMatchObject({
      userId: leader.id,
      role: GroupMemberRole.LEADER,
    });
  });

  it('rejects creating a duplicate membership for the same user and group', async () => {
    const [leader, member] = await Promise.all([
      prismaService.user.create({
        data: {
          email: 'duplicate-leader@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Duplicate Leader',
        },
      }),
      prismaService.user.create({
        data: {
          email: 'duplicate-member@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Duplicate Member',
        },
      }),
    ]);

    const group = await groupService.createGroupWithLeader({
      name: 'Friends',
      leaderUserId: leader.id,
    });

    await groupMembershipService.addMember({
      groupId: group.id,
      userId: member.id,
    });

    await expect(
      groupMembershipService.addMember({
        groupId: group.id,
        userId: member.id,
      }),
    ).rejects.toThrow();
  });

  it('rejects a second leader for the same group', async () => {
    const [leader, secondUser] = await Promise.all([
      prismaService.user.create({
        data: {
          email: 'first-leader@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'First Leader',
        },
      }),
      prismaService.user.create({
        data: {
          email: 'second-leader@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Second Leader',
        },
      }),
    ]);

    const group = await groupService.createGroupWithLeader({
      name: 'Team',
      leaderUserId: leader.id,
    });

    await expect(
      groupMembershipService.addMember({
        groupId: group.id,
        userId: secondUser.id,
        role: GroupMemberRole.LEADER,
      }),
    ).rejects.toThrow();
  });

  it('lists only the groups that a user belongs to', async () => {
    const [leader, member, outsider] = await Promise.all([
      prismaService.user.create({
        data: {
          email: 'list-leader@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'List Leader',
        },
      }),
      prismaService.user.create({
        data: {
          email: 'list-member@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'List Member',
        },
      }),
      prismaService.user.create({
        data: {
          email: 'list-outsider@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'List Outsider',
        },
      }),
    ]);

    const [sharedGroup, outsiderGroup] = await Promise.all([
      groupService.createGroupWithLeader({
        name: 'Shared Group',
        leaderUserId: leader.id,
      }),
      groupService.createGroupWithLeader({
        name: 'Outsider Group',
        leaderUserId: outsider.id,
      }),
    ]);

    await groupMembershipService.addMember({
      groupId: sharedGroup.id,
      userId: member.id,
    });

    const groups = await groupService.findGroupsForUser(member.id);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: sharedGroup.id,
      name: 'Shared Group',
    });
    expect(groups[0].memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: leader.id,
          role: GroupMemberRole.LEADER,
          user: {
            id: leader.id,
            name: 'List Leader',
            profileImageKey: null,
          },
        }),
        expect.objectContaining({
          userId: member.id,
          role: GroupMemberRole.MEMBER,
          user: {
            id: member.id,
            name: 'List Member',
            profileImageKey: null,
          },
        }),
      ]),
    );
    expect(groups.map((group) => group.id)).not.toContain(outsiderGroup.id);
  });

  it('enforces membership for group detail retrieval', async () => {
    const [leader, outsider] = await Promise.all([
      prismaService.user.create({
        data: {
          email: 'detail-leader@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Detail Leader',
        },
      }),
      prismaService.user.create({
        data: {
          email: 'detail-outsider@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Detail Outsider',
        },
      }),
    ]);

    const group = await groupService.createGroupWithLeader({
      name: 'Private Group',
      leaderUserId: leader.id,
    });

    await expect(
      groupService.findByIdForUser(group.id, outsider.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns a not-found error for an unknown group detail request', async () => {
    await expect(
      groupService.findByIdForUser('missing-group-id', 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns ordered group members for an authorized user', async () => {
    const [leader, member] = await Promise.all([
      prismaService.user.create({
        data: {
          email: 'members-leader@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Members Leader',
        },
      }),
      prismaService.user.create({
        data: {
          email: 'members-user@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Members User',
        },
      }),
    ]);

    const group = await groupService.createGroupWithLeader({
      name: 'Members Group',
      leaderUserId: leader.id,
    });

    await groupMembershipService.addMember({
      groupId: group.id,
      userId: member.id,
    });

    const members = await groupService.findMembersForUser(group.id, leader.id);

    expect(members).toHaveLength(2);
    expect(members[0]).toMatchObject({
      userId: leader.id,
      role: GroupMemberRole.LEADER,
      user: {
        id: leader.id,
        name: 'Members Leader',
        profileImageKey: null,
      },
    });
    expect(members[1]).toMatchObject({
      userId: member.id,
      role: GroupMemberRole.MEMBER,
      user: {
        id: member.id,
        name: 'Members User',
        profileImageKey: null,
      },
    });
  });

  it('rejects persisting a group without a leader membership', async () => {
    await expect(
      prismaService.group.create({
        data: {
          name: 'Invalid Group',
        },
      }),
    ).rejects.toThrow('must have exactly one leader');
  });

  it('rejects removing the final leader while the group still exists', async () => {
    const leader = await prismaService.user.create({
      data: {
        email: 'remove-leader@example.com',
        passwordHash: 'placeholder-password-hash',
        name: 'Remove Leader',
      },
    });

    const group = await groupService.createGroupWithLeader({
      name: 'Invariant Group',
      leaderUserId: leader.id,
    });

    await expect(
      prismaService.groupMember.delete({
        where: {
          groupId_userId: {
            groupId: group.id,
            userId: leader.id,
          },
        },
      }),
    ).rejects.toThrow('must have exactly one leader');
  });

  // ─── transferLeadership ───────────────────────────────────────────────────

  it('transfers leadership from the current leader to an existing member', async () => {
    const [leader, member] = await Promise.all([
      prismaService.user.create({
        data: {
          email: 'transfer-leader@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Transfer Leader',
        },
      }),
      prismaService.user.create({
        data: {
          email: 'transfer-member@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Transfer Member',
        },
      }),
    ]);

    const group = await groupService.createGroupWithLeader({
      name: 'Transfer Group',
      leaderUserId: leader.id,
    });

    await groupMembershipService.addMember({
      groupId: group.id,
      userId: member.id,
    });

    const updated = await groupService.transferLeadership(
      group.id,
      leader.id,
      member.id,
    );

    const leaderMembership = updated.memberships.find(
      (m) => m.userId === leader.id,
    );
    const memberMembership = updated.memberships.find(
      (m) => m.userId === member.id,
    );

    expect(leaderMembership?.role).toBe(GroupMemberRole.MEMBER);
    expect(memberMembership?.role).toBe(GroupMemberRole.LEADER);
  });

  it('rejects leadership transfer to a non-member', async () => {
    const leader = await prismaService.user.create({
      data: {
        email: 'transfer-reject-leader@example.com',
        passwordHash: 'placeholder-password-hash',
        name: 'Transfer Reject Leader',
      },
    });

    const group = await groupService.createGroupWithLeader({
      name: 'Transfer Reject Group',
      leaderUserId: leader.id,
    });

    await expect(
      groupService.transferLeadership(group.id, leader.id, 'non-member-id'),
    ).rejects.toThrow();
  });

  it('rejects self-transfer when the leader is already the leader', async () => {
    const leader = await prismaService.user.create({
      data: {
        email: 'transfer-self-leader@example.com',
        passwordHash: 'placeholder-password-hash',
        name: 'Transfer Self Leader',
      },
    });

    const group = await groupService.createGroupWithLeader({
      name: 'Transfer Self Group',
      leaderUserId: leader.id,
    });

    await expect(
      groupService.transferLeadership(group.id, leader.id, leader.id),
    ).rejects.toThrow();
  });

  // ─── leaveGroup ───────────────────────────────────────────────────────────

  it('removes a regular member when they leave', async () => {
    const [leader, member] = await Promise.all([
      prismaService.user.create({
        data: {
          email: 'leave-leader@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Leave Leader',
        },
      }),
      prismaService.user.create({
        data: {
          email: 'leave-member@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Leave Member',
        },
      }),
    ]);

    const group = await groupService.createGroupWithLeader({
      name: 'Leave Group',
      leaderUserId: leader.id,
    });

    await groupMembershipService.addMember({
      groupId: group.id,
      userId: member.id,
    });

    await groupService.leaveGroup(group.id, member.id);

    const remaining = await groupMembershipService.listMembers(group.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].userId).toBe(leader.id);
  });

  it('promotes the longest-standing member when the leader leaves', async () => {
    const [leader, firstMember, secondMember] = await Promise.all([
      prismaService.user.create({
        data: {
          email: 'leader-leave-leader@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Leader Leave Leader',
        },
      }),
      prismaService.user.create({
        data: {
          email: 'leader-leave-first@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Leader Leave First',
        },
      }),
      prismaService.user.create({
        data: {
          email: 'leader-leave-second@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Leader Leave Second',
        },
      }),
    ]);

    const group = await groupService.createGroupWithLeader({
      name: 'Leader Leave Group',
      leaderUserId: leader.id,
    });

    await groupMembershipService.addMember({
      groupId: group.id,
      userId: firstMember.id,
    });
    await groupMembershipService.addMember({
      groupId: group.id,
      userId: secondMember.id,
    });

    await groupService.leaveGroup(group.id, leader.id);

    const remaining = await groupMembershipService.listMembers(group.id);
    expect(remaining).toHaveLength(2);
    expect(remaining.find((m) => m.userId === leader.id)).toBeUndefined();

    const newLeader = remaining.find((m) => m.role === GroupMemberRole.LEADER);
    expect(newLeader?.userId).toBe(firstMember.id);
  });

  it('deletes the group when the sole leader leaves', async () => {
    const leader = await prismaService.user.create({
      data: {
        email: 'sole-leader-leave@example.com',
        passwordHash: 'placeholder-password-hash',
        name: 'Sole Leader Leave',
      },
    });

    const group = await groupService.createGroupWithLeader({
      name: 'Sole Leader Group',
      leaderUserId: leader.id,
    });

    await groupService.leaveGroup(group.id, leader.id);

    const deleted = await prismaService.group.findUnique({
      where: { id: group.id },
    });
    expect(deleted).toBeNull();
  });

  // ─── GroupDeletionService ─────────────────────────────────────────────────

  it('deletes the group and all memberships when leader explicitly deletes', async () => {
    const leader = await prismaService.user.create({
      data: {
        email: 'delete-leader@example.com',
        passwordHash: 'placeholder-password-hash',
        name: 'Delete Leader',
      },
    });
    const member = await prismaService.user.create({
      data: {
        email: 'delete-member@example.com',
        passwordHash: 'placeholder-password-hash',
        name: 'Delete Member',
      },
    });

    const group = await groupService.createGroupWithLeader({
      name: 'Delete Group',
      leaderUserId: leader.id,
    });

    await groupMembershipService.addMember({
      groupId: group.id,
      userId: member.id,
    });

    await groupDeletionService.deleteGroup(group.id);

    const deletedGroup = await prismaService.group.findUnique({
      where: { id: group.id },
    });
    expect(deletedGroup).toBeNull();

    const remainingMembers = await prismaService.groupMember.findMany({
      where: { groupId: group.id },
    });
    expect(remainingMembers).toHaveLength(0);
  });

  it('throws NotFoundException when deleting a group that does not exist', async () => {
    await expect(
      groupDeletionService.deleteGroup('non-existent-group-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { GroupMemberRole } from '@prisma/client';
import { validateEnvironment } from '../../../common/config/environment.validation';
import { PrismaService } from '../../database/prisma.service';
import { GroupMembershipService } from '../group-membership.service';
import { GroupModule } from '../group.module';
import { GroupService } from '../group.service';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;

describe('GroupModule (integration)', () => {
  let prismaService: PrismaService;
  let groupService: GroupService;
  let groupMembershipService: GroupMembershipService;

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
          user: expect.objectContaining({ name: 'List Leader' }),
        }),
        expect.objectContaining({
          userId: member.id,
          role: GroupMemberRole.MEMBER,
          user: expect.objectContaining({ name: 'List Member' }),
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
});

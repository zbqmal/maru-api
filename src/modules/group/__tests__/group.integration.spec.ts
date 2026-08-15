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
    await prismaService.groupMember.deleteMany();
    await prismaService.group.deleteMany();
    await prismaService.session.deleteMany();
    await prismaService.passwordResetToken.deleteMany();
    await prismaService.user.deleteMany();
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

    await expect(groupMembershipService.findLeader(group.id)).resolves.toMatchObject(
      {
        userId: leader.id,
        role: GroupMemberRole.LEADER,
      },
    );
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

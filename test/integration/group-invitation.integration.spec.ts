import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { validateEnvironment } from '../../src/common/config/environment.validation';
import { PrismaService } from '../../src/modules/database/prisma.service';
import { EmailService } from '../../src/modules/email/email.service';
import { GroupInvitationService } from '../../src/modules/group/group-invitation.service';
import { GroupModule } from '../../src/modules/group/group.module';
import { GroupService } from '../../src/modules/group/group.service';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;

describe('GroupInvitationService (integration)', () => {
  let prismaService: PrismaService;
  let groupService: GroupService;
  let invitationService: GroupInvitationService;
  let emailSend: jest.Mock;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error(
        'TEST_DATABASE_URL or DATABASE_URL must be set for tests.',
      );
    }

    emailSend = jest.fn().mockResolvedValue(undefined);

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
    })
      .overrideProvider(EmailService)
      .useValue({ send: emailSend })
      .compile();

    prismaService = moduleRef.get(PrismaService);
    groupService = moduleRef.get(GroupService);
    invitationService = moduleRef.get(GroupInvitationService);
  });

  beforeEach(async () => {
    emailSend.mockClear();
    await prismaService.groupInvitation.deleteMany();
    await prismaService.group.deleteMany();
    await prismaService.session.deleteMany();
    await prismaService.passwordResetToken.deleteMany();
    await prismaService.user.deleteMany();
  });

  afterAll(async () => {
    await prismaService.$disconnect();
  });

  async function createLeaderAndGroup() {
    const leader = await prismaService.user.create({
      data: {
        email: 'leader@example.com',
        passwordHash: 'placeholder-hash',
        name: 'Leader User',
      },
    });

    const group = await groupService.createGroupWithLeader({
      name: 'Family',
      leaderUserId: leader.id,
    });

    return { leader, group };
  }

  it('creates an invitation and stores a hash (not the raw token)', async () => {
    const { leader, group } = await createLeaderAndGroup();

    const invitation = await invitationService.createInvitation(
      group.id,
      leader.id,
      'alice@example.com',
    );

    expect(invitation.invitedEmail).toBe('alice@example.com');
    expect(invitation.groupId).toBe(group.id);
    expect(invitation.acceptedAt).toBeNull();
    expect(invitation.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // The stored tokenHash must not equal the raw token value returned from
    // the service's internal token generator (i.e. it is hashed).
    const persisted = await prismaService.groupInvitation.findUnique({
      where: { id: invitation.id },
    });
    expect(persisted).not.toBeNull();
    // tokenHash is a 64-char hex string (sha256)
    expect(persisted!.tokenHash).toHaveLength(64);
    expect(persisted!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sends an invitation email to the invited address', async () => {
    const { leader, group } = await createLeaderAndGroup();

    await invitationService.createInvitation(
      group.id,
      leader.id,
      'alice@example.com',
    );

    expect(emailSend).toHaveBeenCalledTimes(1);
    const [options] = emailSend.mock.calls[0] as [
      { to: string; subject: string },
    ];
    expect(options.to).toBe('alice@example.com');
    expect(options.subject).toContain('Family');
  });

  it('rejects an invitation from a non-leader member', async () => {
    const { group } = await createLeaderAndGroup();

    const member = await prismaService.user.create({
      data: {
        email: 'member@example.com',
        passwordHash: 'placeholder-hash',
        name: 'Member User',
      },
    });
    await prismaService.groupMember.create({
      data: { groupId: group.id, userId: member.id },
    });

    await expect(
      invitationService.createInvitation(
        group.id,
        member.id,
        'alice@example.com',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an invitation when the target email is already a member', async () => {
    const { leader, group } = await createLeaderAndGroup();

    const existingMember = await prismaService.user.create({
      data: {
        email: 'already@example.com',
        passwordHash: 'placeholder-hash',
        name: 'Existing Member',
      },
    });
    await prismaService.groupMember.create({
      data: { groupId: group.id, userId: existingMember.id },
    });

    await expect(
      invitationService.createInvitation(
        group.id,
        leader.id,
        'already@example.com',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a duplicate pending invitation for the same email', async () => {
    const { leader, group } = await createLeaderAndGroup();

    await invitationService.createInvitation(
      group.id,
      leader.id,
      'alice@example.com',
    );

    await expect(
      invitationService.createInvitation(
        group.id,
        leader.id,
        'alice@example.com',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows re-inviting the same email after the previous invitation expired', async () => {
    const { leader, group } = await createLeaderAndGroup();

    // Insert an already-expired invitation manually.
    await prismaService.groupInvitation.create({
      data: {
        groupId: group.id,
        invitedEmail: 'alice@example.com',
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    // A new invitation for the same email should succeed.
    const invitation = await invitationService.createInvitation(
      group.id,
      leader.id,
      'alice@example.com',
    );

    expect(invitation.invitedEmail).toBe('alice@example.com');
  });

  it('persists the invitation in the database', async () => {
    const { leader, group } = await createLeaderAndGroup();

    const invitation = await invitationService.createInvitation(
      group.id,
      leader.id,
      'alice@example.com',
    );

    const count = await prismaService.groupInvitation.count({
      where: { groupId: group.id, invitedEmail: 'alice@example.com' },
    });
    expect(count).toBe(1);

    const persisted = await prismaService.groupInvitation.findUnique({
      where: { id: invitation.id },
    });
    expect(persisted?.groupId).toBe(group.id);
    expect(persisted?.acceptedAt).toBeNull();
  });
});

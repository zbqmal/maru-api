import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { GroupMemberRole } from '@prisma/client';
import { GroupInvitationService } from '../group-invitation.service';

const GROUP_ID = 'group-1';
const LEADER_ID = 'user-leader';
const MEMBER_ID = 'user-member';
const INVITED_EMAIL = 'alice@example.com';

function makeValidInvitationRecord() {
  return {
    id: 'invitation-1',
    groupId: GROUP_ID,
    invitedEmail: INVITED_EMAIL,
    tokenHash: 'hashed-token',
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    acceptedAt: null,
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    group: {
      name: 'Family',
    },
  };
}

function makeJoinedGroup() {
  return {
    id: GROUP_ID,
    name: 'Family',
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    updatedAt: new Date('2026-08-20T00:00:00.000Z'),
    memberships: [
      {
        id: 'membership-1',
        groupId: GROUP_ID,
        userId: LEADER_ID,
        role: GroupMemberRole.LEADER,
        createdAt: new Date('2026-08-20T00:00:00.000Z'),
        updatedAt: new Date('2026-08-20T00:00:00.000Z'),
        user: {
          id: LEADER_ID,
          name: 'Leader User',
          profileImageKey: null,
        },
      },
      {
        id: 'membership-2',
        groupId: GROUP_ID,
        userId: MEMBER_ID,
        role: GroupMemberRole.MEMBER,
        createdAt: new Date('2026-08-20T00:00:00.000Z'),
        updatedAt: new Date('2026-08-20T00:00:00.000Z'),
        user: {
          id: MEMBER_ID,
          name: 'Invited User',
          profileImageKey: null,
        },
      },
    ],
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  const prisma = {
    group: {
      findUnique: jest.fn().mockResolvedValue({ id: GROUP_ID, name: 'Family' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(makeJoinedGroup()),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({ email: INVITED_EMAIL }),
    },
    groupMember: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'membership-2',
        groupId: GROUP_ID,
        userId: MEMBER_ID,
        role: GroupMemberRole.MEMBER,
      }),
    },
    groupInvitation: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(makeValidInvitationRecord()),
      create: jest.fn().mockResolvedValue({
        id: 'invitation-1',
        groupId: GROUP_ID,
        invitedEmail: INVITED_EMAIL,
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        acceptedAt: null,
        createdAt: new Date(),
      }),
      update: jest.fn().mockResolvedValue(undefined),
    },
    $transaction: jest.fn(),
    ...overrides,
  };

  prisma.$transaction.mockImplementation(
    async (
      callback: (client: typeof prisma) => Promise<unknown>,
    ): Promise<unknown> => callback(prisma),
  );

  return prisma;
}

function makeGroupMembershipService(isLeader = true) {
  return { isLeader: jest.fn().mockResolvedValue(isLeader) };
}

function makeSessionTokenService() {
  return {
    generateToken: jest.fn().mockReturnValue('raw-token-abc123'),
    hashToken: jest.fn().mockReturnValue('hashed-token'),
  };
}

function makeEmailService() {
  return { send: jest.fn().mockResolvedValue(undefined) };
}

function makeConfigService(frontendUrl = 'https://app.example.com') {
  return { getOrThrow: jest.fn().mockReturnValue(frontendUrl) };
}

function buildService(
  overrides: {
    prisma?: ReturnType<typeof makePrisma>;
    membership?: ReturnType<typeof makeGroupMembershipService>;
    token?: ReturnType<typeof makeSessionTokenService>;
    email?: ReturnType<typeof makeEmailService>;
    config?: ReturnType<typeof makeConfigService>;
  } = {},
) {
  return new GroupInvitationService(
    (overrides.prisma ?? makePrisma()) as never,
    (overrides.membership ?? makeGroupMembershipService()) as never,
    overrides.token ?? makeSessionTokenService(),
    (overrides.email ?? makeEmailService()) as never,
    (overrides.config ?? makeConfigService()) as never,
  );
}

describe('GroupInvitationService', () => {
  describe('createInvitation', () => {
    it('throws ForbiddenException when caller is not a leader', async () => {
      const service = buildService({
        membership: makeGroupMembershipService(false),
      });

      await expect(
        service.createInvitation(GROUP_ID, LEADER_ID, INVITED_EMAIL),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException when group does not exist', async () => {
      const prisma = makePrisma();
      prisma.group.findUnique.mockResolvedValue(null);

      const service = buildService({ prisma });

      await expect(
        service.createInvitation(GROUP_ID, LEADER_ID, INVITED_EMAIL),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when invited email already belongs to a group member', async () => {
      const prisma = makePrisma();
      prisma.user.findFirst.mockResolvedValue({ id: 'user-2' });

      const service = buildService({ prisma });

      await expect(
        service.createInvitation(GROUP_ID, LEADER_ID, INVITED_EMAIL),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException when a pending invitation already exists for the email', async () => {
      const prisma = makePrisma();
      prisma.groupInvitation.findFirst.mockResolvedValue({
        id: 'invitation-existing',
      });

      const service = buildService({ prisma });

      await expect(
        service.createInvitation(GROUP_ID, LEADER_ID, INVITED_EMAIL),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates the invitation record with a hashed token', async () => {
      const prisma = makePrisma();
      const token = makeSessionTokenService();
      const service = buildService({ prisma, token });

      await service.createInvitation(GROUP_ID, LEADER_ID, INVITED_EMAIL);

      expect(token.generateToken).toHaveBeenCalledWith(32);
      expect(token.hashToken).toHaveBeenCalledWith('raw-token-abc123');
      expect(prisma.groupInvitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            groupId: GROUP_ID,
            invitedEmail: INVITED_EMAIL,
            tokenHash: 'hashed-token',
          }) as unknown,
        }) as unknown,
      );
    });

    it('normalizes the invited email before checking and saving it', async () => {
      const prisma = makePrisma();
      const service = buildService({ prisma });

      await service.createInvitation(GROUP_ID, LEADER_ID, '  ALICE@EXAMPLE.COM ');

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: INVITED_EMAIL,
          }) as unknown,
        }) as unknown,
      );
      expect(prisma.groupInvitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            invitedEmail: INVITED_EMAIL,
          }) as unknown,
        }) as unknown,
      );
    });

    it('sends an invitation email containing the accept URL', async () => {
      const email = makeEmailService();
      const service = buildService({ email });

      await service.createInvitation(GROUP_ID, LEADER_ID, INVITED_EMAIL);

      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: INVITED_EMAIL,
          subject: expect.stringContaining('Family') as unknown,
        }) as unknown,
      );

      const callArg = (
        email.send.mock.calls[0] as [{ html: string; text: string }]
      )[0];
      expect(callArg.html).toContain('raw-token-abc123');
      expect(callArg.text).toContain('raw-token-abc123');
    });

    it('returns the created invitation', async () => {
      const service = buildService();

      const result = await service.createInvitation(
        GROUP_ID,
        LEADER_ID,
        INVITED_EMAIL,
      );

      expect(result).toMatchObject({
        id: 'invitation-1',
        groupId: GROUP_ID,
        invitedEmail: INVITED_EMAIL,
        acceptedAt: null,
      });
    });

    it('checks for existing members using the normalized invited email', async () => {
      const prisma = makePrisma();
      const service = buildService({ prisma });

      await service.createInvitation(GROUP_ID, LEADER_ID, '  ALICE@EXAMPLE.COM ');

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: INVITED_EMAIL,
            groupMemberships: { some: { groupId: GROUP_ID } },
          }) as unknown,
        }) as unknown,
      );
    });

    it('checks for pending (non-expired, non-accepted) duplicate invitations', async () => {
      const prisma = makePrisma();
      const service = buildService({ prisma });

      await service.createInvitation(GROUP_ID, LEADER_ID, INVITED_EMAIL);

      expect(prisma.groupInvitation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            groupId: GROUP_ID,
            invitedEmail: INVITED_EMAIL,
            acceptedAt: null,
            expiresAt: { gt: expect.any(Date) as unknown },
          }) as unknown,
        }) as unknown,
      );
    });
  });

  describe('validateInvitation', () => {
    it('returns invitation details for a valid token', async () => {
      const prisma = makePrisma();
      const token = makeSessionTokenService();
      const service = buildService({ prisma, token });

      await expect(
        service.validateInvitation(' raw-token-abc123 '),
      ).resolves.toMatchObject({
        id: 'invitation-1',
        groupId: GROUP_ID,
        groupName: 'Family',
        invitedEmail: INVITED_EMAIL,
      });

      expect(token.hashToken).toHaveBeenCalledWith('raw-token-abc123');
      expect(prisma.groupInvitation.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: 'hashed-token' },
        }) as unknown,
      );
    });

    it('throws NotFoundException for an unknown token', async () => {
      const prisma = makePrisma();
      prisma.groupInvitation.findUnique.mockResolvedValue(null);

      const service = buildService({ prisma });

      await expect(
        service.validateInvitation('missing-token'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws GoneException for an expired invitation', async () => {
      const prisma = makePrisma();
      prisma.groupInvitation.findUnique.mockResolvedValue({
        ...makeValidInvitationRecord(),
        expiresAt: new Date(Date.now() - 1000),
      });

      const service = buildService({ prisma });

      await expect(
        service.validateInvitation('expired-token'),
      ).rejects.toBeInstanceOf(GoneException);
    });

    it('throws ConflictException for an already-used invitation', async () => {
      const prisma = makePrisma();
      prisma.groupInvitation.findUnique.mockResolvedValue({
        ...makeValidInvitationRecord(),
        acceptedAt: new Date(),
      });

      const service = buildService({ prisma });

      await expect(
        service.validateInvitation('used-token'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('acceptInvitation', () => {
    it('creates a member and marks the invitation accepted', async () => {
      const prisma = makePrisma();
      const service = buildService({ prisma });

      const result = await service.acceptInvitation('raw-token-abc123', MEMBER_ID);

      expect(prisma.groupMember.create).toHaveBeenCalledWith({
        data: {
          groupId: GROUP_ID,
          userId: MEMBER_ID,
          role: GroupMemberRole.MEMBER,
        },
      });
      expect(prisma.groupInvitation.update).toHaveBeenCalledWith({
        where: { id: 'invitation-1' },
        data: { acceptedAt: expect.any(Date) as unknown },
      });
      expect(result.memberships).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: MEMBER_ID,
            role: GroupMemberRole.MEMBER,
          }),
        ]),
      );
    });

    it('throws ForbiddenException when the authenticated email does not match', async () => {
      const prisma = makePrisma({
        user: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue({ email: 'other@example.com' }),
        },
      });
      const service = buildService({ prisma });

      await expect(
        service.acceptInvitation('raw-token-abc123', MEMBER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.groupMember.create).not.toHaveBeenCalled();
    });

    it('matches invited email case-insensitively during acceptance', async () => {
      const prisma = makePrisma({
        groupInvitation: {
          ...makePrisma().groupInvitation,
          findUnique: jest.fn().mockResolvedValue({
            ...makeValidInvitationRecord(),
            invitedEmail: 'ALICE@EXAMPLE.COM',
          }),
        },
        user: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUnique: jest.fn().mockResolvedValue({ email: INVITED_EMAIL }),
        },
      });
      const service = buildService({ prisma });

      await expect(
        service.acceptInvitation('raw-token-abc123', MEMBER_ID),
      ).resolves.toMatchObject({
        id: GROUP_ID,
      });
    });

    it('throws ConflictException when the user is already a group member', async () => {
      const prisma = makePrisma();
      prisma.groupMember.findUnique.mockResolvedValue({ id: 'membership-existing' });

      const service = buildService({ prisma });

      await expect(
        service.acceptInvitation('raw-token-abc123', MEMBER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.groupInvitation.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown token', async () => {
      const prisma = makePrisma();
      prisma.groupInvitation.findUnique.mockResolvedValue(null);

      const service = buildService({ prisma });

      await expect(
        service.acceptInvitation('missing-token', MEMBER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws GoneException for an expired invitation', async () => {
      const prisma = makePrisma();
      prisma.groupInvitation.findUnique.mockResolvedValue({
        ...makeValidInvitationRecord(),
        expiresAt: new Date(Date.now() - 1000),
      });

      const service = buildService({ prisma });

      await expect(
        service.acceptInvitation('expired-token', MEMBER_ID),
      ).rejects.toBeInstanceOf(GoneException);
    });

    it('throws ConflictException for an already-used invitation', async () => {
      const prisma = makePrisma();
      prisma.groupInvitation.findUnique.mockResolvedValue({
        ...makeValidInvitationRecord(),
        acceptedAt: new Date(),
      });

      const service = buildService({ prisma });

      await expect(
        service.acceptInvitation('used-token', MEMBER_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});

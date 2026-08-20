import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GroupInvitationService } from '../group-invitation.service';

const GROUP_ID = 'group-1';
const LEADER_ID = 'user-leader';
const INVITED_EMAIL = 'alice@example.com';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    group: {
      findUnique: jest.fn().mockResolvedValue({ id: GROUP_ID, name: 'Family' }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    groupInvitation: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'invitation-1',
        groupId: GROUP_ID,
        invitedEmail: INVITED_EMAIL,
        tokenHash: 'hashed-token',
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        acceptedAt: null,
        createdAt: new Date(),
      }),
    },
    ...overrides,
  };
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

    it('checks for existing members using the exact invited email', async () => {
      const prisma = makePrisma();
      const service = buildService({ prisma });

      await service.createInvitation(GROUP_ID, LEADER_ID, INVITED_EMAIL);

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
});

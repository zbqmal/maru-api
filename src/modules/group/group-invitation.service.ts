import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GroupMemberRole, Prisma, type GroupInvitation } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../common/config/environment.variables';
import type { GroupWithMemberships } from '../../lib/types/group.types';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import { normalizeEmail } from '../auth/utils/string.util';
import { SessionTokenService } from '../auth/services/session-token.service';
import { GroupMembershipService } from './group-membership.service';

const INVITATION_TTL_MS = 1000 * 60 * 60 * 72; // 72 hours

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

const invitationValidationInclude = {
  group: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.GroupInvitationInclude;

type InvitationValidationRecord = Prisma.GroupInvitationGetPayload<{
  include: typeof invitationValidationInclude;
}>;

export interface InvitationValidationResult {
  id: string;
  groupId: string;
  groupName: string;
  invitedEmail: string;
  expiresAt: Date;
  createdAt: Date;
}

@Injectable()
export class GroupInvitationService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly groupMembershipService: GroupMembershipService,
    private readonly sessionTokenService: SessionTokenService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async createInvitation(
    groupId: string,
    invitedByUserId: string,
    invitedEmail: string,
  ): Promise<GroupInvitation> {
    const normalizedInvitedEmail = normalizeEmail(invitedEmail);

    // 1. Verify the caller is a leader of this group.
    const isLeader = await this.groupMembershipService.isLeader(
      groupId,
      invitedByUserId,
    );
    if (!isLeader) {
      throw new ForbiddenException('Group leader role required.');
    }

    // 2. Verify the group actually exists (isLeader only checks membership).
    const group = await this.prismaService.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true },
    });
    if (group === null) {
      throw new NotFoundException('Group not found.');
    }

    // 3. Prevent inviting a user who is already a member via their email.
    const existingMember = await this.prismaService.user.findFirst({
      where: {
        email: normalizedInvitedEmail,
        groupMemberships: { some: { groupId } },
      },
      select: { id: true },
    });
    if (existingMember !== null) {
      throw new ConflictException(
        'The invited email address already belongs to a group member.',
      );
    }

    // 4. Prevent a duplicate pending (non-expired, non-accepted) invitation.
    const pendingInvitation =
      await this.prismaService.groupInvitation.findFirst({
        where: {
          groupId,
          invitedEmail: normalizedInvitedEmail,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
    if (pendingInvitation !== null) {
      throw new ConflictException(
        'A pending invitation for this email address already exists.',
      );
    }

    // 5. Generate a secure random token and store its hash.
    const rawToken = this.sessionTokenService.generateToken(32);
    const tokenHash = this.sessionTokenService.hashToken(rawToken);

    const invitation = await this.prismaService.groupInvitation.create({
      data: {
        groupId,
        invitedEmail: normalizedInvitedEmail,
        tokenHash,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });

    // 6. Send the invitation email (fire-and-forget errors are swallowed so
    //    the HTTP response is not blocked by transient email failures).
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const inviteUrl = `${frontendUrl}/invitations/accept?token=${rawToken}`;

    await this.emailService.send({
      to: normalizedInvitedEmail,
      subject: `You've been invited to join ${group.name} on Maru`,
      html: buildInvitationEmail(group.name, inviteUrl),
      text: `You've been invited to join the group "${group.name}" on Maru.\n\nAccept your invitation by visiting:\n${inviteUrl}\n\nThis link expires in 72 hours.`,
    });

    return invitation;
  }

  async validateInvitation(token: string): Promise<InvitationValidationResult> {
    const invitation = await this.findInvitationByToken(
      this.prismaService,
      token,
    );
    this.assertInvitationCanBeAccepted(invitation);

    return {
      id: invitation.id,
      groupId: invitation.groupId,
      groupName: invitation.group.name,
      invitedEmail: invitation.invitedEmail,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }

  async acceptInvitation(
    token: string,
    userId: string,
  ): Promise<GroupWithMemberships> {
    return this.prismaService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const invitation = await this.findInvitationByToken(tx, token);
        this.assertInvitationCanBeAccepted(invitation);

        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });

        if (user === null) {
          throw new NotFoundException('User not found.');
        }

        if (
          normalizeEmail(user.email) !== normalizeEmail(invitation.invitedEmail)
        ) {
          throw new ForbiddenException(
            'Invitation email does not match the authenticated account.',
          );
        }

        const existingMembership = await tx.groupMember.findUnique({
          where: {
            groupId_userId: {
              groupId: invitation.groupId,
              userId,
            },
          },
          select: { id: true },
        });

        if (existingMembership !== null) {
          throw new ConflictException('You are already a member of this group.');
        }

        try {
          await tx.groupMember.create({
            data: {
              groupId: invitation.groupId,
              userId,
              role: GroupMemberRole.MEMBER,
            },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            throw new ConflictException(
              'You are already a member of this group.',
            );
          }

          throw error;
        }

        await tx.groupInvitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });

        return tx.group.findUniqueOrThrow({
          where: { id: invitation.groupId },
          include: groupWithMembershipsInclude,
        });
      },
    );
  }

  private async findInvitationByToken(
    prisma:
      | PrismaService
      | Prisma.TransactionClient,
    token: string,
  ): Promise<InvitationValidationRecord | null> {
    const tokenHash = this.sessionTokenService.hashToken(token.trim());

    return prisma.groupInvitation.findUnique({
      where: { tokenHash },
      include: invitationValidationInclude,
    });
  }

  private assertInvitationCanBeAccepted(
    invitation: InvitationValidationRecord | null,
  ): asserts invitation is InvitationValidationRecord {
    if (invitation === null) {
      throw new NotFoundException('Invitation not found.');
    }

    if (invitation.acceptedAt !== null) {
      throw new ConflictException('Invitation has already been used.');
    }

    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('Invitation has expired.');
    }
  }
}

function buildInvitationEmail(groupName: string, inviteUrl: string): string {
  return `
    <p>You've been invited to join the group <strong>${groupName}</strong> on Maru.</p>
    <p><a href="${inviteUrl}">Accept invitation</a></p>
    <p>This link expires in 72 hours.</p>
  `;
}

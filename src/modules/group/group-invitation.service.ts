import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { GroupInvitation } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../common/config/environment.variables';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import { SessionTokenService } from '../auth/services/session-token.service';
import { GroupMembershipService } from './group-membership.service';

const INVITATION_TTL_MS = 1000 * 60 * 60 * 72; // 72 hours

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
        email: invitedEmail,
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
          invitedEmail,
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
        invitedEmail,
        tokenHash,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });

    // 6. Send the invitation email (fire-and-forget errors are swallowed so
    //    the HTTP response is not blocked by transient email failures).
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const inviteUrl = `${frontendUrl}/invitations/accept?token=${rawToken}`;

    await this.emailService.send({
      to: invitedEmail,
      subject: `You've been invited to join ${group.name} on Maru`,
      html: buildInvitationEmail(group.name, inviteUrl),
      text: `You've been invited to join the group "${group.name}" on Maru.\n\nAccept your invitation by visiting:\n${inviteUrl}\n\nThis link expires in 72 hours.`,
    });

    return invitation;
  }
}

function buildInvitationEmail(groupName: string, inviteUrl: string): string {
  return `
    <p>You've been invited to join the group <strong>${groupName}</strong> on Maru.</p>
    <p><a href="${inviteUrl}">Accept invitation</a></p>
    <p>This link expires in 72 hours.</p>
  `;
}

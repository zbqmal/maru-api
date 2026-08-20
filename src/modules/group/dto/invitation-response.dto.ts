import { ApiProperty } from '@nestjs/swagger';
import type { GroupInvitation } from '@prisma/client';

export class InvitationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  groupId!: string;

  @ApiProperty()
  invitedEmail!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiProperty({ nullable: true, type: String })
  acceptedAt!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export function toInvitationResponseDto(
  invitation: GroupInvitation,
): InvitationResponseDto {
  return {
    id: invitation.id,
    groupId: invitation.groupId,
    invitedEmail: invitation.invitedEmail,
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    createdAt: invitation.createdAt.toISOString(),
  };
}

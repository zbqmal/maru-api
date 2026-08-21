import { ApiProperty } from '@nestjs/swagger';
import type { InvitationValidationResult } from '../group-invitation.service';

export class InvitationValidationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  groupId!: string;

  @ApiProperty()
  groupName!: string;

  @ApiProperty()
  invitedEmail!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiProperty()
  createdAt!: string;
}

export function toInvitationValidationResponseDto(
  invitation: InvitationValidationResult,
): InvitationValidationResponseDto {
  return {
    id: invitation.id,
    groupId: invitation.groupId,
    groupName: invitation.groupName,
    invitedEmail: invitation.invitedEmail,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}

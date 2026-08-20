import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { GroupResponseDto, toGroupResponseDto } from './dto/group-response.dto';
import { InvitationTokenDto } from './dto/invitation-token.dto';
import {
  InvitationValidationResponseDto,
  toInvitationValidationResponseDto,
} from './dto/invitation-validation-response.dto';
import { GroupInvitationService } from './group-invitation.service';

@ApiTags('Group Invitations')
@Controller('group-invitations')
export class GroupInvitationController {
  constructor(
    private readonly groupInvitationService: GroupInvitationService,
  ) {}

  @ApiOperation({ summary: 'Validate an invitation token' })
  @ApiOkResponse({
    description: 'Invitation is valid.',
    type: InvitationValidationResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Invitation not found.' })
  @ApiConflictResponse({ description: 'Invitation has already been used.' })
  @ApiGoneResponse({ description: 'Invitation has expired.' })
  @Get('validate')
  async validateInvitation(
    @Query() dto: InvitationTokenDto,
  ): Promise<InvitationValidationResponseDto> {
    const invitation = await this.groupInvitationService.validateInvitation(
      dto.token,
    );
    return toInvitationValidationResponseDto(invitation);
  }

  @ApiOperation({ summary: 'Accept an invitation for the current user' })
  @ApiCookieAuth('session')
  @ApiOkResponse({
    description: 'Invitation accepted and membership created.',
    type: GroupResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required.' })
  @ApiForbiddenResponse({
    description: 'Invitation email does not match the authenticated account.',
  })
  @ApiNotFoundResponse({ description: 'Invitation not found.' })
  @ApiConflictResponse({
    description:
      'Invitation has already been used or membership already exists.',
  })
  @ApiGoneResponse({ description: 'Invitation has expired.' })
  @UseGuards(SessionAuthGuard)
  @HttpCode(200)
  @Post('accept')
  async acceptInvitation(
    @CurrentUser() user: User,
    @Body() dto: InvitationTokenDto,
  ): Promise<GroupResponseDto> {
    const group = await this.groupInvitationService.acceptInvitation(
      dto.token,
      user.id,
    );
    return toGroupResponseDto(group);
  }
}

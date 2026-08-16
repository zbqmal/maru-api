import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CreateGroupDto } from './dto/create-group.dto';
import {
  GroupMemberResponseDto,
  toGroupMemberResponseDto,
} from './dto/group-member-response.dto';
import { GroupResponseDto, toGroupResponseDto } from './dto/group-response.dto';
import { GroupService } from './group.service';

@ApiTags('Groups')
@ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'Authentication required.' })
@UseGuards(SessionAuthGuard)
@Controller('groups')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @ApiOperation({ summary: 'Create a group' })
  @ApiCreatedResponse({
    description: 'Created group with leader membership',
    type: GroupResponseDto,
  })
  @Post()
  async createGroup(
    @CurrentUser() user: User,
    @Body() dto: CreateGroupDto,
  ): Promise<GroupResponseDto> {
    const group = await this.groupService.createGroupWithLeader({
      name: dto.name,
      leaderUserId: user.id,
    });

    return toGroupResponseDto(group);
  }

  @ApiOperation({ summary: 'List groups for current user' })
  @ApiOkResponse({
    description: 'Groups for current user',
    type: GroupResponseDto,
    isArray: true,
  })
  @Get()
  async listGroups(@CurrentUser() user: User): Promise<GroupResponseDto[]> {
    const groups = await this.groupService.findGroupsForUser(user.id);
    return groups.map(toGroupResponseDto);
  }

  @ApiOperation({ summary: 'Get group detail' })
  @ApiOkResponse({ description: 'Group detail', type: GroupResponseDto })
  @ApiForbiddenResponse({ description: 'Group membership required.' })
  @ApiNotFoundResponse({ description: 'Group not found.' })
  @Get(':groupId')
  async getGroup(
    @CurrentUser() user: User,
    @Param('groupId') groupId: string,
  ): Promise<GroupResponseDto> {
    const group = await this.groupService.findByIdForUser(groupId, user.id);
    return toGroupResponseDto(group);
  }

  @ApiOperation({ summary: 'List group members' })
  @ApiOkResponse({
    description: 'Group members',
    type: GroupMemberResponseDto,
    isArray: true,
  })
  @ApiForbiddenResponse({ description: 'Group membership required.' })
  @ApiNotFoundResponse({ description: 'Group not found.' })
  @HttpCode(200)
  @Get(':groupId/members')
  async listMembers(
    @CurrentUser() user: User,
    @Param('groupId') groupId: string,
  ): Promise<GroupMemberResponseDto[]> {
    const memberships = await this.groupService.findMembersForUser(
      groupId,
      user.id,
    );
    return memberships.map(toGroupMemberResponseDto);
  }
}

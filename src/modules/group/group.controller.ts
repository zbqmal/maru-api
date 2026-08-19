import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
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
import { TransferLeadershipDto } from './dto/transfer-leadership.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupLeaderGuard } from './guards/group-leader.guard';
import { GroupMemberGuard } from './guards/group-member.guard';
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

  @ApiOperation({ summary: 'Update a group (leader only)' })
  @ApiOkResponse({ description: 'Updated group', type: GroupResponseDto })
  @ApiForbiddenResponse({ description: 'Group leader role required.' })
  @ApiNotFoundResponse({ description: 'Group not found.' })
  @UseGuards(GroupLeaderGuard)
  @Patch(':groupId')
  async updateGroup(
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
  ): Promise<GroupResponseDto> {
    const group = await this.groupService.updateGroup(groupId, {
      name: dto.name,
    });
    return toGroupResponseDto(group);
  }

  @ApiOperation({ summary: 'Transfer group leadership (leader only)' })
  @ApiOkResponse({
    description: 'Updated group with new leader',
    type: GroupResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Group leader role required.' })
  @ApiNotFoundResponse({ description: 'Target member not found in group.' })
  @UseGuards(GroupLeaderGuard)
  @HttpCode(200)
  @Post(':groupId/transfer-leadership')
  async transferLeadership(
    @CurrentUser() user: User,
    @Param('groupId') groupId: string,
    @Body() dto: TransferLeadershipDto,
  ): Promise<GroupResponseDto> {
    const group = await this.groupService.transferLeadership(
      groupId,
      user.id,
      dto.newLeaderId,
    );
    return toGroupResponseDto(group);
  }

  @ApiOperation({ summary: 'Leave a group' })
  @ApiNoContentResponse({ description: 'Successfully left the group.' })
  @ApiForbiddenResponse({ description: 'Group membership required.' })
  @UseGuards(GroupMemberGuard)
  @HttpCode(204)
  @Delete(':groupId/leave')
  async leaveGroup(
    @CurrentUser() user: User,
    @Param('groupId') groupId: string,
  ): Promise<void> {
    await this.groupService.leaveGroup(groupId, user.id);
  }
}

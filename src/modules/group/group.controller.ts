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
  ApiBadRequestResponse,
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
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { CreateGroupQuestionDto } from './dto/create-group-question.dto';
import {
  GroupMemberResponseDto,
  toGroupMemberResponseDto,
} from './dto/group-member-response.dto';
import {
  GroupQuestionResponseDto,
  toGroupQuestionResponseDto,
} from './dto/group-question-response.dto';
import {
  InvitationResponseDto,
  toInvitationResponseDto,
} from './dto/invitation-response.dto';
import { ReorderGroupQuestionsDto } from './dto/reorder-group-questions.dto';
import { GroupResponseDto, toGroupResponseDto } from './dto/group-response.dto';
import { TransferLeadershipDto } from './dto/transfer-leadership.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { UpdateGroupQuestionDto } from './dto/update-group-question.dto';
import { GroupDeletionService } from './group-deletion.service';
import { GroupInvitationService } from './group-invitation.service';
import { GroupQuestionService } from './group-question.service';
import { GroupLeaderGuard } from './guards/group-leader.guard';
import { GroupMemberGuard } from './guards/group-member.guard';
import { GroupService } from './group.service';

@ApiTags('Groups')
@ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'Authentication required.' })
@UseGuards(SessionAuthGuard)
@Controller('groups')
export class GroupController {
  constructor(
    private readonly groupService: GroupService,
    private readonly groupDeletionService: GroupDeletionService,
    private readonly groupInvitationService: GroupInvitationService,
    private readonly groupQuestionService: GroupQuestionService,
  ) {}

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

  @ApiOperation({ summary: 'List group questions' })
  @ApiOkResponse({
    description: 'Active group questions in display order',
    type: GroupQuestionResponseDto,
    isArray: true,
  })
  @ApiForbiddenResponse({ description: 'Group membership required.' })
  @ApiNotFoundResponse({ description: 'Group not found.' })
  @Get(':groupId/questions')
  async listQuestions(
    @CurrentUser() user: User,
    @Param('groupId') groupId: string,
  ): Promise<GroupQuestionResponseDto[]> {
    const questions = await this.groupQuestionService.listQuestionsForUser(
      groupId,
      user.id,
    );

    return questions.map(toGroupQuestionResponseDto);
  }

  @ApiOperation({ summary: 'Create a group question (leader only)' })
  @ApiCreatedResponse({
    description: 'Created group question.',
    type: GroupQuestionResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Question content is invalid or the four-question limit was exceeded.',
  })
  @ApiForbiddenResponse({ description: 'Group leader role required.' })
  @ApiNotFoundResponse({ description: 'Group not found.' })
  @UseGuards(GroupLeaderGuard)
  @Post(':groupId/questions')
  async createQuestion(
    @CurrentUser() user: User,
    @Param('groupId') groupId: string,
    @Body() dto: CreateGroupQuestionDto,
  ): Promise<GroupQuestionResponseDto> {
    const question = await this.groupQuestionService.createQuestion(
      groupId,
      user.id,
      {
        question: dto.question,
      },
    );

    return toGroupQuestionResponseDto(question);
  }

  @ApiOperation({ summary: 'Reorder group questions (leader only)' })
  @ApiOkResponse({
    description: 'Reordered group questions.',
    type: GroupQuestionResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: 'Reorder payload must contain each active group question exactly once.',
  })
  @ApiForbiddenResponse({ description: 'Group leader role required.' })
  @UseGuards(GroupLeaderGuard)
  @Patch(':groupId/questions/reorder')
  async reorderQuestions(
    @Param('groupId') groupId: string,
    @Body() dto: ReorderGroupQuestionsDto,
  ): Promise<GroupQuestionResponseDto[]> {
    const questions = await this.groupQuestionService.reorderQuestions(
      groupId,
      dto.questionIds,
    );

    return questions.map(toGroupQuestionResponseDto);
  }

  @ApiOperation({ summary: 'Update a group question (leader only)' })
  @ApiOkResponse({
    description: 'Updated group question.',
    type: GroupQuestionResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Group leader role required.' })
  @ApiNotFoundResponse({ description: 'Group question not found.' })
  @UseGuards(GroupLeaderGuard)
  @Patch(':groupId/questions/:questionId')
  async updateQuestion(
    @Param('groupId') groupId: string,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateGroupQuestionDto,
  ): Promise<GroupQuestionResponseDto> {
    const question = await this.groupQuestionService.updateQuestion(
      groupId,
      questionId,
      {
        question: dto.question,
      },
    );

    return toGroupQuestionResponseDto(question);
  }

  @ApiOperation({ summary: 'Delete a group question (leader only)' })
  @ApiNoContentResponse({ description: 'Group question deleted successfully.' })
  @ApiForbiddenResponse({ description: 'Group leader role required.' })
  @ApiNotFoundResponse({ description: 'Group question not found.' })
  @UseGuards(GroupLeaderGuard)
  @HttpCode(204)
  @Delete(':groupId/questions/:questionId')
  async deleteQuestion(
    @Param('groupId') groupId: string,
    @Param('questionId') questionId: string,
  ): Promise<void> {
    await this.groupQuestionService.deleteQuestion(groupId, questionId);
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

  @ApiOperation({ summary: 'Invite a user to a group by email (leader only)' })
  @ApiCreatedResponse({
    description: 'Invitation created and email sent.',
    type: InvitationResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Group leader role required.' })
  @ApiNotFoundResponse({ description: 'Group not found.' })
  @UseGuards(GroupLeaderGuard)
  @Post(':groupId/invitations')
  async createInvitation(
    @CurrentUser() user: User,
    @Param('groupId') groupId: string,
    @Body() dto: CreateInvitationDto,
  ): Promise<InvitationResponseDto> {
    const invitation = await this.groupInvitationService.createInvitation(
      groupId,
      user.id,
      dto.email,
    );
    return toInvitationResponseDto(invitation);
  }

  @ApiOperation({ summary: 'Delete a group (leader only)' })
  @ApiNoContentResponse({ description: 'Group deleted successfully.' })
  @ApiForbiddenResponse({ description: 'Group leader role required.' })
  @ApiNotFoundResponse({ description: 'Group not found.' })
  @UseGuards(GroupLeaderGuard)
  @HttpCode(204)
  @Delete(':groupId')
  async deleteGroup(@Param('groupId') groupId: string): Promise<void> {
    await this.groupDeletionService.deleteGroup(groupId);
  }
}

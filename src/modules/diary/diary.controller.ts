import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { GroupMemberGuard } from '../group/guards/group-member.guard';
import { DiaryEntryService } from './diary-entry.service';
import {
  DiaryContextResponseDto,
  toDiaryContextResponseDto,
} from './dto/diary-context-response.dto';

@ApiTags('Diary')
@ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'Authentication required.' })
@UseGuards(SessionAuthGuard)
@Controller('groups/:groupId/diary')
export class DiaryController {
  constructor(private readonly diaryEntryService: DiaryEntryService) {}

  @ApiOperation({ summary: "Get today's diary context for a group" })
  @ApiOkResponse({
    description:
      "Active group questions and the current user's diary entry (if any) for today.",
    type: DiaryContextResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Group membership required.' })
  @UseGuards(GroupMemberGuard)
  @Get('today')
  async getTodaysDiaryContext(
    @CurrentUser() user: User,
    @Param('groupId') groupId: string,
  ): Promise<DiaryContextResponseDto> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const context = await this.diaryEntryService.getTodaysDiaryContext(
      groupId,
      user.id,
      today,
    );

    return toDiaryContextResponseDto(context.questions, context.entry);
  }
}

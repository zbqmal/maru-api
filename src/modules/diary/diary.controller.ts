import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
import { GetDiaryContextQueryDto } from './dto/get-diary-context-query.dto';

@ApiTags('Diary')
@ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'Authentication required.' })
@UseGuards(SessionAuthGuard)
@Controller('groups/:groupId/diary')
export class DiaryController {
  constructor(private readonly diaryEntryService: DiaryEntryService) {}

  @ApiOperation({
    summary: 'Get diary context for a given date',
    description:
      "Returns the group's active custom questions and the current user's diary entry (if any) for the specified date. The `date` parameter must be the caller's **local date** in `YYYY-MM-DD` format so that users in different timezones each see their own correct diary day.",
  })
  @ApiOkResponse({
    description:
      "Active group questions and the current user's diary entry (if any) for the given date.",
    type: DiaryContextResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'date must be a valid ISO 8601 date string (YYYY-MM-DD).',
  })
  @ApiForbiddenResponse({ description: 'Group membership required.' })
  @UseGuards(GroupMemberGuard)
  @Get('context')
  async getDiaryContext(
    @CurrentUser() user: User,
    @Param('groupId') groupId: string,
    @Query() query: GetDiaryContextQueryDto,
  ): Promise<DiaryContextResponseDto> {
    const diaryDate = new Date(`${query.date}T00:00:00.000Z`);

    const context = await this.diaryEntryService.getTodaysDiaryContext(
      groupId,
      user.id,
      diaryDate,
    );

    return toDiaryContextResponseDto(context.questions, context.entry);
  }
}

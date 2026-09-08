import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
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
import { GroupMemberGuard } from '../group/guards/group-member.guard';
import { MediaService } from '../media/media.service';
import { DiaryEntryService } from './diary-entry.service';
import {
  AnswerResponseDto,
  toAnswerResponseDto,
} from './dto/answer-response.dto';
import { CreateAnswerDto } from './dto/create-answer.dto';
import {
  DiaryContextResponseDto,
  toDiaryContextResponseDto,
} from './dto/diary-context-response.dto';
import { GetDiaryContextQueryDto } from './dto/get-diary-context-query.dto';
import {
  GroupDailyFeedResponseDto,
  toGroupDailyFeedResponseDto,
} from './dto/group-daily-feed-response.dto';
import { UpdateAnswerDto } from './dto/update-answer.dto';
import { RequestDiaryPhotoUploadDto } from './dto/request-diary-photo-upload.dto';
import { PresignedUploadResponseDto } from './dto/presigned-upload-response.dto';
import { RegisterDiaryPhotoDto } from './dto/register-diary-photo.dto';
import { PhotoResponseDto, toPhotoResponseDto } from './dto/photo-response.dto';

@ApiTags('Diary')
@ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'Authentication required.' })
@UseGuards(SessionAuthGuard)
@Controller('groups/:groupId/diary')
export class DiaryController {
  constructor(
    private readonly diaryEntryService: DiaryEntryService,
    private readonly mediaService: MediaService,
  ) {}

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

    return toDiaryContextResponseDto(
      context.questions,
      context.dailyQuestion,
      context.entry,
    );
  }

  @ApiOperation({
    summary: "Get all group members' diary entries for a given date",
    description:
      'Returns every group member paired with their diary entry (and answers) for the specified date. Members who have not written an entry for that date are included with `entry: null`. Requires group membership.',
  })
  @ApiOkResponse({
    description: "Group members' diary entries for the given date.",
    type: GroupDailyFeedResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'date must be a valid ISO 8601 date string (YYYY-MM-DD).',
  })
  @ApiForbiddenResponse({ description: 'Group membership required.' })
  @UseGuards(GroupMemberGuard)
  @Get('feed')
  async getGroupDailyFeed(
    @Param('groupId') groupId: string,
    @Query() query: GetDiaryContextQueryDto,
  ): Promise<GroupDailyFeedResponseDto> {
    const diaryDate = new Date(`${query.date}T00:00:00.000Z`);

    const memberships = await this.diaryEntryService.getGroupDailyFeed(
      groupId,
      diaryDate,
    );

    return toGroupDailyFeedResponseDto(diaryDate, memberships);
  }

  @ApiOperation({
    summary: 'Create a diary answer for a given date',
    description:
      "Creates the caller's answer for a custom question on the given date. If the user has no diary entry for that date yet, one is created automatically.",
  })
  @ApiCreatedResponse({
    description: 'Diary answer created successfully.',
    type: AnswerResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Request payload is invalid or an unsupported question type was provided.',
  })
  @ApiForbiddenResponse({ description: 'Group membership required.' })
  @ApiNotFoundResponse({
    description: 'Group question not found or does not belong to this group.',
  })
  @UseGuards(GroupMemberGuard)
  @Post('answers')
  async createAnswer(
    @CurrentUser() user: User,
    @Param('groupId') groupId: string,
    @Body() dto: CreateAnswerDto,
  ): Promise<AnswerResponseDto> {
    const diaryDate = new Date(`${dto.date}T00:00:00.000Z`);
    const answer = await this.diaryEntryService.createAnswerForUser({
      groupId,
      userId: user.id,
      diaryDate,
      questionType: dto.questionType,
      groupQuestionId: dto.groupQuestionId,
      body: dto.body,
    });

    return toAnswerResponseDto(answer);
  }

  @ApiOperation({ summary: 'Update an existing diary answer' })
  @ApiOkResponse({
    description: 'Diary answer updated successfully.',
    type: AnswerResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Request payload is invalid.' })
  @ApiForbiddenResponse({
    description: 'Group membership required or diary ownership is violated.',
  })
  @ApiNotFoundResponse({ description: 'Answer not found.' })
  @UseGuards(GroupMemberGuard)
  @Patch('answers/:answerId')
  async updateAnswer(
    @CurrentUser() user: User,
    @Param('groupId') groupId: string,
    @Param('answerId') answerId: string,
    @Body() dto: UpdateAnswerDto,
  ): Promise<AnswerResponseDto> {
    const answer = await this.diaryEntryService.updateAnswerForUser(
      groupId,
      user.id,
      answerId,
      {
        body: dto.body,
      },
    );

    return toAnswerResponseDto(answer);
  }

  @ApiOperation({
    summary: 'Request a presigned diary photo upload URL',
    description:
      'Returns a short-lived S3 URL for directly uploading a photo to a diary entry. Upload the image using the requested MIME type before the URL expires.',
  })
  @ApiCreatedResponse({
    description: 'Presigned diary photo upload URL created successfully.',
    type: PresignedUploadResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Request payload is invalid or the image type or size is unsupported.',
  })
  @ApiForbiddenResponse({
    description: 'Group membership required or diary ownership is violated.',
  })
  @ApiNotFoundResponse({ description: 'Diary entry not found.' })
  @UseGuards(GroupMemberGuard)
  @Post('entries/:diaryEntryId/photos/upload-url')
  async requestDiaryPhotoUpload(
    @CurrentUser() user: User,
    @Param('groupId') groupId: string,
    @Param('diaryEntryId') diaryEntryId: string,
    @Body() dto: RequestDiaryPhotoUploadDto,
  ): Promise<PresignedUploadResponseDto> {
    await this.diaryEntryService.assertEntryOwnedByUser(
      diaryEntryId,
      groupId,
      user.id,
    );

    return this.mediaService.createDiaryPhotoUpload(diaryEntryId, dto);
  }

  @ApiOperation({
    summary: 'Register uploaded diary photo metadata',
    description:
      'Registers metadata for a photo that was uploaded directly to S3 using a server-generated diary photo storage key.',
  })
  @ApiCreatedResponse({
    description: 'Diary photo registered successfully.',
    type: PhotoResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Request payload is invalid or the storage key does not belong to this diary entry.',
  })
  @ApiForbiddenResponse({
    description: 'Group membership required or diary ownership is violated.',
  })
  @ApiNotFoundResponse({ description: 'Diary entry not found.' })
  @UseGuards(GroupMemberGuard)
  @Post('entries/:diaryEntryId/photos')
  async registerDiaryPhoto(
    @CurrentUser() user: User,
    @Param('groupId') groupId: string,
    @Param('diaryEntryId') diaryEntryId: string,
    @Body() dto: RegisterDiaryPhotoDto,
  ): Promise<PhotoResponseDto> {
    const photo = await this.diaryEntryService.registerPhotoForUser({
      groupId,
      diaryEntryId,
      userId: user.id,
      storageKey: dto.storageKey,
      mimeType: dto.mimeType,
      width: dto.width,
      height: dto.height,
      sizeBytes: dto.sizeBytes,
    });

    return toPhotoResponseDto(photo);
  }

  @ApiOperation({ summary: 'Delete a diary photo' })
  @ApiNoContentResponse({ description: 'Diary photo deleted successfully.' })
  @ApiForbiddenResponse({
    description: 'Group membership required or diary ownership is violated.',
  })
  @ApiNotFoundResponse({ description: 'Photo not found.' })
  @UseGuards(GroupMemberGuard)
  @Delete('entries/:diaryEntryId/photos/:photoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDiaryPhoto(
    @CurrentUser() user: User,
    @Param('groupId') groupId: string,
    @Param('diaryEntryId') diaryEntryId: string,
    @Param('photoId') photoId: string,
  ): Promise<void> {
    await this.diaryEntryService.deletePhotoForUser(
      groupId,
      diaryEntryId,
      user.id,
      photoId,
    );
  }
}

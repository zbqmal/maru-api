import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { DailyQuestionService } from './daily-question.service';
import {
  DailyQuestionResponseDto,
  toDailyQuestionResponseDto,
} from './dto/daily-question-response.dto';

@ApiTags('Daily Question')
@ApiCookieAuth('session')
@ApiUnauthorizedResponse({ description: 'Authentication required.' })
@UseGuards(SessionAuthGuard)
@Controller('daily-question')
export class DailyQuestionController {
  private readonly logger = new Logger(DailyQuestionController.name);

  constructor(private readonly dailyQuestionService: DailyQuestionService) {}

  @ApiOperation({
    summary: "Get today's global daily question",
    description:
      "Returns the AI-generated global question for today (UTC date). Returns 404 if today's question has not been generated yet.",
  })
  @ApiOkResponse({
    description: "Today's daily question.",
    type: DailyQuestionResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Today's question has not been generated yet.",
  })
  @Get('today')
  async getTodaysQuestion(): Promise<DailyQuestionResponseDto> {
    const question = await this.dailyQuestionService.findTodaysQuestion();

    if (!question) {
      throw new NotFoundException(
        "Today's daily question has not been generated yet.",
      );
    }

    return toDailyQuestionResponseDto(question);
  }

  @ApiOperation({
    summary: "Trigger generation of today's daily question (admin/dev use)",
    description:
      "Manually triggers generation of today's question. Idempotent – returns the existing question if already generated.",
  })
  @ApiOkResponse({
    description: "Today's daily question (newly generated or existing).",
    type: DailyQuestionResponseDto,
  })
  @Post('generate')
  async triggerGeneration(): Promise<DailyQuestionResponseDto> {
    const question =
      await this.dailyQuestionService.generateAndStoreTodaysQuestion();
    return toDailyQuestionResponseDto(question);
  }
}

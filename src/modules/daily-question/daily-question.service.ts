import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { DailyQuestion } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OpenAiService } from './openai.service';

const DAILY_QUESTION_PROMPT = `You are a thoughtful journal assistant for a group diary app used by close friends and family.
Generate one meaningful, open-ended daily reflection question in Korean.
The question should be warm, personal, and encourage genuine sharing between people who care about each other.
Requirements:
- Written in Korean
- One sentence only
- No more than 50 characters
- No bullet points, numbering, or extra formatting
- Do not include quotation marks
- End with a question mark (?)
Respond with only the question text.`;

const MAX_QUESTION_LENGTH = 100;
const GENERATION_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

@Injectable()
export class DailyQuestionService {
  private readonly logger = new Logger(DailyQuestionService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly openAiService: OpenAiService,
  ) {}

  async findByDate(date: Date): Promise<DailyQuestion | null> {
    return this.prismaService.dailyQuestion.findUnique({
      where: { questionDate: date },
    });
  }

  async findTodaysQuestion(): Promise<DailyQuestion | null> {
    return this.findByDate(this.getTodayUtc());
  }

  /**
   * Idempotently generate and store today's question.
   * Returns the existing question if already generated, or the newly
   * created one.  Retries on transient OpenAI failures.
   */
  async generateAndStoreTodaysQuestion(): Promise<DailyQuestion> {
    const today = this.getTodayUtc();

    const existing = await this.findByDate(today);
    if (existing) {
      this.logger.debug(
        `Daily question for ${today.toISOString().split('T')[0]} already exists – skipping generation.`,
      );
      return existing;
    }

    if (!this.openAiService.isAvailable()) {
      throw new Error(
        'Cannot generate daily question: OPENAI_API_KEY is not configured.',
      );
    }

    const questionText = await this.callOpenAiWithRetry();
    this.validateQuestion(questionText);

    try {
      const question = await this.prismaService.dailyQuestion.create({
        data: {
          question: questionText,
          questionDate: today,
        },
      });
      this.logger.log(
        `Daily question for ${today.toISOString().split('T')[0]} created: "${questionText}"`,
      );
      return question;
    } catch (err: unknown) {
      // Another instance may have inserted concurrently; re-fetch on unique violation.
      const isUniqueViolation =
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002';

      if (isUniqueViolation) {
        this.logger.warn(
          "Concurrent insertion detected for today's daily question – fetching existing record.",
        );
        const concurrent = await this.findByDate(today);
        if (concurrent) return concurrent;
      }
      throw err;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: 'generate-daily-question',
    timeZone: 'UTC',
  })
  async scheduledGeneration(): Promise<void> {
    this.logger.log('Scheduled daily question generation starting...');

    try {
      await this.generateAndStoreTodaysQuestion();
    } catch (err: unknown) {
      this.logger.error(
        'Failed to generate daily question during scheduled run.',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async callOpenAiWithRetry(): Promise<string> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= GENERATION_RETRIES; attempt++) {
      try {
        const result = await this.openAiService.chat({
          messages: [{ role: 'user', content: DAILY_QUESTION_PROMPT }],
          maxTokens: 200,
        });
        return result;
      } catch (err: unknown) {
        lastError = err;
        this.logger.warn(
          `OpenAI call attempt ${attempt}/${GENERATION_RETRIES} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );

        if (attempt < GENERATION_RETRIES) {
          await this.sleep(RETRY_DELAY_MS * attempt);
        }
      }
    }

    throw lastError;
  }

  private validateQuestion(text: string): void {
    if (!text || text.trim().length === 0) {
      throw new Error('Generated question is empty.');
    }

    if (text.length > MAX_QUESTION_LENGTH) {
      throw new Error(
        `Generated question exceeds ${MAX_QUESTION_LENGTH} characters: "${text}"`,
      );
    }

    if (!text.endsWith('?')) {
      throw new Error(
        `Generated question does not end with a question mark: "${text}"`,
      );
    }
  }

  private getTodayUtc(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Answer,
  DailyQuestion,
  DiaryEntry,
  GroupMember,
  GroupQuestion,
  Prisma,
  QuestionType,
  User,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DailyQuestionService } from '../daily-question/daily-question.service';

type UserSummary = Pick<User, 'id' | 'name' | 'profileImageKey'>;

export type MembershipWithUserAndEntry = GroupMember & {
  user: UserSummary;
  entry: (DiaryEntry & { answers: Answer[] }) | null;
};

export interface CreateDiaryEntryInput {
  groupId: string;
  userId: string;
  diaryDate: Date;
}

export interface CreateAnswerInput {
  diaryEntryId: string;
  questionType: QuestionType;
  groupQuestionId?: string;
  dailyQuestionId?: string;
  body: string;
}

export interface CreateAnswerForUserInput {
  groupId: string;
  userId: string;
  diaryDate: Date;
  questionType: QuestionType;
  groupQuestionId?: string;
  body: string;
}

export interface UpdateAnswerInput {
  body: string;
}

export interface DiaryContext {
  questions: GroupQuestion[];
  dailyQuestion: DailyQuestion | null;
  entry: (DiaryEntry & { answers: Answer[] }) | null;
}

@Injectable()
export class DiaryEntryService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly dailyQuestionService: DailyQuestionService,
  ) {}

  async findOrCreateEntry(input: CreateDiaryEntryInput): Promise<DiaryEntry> {
    return this.prismaService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await this.assertGroupExists(tx, input.groupId);
        await this.assertUserExists(tx, input.userId);

        const existing = await tx.diaryEntry.findUnique({
          where: {
            groupId_userId_diaryDate: {
              groupId: input.groupId,
              userId: input.userId,
              diaryDate: input.diaryDate,
            },
          },
        });

        if (existing) {
          return existing;
        }

        return tx.diaryEntry.create({
          data: {
            groupId: input.groupId,
            userId: input.userId,
            diaryDate: input.diaryDate,
          },
        });
      },
    );
  }

  async findEntryById(id: string): Promise<DiaryEntry> {
    const entry = await this.prismaService.diaryEntry.findUnique({
      where: { id },
    });

    if (!entry) {
      throw new NotFoundException('Diary entry not found.');
    }

    return entry;
  }

  async createAnswer(input: CreateAnswerInput): Promise<Answer> {
    return this.prismaService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const entry = await tx.diaryEntry.findUnique({
          where: { id: input.diaryEntryId },
          select: { id: true, groupId: true },
        });

        if (!entry) {
          throw new NotFoundException('Diary entry not found.');
        }

        let questionSnapshot = '';

        if (input.questionType === QuestionType.CUSTOM) {
          if (!input.groupQuestionId) {
            throw new BadRequestException(
              'groupQuestionId is required for CUSTOM question type.',
            );
          }

          const groupQuestion = await this.findGroupQuestionBelongingToGroup(
            tx,
            input.groupQuestionId,
            entry.groupId,
          );
          questionSnapshot = groupQuestion.question;
        }

        const duplicate = await tx.answer.findUnique({
          where: {
            diaryEntryId_groupQuestionId: {
              diaryEntryId: input.diaryEntryId,
              groupQuestionId: input.groupQuestionId ?? '',
            },
          },
        });

        if (duplicate) {
          throw new ConflictException(
            'An answer for this question already exists in this diary entry.',
          );
        }

        return tx.answer.create({
          data: {
            diaryEntryId: input.diaryEntryId,
            questionType: input.questionType,
            groupQuestionId: input.groupQuestionId ?? null,
            dailyQuestionId: input.dailyQuestionId ?? null,
            questionSnapshot,
            body: input.body,
          },
        });
      },
    );
  }

  async createAnswerForUser(input: CreateAnswerForUserInput): Promise<Answer> {
    return this.prismaService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const entry = await this.findOrCreateDiaryEntryInTransaction(tx, {
          groupId: input.groupId,
          userId: input.userId,
          diaryDate: input.diaryDate,
        });

        if (input.questionType === QuestionType.CUSTOM) {
          return this.createCustomAnswer(tx, entry.id, input);
        }

        if (input.questionType === QuestionType.DAILY) {
          return this.createDailyAnswer(
            tx,
            entry.id,
            input.diaryDate,
            input.body,
          );
        }

        throw new BadRequestException(
          `Unsupported question type: ${String(input.questionType)}`,
        );
      },
    );
  }

  async updateAnswer(
    answerId: string,
    input: UpdateAnswerInput,
  ): Promise<Answer> {
    const answer = await this.prismaService.answer.findUnique({
      where: { id: answerId },
    });

    if (!answer) {
      throw new NotFoundException('Answer not found.');
    }

    return this.prismaService.answer.update({
      where: { id: answerId },
      data: { body: input.body },
    });
  }

  async updateAnswerForUser(
    groupId: string,
    userId: string,
    answerId: string,
    input: UpdateAnswerInput,
  ): Promise<Answer> {
    const answer = await this.prismaService.answer.findUnique({
      where: { id: answerId },
      include: {
        diaryEntry: {
          select: {
            groupId: true,
            userId: true,
          },
        },
      },
    });

    if (!answer) {
      throw new NotFoundException('Answer not found.');
    }

    if (
      answer.diaryEntry.groupId !== groupId ||
      answer.diaryEntry.userId !== userId
    ) {
      throw new ForbiddenException(
        'You can only update your own diary answers.',
      );
    }

    return this.prismaService.answer.update({
      where: { id: answerId },
      data: { body: input.body },
    });
  }

  async listEntriesForGroup(
    groupId: string,
    diaryDate: Date,
  ): Promise<DiaryEntry[]> {
    return this.prismaService.diaryEntry.findMany({
      where: { groupId, diaryDate },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getGroupDailyFeed(
    groupId: string,
    date: Date,
  ): Promise<MembershipWithUserAndEntry[]> {
    const [memberships, entries] = await Promise.all([
      this.prismaService.groupMember.findMany({
        where: { groupId },
        include: {
          user: { select: { id: true, name: true, profileImageKey: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prismaService.diaryEntry.findMany({
        where: { groupId, diaryDate: date },
        include: { answers: { orderBy: { createdAt: 'asc' } } },
      }),
    ]);

    const entryByUserId = new Map(entries.map((e) => [e.userId, e]));

    return memberships.map((m) => ({
      ...m,
      entry: entryByUserId.get(m.userId) ?? null,
    }));
  }

  async getTodaysDiaryContext(
    groupId: string,
    userId: string,
    date: Date,
  ): Promise<DiaryContext> {
    const [questions, dailyQuestion, entry] = await Promise.all([
      this.prismaService.groupQuestion.findMany({
        where: { groupId, isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      }),
      this.dailyQuestionService.findByDate(date),
      this.prismaService.diaryEntry.findUnique({
        where: {
          groupId_userId_diaryDate: {
            groupId,
            userId,
            diaryDate: date,
          },
        },
        include: { answers: { orderBy: { createdAt: 'asc' } } },
      }),
    ]);

    return { questions, dailyQuestion, entry };
  }

  private async createCustomAnswer(
    tx: Prisma.TransactionClient,
    diaryEntryId: string,
    input: CreateAnswerForUserInput,
  ): Promise<Answer> {
    if (!input.groupQuestionId) {
      throw new BadRequestException(
        'groupQuestionId is required for CUSTOM question type.',
      );
    }

    const groupQuestion = await this.findGroupQuestionBelongingToGroup(
      tx,
      input.groupQuestionId,
      input.groupId,
    );

    const duplicate = await tx.answer.findUnique({
      where: {
        diaryEntryId_groupQuestionId: {
          diaryEntryId,
          groupQuestionId: input.groupQuestionId,
        },
      },
    });

    if (duplicate) {
      throw new ConflictException(
        'An answer for this question already exists in this diary entry.',
      );
    }

    return tx.answer.create({
      data: {
        diaryEntryId,
        questionType: QuestionType.CUSTOM,
        groupQuestionId: input.groupQuestionId,
        dailyQuestionId: null,
        questionSnapshot: groupQuestion.question,
        body: input.body,
      },
    });
  }

  private async createDailyAnswer(
    tx: Prisma.TransactionClient,
    diaryEntryId: string,
    diaryDate: Date,
    body: string,
  ): Promise<Answer> {
    const dailyQuestion = await tx.dailyQuestion.findUnique({
      where: { questionDate: diaryDate },
    });

    if (!dailyQuestion) {
      throw new NotFoundException(
        "Today's daily question has not been generated yet.",
      );
    }

    const duplicate = await tx.answer.findFirst({
      where: {
        diaryEntryId,
        questionType: QuestionType.DAILY,
        dailyQuestionId: dailyQuestion.id,
      },
    });

    if (duplicate) {
      throw new ConflictException(
        'A daily answer already exists in this diary entry.',
      );
    }

    return tx.answer.create({
      data: {
        diaryEntryId,
        questionType: QuestionType.DAILY,
        groupQuestionId: null,
        dailyQuestionId: dailyQuestion.id,
        questionSnapshot: dailyQuestion.question,
        body,
      },
    });
  }

  private async assertGroupExists(
    tx: Prisma.TransactionClient,
    groupId: string,
  ): Promise<void> {
    const group = await tx.group.findUnique({
      where: { id: groupId },
      select: { id: true },
    });

    if (!group) {
      throw new NotFoundException('Group not found.');
    }
  }

  private async assertUserExists(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }
  }

  private async findGroupQuestionBelongingToGroup(
    tx: Prisma.TransactionClient,
    groupQuestionId: string,
    groupId: string,
  ): Promise<{ id: string; question: string }> {
    const question = await tx.groupQuestion.findFirst({
      where: { id: groupQuestionId, groupId },
      select: { id: true, question: true },
    });

    if (!question) {
      throw new NotFoundException(
        'Group question not found or does not belong to this group.',
      );
    }

    return question;
  }

  private async findOrCreateDiaryEntryInTransaction(
    tx: Prisma.TransactionClient,
    input: CreateDiaryEntryInput,
  ): Promise<DiaryEntry> {
    const existing = await tx.diaryEntry.findUnique({
      where: {
        groupId_userId_diaryDate: {
          groupId: input.groupId,
          userId: input.userId,
          diaryDate: input.diaryDate,
        },
      },
    });

    if (existing) {
      return existing;
    }

    return tx.diaryEntry.create({
      data: {
        groupId: input.groupId,
        userId: input.userId,
        diaryDate: input.diaryDate,
      },
    });
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Answer,
  DiaryEntry,
  GroupQuestion,
  Prisma,
  QuestionType,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface CreateDiaryEntryInput {
  groupId: string;
  userId: string;
  diaryDate: Date;
}

export interface CreateAnswerInput {
  diaryEntryId: string;
  questionType: QuestionType;
  groupQuestionId?: string;
  body: string;
}

export interface UpdateAnswerInput {
  body: string;
}

export interface DiaryContext {
  questions: GroupQuestion[];
  entry: (DiaryEntry & { answers: Answer[] }) | null;
}

@Injectable()
export class DiaryEntryService {
  constructor(private readonly prismaService: PrismaService) {}

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

        if (input.questionType === QuestionType.CUSTOM) {
          if (!input.groupQuestionId) {
            throw new BadRequestException(
              'groupQuestionId is required for CUSTOM question type.',
            );
          }

          await this.assertGroupQuestionBelongsToGroup(
            tx,
            input.groupQuestionId,
            entry.groupId,
          );
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
            body: input.body,
          },
        });
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

  async listEntriesForGroup(
    groupId: string,
    diaryDate: Date,
  ): Promise<DiaryEntry[]> {
    return this.prismaService.diaryEntry.findMany({
      where: { groupId, diaryDate },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getTodaysDiaryContext(
    groupId: string,
    userId: string,
    date: Date,
  ): Promise<DiaryContext> {
    const [questions, entry] = await Promise.all([
      this.prismaService.groupQuestion.findMany({
        where: { groupId, isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      }),
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

    return { questions, entry };
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

  private async assertGroupQuestionBelongsToGroup(
    tx: Prisma.TransactionClient,
    groupQuestionId: string,
    groupId: string,
  ): Promise<void> {
    const question = await tx.groupQuestion.findFirst({
      where: { id: groupQuestionId, groupId },
      select: { id: true },
    });

    if (!question) {
      throw new NotFoundException(
        'Group question not found or does not belong to this group.',
      );
    }
  }
}

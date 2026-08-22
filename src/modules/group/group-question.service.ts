import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GroupQuestionRecord } from '../../lib/types/group.types';
import { PrismaService } from '../database/prisma.service';
import { GroupService } from './group.service';

const MAX_ACTIVE_GROUP_QUESTIONS = 4;
const REORDER_TEMP_OFFSET = 100;

interface CreateGroupQuestionInput {
  question: string;
}

interface UpdateGroupQuestionInput {
  question?: string;
}

@Injectable()
export class GroupQuestionService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly groupService: GroupService,
  ) {}

  async listQuestionsForUser(
    groupId: string,
    userId: string,
  ): Promise<GroupQuestionRecord[]> {
    await this.groupService.findByIdForUser(groupId, userId);

    return this.prismaService.groupQuestion.findMany({
      where: { groupId, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async createQuestion(
    groupId: string,
    createdByUserId: string,
    input: CreateGroupQuestionInput,
  ): Promise<GroupQuestionRecord> {
    return this.prismaService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await this.assertGroupExists(tx, groupId);

        const activeCount = await tx.groupQuestion.count({
          where: { groupId, isActive: true },
        });

        if (activeCount >= MAX_ACTIVE_GROUP_QUESTIONS) {
          throw new BadRequestException(
            'A group can have at most four active custom questions.',
          );
        }

        return tx.groupQuestion.create({
          data: {
            groupId,
            question: input.question,
            displayOrder: activeCount + 1,
            createdByUserId,
          },
        });
      },
    );
  }

  async updateQuestion(
    groupId: string,
    questionId: string,
    input: UpdateGroupQuestionInput,
  ): Promise<GroupQuestionRecord> {
    return this.prismaService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await this.findQuestionOrThrow(tx, groupId, questionId);

        return tx.groupQuestion.update({
          where: { id: questionId },
          data: {
            question: input.question,
          },
        });
      },
    );
  }

  async deleteQuestion(groupId: string, questionId: string): Promise<void> {
    await this.prismaService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const deletedQuestion = await this.findQuestionOrThrow(
          tx,
          groupId,
          questionId,
        );

        await tx.groupQuestion.delete({
          where: { id: deletedQuestion.id },
        });

        await this.normalizeDisplayOrder(tx, groupId);
      },
    );
  }

  async reorderQuestions(
    groupId: string,
    questionIds: string[],
  ): Promise<GroupQuestionRecord[]> {
    return this.prismaService.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const questions = await tx.groupQuestion.findMany({
          where: { groupId, isActive: true },
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        });

        if (questions.length !== questionIds.length) {
          throw new BadRequestException(
            'Reorder payload must include each active group question exactly once.',
          );
        }

        const existingIds = new Set(questions.map((question) => question.id));

        if (questionIds.some((questionId) => !existingIds.has(questionId))) {
          throw new BadRequestException(
            'Reorder payload must include each active group question exactly once.',
          );
        }

        await Promise.all(
          questionIds.map((questionId, index) =>
            tx.groupQuestion.update({
              where: { id: questionId },
              data: {
                displayOrder: REORDER_TEMP_OFFSET + index + 1,
              },
            }),
          ),
        );

        await Promise.all(
          questionIds.map((questionId, index) =>
            tx.groupQuestion.update({
              where: { id: questionId },
              data: { displayOrder: index + 1 },
            }),
          ),
        );

        return tx.groupQuestion.findMany({
          where: { groupId, isActive: true },
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        });
      },
    );
  }

  private async assertGroupExists(
    tx: Prisma.TransactionClient,
    groupId: string,
  ): Promise<void> {
    const group = await tx.group.findUnique({
      where: { id: groupId },
      select: { id: true },
    });

    if (group === null) {
      throw new NotFoundException('Group not found.');
    }
  }

  private async findQuestionOrThrow(
    tx: Prisma.TransactionClient,
    groupId: string,
    questionId: string,
  ): Promise<GroupQuestionRecord> {
    const question = await tx.groupQuestion.findFirst({
      where: {
        id: questionId,
        groupId,
      },
    });

    if (question === null) {
      throw new NotFoundException('Group question not found.');
    }

    return question;
  }

  private async normalizeDisplayOrder(
    tx: Prisma.TransactionClient,
    groupId: string,
  ): Promise<void> {
    const remainingQuestions = await tx.groupQuestion.findMany({
      where: { groupId, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    });

    await Promise.all(
      remainingQuestions.map((question, index) =>
        tx.groupQuestion.update({
          where: { id: question.id },
          data: { displayOrder: index + 1 },
        }),
      ),
    );
  }
}

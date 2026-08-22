import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GroupQuestionService } from '../group-question.service';

describe('GroupQuestionService', () => {
  const prismaService = {
    groupQuestion: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const groupService = {
    findByIdForUser: jest.fn(),
  };

  beforeEach(() => {
    prismaService.groupQuestion.findMany.mockReset();
    prismaService.$transaction.mockReset();
    groupService.findByIdForUser.mockReset();
  });

  it('lists active questions for a group member in display order', async () => {
    const questions = [
      { id: 'question-1', displayOrder: 1 },
      { id: 'question-2', displayOrder: 2 },
    ];
    prismaService.groupQuestion.findMany.mockResolvedValue(questions);
    groupService.findByIdForUser.mockResolvedValue({
      id: 'group-1',
      memberships: [],
    });

    const service = new GroupQuestionService(
      prismaService as never,
      groupService as never,
    );

    await expect(
      service.listQuestionsForUser('group-1', 'user-1'),
    ).resolves.toEqual(questions);

    expect(groupService.findByIdForUser).toHaveBeenCalledWith('group-1', 'user-1');
    expect(prismaService.groupQuestion.findMany).toHaveBeenCalledWith({
      where: { groupId: 'group-1', isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    });
  });

  it('creates a question at the end of the current ordered list', async () => {
    const createdQuestion = {
      id: 'question-3',
      groupId: 'group-1',
      question: 'What made you smile today?',
      displayOrder: 3,
      isActive: true,
      createdByUserId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const tx = {
      group: {
        findUnique: jest.fn().mockResolvedValue({ id: 'group-1' }),
      },
      groupQuestion: {
        count: jest.fn().mockResolvedValue(2),
        create: jest.fn().mockResolvedValue(createdQuestion),
      },
    };

    prismaService.$transaction.mockImplementation(
      async (
        callback: (
          transactionClient: Prisma.TransactionClient,
        ) => Promise<unknown>,
      ) => callback(tx as unknown as Prisma.TransactionClient),
    );

    const service = new GroupQuestionService(
      prismaService as never,
      groupService as never,
    );

    await expect(
      service.createQuestion('group-1', 'user-1', {
        question: 'What made you smile today?',
      }),
    ).resolves.toEqual(createdQuestion);

    expect(tx.groupQuestion.create).toHaveBeenCalledWith({
      data: {
        groupId: 'group-1',
        question: 'What made you smile today?',
        displayOrder: 3,
        createdByUserId: 'user-1',
      },
    });
  });

  it('rejects creating a fifth active question', async () => {
    const tx = {
      group: {
        findUnique: jest.fn().mockResolvedValue({ id: 'group-1' }),
      },
      groupQuestion: {
        count: jest.fn().mockResolvedValue(4),
      },
    };

    prismaService.$transaction.mockImplementation(
      async (
        callback: (
          transactionClient: Prisma.TransactionClient,
        ) => Promise<unknown>,
      ) => callback(tx as unknown as Prisma.TransactionClient),
    );

    const service = new GroupQuestionService(
      prismaService as never,
      groupService as never,
    );

    await expect(
      service.createQuestion('group-1', 'user-1', { question: 'Question 5' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates the stored question text', async () => {
    const updatedQuestion = {
      id: 'question-1',
      groupId: 'group-1',
      question: 'Updated question',
      displayOrder: 1,
      isActive: true,
      createdByUserId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const tx = {
      groupQuestion: {
        findFirst: jest.fn().mockResolvedValue(updatedQuestion),
        update: jest.fn().mockResolvedValue(updatedQuestion),
      },
    };

    prismaService.$transaction.mockImplementation(
      async (
        callback: (
          transactionClient: Prisma.TransactionClient,
        ) => Promise<unknown>,
      ) => callback(tx as unknown as Prisma.TransactionClient),
    );

    const service = new GroupQuestionService(
      prismaService as never,
      groupService as never,
    );

    await expect(
      service.updateQuestion('group-1', 'question-1', {
        question: 'Updated question',
      }),
    ).resolves.toEqual(updatedQuestion);

    expect(tx.groupQuestion.update).toHaveBeenCalledWith({
      where: { id: 'question-1' },
      data: { question: 'Updated question' },
    });
  });

  it('normalizes display order after deleting a question', async () => {
    const tx = {
      groupQuestion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'question-2',
          groupId: 'group-1',
        }),
        delete: jest.fn().mockResolvedValue(undefined),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'question-1', displayOrder: 1 },
            { id: 'question-3', displayOrder: 3 },
          ])
          .mockResolvedValueOnce([
            { id: 'question-1', displayOrder: 1 },
            { id: 'question-2', displayOrder: 2 },
          ]),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };

    prismaService.$transaction.mockImplementation(
      async (
        callback: (
          transactionClient: Prisma.TransactionClient,
        ) => Promise<unknown>,
      ) => callback(tx as unknown as Prisma.TransactionClient),
    );

    const service = new GroupQuestionService(
      prismaService as never,
      groupService as never,
    );

    await service.deleteQuestion('group-1', 'question-2');

    expect(tx.groupQuestion.delete).toHaveBeenCalledWith({
      where: { id: 'question-2' },
    });
    expect(tx.groupQuestion.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'question-1' },
      data: { displayOrder: 1 },
    });
    expect(tx.groupQuestion.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'question-3' },
      data: { displayOrder: 2 },
    });
  });

  it('reorders questions using a temporary offset before normalizing positions', async () => {
    const reorderedQuestions = [
      { id: 'question-2', displayOrder: 1 },
      { id: 'question-1', displayOrder: 2 },
    ];
    const tx = {
      groupQuestion: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'question-1', displayOrder: 1 },
            { id: 'question-2', displayOrder: 2 },
          ])
          .mockResolvedValueOnce(reorderedQuestions),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };

    prismaService.$transaction.mockImplementation(
      async (
        callback: (
          transactionClient: Prisma.TransactionClient,
        ) => Promise<unknown>,
      ) => callback(tx as unknown as Prisma.TransactionClient),
    );

    const service = new GroupQuestionService(
      prismaService as never,
      groupService as never,
    );

    await expect(
      service.reorderQuestions('group-1', ['question-2', 'question-1']),
    ).resolves.toEqual(reorderedQuestions);

    expect(tx.groupQuestion.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'question-2' },
      data: { displayOrder: 101 },
    });
    expect(tx.groupQuestion.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'question-1' },
      data: { displayOrder: 102 },
    });
    expect(tx.groupQuestion.update).toHaveBeenNthCalledWith(3, {
      where: { id: 'question-2' },
      data: { displayOrder: 1 },
    });
    expect(tx.groupQuestion.update).toHaveBeenNthCalledWith(4, {
      where: { id: 'question-1' },
      data: { displayOrder: 2 },
    });
  });

  it('rejects reorder payloads that do not contain every question exactly once', async () => {
    const tx = {
      groupQuestion: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'question-1', displayOrder: 1 },
          { id: 'question-2', displayOrder: 2 },
        ]),
      },
    };

    prismaService.$transaction.mockImplementation(
      async (
        callback: (
          transactionClient: Prisma.TransactionClient,
        ) => Promise<unknown>,
      ) => callback(tx as unknown as Prisma.TransactionClient),
    );

    const service = new GroupQuestionService(
      prismaService as never,
      groupService as never,
    );

    await expect(
      service.reorderQuestions('group-1', ['question-1']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when a question does not belong to the group', async () => {
    const tx = {
      groupQuestion: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    prismaService.$transaction.mockImplementation(
      async (
        callback: (
          transactionClient: Prisma.TransactionClient,
        ) => Promise<unknown>,
      ) => callback(tx as unknown as Prisma.TransactionClient),
    );

    const service = new GroupQuestionService(
      prismaService as never,
      groupService as never,
    );

    await expect(
      service.updateQuestion('group-1', 'question-9', {
        question: 'Missing question',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

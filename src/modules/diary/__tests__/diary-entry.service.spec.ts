import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { QuestionType, Prisma } from '@prisma/client';
import { DiaryEntryService } from '../diary-entry.service';

describe('DiaryEntryService', () => {
  const makeTx = (overrides: Record<string, unknown> = {}) => ({
    group: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    diaryEntry: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    groupQuestion: { findFirst: jest.fn() },
    dailyQuestion: { findUnique: jest.fn() },
    answer: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    ...overrides,
  });

  const prismaService = {
    $transaction: jest.fn(),
    diaryEntry: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    answer: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    groupQuestion: {
      findMany: jest.fn(),
    },
    groupMember: {
      findMany: jest.fn(),
    },
  };

  const dailyQuestionService = {
    findByDate: jest.fn(),
  };

  function makeService() {
    return new DiaryEntryService(
      prismaService as never,
      dailyQuestionService as never,
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ──────────────────────────────────────────────
  // findOrCreateEntry
  // ──────────────────────────────────────────────

  describe('findOrCreateEntry', () => {
    it('creates a new diary entry when none exists', async () => {
      const createdEntry = {
        id: 'entry-1',
        groupId: 'group-1',
        userId: 'user-1',
        diaryDate: new Date('2024-01-01'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const tx = makeTx();
      tx.group.findUnique.mockResolvedValue({ id: 'group-1' });
      tx.user.findUnique.mockResolvedValue({ id: 'user-1' });
      tx.diaryEntry.findUnique.mockResolvedValue(null);
      tx.diaryEntry.create.mockResolvedValue(createdEntry);

      prismaService.$transaction.mockImplementation(
        (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          cb(tx as unknown as Prisma.TransactionClient),
      );

      const service = makeService();
      const result = await service.findOrCreateEntry({
        groupId: 'group-1',
        userId: 'user-1',
        diaryDate: new Date('2024-01-01'),
      });

      expect(result).toEqual(createdEntry);
      expect(tx.diaryEntry.create).toHaveBeenCalledWith({
        data: {
          groupId: 'group-1',
          userId: 'user-1',
          diaryDate: new Date('2024-01-01'),
        },
      });
    });

    it('returns the existing entry without creating a duplicate', async () => {
      const existingEntry = {
        id: 'entry-1',
        groupId: 'group-1',
        userId: 'user-1',
        diaryDate: new Date('2024-01-01'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const tx = makeTx();
      tx.group.findUnique.mockResolvedValue({ id: 'group-1' });
      tx.user.findUnique.mockResolvedValue({ id: 'user-1' });
      tx.diaryEntry.findUnique.mockResolvedValue(existingEntry);

      prismaService.$transaction.mockImplementation(
        (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          cb(tx as unknown as Prisma.TransactionClient),
      );

      const service = makeService();
      const result = await service.findOrCreateEntry({
        groupId: 'group-1',
        userId: 'user-1',
        diaryDate: new Date('2024-01-01'),
      });

      expect(result).toEqual(existingEntry);
      expect(tx.diaryEntry.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the group does not exist', async () => {
      const tx = makeTx();
      tx.group.findUnique.mockResolvedValue(null);

      prismaService.$transaction.mockImplementation(
        (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          cb(tx as unknown as Prisma.TransactionClient),
      );

      const service = makeService();
      await expect(
        service.findOrCreateEntry({
          groupId: 'missing-group',
          userId: 'user-1',
          diaryDate: new Date('2024-01-01'),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      const tx = makeTx();
      tx.group.findUnique.mockResolvedValue({ id: 'group-1' });
      tx.user.findUnique.mockResolvedValue(null);

      prismaService.$transaction.mockImplementation(
        (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          cb(tx as unknown as Prisma.TransactionClient),
      );

      const service = makeService();
      await expect(
        service.findOrCreateEntry({
          groupId: 'group-1',
          userId: 'missing-user',
          diaryDate: new Date('2024-01-01'),
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────
  // findEntryById
  // ──────────────────────────────────────────────

  describe('findEntryById', () => {
    it('returns the entry when it exists', async () => {
      const entry = { id: 'entry-1', groupId: 'group-1' };
      prismaService.diaryEntry.findUnique.mockResolvedValue(entry);

      const service = makeService();
      await expect(service.findEntryById('entry-1')).resolves.toEqual(entry);
    });

    it('throws NotFoundException when the entry does not exist', async () => {
      prismaService.diaryEntry.findUnique.mockResolvedValue(null);

      const service = makeService();
      await expect(service.findEntryById('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ──────────────────────────────────────────────
  // createAnswer
  // ──────────────────────────────────────────────

  describe('createAnswer', () => {
    it('creates a CUSTOM answer when groupQuestionId belongs to the entry group', async () => {
      const createdAnswer = {
        id: 'answer-1',
        diaryEntryId: 'entry-1',
        questionType: QuestionType.CUSTOM,
        groupQuestionId: 'question-1',
        questionSnapshot: 'What made you smile today?',
        body: 'Felt great!',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const tx = makeTx();
      tx.diaryEntry.findUnique.mockResolvedValue({
        id: 'entry-1',
        groupId: 'group-1',
      });
      tx.groupQuestion.findFirst.mockResolvedValue({
        id: 'question-1',
        question: 'What made you smile today?',
      });
      tx.answer.findUnique.mockResolvedValue(null);
      tx.answer.create.mockResolvedValue(createdAnswer);

      prismaService.$transaction.mockImplementation(
        (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          cb(tx as unknown as Prisma.TransactionClient),
      );

      const service = makeService();
      const result = await service.createAnswer({
        diaryEntryId: 'entry-1',
        questionType: QuestionType.CUSTOM,
        groupQuestionId: 'question-1',
        body: 'Felt great!',
      });

      expect(result).toEqual(createdAnswer);
      expect(tx.answer.create).toHaveBeenCalledWith({
        data: {
          diaryEntryId: 'entry-1',
          questionType: QuestionType.CUSTOM,
          groupQuestionId: 'question-1',
          dailyQuestionId: null,
          questionSnapshot: 'What made you smile today?',
          body: 'Felt great!',
        },
      });
    });

    it('throws BadRequestException when CUSTOM answer lacks groupQuestionId', async () => {
      const tx = makeTx();
      tx.diaryEntry.findUnique.mockResolvedValue({
        id: 'entry-1',
        groupId: 'group-1',
      });

      prismaService.$transaction.mockImplementation(
        (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          cb(tx as unknown as Prisma.TransactionClient),
      );

      const service = makeService();
      await expect(
        service.createAnswer({
          diaryEntryId: 'entry-1',
          questionType: QuestionType.CUSTOM,
          body: 'My answer',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when groupQuestionId does not belong to the group', async () => {
      const tx = makeTx();
      tx.diaryEntry.findUnique.mockResolvedValue({
        id: 'entry-1',
        groupId: 'group-1',
      });
      tx.groupQuestion.findFirst.mockResolvedValue(null);

      prismaService.$transaction.mockImplementation(
        (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          cb(tx as unknown as Prisma.TransactionClient),
      );

      const service = makeService();
      await expect(
        service.createAnswer({
          diaryEntryId: 'entry-1',
          questionType: QuestionType.CUSTOM,
          groupQuestionId: 'wrong-question',
          body: 'My answer',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when a duplicate answer exists for the same question', async () => {
      const tx = makeTx();
      tx.diaryEntry.findUnique.mockResolvedValue({
        id: 'entry-1',
        groupId: 'group-1',
      });
      tx.groupQuestion.findFirst.mockResolvedValue({
        id: 'question-1',
        question: 'What made you smile today?',
      });
      tx.answer.findUnique.mockResolvedValue({ id: 'answer-1' });

      prismaService.$transaction.mockImplementation(
        (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          cb(tx as unknown as Prisma.TransactionClient),
      );

      const service = makeService();
      await expect(
        service.createAnswer({
          diaryEntryId: 'entry-1',
          questionType: QuestionType.CUSTOM,
          groupQuestionId: 'question-1',
          body: 'Duplicate',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException when diary entry does not exist', async () => {
      const tx = makeTx();
      tx.diaryEntry.findUnique.mockResolvedValue(null);

      prismaService.$transaction.mockImplementation(
        (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          cb(tx as unknown as Prisma.TransactionClient),
      );

      const service = makeService();
      await expect(
        service.createAnswer({
          diaryEntryId: 'missing-entry',
          questionType: QuestionType.CUSTOM,
          groupQuestionId: 'question-1',
          body: 'Answer',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────
  // updateAnswer
  // ──────────────────────────────────────────────

  describe('updateAnswer', () => {
    it('updates the answer body', async () => {
      const existing = {
        id: 'answer-1',
        diaryEntryId: 'entry-1',
        questionSnapshot: 'Original question',
        body: 'Old body',
      };
      const updated = { ...existing, body: 'New body' };

      prismaService.answer.findUnique.mockResolvedValue(existing);
      prismaService.answer.update.mockResolvedValue(updated);

      const service = makeService();
      await expect(
        service.updateAnswer('answer-1', { body: 'New body' }),
      ).resolves.toEqual(updated);

      expect(prismaService.answer.update).toHaveBeenCalledWith({
        where: { id: 'answer-1' },
        data: { body: 'New body' },
      });
      expect(updated.questionSnapshot).toBe('Original question');
    });

    it('throws NotFoundException when answer does not exist', async () => {
      prismaService.answer.findUnique.mockResolvedValue(null);

      const service = makeService();
      await expect(
        service.updateAnswer('missing', { body: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────
  // createAnswerForUser
  // ──────────────────────────────────────────────

  describe('createAnswerForUser', () => {
    it('creates diary entry automatically and then creates answer', async () => {
      const createdAnswer = {
        id: 'answer-2',
        diaryEntryId: 'entry-2',
        questionType: QuestionType.CUSTOM,
        groupQuestionId: 'question-1',
        questionSnapshot: 'What made you smile today?',
        body: 'Auto entry answer',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const tx = makeTx();
      tx.diaryEntry.findUnique.mockResolvedValue(null);
      tx.diaryEntry.create.mockResolvedValue({
        id: 'entry-2',
        groupId: 'group-1',
        userId: 'user-1',
        diaryDate: new Date('2024-01-01'),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      tx.groupQuestion.findFirst.mockResolvedValue({
        id: 'question-1',
        question: 'What made you smile today?',
      });
      tx.answer.findUnique.mockResolvedValue(null);
      tx.answer.create.mockResolvedValue(createdAnswer);

      prismaService.$transaction.mockImplementation(
        (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          cb(tx as unknown as Prisma.TransactionClient),
      );

      const service = makeService();
      const result = await service.createAnswerForUser({
        groupId: 'group-1',
        userId: 'user-1',
        diaryDate: new Date('2024-01-01'),
        questionType: QuestionType.CUSTOM,
        groupQuestionId: 'question-1',
        body: 'Auto entry answer',
      });

      expect(result).toEqual(createdAnswer);
      expect(tx.diaryEntry.create).toHaveBeenCalledWith({
        data: {
          groupId: 'group-1',
          userId: 'user-1',
          diaryDate: new Date('2024-01-01'),
        },
      });
    });

    it('throws ConflictException when duplicate exists for created-or-found entry', async () => {
      const tx = makeTx();
      tx.diaryEntry.findUnique.mockResolvedValue({
        id: 'entry-1',
        groupId: 'group-1',
        userId: 'user-1',
        diaryDate: new Date('2024-01-01'),
      });
      tx.groupQuestion.findFirst.mockResolvedValue({
        id: 'question-1',
        question: 'What made you smile today?',
      });
      tx.answer.findUnique.mockResolvedValue({ id: 'dup' });

      prismaService.$transaction.mockImplementation(
        (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          cb(tx as unknown as Prisma.TransactionClient),
      );

      const service = makeService();
      await expect(
        service.createAnswerForUser({
          groupId: 'group-1',
          userId: 'user-1',
          diaryDate: new Date('2024-01-01'),
          questionType: QuestionType.CUSTOM,
          groupQuestionId: 'question-1',
          body: 'Duplicate',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a DAILY answer when the daily question exists for the date', async () => {
      const dailyQ = {
        id: 'dq-1',
        question: '오늘 가장 기억에 남는 순간은?',
        questionDate: new Date('2024-01-01'),
        createdAt: new Date(),
      };
      const createdAnswer = {
        id: 'answer-daily-1',
        diaryEntryId: 'entry-1',
        questionType: QuestionType.DAILY,
        groupQuestionId: null,
        dailyQuestionId: 'dq-1',
        questionSnapshot: '오늘 가장 기억에 남는 순간은?',
        body: 'A great moment.',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const tx = makeTx();
      tx.diaryEntry.findUnique.mockResolvedValue({
        id: 'entry-1',
        groupId: 'group-1',
        userId: 'user-1',
        diaryDate: new Date('2024-01-01'),
      });
      tx.dailyQuestion.findUnique.mockResolvedValue(dailyQ);
      tx.answer.findFirst.mockResolvedValue(null);
      tx.answer.create.mockResolvedValue(createdAnswer);

      prismaService.$transaction.mockImplementation(
        (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          cb(tx as unknown as Prisma.TransactionClient),
      );

      const service = makeService();
      const result = await service.createAnswerForUser({
        groupId: 'group-1',
        userId: 'user-1',
        diaryDate: new Date('2024-01-01'),
        questionType: QuestionType.DAILY,
        body: 'A great moment.',
      });

      expect(result).toEqual(createdAnswer);
      expect(tx.answer.create).toHaveBeenCalledWith({
        data: {
          diaryEntryId: 'entry-1',
          questionType: QuestionType.DAILY,
          groupQuestionId: null,
          dailyQuestionId: 'dq-1',
          questionSnapshot: '오늘 가장 기억에 남는 순간은?',
          body: 'A great moment.',
        },
      });
    });

    it('throws NotFoundException when DAILY type is used but no question exists for the date', async () => {
      const tx = makeTx();
      tx.diaryEntry.findUnique.mockResolvedValue({
        id: 'entry-1',
        groupId: 'group-1',
        userId: 'user-1',
        diaryDate: new Date('2024-01-01'),
      });
      tx.dailyQuestion.findUnique.mockResolvedValue(null);

      prismaService.$transaction.mockImplementation(
        (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          cb(tx as unknown as Prisma.TransactionClient),
      );

      const service = makeService();
      await expect(
        service.createAnswerForUser({
          groupId: 'group-1',
          userId: 'user-1',
          diaryDate: new Date('2024-01-01'),
          questionType: QuestionType.DAILY,
          body: 'No question yet',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when a DAILY answer already exists', async () => {
      const dailyQ = {
        id: 'dq-1',
        question: '오늘 기분은?',
        questionDate: new Date('2024-01-01'),
        createdAt: new Date(),
      };

      const tx = makeTx();
      tx.diaryEntry.findUnique.mockResolvedValue({
        id: 'entry-1',
        groupId: 'group-1',
        userId: 'user-1',
        diaryDate: new Date('2024-01-01'),
      });
      tx.dailyQuestion.findUnique.mockResolvedValue(dailyQ);
      tx.answer.findFirst.mockResolvedValue({ id: 'existing-answer' });

      prismaService.$transaction.mockImplementation(
        (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          cb(tx as unknown as Prisma.TransactionClient),
      );

      const service = makeService();
      await expect(
        service.createAnswerForUser({
          groupId: 'group-1',
          userId: 'user-1',
          diaryDate: new Date('2024-01-01'),
          questionType: QuestionType.DAILY,
          body: 'Duplicate daily answer',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ──────────────────────────────────────────────
  // updateAnswerForUser
  // ──────────────────────────────────────────────

  describe('updateAnswerForUser', () => {
    it('updates answer when owner and group match', async () => {
      prismaService.answer.findUnique.mockResolvedValue({
        id: 'answer-1',
        body: 'Old body',
        diaryEntry: {
          groupId: 'group-1',
          userId: 'user-1',
        },
      });
      prismaService.answer.update.mockResolvedValue({
        id: 'answer-1',
        body: 'New body',
      });

      const service = makeService();
      await expect(
        service.updateAnswerForUser('group-1', 'user-1', 'answer-1', {
          body: 'New body',
        }),
      ).resolves.toEqual({
        id: 'answer-1',
        body: 'New body',
      });
    });

    it('throws ForbiddenException when answer is owned by another user', async () => {
      prismaService.answer.findUnique.mockResolvedValue({
        id: 'answer-1',
        body: 'Old body',
        diaryEntry: {
          groupId: 'group-1',
          userId: 'user-2',
        },
      });

      const service = makeService();
      await expect(
        service.updateAnswerForUser('group-1', 'user-1', 'answer-1', {
          body: 'New body',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException when answer does not exist', async () => {
      prismaService.answer.findUnique.mockResolvedValue(null);

      const service = makeService();
      await expect(
        service.updateAnswerForUser('group-1', 'user-1', 'missing', {
          body: 'x',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ──────────────────────────────────────────────
  // listEntriesForGroup
  // ──────────────────────────────────────────────

  describe('listEntriesForGroup', () => {
    it('returns entries ordered by createdAt', async () => {
      const entries = [{ id: 'e1' }, { id: 'e2' }];
      prismaService.diaryEntry.findMany.mockResolvedValue(entries);

      const service = makeService();
      const date = new Date('2024-01-01');
      await expect(
        service.listEntriesForGroup('group-1', date),
      ).resolves.toEqual(entries);

      expect(prismaService.diaryEntry.findMany).toHaveBeenCalledWith({
        where: { groupId: 'group-1', diaryDate: date },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  // ──────────────────────────────────────────────
  // getTodaysDiaryContext
  // ──────────────────────────────────────────────

  describe('getTodaysDiaryContext', () => {
    const date = new Date('2024-06-01');

    it('returns questions, dailyQuestion, and null entry when no diary entry exists', async () => {
      const questions = [
        { id: 'q1', groupId: 'group-1', question: 'Q1', displayOrder: 1 },
      ];
      const dailyQ = {
        id: 'dq-1',
        question: '오늘 기분은?',
        questionDate: date,
      };

      prismaService.groupQuestion.findMany.mockResolvedValue(questions);
      dailyQuestionService.findByDate.mockResolvedValue(dailyQ);
      prismaService.diaryEntry.findUnique.mockResolvedValue(null);

      const service = makeService();
      const result = await service.getTodaysDiaryContext(
        'group-1',
        'user-1',
        date,
      );

      expect(result.questions).toEqual(questions);
      expect(result.dailyQuestion).toEqual(dailyQ);
      expect(result.entry).toBeNull();

      expect(prismaService.groupQuestion.findMany).toHaveBeenCalledWith({
        where: { groupId: 'group-1', isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      });
      expect(dailyQuestionService.findByDate).toHaveBeenCalledWith(date);
      expect(prismaService.diaryEntry.findUnique).toHaveBeenCalledWith({
        where: {
          groupId_userId_diaryDate: {
            groupId: 'group-1',
            userId: 'user-1',
            diaryDate: date,
          },
        },
        include: { answers: { orderBy: { createdAt: 'asc' } } },
      });
    });

    it('returns questions, dailyQuestion, and existing entry with answers', async () => {
      const questions = [
        { id: 'q1', groupId: 'group-1', question: 'Q1', displayOrder: 1 },
      ];
      const dailyQ = {
        id: 'dq-1',
        question: '오늘 기분은?',
        questionDate: date,
      };
      const entry = {
        id: 'entry-1',
        groupId: 'group-1',
        userId: 'user-1',
        diaryDate: date,
        createdAt: new Date(),
        updatedAt: new Date(),
        answers: [
          {
            id: 'a1',
            diaryEntryId: 'entry-1',
            questionType: 'CUSTOM',
            groupQuestionId: 'q1',
            questionSnapshot: 'Q1',
            body: 'My answer',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };

      prismaService.groupQuestion.findMany.mockResolvedValue(questions);
      dailyQuestionService.findByDate.mockResolvedValue(dailyQ);
      prismaService.diaryEntry.findUnique.mockResolvedValue(entry);

      const service = makeService();
      const result = await service.getTodaysDiaryContext(
        'group-1',
        'user-1',
        date,
      );

      expect(result.questions).toEqual(questions);
      expect(result.dailyQuestion).toEqual(dailyQ);
      expect(result.entry).toEqual(entry);
    });

    it('returns null dailyQuestion when no question has been generated yet', async () => {
      prismaService.groupQuestion.findMany.mockResolvedValue([]);
      dailyQuestionService.findByDate.mockResolvedValue(null);
      prismaService.diaryEntry.findUnique.mockResolvedValue(null);

      const service = makeService();
      const result = await service.getTodaysDiaryContext(
        'group-1',
        'user-1',
        date,
      );

      expect(result.questions).toEqual([]);
      expect(result.dailyQuestion).toBeNull();
      expect(result.entry).toBeNull();
    });

    it('looks up the daily question for the requested date, not always today', async () => {
      const otherDate = new Date('2024-06-02');

      prismaService.groupQuestion.findMany.mockResolvedValue([]);
      dailyQuestionService.findByDate.mockResolvedValue(null);
      prismaService.diaryEntry.findUnique.mockResolvedValue(null);

      const service = makeService();
      await service.getTodaysDiaryContext('group-1', 'user-1', otherDate);

      expect(dailyQuestionService.findByDate).toHaveBeenCalledWith(otherDate);
    });
  });

  // ──────────────────────────────────────────────
  // getGroupDailyFeed
  // ──────────────────────────────────────────────

  describe('getGroupDailyFeed', () => {
    const date = new Date('2024-06-01T00:00:00.000Z');

    const makeUser = (id: string, name: string) => ({
      id,
      name,
      profileImageKey: null,
    });

    const makeMembership = (
      userId: string,
      name: string,
      memberId = `member-${userId}`,
    ) => ({
      id: memberId,
      groupId: 'group-1',
      userId,
      role: 'MEMBER',
      createdAt: new Date(),
      updatedAt: new Date(),
      user: makeUser(userId, name),
    });

    const makeEntry = (
      userId: string,
      answers: object[] = [],
      entryId = `entry-${userId}`,
    ) => ({
      id: entryId,
      groupId: 'group-1',
      userId,
      diaryDate: date,
      createdAt: new Date(),
      updatedAt: new Date(),
      answers,
    });

    it('returns each member paired with their diary entry', async () => {
      const memberships = [
        makeMembership('user-1', 'Alice'),
        makeMembership('user-2', 'Bob'),
      ];
      const entries = [makeEntry('user-1', [{ id: 'a1', body: 'Good day' }])];

      prismaService.groupMember.findMany.mockResolvedValue(memberships);
      prismaService.diaryEntry.findMany.mockResolvedValue(entries);

      const service = makeService();
      const result = await service.getGroupDailyFeed('group-1', date);

      expect(result).toHaveLength(2);

      const alice = result.find((r) => r.userId === 'user-1');
      const bob = result.find((r) => r.userId === 'user-2');

      expect(alice?.entry).not.toBeNull();
      expect(alice?.entry?.answers).toHaveLength(1);
      expect(bob?.entry).toBeNull();
    });

    it('returns null entry for every member when no entries exist for the date', async () => {
      const memberships = [
        makeMembership('user-1', 'Alice'),
        makeMembership('user-2', 'Bob'),
      ];

      prismaService.groupMember.findMany.mockResolvedValue(memberships);
      prismaService.diaryEntry.findMany.mockResolvedValue([]);

      const service = makeService();
      const result = await service.getGroupDailyFeed('group-1', date);

      expect(result).toHaveLength(2);
      expect(result.every((r) => r.entry === null)).toBe(true);
    });

    it('returns an empty array when the group has no members', async () => {
      prismaService.groupMember.findMany.mockResolvedValue([]);
      prismaService.diaryEntry.findMany.mockResolvedValue([]);

      const service = makeService();
      const result = await service.getGroupDailyFeed('group-1', date);

      expect(result).toHaveLength(0);
    });

    it('fetches members and entries in parallel (both mocks called once)', async () => {
      prismaService.groupMember.findMany.mockResolvedValue([]);
      prismaService.diaryEntry.findMany.mockResolvedValue([]);

      const service = makeService();
      await service.getGroupDailyFeed('group-1', date);

      expect(prismaService.groupMember.findMany).toHaveBeenCalledTimes(1);
      expect(prismaService.diaryEntry.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns member user info on each result', async () => {
      const memberships = [makeMembership('user-1', 'Alice')];
      const entries = [makeEntry('user-1')];

      prismaService.groupMember.findMany.mockResolvedValue(memberships);
      prismaService.diaryEntry.findMany.mockResolvedValue(entries);

      const service = makeService();
      const result = await service.getGroupDailyFeed('group-1', date);

      expect(result[0].user).toMatchObject({ id: 'user-1', name: 'Alice' });
    });
  });
});

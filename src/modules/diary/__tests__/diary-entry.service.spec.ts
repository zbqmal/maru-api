import {
  BadRequestException,
  ConflictException,
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
    answer: {
      findUnique: jest.fn(),
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
  };

  function makeService() {
    return new DiaryEntryService(prismaService as never);
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
});

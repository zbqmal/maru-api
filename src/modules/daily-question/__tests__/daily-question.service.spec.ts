import { Logger } from '@nestjs/common';
import { DailyQuestionService } from '../daily-question.service';

describe('DailyQuestionService', () => {
  const makePrismaService = (overrides: Record<string, unknown> = {}) => ({
    dailyQuestion: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    ...overrides,
  });

  const makeOpenAiService = (chatResult?: string) => ({
    isAvailable: jest.fn().mockReturnValue(true),
    chat: jest
      .fn()
      .mockResolvedValue(chatResult ?? '오늘 가장 행복했던 순간은 무엇인가요?'),
  });

  function makeService(
    prismaService: ReturnType<typeof makePrismaService>,
    openAiService: ReturnType<typeof makeOpenAiService>,
  ) {
    return new DailyQuestionService(
      prismaService as never,
      openAiService as never,
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  // ──────────────────────────────────────────────
  // findTodaysQuestion
  // ──────────────────────────────────────────────

  describe('findTodaysQuestion', () => {
    it('returns null when no question exists for today', async () => {
      const prisma = makePrismaService();
      prisma.dailyQuestion.findUnique.mockResolvedValue(null);

      const svc = makeService(prisma, makeOpenAiService());
      const result = await svc.findTodaysQuestion();

      expect(result).toBeNull();
      expect(prisma.dailyQuestion.findUnique).toHaveBeenCalledTimes(1);
    });

    it('returns the question when it exists for today', async () => {
      const existing = {
        id: 'dq-1',
        question: '오늘 기분은 어때요?',
        questionDate: new Date(),
      };
      const prisma = makePrismaService();
      prisma.dailyQuestion.findUnique.mockResolvedValue(existing);

      const svc = makeService(prisma, makeOpenAiService());
      const result = await svc.findTodaysQuestion();

      expect(result).toEqual(existing);
    });
  });

  // ──────────────────────────────────────────────
  // generateAndStoreTodaysQuestion — idempotency
  // ──────────────────────────────────────────────

  describe('generateAndStoreTodaysQuestion', () => {
    it('returns existing question without calling OpenAI when one already exists', async () => {
      const existing = {
        id: 'dq-1',
        question: '오늘 기분은 어때요?',
        questionDate: new Date(),
      };
      const prisma = makePrismaService();
      prisma.dailyQuestion.findUnique.mockResolvedValue(existing);

      const openAi = makeOpenAiService();
      const svc = makeService(prisma, openAi);

      const result = await svc.generateAndStoreTodaysQuestion();

      expect(result).toEqual(existing);
      expect(openAi.chat).not.toHaveBeenCalled();
    });

    it('calls OpenAI and stores the question when none exists', async () => {
      const createdQuestion = {
        id: 'dq-2',
        question: '오늘 가장 행복했던 순간은 무엇인가요?',
        questionDate: new Date(),
        createdAt: new Date(),
      };

      const prisma = makePrismaService();
      prisma.dailyQuestion.findUnique.mockResolvedValue(null);
      prisma.dailyQuestion.create.mockResolvedValue(createdQuestion);

      const openAi = makeOpenAiService('오늘 가장 행복했던 순간은 무엇인가요?');
      const svc = makeService(prisma, openAi);

      const result = await svc.generateAndStoreTodaysQuestion();

      expect(openAi.chat).toHaveBeenCalledTimes(1);
      expect(prisma.dailyQuestion.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual(createdQuestion);
    });

    it('throws when OpenAI is not available and no question exists', async () => {
      const prisma = makePrismaService();
      prisma.dailyQuestion.findUnique.mockResolvedValue(null);

      const openAi = makeOpenAiService();
      openAi.isAvailable.mockReturnValue(false);

      const svc = makeService(prisma, openAi);

      await expect(svc.generateAndStoreTodaysQuestion()).rejects.toThrow(
        'Cannot generate daily question: OPENAI_API_KEY is not configured.',
      );
    });

    it('re-fetches and returns the concurrent question on unique-constraint violation', async () => {
      const concurrentQuestion = {
        id: 'dq-concurrent',
        question: '오늘 뭘 배웠나요?',
        questionDate: new Date(),
        createdAt: new Date(),
      };

      const prisma = makePrismaService();
      // First findUnique: no existing question
      // After P2002: second findUnique returns concurrent question
      prisma.dailyQuestion.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(concurrentQuestion);

      const uniqueError = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
      prisma.dailyQuestion.create.mockRejectedValue(uniqueError);

      const svc = makeService(prisma, makeOpenAiService());
      const result = await svc.generateAndStoreTodaysQuestion();

      expect(result).toEqual(concurrentQuestion);
    });

    it('retries on OpenAI failure and succeeds on second attempt', async () => {
      const createdQuestion = {
        id: 'dq-3',
        question: '오늘 가장 감사한 것은 무엇인가요?',
        questionDate: new Date(),
        createdAt: new Date(),
      };

      const prisma = makePrismaService();
      prisma.dailyQuestion.findUnique.mockResolvedValue(null);
      prisma.dailyQuestion.create.mockResolvedValue(createdQuestion);

      const openAi = makeOpenAiService('오늘 가장 감사한 것은 무엇인가요?');
      openAi.chat
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('오늘 가장 감사한 것은 무엇인가요?');

      // Speed up retry delays
      jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((fn: TimerHandler) => {
          if (typeof fn === 'function') (fn as () => void)();
          return 0 as unknown as ReturnType<typeof setTimeout>;
        });

      const svc = makeService(prisma, openAi);
      const result = await svc.generateAndStoreTodaysQuestion();

      expect(openAi.chat).toHaveBeenCalledTimes(2);
      expect(result).toEqual(createdQuestion);

      jest.restoreAllMocks();
    });
  });

  // ──────────────────────────────────────────────
  // validateQuestion (via generateAndStoreTodaysQuestion)
  // ──────────────────────────────────────────────

  describe('validation', () => {
    it('throws when generated question does not end with ?', async () => {
      const prisma = makePrismaService();
      prisma.dailyQuestion.findUnique.mockResolvedValue(null);

      const openAi = makeOpenAiService('오늘 기분은 어때요'); // no ?
      const svc = makeService(prisma, openAi);

      await expect(svc.generateAndStoreTodaysQuestion()).rejects.toThrow(
        'does not end with a question mark',
      );
    });

    it('throws when generated question exceeds max length', async () => {
      const prisma = makePrismaService();
      prisma.dailyQuestion.findUnique.mockResolvedValue(null);

      const longQuestion = 'a'.repeat(101) + '?';
      const openAi = makeOpenAiService(longQuestion);
      const svc = makeService(prisma, openAi);

      await expect(svc.generateAndStoreTodaysQuestion()).rejects.toThrow(
        'exceeds',
      );
    });
  });

  // ──────────────────────────────────────────────
  // scheduledGeneration
  // ──────────────────────────────────────────────

  describe('scheduledGeneration', () => {
    it('calls generateAndStoreTodaysQuestion and does not throw', async () => {
      const prisma = makePrismaService();
      const existing = {
        id: 'dq-1',
        question: '오늘 기분은?',
        questionDate: new Date(),
      };
      prisma.dailyQuestion.findUnique.mockResolvedValue(existing);

      const svc = makeService(prisma, makeOpenAiService());

      await expect(svc.scheduledGeneration()).resolves.not.toThrow();
    });

    it('logs error without throwing when generation fails', async () => {
      const prisma = makePrismaService();
      prisma.dailyQuestion.findUnique.mockResolvedValue(null);

      const openAi = makeOpenAiService();
      openAi.isAvailable.mockReturnValue(false);

      const svc = makeService(prisma, openAi);

      // Should not throw even when generation fails
      await expect(svc.scheduledGeneration()).resolves.not.toThrow();
    });
  });
});

import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { validateEnvironment } from '../../src/common/config/environment.validation';
import { DailyQuestionModule } from '../../src/modules/daily-question/daily-question.module';
import { DailyQuestionService } from '../../src/modules/daily-question/daily-question.service';
import { OpenAiService } from '../../src/modules/daily-question/openai.service';
import { PrismaService } from '../../src/modules/database/prisma.service';
import { DiaryModule } from '../../src/modules/diary/diary.module';
import { DiaryEntryService } from '../../src/modules/diary/diary-entry.service';
import { GroupModule } from '../../src/modules/group/group.module';
import { GroupService } from '../../src/modules/group/group.service';
import { GroupMembershipService } from '../../src/modules/group/group-membership.service';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;

const MOCK_QUESTION = '오늘 가장 기억에 남는 순간은 무엇인가요?';

describe('DailyQuestionService (integration)', () => {
  let prismaService: PrismaService;
  let dailyQuestionService: DailyQuestionService;
  let diaryEntryService: DiaryEntryService;
  let groupService: GroupService;
  let groupMembershipService: GroupMembershipService;

  const mockOpenAiService = {
    isAvailable: jest.fn().mockReturnValue(true),
    chat: jest.fn().mockResolvedValue(MOCK_QUESTION),
  };

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error(
        'TEST_DATABASE_URL or DATABASE_URL must be set for integration tests.',
      );
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          ignoreEnvFile: true,
          validate: validateEnvironment,
        }),
        DailyQuestionModule,
        DiaryModule,
        GroupModule,
      ],
    })
      .overrideProvider(OpenAiService)
      .useValue(mockOpenAiService)
      .compile();

    prismaService = moduleRef.get(PrismaService);
    dailyQuestionService = moduleRef.get(DailyQuestionService);
    diaryEntryService = moduleRef.get(DiaryEntryService);
    groupService = moduleRef.get(GroupService);
    groupMembershipService = moduleRef.get(GroupMembershipService);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOpenAiService.chat.mockResolvedValue(MOCK_QUESTION);

    await prismaService.answer.deleteMany();
    await prismaService.diaryEntry.deleteMany();
    await prismaService.dailyQuestion.deleteMany();
    await prismaService.groupQuestion.deleteMany();
    await prismaService.groupInvitation.deleteMany();
    await prismaService.groupMember.deleteMany();
    await prismaService.group.deleteMany();
    await prismaService.session.deleteMany();
    await prismaService.passwordResetToken.deleteMany();
    await prismaService.user.deleteMany();
  });

  afterAll(async () => {
    await prismaService.$disconnect();
  });

  // ──────────────────────────────────────────────
  // findTodaysQuestion
  // ──────────────────────────────────────────────

  describe('findTodaysQuestion', () => {
    it('returns null when no question has been generated today', async () => {
      const result = await dailyQuestionService.findTodaysQuestion();
      expect(result).toBeNull();
    });

    it('returns the question after generation', async () => {
      await dailyQuestionService.generateAndStoreTodaysQuestion();
      const result = await dailyQuestionService.findTodaysQuestion();

      expect(result).not.toBeNull();
      expect(result?.question).toBe(MOCK_QUESTION);
    });
  });

  // ──────────────────────────────────────────────
  // generateAndStoreTodaysQuestion — idempotency
  // ──────────────────────────────────────────────

  describe('generateAndStoreTodaysQuestion', () => {
    it('creates a new question and persists it', async () => {
      const result =
        await dailyQuestionService.generateAndStoreTodaysQuestion();

      expect(result.id).toBeDefined();
      expect(result.question).toBe(MOCK_QUESTION);
      expect(result.questionDate).toBeDefined();

      const count = await prismaService.dailyQuestion.count();
      expect(count).toBe(1);
    });

    it('is idempotent — second call returns existing question without calling OpenAI again', async () => {
      const first = await dailyQuestionService.generateAndStoreTodaysQuestion();
      const second =
        await dailyQuestionService.generateAndStoreTodaysQuestion();

      expect(second.id).toBe(first.id);
      expect(mockOpenAiService.chat).toHaveBeenCalledTimes(1);

      const count = await prismaService.dailyQuestion.count();
      expect(count).toBe(1);
    });

    it('handles concurrent calls (simulated) without duplicate rows', async () => {
      // Run two concurrent calls — only one should succeed in creating the row
      const [first, second] = await Promise.all([
        dailyQuestionService.generateAndStoreTodaysQuestion(),
        dailyQuestionService.generateAndStoreTodaysQuestion(),
      ]);

      expect(first.id).toBe(second.id);
      const count = await prismaService.dailyQuestion.count();
      expect(count).toBe(1);
    });
  });

  // ──────────────────────────────────────────────
  // DAILY answer creation via DiaryEntryService
  // ──────────────────────────────────────────────

  describe('DAILY answer creation via DiaryEntryService', () => {
    async function createFixture() {
      const [leader, member] = await Promise.all([
        prismaService.user.create({
          data: {
            email: 'daily-leader@example.com',
            passwordHash: 'placeholder',
            name: 'Daily Leader',
          },
        }),
        prismaService.user.create({
          data: {
            email: 'daily-member@example.com',
            passwordHash: 'placeholder',
            name: 'Daily Member',
          },
        }),
      ]);

      const group = await groupService.createGroupWithLeader({
        name: 'Daily Group',
        leaderUserId: leader.id,
      });

      await groupMembershipService.addMember({
        groupId: group.id,
        userId: member.id,
      });

      return { leader, member, group };
    }

    it('creates a DAILY answer linked to the daily question', async () => {
      const { leader, group } = await createFixture();

      const dailyQ =
        await dailyQuestionService.generateAndStoreTodaysQuestion();

      const today = new Date();
      const diaryDate = new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate(),
        ),
      );

      const answer = await diaryEntryService.createAnswerForUser({
        groupId: group.id,
        userId: leader.id,
        diaryDate,
        questionType: 'DAILY',
        body: '오늘 저녁을 가족과 함께 먹었어요.',
      });

      expect(answer.questionType).toBe('DAILY');
      expect(answer.dailyQuestionId).toBe(dailyQ.id);
      expect(answer.questionSnapshot).toBe(MOCK_QUESTION);
      expect(answer.groupQuestionId).toBeNull();
    });

    it('rejects duplicate DAILY answer for the same diary entry', async () => {
      const { leader, group } = await createFixture();
      await dailyQuestionService.generateAndStoreTodaysQuestion();

      const today = new Date();
      const diaryDate = new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate(),
        ),
      );

      await diaryEntryService.createAnswerForUser({
        groupId: group.id,
        userId: leader.id,
        diaryDate,
        questionType: 'DAILY',
        body: 'First answer.',
      });

      const { ConflictException } = await import('@nestjs/common');
      await expect(
        diaryEntryService.createAnswerForUser({
          groupId: group.id,
          userId: leader.id,
          diaryDate,
          questionType: 'DAILY',
          body: 'Duplicate answer.',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns null dailyQuestion in context when not yet generated', async () => {
      const { leader, group } = await createFixture();

      const today = new Date();
      const diaryDate = new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate(),
        ),
      );

      const context = await diaryEntryService.getTodaysDiaryContext(
        group.id,
        leader.id,
        diaryDate,
      );

      expect(context.dailyQuestion).toBeNull();
    });

    it('includes dailyQuestion in context after generation', async () => {
      const { leader, group } = await createFixture();
      const dailyQ =
        await dailyQuestionService.generateAndStoreTodaysQuestion();

      const today = new Date();
      const diaryDate = new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate(),
        ),
      );

      const context = await diaryEntryService.getTodaysDiaryContext(
        group.id,
        leader.id,
        diaryDate,
      );

      expect(context.dailyQuestion).not.toBeNull();
      expect(context.dailyQuestion?.id).toBe(dailyQ.id);
      expect(context.dailyQuestion?.question).toBe(MOCK_QUESTION);
    });
  });
});

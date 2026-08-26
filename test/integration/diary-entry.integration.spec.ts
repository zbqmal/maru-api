import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { QuestionType } from '@prisma/client';
import { validateEnvironment } from '../../src/common/config/environment.validation';
import { PrismaService } from '../../src/modules/database/prisma.service';
import { DiaryModule } from '../../src/modules/diary/diary.module';
import { DiaryEntryService } from '../../src/modules/diary/diary-entry.service';
import { GroupModule } from '../../src/modules/group/group.module';
import { GroupMembershipService } from '../../src/modules/group/group-membership.service';
import { GroupQuestionService } from '../../src/modules/group/group-question.service';
import { GroupService } from '../../src/modules/group/group.service';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;

describe('DiaryEntryService (integration)', () => {
  let prismaService: PrismaService;
  let groupService: GroupService;
  let groupMembershipService: GroupMembershipService;
  let groupQuestionService: GroupQuestionService;
  let diaryEntryService: DiaryEntryService;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error(
        'TEST_DATABASE_URL or DATABASE_URL must be set for tests.',
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
        GroupModule,
        DiaryModule,
      ],
    }).compile();

    prismaService = moduleRef.get(PrismaService);
    groupService = moduleRef.get(GroupService);
    groupMembershipService = moduleRef.get(GroupMembershipService);
    groupQuestionService = moduleRef.get(GroupQuestionService);
    diaryEntryService = moduleRef.get(DiaryEntryService);
  });

  beforeEach(async () => {
    await prismaService.answer.deleteMany();
    await prismaService.diaryEntry.deleteMany();
    await prismaService.groupQuestion.deleteMany();
    await prismaService.group.deleteMany();
    await prismaService.session.deleteMany();
    await prismaService.passwordResetToken.deleteMany();
    await prismaService.user.deleteMany();
  });

  afterAll(async () => {
    await prismaService.$disconnect();
  });

  async function createFixture() {
    const [leader, member] = await Promise.all([
      prismaService.user.create({
        data: {
          email: 'diary-leader@example.com',
          passwordHash: 'placeholder',
          name: 'Diary Leader',
        },
      }),
      prismaService.user.create({
        data: {
          email: 'diary-member@example.com',
          passwordHash: 'placeholder',
          name: 'Diary Member',
        },
      }),
    ]);

    const group = await groupService.createGroupWithLeader({
      name: 'Diary Group',
      leaderUserId: leader.id,
    });

    await groupMembershipService.addMember({
      groupId: group.id,
      userId: member.id,
    });

    const question = await groupQuestionService.createQuestion(
      group.id,
      leader.id,
      { question: 'What made you smile today?' },
    );

    const diaryDate = new Date('2024-06-01');

    return { leader, member, group, question, diaryDate };
  }

  // ──────────────────────────────────────────────
  // DiaryEntry uniqueness constraint
  // ──────────────────────────────────────────────

  it('enforces UNIQUE(group_id, user_id, diary_date) — returns existing entry on second call', async () => {
    const { leader, group, diaryDate } = await createFixture();

    const first = await diaryEntryService.findOrCreateEntry({
      groupId: group.id,
      userId: leader.id,
      diaryDate,
    });

    const second = await diaryEntryService.findOrCreateEntry({
      groupId: group.id,
      userId: leader.id,
      diaryDate,
    });

    expect(second.id).toBe(first.id);

    const count = await prismaService.diaryEntry.count({
      where: { groupId: group.id, userId: leader.id, diaryDate },
    });
    expect(count).toBe(1);
  });

  it('allows different users to have separate diary entries for the same group and date', async () => {
    const { leader, member, group, diaryDate } = await createFixture();

    const leaderEntry = await diaryEntryService.findOrCreateEntry({
      groupId: group.id,
      userId: leader.id,
      diaryDate,
    });

    const memberEntry = await diaryEntryService.findOrCreateEntry({
      groupId: group.id,
      userId: member.id,
      diaryDate,
    });

    expect(leaderEntry.id).not.toBe(memberEntry.id);

    const count = await prismaService.diaryEntry.count({
      where: { groupId: group.id, diaryDate },
    });
    expect(count).toBe(2);
  });

  it('throws NotFoundException when creating an entry for a non-existent group', async () => {
    const { leader, diaryDate } = await createFixture();

    await expect(
      diaryEntryService.findOrCreateEntry({
        groupId: 'nonexistent-group',
        userId: leader.id,
        diaryDate,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ──────────────────────────────────────────────
  // Answer duplicate constraint
  // ──────────────────────────────────────────────

  it('creates an answer linked to a group question', async () => {
    const { leader, group, question, diaryDate } = await createFixture();

    const entry = await diaryEntryService.findOrCreateEntry({
      groupId: group.id,
      userId: leader.id,
      diaryDate,
    });

    const answer = await diaryEntryService.createAnswer({
      diaryEntryId: entry.id,
      questionType: QuestionType.CUSTOM,
      groupQuestionId: question.id,
      body: 'Saw a rainbow!',
    });

    expect(answer.diaryEntryId).toBe(entry.id);
    expect(answer.groupQuestionId).toBe(question.id);
    expect(answer.questionSnapshot).toBe('What made you smile today?');
    expect(answer.questionType).toBe(QuestionType.CUSTOM);
    expect(answer.body).toBe('Saw a rainbow!');
  });

  it('prevents duplicate answers for the same question within a diary entry', async () => {
    const { leader, group, question, diaryDate } = await createFixture();

    const entry = await diaryEntryService.findOrCreateEntry({
      groupId: group.id,
      userId: leader.id,
      diaryDate,
    });

    await diaryEntryService.createAnswer({
      diaryEntryId: entry.id,
      questionType: QuestionType.CUSTOM,
      groupQuestionId: question.id,
      body: 'First answer',
    });

    await expect(
      diaryEntryService.createAnswer({
        diaryEntryId: entry.id,
        questionType: QuestionType.CUSTOM,
        groupQuestionId: question.id,
        body: 'Duplicate answer',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an answer whose groupQuestionId belongs to a different group', async () => {
    const { leader, group, diaryDate } = await createFixture();

    const otherGroup = await groupService.createGroupWithLeader({
      name: 'Other Group',
      leaderUserId: leader.id,
    });
    const foreignQuestion = await groupQuestionService.createQuestion(
      otherGroup.id,
      leader.id,
      { question: 'Foreign question' },
    );

    const entry = await diaryEntryService.findOrCreateEntry({
      groupId: group.id,
      userId: leader.id,
      diaryDate,
    });

    await expect(
      diaryEntryService.createAnswer({
        diaryEntryId: entry.id,
        questionType: QuestionType.CUSTOM,
        groupQuestionId: foreignQuestion.id,
        body: 'Should fail',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates diary entry automatically when creating the first answer for a date', async () => {
    const { leader, group, question, diaryDate } = await createFixture();

    const beforeEntry = await prismaService.diaryEntry.findUnique({
      where: {
        groupId_userId_diaryDate: {
          groupId: group.id,
          userId: leader.id,
          diaryDate,
        },
      },
    });
    expect(beforeEntry).toBeNull();

    const answer = await diaryEntryService.createAnswerForUser({
      groupId: group.id,
      userId: leader.id,
      diaryDate,
      questionType: QuestionType.CUSTOM,
      groupQuestionId: question.id,
      body: 'Auto-created entry answer',
    });

    const persistedEntry = await prismaService.diaryEntry.findUnique({
      where: {
        groupId_userId_diaryDate: {
          groupId: group.id,
          userId: leader.id,
          diaryDate,
        },
      },
    });

    expect(persistedEntry).not.toBeNull();
    expect(answer.diaryEntryId).toBe(persistedEntry!.id);
  });

  it('rolls back auto-created diary entry when answer creation fails', async () => {
    const { leader, group, diaryDate } = await createFixture();

    const otherGroup = await groupService.createGroupWithLeader({
      name: 'Rollback Group',
      leaderUserId: leader.id,
    });
    const foreignQuestion = await groupQuestionService.createQuestion(
      otherGroup.id,
      leader.id,
      { question: 'Foreign question for rollback' },
    );

    await expect(
      diaryEntryService.createAnswerForUser({
        groupId: group.id,
        userId: leader.id,
        diaryDate,
        questionType: QuestionType.CUSTOM,
        groupQuestionId: foreignQuestion.id,
        body: 'Should fail and rollback entry',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const entryAfterFailure = await prismaService.diaryEntry.findUnique({
      where: {
        groupId_userId_diaryDate: {
          groupId: group.id,
          userId: leader.id,
          diaryDate,
        },
      },
    });
    expect(entryAfterFailure).toBeNull();
  });

  // ──────────────────────────────────────────────
  // updateAnswer
  // ──────────────────────────────────────────────

  it('updates an answer body', async () => {
    const { leader, group, question, diaryDate } = await createFixture();

    const entry = await diaryEntryService.findOrCreateEntry({
      groupId: group.id,
      userId: leader.id,
      diaryDate,
    });

    const answer = await diaryEntryService.createAnswer({
      diaryEntryId: entry.id,
      questionType: QuestionType.CUSTOM,
      groupQuestionId: question.id,
      body: 'Original',
    });

    const updated = await diaryEntryService.updateAnswer(answer.id, {
      body: 'Updated',
    });

    expect(updated.body).toBe('Updated');
    expect(updated.questionSnapshot).toBe('What made you smile today?');
  });

  it('keeps the original question snapshot after the source question text is updated', async () => {
    const { leader, group, question, diaryDate } = await createFixture();

    const entry = await diaryEntryService.findOrCreateEntry({
      groupId: group.id,
      userId: leader.id,
      diaryDate,
    });

    const answer = await diaryEntryService.createAnswer({
      diaryEntryId: entry.id,
      questionType: QuestionType.CUSTOM,
      groupQuestionId: question.id,
      body: 'Original',
    });

    await groupQuestionService.updateQuestion(group.id, question.id, {
      question: 'Updated question text',
    });

    const updatedAnswer = await diaryEntryService.updateAnswer(answer.id, {
      body: 'Edited answer body',
    });

    expect(updatedAnswer.body).toBe('Edited answer body');
    expect(updatedAnswer.questionSnapshot).toBe('What made you smile today?');
  });

  it('forbids updating another member’s answer via ownership-aware update', async () => {
    const { leader, member, group, question, diaryDate } =
      await createFixture();

    const memberEntry = await diaryEntryService.findOrCreateEntry({
      groupId: group.id,
      userId: member.id,
      diaryDate,
    });
    const memberAnswer = await diaryEntryService.createAnswer({
      diaryEntryId: memberEntry.id,
      questionType: QuestionType.CUSTOM,
      groupQuestionId: question.id,
      body: 'Member answer',
    });

    await expect(
      diaryEntryService.updateAnswerForUser(
        group.id,
        leader.id,
        memberAnswer.id,
        { body: 'Leader trying to edit member answer' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ──────────────────────────────────────────────
  // listEntriesForGroup
  // ──────────────────────────────────────────────

  it('lists diary entries for a group on a given date', async () => {
    const { leader, member, group, diaryDate } = await createFixture();

    await diaryEntryService.findOrCreateEntry({
      groupId: group.id,
      userId: leader.id,
      diaryDate,
    });
    await diaryEntryService.findOrCreateEntry({
      groupId: group.id,
      userId: member.id,
      diaryDate,
    });

    const entries = await diaryEntryService.listEntriesForGroup(
      group.id,
      diaryDate,
    );

    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.userId).sort()).toEqual(
      [leader.id, member.id].sort(),
    );
  });

  // ──────────────────────────────────────────────
  // Cascade delete
  // ──────────────────────────────────────────────

  it('deletes answers when the parent diary entry is deleted', async () => {
    const { leader, group, question, diaryDate } = await createFixture();

    const entry = await diaryEntryService.findOrCreateEntry({
      groupId: group.id,
      userId: leader.id,
      diaryDate,
    });

    await diaryEntryService.createAnswer({
      diaryEntryId: entry.id,
      questionType: QuestionType.CUSTOM,
      groupQuestionId: question.id,
      body: 'Will be deleted',
    });

    await prismaService.diaryEntry.delete({ where: { id: entry.id } });

    const answerCount = await prismaService.answer.count({
      where: { diaryEntryId: entry.id },
    });
    expect(answerCount).toBe(0);
  });

  it('keeps answer and snapshot when the source group question is deleted', async () => {
    const { leader, group, question, diaryDate } = await createFixture();

    const entry = await diaryEntryService.findOrCreateEntry({
      groupId: group.id,
      userId: leader.id,
      diaryDate,
    });

    const answer = await diaryEntryService.createAnswer({
      diaryEntryId: entry.id,
      questionType: QuestionType.CUSTOM,
      groupQuestionId: question.id,
      body: 'Will keep snapshot',
    });

    await groupQuestionService.deleteQuestion(group.id, question.id);

    const persisted = await prismaService.answer.findUnique({
      where: { id: answer.id },
    });

    expect(persisted).not.toBeNull();
    expect(persisted!.groupQuestionId).toBeNull();
    expect(persisted!.questionSnapshot).toBe('What made you smile today?');
  });

  // ──────────────────────────────────────────────
  // getTodaysDiaryContext
  // ──────────────────────────────────────────────

  describe('getTodaysDiaryContext', () => {
    it('returns active questions and null entry when no diary entry exists', async () => {
      const { leader, group, question, diaryDate } = await createFixture();

      const context = await diaryEntryService.getTodaysDiaryContext(
        group.id,
        leader.id,
        diaryDate,
      );

      expect(context.questions).toHaveLength(1);
      expect(context.questions[0].id).toBe(question.id);
      expect(context.entry).toBeNull();
    });

    it('returns entry with answers when entry exists', async () => {
      const { leader, group, question, diaryDate } = await createFixture();

      const entry = await diaryEntryService.findOrCreateEntry({
        groupId: group.id,
        userId: leader.id,
        diaryDate,
      });

      await diaryEntryService.createAnswer({
        diaryEntryId: entry.id,
        questionType: QuestionType.CUSTOM,
        groupQuestionId: question.id,
        body: 'Today went well',
      });

      const context = await diaryEntryService.getTodaysDiaryContext(
        group.id,
        leader.id,
        diaryDate,
      );

      expect(context.entry).not.toBeNull();
      expect(context.entry!.id).toBe(entry.id);
      expect(context.entry!.answers).toHaveLength(1);
      expect(context.entry!.answers[0].body).toBe('Today went well');
      expect(context.entry!.answers[0].questionSnapshot).toBe(
        'What made you smile today?',
      );
    });

    it('returns only active questions', async () => {
      const { leader, group, diaryDate } = await createFixture();

      const inactive = await prismaService.groupQuestion.create({
        data: {
          groupId: group.id,
          question: 'Inactive question',
          displayOrder: 2,
          isActive: false,
          createdByUserId: leader.id,
        },
      });

      const context = await diaryEntryService.getTodaysDiaryContext(
        group.id,
        leader.id,
        diaryDate,
      );

      const ids = context.questions.map((q) => q.id);
      expect(ids).not.toContain(inactive.id);
    });

    it("does not return another member's entry", async () => {
      const { leader, member, group, question, diaryDate } =
        await createFixture();

      const memberEntry = await diaryEntryService.findOrCreateEntry({
        groupId: group.id,
        userId: member.id,
        diaryDate,
      });

      await diaryEntryService.createAnswer({
        diaryEntryId: memberEntry.id,
        questionType: QuestionType.CUSTOM,
        groupQuestionId: question.id,
        body: "Member's answer",
      });

      const context = await diaryEntryService.getTodaysDiaryContext(
        group.id,
        leader.id,
        diaryDate,
      );

      expect(context.entry).toBeNull();
    });
  });
});

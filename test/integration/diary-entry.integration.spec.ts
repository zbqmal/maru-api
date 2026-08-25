import { ConflictException, NotFoundException } from '@nestjs/common';
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
});

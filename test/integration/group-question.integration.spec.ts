import { ForbiddenException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { validateEnvironment } from '../../src/common/config/environment.validation';
import { PrismaService } from '../../src/modules/database/prisma.service';
import { GroupMembershipService } from '../../src/modules/group/group-membership.service';
import { GroupModule } from '../../src/modules/group/group.module';
import { GroupQuestionService } from '../../src/modules/group/group-question.service';
import { GroupService } from '../../src/modules/group/group.service';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;

describe('GroupQuestionService (integration)', () => {
  let prismaService: PrismaService;
  let groupService: GroupService;
  let groupMembershipService: GroupMembershipService;
  let groupQuestionService: GroupQuestionService;

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
      ],
    }).compile();

    prismaService = moduleRef.get(PrismaService);
    groupService = moduleRef.get(GroupService);
    groupMembershipService = moduleRef.get(GroupMembershipService);
    groupQuestionService = moduleRef.get(GroupQuestionService);
  });

  beforeEach(async () => {
    await prismaService.group.deleteMany();
    await prismaService.session.deleteMany();
    await prismaService.passwordResetToken.deleteMany();
    await prismaService.user.deleteMany();
  });

  afterAll(async () => {
    await prismaService.$disconnect();
  });

  async function createGroupFixture() {
    const [leader, member, outsider] = await Promise.all([
      prismaService.user.create({
        data: {
          email: 'questions-leader@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Questions Leader',
        },
      }),
      prismaService.user.create({
        data: {
          email: 'questions-member@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Questions Member',
        },
      }),
      prismaService.user.create({
        data: {
          email: 'questions-outsider@example.com',
          passwordHash: 'placeholder-password-hash',
          name: 'Questions Outsider',
        },
      }),
    ]);

    const group = await groupService.createGroupWithLeader({
      name: 'Questions Group',
      leaderUserId: leader.id,
    });

    await groupMembershipService.addMember({
      groupId: group.id,
      userId: member.id,
    });

    return { leader, member, outsider, group };
  }

  it('creates and lists group questions for authorized members in display order', async () => {
    const { leader, member, group } = await createGroupFixture();

    await groupQuestionService.createQuestion(group.id, leader.id, {
      question: 'What made you smile today?',
    });
    await groupQuestionService.createQuestion(group.id, leader.id, {
      question: 'What challenged you today?',
    });

    const questions = await groupQuestionService.listQuestionsForUser(
      group.id,
      member.id,
    );

    expect(questions).toHaveLength(2);
    expect(questions.map((question) => question.displayOrder)).toEqual([1, 2]);
    expect(questions.map((question) => question.question)).toEqual([
      'What made you smile today?',
      'What challenged you today?',
    ]);
  });

  it('enforces the maximum of four active custom questions', async () => {
    const { leader, group } = await createGroupFixture();

    for (const question of ['Question 1', 'Question 2', 'Question 3', 'Question 4']) {
      await groupQuestionService.createQuestion(group.id, leader.id, {
        question,
      });
    }

    await expect(
      groupQuestionService.createQuestion(group.id, leader.id, {
        question: 'Question 5',
      }),
    ).rejects.toThrow('at most four active custom questions');
  });

  it('rejects question reads for non-members', async () => {
    const { leader, outsider, group } = await createGroupFixture();

    await groupQuestionService.createQuestion(group.id, leader.id, {
      question: 'What made you smile today?',
    });

    await expect(
      groupQuestionService.listQuestionsForUser(group.id, outsider.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reorders questions and persists the new display order', async () => {
    const { leader, group } = await createGroupFixture();

    const first = await groupQuestionService.createQuestion(group.id, leader.id, {
      question: 'First question',
    });
    const second = await groupQuestionService.createQuestion(
      group.id,
      leader.id,
      {
        question: 'Second question',
      },
    );
    const third = await groupQuestionService.createQuestion(group.id, leader.id, {
      question: 'Third question',
    });

    const reordered = await groupQuestionService.reorderQuestions(group.id, [
      third.id,
      first.id,
      second.id,
    ]);

    expect(reordered.map((question) => question.id)).toEqual([
      third.id,
      first.id,
      second.id,
    ]);
    expect(reordered.map((question) => question.displayOrder)).toEqual([1, 2, 3]);
  });

  it('deletes a question and closes the display-order gap', async () => {
    const { leader, group } = await createGroupFixture();

    const first = await groupQuestionService.createQuestion(group.id, leader.id, {
      question: 'First question',
    });
    const second = await groupQuestionService.createQuestion(
      group.id,
      leader.id,
      {
        question: 'Second question',
      },
    );
    const third = await groupQuestionService.createQuestion(group.id, leader.id, {
      question: 'Third question',
    });

    await groupQuestionService.deleteQuestion(group.id, second.id);

    const remaining = await groupQuestionService.listQuestionsForUser(
      group.id,
      leader.id,
    );

    expect(remaining.map((question) => question.id)).toEqual([first.id, third.id]);
    expect(remaining.map((question) => question.displayOrder)).toEqual([1, 2]);
  });
});

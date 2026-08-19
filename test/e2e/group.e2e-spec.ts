import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GroupMemberRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '../../src/common/interceptors/logging.interceptor';
import { PrismaService } from '../../src/modules/database/prisma.service';
import { EmailService } from '../../src/modules/email/email.service';

describe('GroupController (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn().mockResolvedValue(undefined) })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new LoggingInterceptor());
    await app.init();

    prismaService = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prismaService.group.deleteMany();
    await prismaService.session.deleteMany();
    await prismaService.passwordResetToken.deleteMany();
    await prismaService.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndLogin(
    email: string,
    password = 'Str0ngPassword!',
    name = 'Group User',
  ): Promise<{ sessionCookie: string; userId: string }> {
    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/register')
      .send({ email, password, name });

    const userId = (response.body as { id: string }).id;
    const rawSetCookie = (response.headers as Record<string, unknown>)[
      'set-cookie'
    ];
    const setCookie = Array.isArray(rawSetCookie)
      ? rawSetCookie.filter(
          (cookie): cookie is string => typeof cookie === 'string',
        )
      : typeof rawSetCookie === 'string'
        ? [rawSetCookie]
        : [];

    if (setCookie.length === 0) {
      throw new Error('Register response did not include a session cookie.');
    }

    return {
      sessionCookie: setCookie[0].split(';')[0],
      userId,
    };
  }

  it('creates a group and the creator becomes its leader', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const { sessionCookie, userId } = await registerAndLogin(
      'group-create@example.com',
      'Str0ngPassword!',
      'Group Creator',
    );

    const response = await request(httpServer)
      .post('/groups')
      .set('Cookie', sessionCookie)
      .send({ name: '  Family  ' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: 'Family',
      memberships: [
        {
          userId,
          role: GroupMemberRole.LEADER,
          user: {
            id: userId,
            name: 'Group Creator',
            profileImageKey: null,
          },
        },
      ],
    });

    const persistedMembership = await prismaService.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: (response.body as { id: string }).id,
          userId,
        },
      },
    });
    expect(persistedMembership?.role).toBe(GroupMemberRole.LEADER);
  });

  it('lists only the groups for the current user', async () => {
    const [leader, member, outsider] = await Promise.all([
      registerAndLogin(
        'group-list-leader@example.com',
        'Str0ngPassword!',
        'List Leader',
      ),
      registerAndLogin(
        'group-list-member@example.com',
        'Str0ngPassword!',
        'List Member',
      ),
      registerAndLogin(
        'group-list-outsider@example.com',
        'Str0ngPassword!',
        'List Outsider',
      ),
    ]);

    const [sharedGroup, outsiderGroup] = await Promise.all([
      prismaService.group.create({
        data: {
          name: 'Shared Group',
          memberships: {
            create: {
              userId: leader.userId,
              role: GroupMemberRole.LEADER,
            },
          },
        },
      }),
      prismaService.group.create({
        data: {
          name: 'Outsider Group',
          memberships: {
            create: {
              userId: outsider.userId,
              role: GroupMemberRole.LEADER,
            },
          },
        },
      }),
    ]);

    await prismaService.groupMember.create({
      data: {
        groupId: sharedGroup.id,
        userId: member.userId,
        role: GroupMemberRole.MEMBER,
      },
    });

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get('/groups')
      .set('Cookie', member.sessionCookie);
    const groupsBody = response.body as Array<{ id: string; name: string }>;

    expect(response.status).toBe(200);
    expect(groupsBody).toHaveLength(1);
    expect(groupsBody[0]).toMatchObject({
      id: sharedGroup.id,
      name: 'Shared Group',
    });
    expect(groupsBody.map((group) => group.id)).not.toContain(outsiderGroup.id);
  });

  it('returns group detail to members and forbids non-members', async () => {
    const [leader, member, outsider] = await Promise.all([
      registerAndLogin(
        'group-detail-leader@example.com',
        'Str0ngPassword!',
        'Detail Leader',
      ),
      registerAndLogin(
        'group-detail-member@example.com',
        'Str0ngPassword!',
        'Detail Member',
      ),
      registerAndLogin(
        'group-detail-outsider@example.com',
        'Str0ngPassword!',
        'Detail Outsider',
      ),
    ]);

    const group = await prismaService.group.create({
      data: {
        name: 'Detail Group',
        memberships: {
          create: {
            userId: leader.userId,
            role: GroupMemberRole.LEADER,
          },
        },
      },
    });

    await prismaService.groupMember.create({
      data: {
        groupId: group.id,
        userId: member.userId,
        role: GroupMemberRole.MEMBER,
      },
    });

    const allowedResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${group.id}`)
      .set('Cookie', member.sessionCookie);
    const groupBody = allowedResponse.body as {
      id: string;
      name: string;
      memberships: Array<{ userId: string; role: GroupMemberRole }>;
    };

    expect(allowedResponse.status).toBe(200);
    expect(groupBody).toMatchObject({
      id: group.id,
      name: 'Detail Group',
    });
    expect(groupBody.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: leader.userId,
          role: GroupMemberRole.LEADER,
        }),
        expect.objectContaining({
          userId: member.userId,
          role: GroupMemberRole.MEMBER,
        }),
      ]),
    );

    const deniedResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${group.id}`)
      .set('Cookie', outsider.sessionCookie);

    expect(deniedResponse.status).toBe(403);
    expect((deniedResponse.body as { message: string }).message).toBe(
      'Group membership required.',
    );
  });

  it('lists group members for members and rejects non-members', async () => {
    const [leader, member, outsider] = await Promise.all([
      registerAndLogin(
        'group-members-leader@example.com',
        'Str0ngPassword!',
        'Members Leader',
      ),
      registerAndLogin(
        'group-members-user@example.com',
        'Str0ngPassword!',
        'Members User',
      ),
      registerAndLogin(
        'group-members-outsider@example.com',
        'Str0ngPassword!',
        'Members Outsider',
      ),
    ]);

    const group = await prismaService.group.create({
      data: {
        name: 'Members Group',
        memberships: {
          create: {
            userId: leader.userId,
            role: GroupMemberRole.LEADER,
          },
        },
      },
    });

    await prismaService.groupMember.create({
      data: {
        groupId: group.id,
        userId: member.userId,
        role: GroupMemberRole.MEMBER,
      },
    });

    const membersResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${group.id}/members`)
      .set('Cookie', leader.sessionCookie);
    const membersBody = membersResponse.body as Array<{
      userId: string;
      role: GroupMemberRole;
      user: { name: string };
    }>;

    expect(membersResponse.status).toBe(200);
    expect(membersBody).toHaveLength(2);
    expect(membersBody[0]).toMatchObject({
      userId: leader.userId,
      role: GroupMemberRole.LEADER,
      user: { name: 'Members Leader' },
    });
    expect(membersBody[1]).toMatchObject({
      userId: member.userId,
      role: GroupMemberRole.MEMBER,
      user: { name: 'Members User' },
    });

    const deniedResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get(`/groups/${group.id}/members`)
      .set('Cookie', outsider.sessionCookie);

    expect(deniedResponse.status).toBe(403);
    expect((deniedResponse.body as { message: string }).message).toBe(
      'Group membership required.',
    );
  });

  it('rejects unauthenticated group requests', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const createResponse = await request(httpServer)
      .post('/groups')
      .send({ name: 'Family' });
    const listResponse = await request(httpServer).get('/groups');
    const detailResponse = await request(httpServer).get('/groups/group-1');
    const membersResponse = await request(httpServer).get(
      '/groups/group-1/members',
    );
    const updateResponse = await request(httpServer)
      .patch('/groups/group-1')
      .send({ name: 'New Name' });

    expect(createResponse.status).toBe(401);
    expect(listResponse.status).toBe(401);
    expect(detailResponse.status).toBe(401);
    expect(membersResponse.status).toBe(401);
    expect(updateResponse.status).toBe(401);
  });

  it('allows the leader to update a group name', async () => {
    const { sessionCookie } = await registerAndLogin(
      'group-update-leader@example.com',
      'Str0ngPassword!',
      'Update Leader',
    );

    const createResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/groups')
      .set('Cookie', sessionCookie)
      .send({ name: 'Original Name' });

    const groupId = (createResponse.body as { id: string }).id;

    const updateResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .patch(`/groups/${groupId}`)
      .set('Cookie', sessionCookie)
      .send({ name: '  Updated Name  ' });

    expect(updateResponse.status).toBe(200);
    expect((updateResponse.body as { name: string }).name).toBe('Updated Name');

    const persisted = await prismaService.group.findUniqueOrThrow({
      where: { id: groupId },
    });
    expect(persisted.name).toBe('Updated Name');
  });

  it('forbids a regular member from updating a group', async () => {
    const [leader, member] = await Promise.all([
      registerAndLogin(
        'group-update-leader2@example.com',
        'Str0ngPassword!',
        'Update Leader 2',
      ),
      registerAndLogin(
        'group-update-member@example.com',
        'Str0ngPassword!',
        'Update Member',
      ),
    ]);

    const createResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/groups')
      .set('Cookie', leader.sessionCookie)
      .send({ name: 'Leader Group' });

    const groupId = (createResponse.body as { id: string }).id;

    await prismaService.groupMember.create({
      data: {
        groupId,
        userId: member.userId,
        role: GroupMemberRole.MEMBER,
      },
    });

    const updateResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .patch(`/groups/${groupId}`)
      .set('Cookie', member.sessionCookie)
      .send({ name: 'Hijacked Name' });

    expect(updateResponse.status).toBe(403);
    expect((updateResponse.body as { message: string }).message).toBe(
      'Group leader role required.',
    );

    const persisted = await prismaService.group.findUniqueOrThrow({
      where: { id: groupId },
    });
    expect(persisted.name).toBe('Leader Group');
  });

  it('forbids an outsider from updating a group', async () => {
    const [leader, outsider] = await Promise.all([
      registerAndLogin(
        'group-update-leader3@example.com',
        'Str0ngPassword!',
        'Update Leader 3',
      ),
      registerAndLogin(
        'group-update-outsider@example.com',
        'Str0ngPassword!',
        'Update Outsider',
      ),
    ]);

    const createResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/groups')
      .set('Cookie', leader.sessionCookie)
      .send({ name: 'Leader Only Group' });

    const groupId = (createResponse.body as { id: string }).id;

    const updateResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .patch(`/groups/${groupId}`)
      .set('Cookie', outsider.sessionCookie)
      .send({ name: 'Outsider Name' });

    expect(updateResponse.status).toBe(403);
  });

  it('rejects invalid group update payloads', async () => {
    const { sessionCookie } = await registerAndLogin(
      'group-update-invalid@example.com',
      'Str0ngPassword!',
      'Update Invalid User',
    );

    const createResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/groups')
      .set('Cookie', sessionCookie)
      .send({ name: 'Valid Name' });

    const groupId = (createResponse.body as { id: string }).id;

    const blankResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .patch(`/groups/${groupId}`)
      .set('Cookie', sessionCookie)
      .send({ name: '   ' });

    expect(blankResponse.status).toBe(400);

    const extraFieldResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .patch(`/groups/${groupId}`)
      .set('Cookie', sessionCookie)
      .send({ name: 'Valid', extra: 'blocked' });

    expect(extraFieldResponse.status).toBe(400);
  });

  it('rejects invalid group creation payloads and reports missing groups', async () => {
    const { sessionCookie } = await registerAndLogin(
      'group-invalid@example.com',
      'Str0ngPassword!',
      'Invalid Group User',
    );

    const invalidResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/groups')
      .set('Cookie', sessionCookie)
      .send({ name: '   ', extra: 'blocked' });

    expect(invalidResponse.status).toBe(400);
    expect((invalidResponse.body as { message: string[] }).message).toEqual(
      expect.arrayContaining([
        'property extra should not exist',
        'name should not be empty',
      ]),
    );

    const notFoundResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .get('/groups/missing-group-id')
      .set('Cookie', sessionCookie);

    expect(notFoundResponse.status).toBe(404);
    expect((notFoundResponse.body as { message: string }).message).toBe(
      'Group not found.',
    );
  });

  // ─── POST /groups/:groupId/transfer-leadership ────────────────────────────

  it('allows the leader to transfer leadership to a member', async () => {
    const [leader, member] = await Promise.all([
      registerAndLogin(
        'transfer-leader@example.com',
        'Str0ngPassword!',
        'Transfer Leader',
      ),
      registerAndLogin(
        'transfer-member@example.com',
        'Str0ngPassword!',
        'Transfer Member',
      ),
    ]);

    const createResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/groups')
      .set('Cookie', leader.sessionCookie)
      .send({ name: 'Transfer Group' });

    const groupId = (createResponse.body as { id: string }).id;

    await prismaService.groupMember.create({
      data: {
        groupId,
        userId: member.userId,
        role: GroupMemberRole.MEMBER,
      },
    });

    const transferResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/transfer-leadership`)
      .set('Cookie', leader.sessionCookie)
      .send({ newLeaderId: member.userId });

    expect(transferResponse.status).toBe(200);

    const body = transferResponse.body as {
      memberships: Array<{ userId: string; role: GroupMemberRole }>;
    };
    expect(body.memberships.find((m) => m.userId === member.userId)?.role).toBe(
      GroupMemberRole.LEADER,
    );
    expect(body.memberships.find((m) => m.userId === leader.userId)?.role).toBe(
      GroupMemberRole.MEMBER,
    );
  });

  it('forbids a regular member from transferring leadership', async () => {
    const [leader, member, target] = await Promise.all([
      registerAndLogin(
        'transfer-forbid-leader@example.com',
        'Str0ngPassword!',
        'Transfer Forbid Leader',
      ),
      registerAndLogin(
        'transfer-forbid-member@example.com',
        'Str0ngPassword!',
        'Transfer Forbid Member',
      ),
      registerAndLogin(
        'transfer-forbid-target@example.com',
        'Str0ngPassword!',
        'Transfer Forbid Target',
      ),
    ]);

    const createResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/groups')
      .set('Cookie', leader.sessionCookie)
      .send({ name: 'Forbid Transfer Group' });

    const groupId = (createResponse.body as { id: string }).id;

    await prismaService.groupMember.createMany({
      data: [
        { groupId, userId: member.userId, role: GroupMemberRole.MEMBER },
        { groupId, userId: target.userId, role: GroupMemberRole.MEMBER },
      ],
    });

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/transfer-leadership`)
      .set('Cookie', member.sessionCookie)
      .send({ newLeaderId: target.userId });

    expect(response.status).toBe(403);
  });

  it('rejects leadership transfer to a non-member', async () => {
    const [leader, outsider] = await Promise.all([
      registerAndLogin(
        'transfer-nonmember-leader@example.com',
        'Str0ngPassword!',
        'Transfer NonMember Leader',
      ),
      registerAndLogin(
        'transfer-nonmember-outsider@example.com',
        'Str0ngPassword!',
        'Transfer NonMember Outsider',
      ),
    ]);

    const createResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/groups')
      .set('Cookie', leader.sessionCookie)
      .send({ name: 'NonMember Transfer Group' });

    const groupId = (createResponse.body as { id: string }).id;

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post(`/groups/${groupId}/transfer-leadership`)
      .set('Cookie', leader.sessionCookie)
      .send({ newLeaderId: outsider.userId });

    expect(response.status).toBe(404);
  });

  // ─── DELETE /groups/:groupId/leave ───────────────────────────────────

  it('allows a regular member to leave a group', async () => {
    const [leader, member] = await Promise.all([
      registerAndLogin(
        'leave-leader@example.com',
        'Str0ngPassword!',
        'Leave Leader',
      ),
      registerAndLogin(
        'leave-member@example.com',
        'Str0ngPassword!',
        'Leave Member',
      ),
    ]);

    const createResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/groups')
      .set('Cookie', leader.sessionCookie)
      .send({ name: 'Leave Group' });

    const groupId = (createResponse.body as { id: string }).id;

    await prismaService.groupMember.create({
      data: {
        groupId,
        userId: member.userId,
        role: GroupMemberRole.MEMBER,
      },
    });

    const leaveResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .delete(`/groups/${groupId}/leave`)
      .set('Cookie', member.sessionCookie);

    expect(leaveResponse.status).toBe(204);

    const remaining = await prismaService.groupMember.findMany({
      where: { groupId },
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].userId).toBe(leader.userId);
  });

  it('promotes the longest-standing member when the leader leaves', async () => {
    const [leader, firstMember, secondMember] = await Promise.all([
      registerAndLogin(
        'leader-leave-leader@example.com',
        'Str0ngPassword!',
        'Leader Leave Leader',
      ),
      registerAndLogin(
        'leader-leave-first@example.com',
        'Str0ngPassword!',
        'Leader Leave First',
      ),
      registerAndLogin(
        'leader-leave-second@example.com',
        'Str0ngPassword!',
        'Leader Leave Second',
      ),
    ]);

    const createResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/groups')
      .set('Cookie', leader.sessionCookie)
      .send({ name: 'Leader Leave Group' });

    const groupId = (createResponse.body as { id: string }).id;

    await prismaService.groupMember.create({
      data: {
        groupId,
        userId: firstMember.userId,
        role: GroupMemberRole.MEMBER,
      },
    });
    await prismaService.groupMember.create({
      data: {
        groupId,
        userId: secondMember.userId,
        role: GroupMemberRole.MEMBER,
      },
    });

    const leaveResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .delete(`/groups/${groupId}/leave`)
      .set('Cookie', leader.sessionCookie);

    expect(leaveResponse.status).toBe(204);

    const remaining = await prismaService.groupMember.findMany({
      where: { groupId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(remaining).toHaveLength(2);
    expect(remaining.find((m) => m.userId === leader.userId)).toBeUndefined();

    const newLeader = remaining.find((m) => m.role === GroupMemberRole.LEADER);
    expect(newLeader?.userId).toBe(firstMember.userId);
  });

  it('deletes the group when the sole leader leaves', async () => {
    const { sessionCookie } = await registerAndLogin(
      'sole-leader-leave@example.com',
      'Str0ngPassword!',
      'Sole Leader Leave',
    );

    const createResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/groups')
      .set('Cookie', sessionCookie)
      .send({ name: 'Sole Group' });

    const groupId = (createResponse.body as { id: string }).id;

    const leaveResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .delete(`/groups/${groupId}/leave`)
      .set('Cookie', sessionCookie);

    expect(leaveResponse.status).toBe(204);

    const deleted = await prismaService.group.findUnique({
      where: { id: groupId },
    });
    expect(deleted).toBeNull();
  });

  it('forbids a non-member from calling leave', async () => {
    const [leader, outsider] = await Promise.all([
      registerAndLogin(
        'leave-outsider-leader@example.com',
        'Str0ngPassword!',
        'Leave Outsider Leader',
      ),
      registerAndLogin(
        'leave-outsider@example.com',
        'Str0ngPassword!',
        'Leave Outsider',
      ),
    ]);

    const createResponse = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .post('/groups')
      .set('Cookie', leader.sessionCookie)
      .send({ name: 'Leave Outsider Group' });

    const groupId = (createResponse.body as { id: string }).id;

    const response = await request(
      app.getHttpServer() as Parameters<typeof request>[0],
    )
      .delete(`/groups/${groupId}/leave`)
      .set('Cookie', outsider.sessionCookie);

    expect(response.status).toBe(403);
  });

  it('rejects unauthenticated requests to transfer leadership and leave group', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    const transferResponse = await request(httpServer)
      .post('/groups/group-1/transfer-leadership')
      .send({ newLeaderId: 'user-1' });

    const leaveResponse = await request(httpServer).delete(
      '/groups/group-1/leave',
    );

    expect(transferResponse.status).toBe(401);
    expect(leaveResponse.status).toBe(401);
  });
});

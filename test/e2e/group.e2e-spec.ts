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
});

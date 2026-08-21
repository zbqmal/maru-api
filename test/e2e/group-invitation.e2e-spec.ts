import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '../../src/common/interceptors/logging.interceptor';
import { SessionTokenService } from '../../src/modules/auth/services/session-token.service';
import { PrismaService } from '../../src/modules/database/prisma.service';
import { EmailService } from '../../src/modules/email/email.service';

describe('GroupController – invitations (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let sessionTokenService: SessionTokenService;
  let emailSend: jest.Mock;

  beforeAll(async () => {
    emailSend = jest.fn().mockResolvedValue(undefined);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue({ send: emailSend })
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
    sessionTokenService = app.get(SessionTokenService);
  });

  beforeEach(async () => {
    emailSend.mockClear();
    await prismaService.groupInvitation.deleteMany();
    await prismaService.group.deleteMany();
    await prismaService.session.deleteMany();
    await prismaService.passwordResetToken.deleteMany();
    await prismaService.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  const httpServer = () => app.getHttpServer() as Parameters<typeof request>[0];

  async function registerAndLogin(
    email: string,
    password = 'Str0ngPassword!',
    name = 'Test User',
  ): Promise<{ sessionCookie: string; userId: string }> {
    const response = await request(httpServer())
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
    return { sessionCookie: setCookie[0].split(';')[0], userId };
  }

  async function createGroup(
    sessionCookie: string,
    name = 'Family',
  ): Promise<string> {
    const res = await request(httpServer())
      .post('/groups')
      .set('Cookie', sessionCookie)
      .send({ name });
    return (res.body as { id: string }).id;
  }

  function extractInvitationToken(): string {
    const [options] = emailSend.mock.calls.at(-1) as [{ text?: string }];
    const tokenMatch = options.text?.match(/token=([A-Za-z0-9_-]+)/);

    if (tokenMatch === null || tokenMatch === undefined) {
      throw new Error('Invitation email did not include a token.');
    }

    return tokenMatch[1];
  }

  it('returns 201 with invitation details when a leader invites a new email', async () => {
    const { sessionCookie } = await registerAndLogin('leader@example.com');
    const groupId = await createGroup(sessionCookie);

    const res = await request(httpServer())
      .post(`/groups/${groupId}/invitations`)
      .set('Cookie', sessionCookie)
      .send({ email: 'alice@example.com' });

    const body = res.body as {
      groupId: string;
      invitedEmail: string;
      acceptedAt: null;
      expiresAt: string;
    };
    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      groupId,
      invitedEmail: 'alice@example.com',
      acceptedAt: null,
    });
    expect(typeof body.expiresAt).toBe('string');
  });

  it('sends exactly one invitation email when the invitation is created', async () => {
    const { sessionCookie } = await registerAndLogin('leader@example.com');
    const groupId = await createGroup(sessionCookie);

    await request(httpServer())
      .post(`/groups/${groupId}/invitations`)
      .set('Cookie', sessionCookie)
      .send({ email: 'alice@example.com' });

    expect(emailSend).toHaveBeenCalledTimes(1);
    const [opts] = emailSend.mock.calls[0] as [{ to: string }];
    expect(opts.to).toBe('alice@example.com');
  });

  it('returns 403 when a regular member tries to create an invitation', async () => {
    const { sessionCookie: leaderCookie } =
      await registerAndLogin('leader@example.com');
    const groupId = await createGroup(leaderCookie);

    const { sessionCookie: memberCookie, userId: memberId } =
      await registerAndLogin('member@example.com');
    await prismaService.groupMember.create({
      data: { groupId, userId: memberId },
    });

    const res = await request(httpServer())
      .post(`/groups/${groupId}/invitations`)
      .set('Cookie', memberCookie)
      .send({ email: 'alice@example.com' });

    expect(res.status).toBe(403);
  });

  it('returns 401 when the request is unauthenticated', async () => {
    const res = await request(httpServer())
      .post('/groups/any-group-id/invitations')
      .send({ email: 'alice@example.com' });

    expect(res.status).toBe(401);
  });

  it('returns 409 when a pending invitation for the email already exists', async () => {
    const { sessionCookie } = await registerAndLogin('leader@example.com');
    const groupId = await createGroup(sessionCookie);

    await request(httpServer())
      .post(`/groups/${groupId}/invitations`)
      .set('Cookie', sessionCookie)
      .send({ email: 'alice@example.com' });

    const res = await request(httpServer())
      .post(`/groups/${groupId}/invitations`)
      .set('Cookie', sessionCookie)
      .send({ email: 'alice@example.com' });

    expect(res.status).toBe(409);
  });

  it('returns 409 when the invited email already belongs to a group member', async () => {
    const { sessionCookie: leaderCookie } =
      await registerAndLogin('leader@example.com');
    const groupId = await createGroup(leaderCookie);

    const { userId: memberId } = await registerAndLogin(
      'already-member@example.com',
    );
    await prismaService.groupMember.create({
      data: { groupId, userId: memberId },
    });

    const res = await request(httpServer())
      .post(`/groups/${groupId}/invitations`)
      .set('Cookie', leaderCookie)
      .send({ email: 'already-member@example.com' });

    expect(res.status).toBe(409);
  });

  it('returns 400 when the email field is missing', async () => {
    const { sessionCookie } = await registerAndLogin('leader@example.com');
    const groupId = await createGroup(sessionCookie);

    const res = await request(httpServer())
      .post(`/groups/${groupId}/invitations`)
      .set('Cookie', sessionCookie)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 400 when the email field is not a valid email address', async () => {
    const { sessionCookie } = await registerAndLogin('leader@example.com');
    const groupId = await createGroup(sessionCookie);

    const res = await request(httpServer())
      .post(`/groups/${groupId}/invitations`)
      .set('Cookie', sessionCookie)
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
  });

  it('returns 200 with invitation details when validating a valid token', async () => {
    const { sessionCookie } = await registerAndLogin('leader@example.com');
    const groupId = await createGroup(sessionCookie);

    await request(httpServer())
      .post(`/groups/${groupId}/invitations`)
      .set('Cookie', sessionCookie)
      .send({ email: 'alice@example.com' });
    const token = extractInvitationToken();

    const res = await request(httpServer()).get(
      `/group-invitations/validate?token=${token}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      groupId,
      groupName: 'Family',
      invitedEmail: 'alice@example.com',
    });
  });

  it('returns 200 and joins the group when the invited user accepts the invitation', async () => {
    const { sessionCookie: leaderCookie } =
      await registerAndLogin('leader@example.com');
    const groupId = await createGroup(leaderCookie);

    await request(httpServer())
      .post(`/groups/${groupId}/invitations`)
      .set('Cookie', leaderCookie)
      .send({ email: 'alice@example.com' });
    const token = extractInvitationToken();

    const { sessionCookie: invitedCookie, userId: invitedUserId } =
      await registerAndLogin('alice@example.com');

    const res = await request(httpServer())
      .post('/group-invitations/accept')
      .set('Cookie', invitedCookie)
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: groupId,
      name: 'Family',
    });
    expect(
      (res.body as { memberships: Array<{ userId: string }> }).memberships,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: invitedUserId }),
      ]),
    );

    const invitation = await prismaService.groupInvitation.findFirst({
      where: { groupId, invitedEmail: 'alice@example.com' },
    });
    expect(invitation?.acceptedAt).toBeInstanceOf(Date);
  });

  it('returns 403 when another authenticated user tries to accept the invitation', async () => {
    const { sessionCookie: leaderCookie } =
      await registerAndLogin('leader@example.com');
    const groupId = await createGroup(leaderCookie);

    await request(httpServer())
      .post(`/groups/${groupId}/invitations`)
      .set('Cookie', leaderCookie)
      .send({ email: 'alice@example.com' });
    const token = extractInvitationToken();

    const { sessionCookie: wrongCookie } =
      await registerAndLogin('wrong@example.com');

    const res = await request(httpServer())
      .post('/group-invitations/accept')
      .set('Cookie', wrongCookie)
      .send({ token });

    expect(res.status).toBe(403);
  });

  it('returns 410 for an expired invitation token', async () => {
    const { sessionCookie: leaderCookie } =
      await registerAndLogin('leader@example.com');
    const groupId = await createGroup(leaderCookie);
    const token = 'expired-token';

    await prismaService.groupInvitation.create({
      data: {
        groupId,
        invitedEmail: 'alice@example.com',
        tokenHash: sessionTokenService.hashToken(token),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const res = await request(httpServer()).get(
      `/group-invitations/validate?token=${token}`,
    );

    expect(res.status).toBe(410);
  });

  it('returns 409 when trying to reuse an already accepted invitation', async () => {
    const { sessionCookie: leaderCookie } =
      await registerAndLogin('leader@example.com');
    const groupId = await createGroup(leaderCookie);

    await request(httpServer())
      .post(`/groups/${groupId}/invitations`)
      .set('Cookie', leaderCookie)
      .send({ email: 'alice@example.com' });
    const token = extractInvitationToken();

    const { sessionCookie: invitedCookie } =
      await registerAndLogin('alice@example.com');

    await request(httpServer())
      .post('/group-invitations/accept')
      .set('Cookie', invitedCookie)
      .send({ token })
      .expect(200);

    const res = await request(httpServer())
      .post('/group-invitations/accept')
      .set('Cookie', invitedCookie)
      .send({ token });

    expect(res.status).toBe(409);
  });
});

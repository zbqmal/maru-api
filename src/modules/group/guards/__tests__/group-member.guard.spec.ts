import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GroupMemberGuard } from '../group-member.guard';

function makeContext(
  userId: string | undefined,
  groupId: string | undefined,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        auth: userId !== undefined ? { user: { id: userId } } : undefined,
        params: { groupId },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('GroupMemberGuard', () => {
  function makeService(isMember: boolean) {
    return { isMember: jest.fn().mockResolvedValue(isMember) };
  }

  it('allows a group member through', async () => {
    const guard = new GroupMemberGuard(makeService(true) as never);
    await expect(
      guard.canActivate(makeContext('user-1', 'group-1')),
    ).resolves.toBe(true);
  });

  it('throws ForbiddenException when the user is not a member', async () => {
    const guard = new GroupMemberGuard(makeService(false) as never);
    await expect(
      guard.canActivate(makeContext('user-1', 'group-1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws ForbiddenException when userId is missing', async () => {
    const guard = new GroupMemberGuard(makeService(true) as never);
    await expect(
      guard.canActivate(makeContext(undefined, 'group-1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws ForbiddenException when groupId is missing', async () => {
    const guard = new GroupMemberGuard(makeService(true) as never);
    await expect(
      guard.canActivate(makeContext('user-1', undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes the correct groupId and userId to the membership service', async () => {
    const service = makeService(true);
    const guard = new GroupMemberGuard(service as never);
    await guard.canActivate(makeContext('user-1', 'group-1'));
    expect(service.isMember).toHaveBeenCalledWith('group-1', 'user-1');
  });
});

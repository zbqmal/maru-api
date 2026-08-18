import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GroupLeaderGuard } from '../group-leader.guard';

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

describe('GroupLeaderGuard', () => {
  function makeService(isLeader: boolean) {
    return { isLeader: jest.fn().mockResolvedValue(isLeader) };
  }

  it('allows a group leader through', async () => {
    const guard = new GroupLeaderGuard(makeService(true) as never);
    await expect(
      guard.canActivate(makeContext('user-1', 'group-1')),
    ).resolves.toBe(true);
  });

  it('throws ForbiddenException when the user is a member but not a leader', async () => {
    const guard = new GroupLeaderGuard(makeService(false) as never);
    await expect(
      guard.canActivate(makeContext('user-1', 'group-1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws ForbiddenException when userId is missing', async () => {
    const guard = new GroupLeaderGuard(makeService(true) as never);
    await expect(
      guard.canActivate(makeContext(undefined, 'group-1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws ForbiddenException when groupId is missing', async () => {
    const guard = new GroupLeaderGuard(makeService(true) as never);
    await expect(
      guard.canActivate(makeContext('user-1', undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes the correct groupId and userId to the membership service', async () => {
    const service = makeService(true);
    const guard = new GroupLeaderGuard(service as never);
    await guard.canActivate(makeContext('user-1', 'group-1'));
    expect(service.isLeader).toHaveBeenCalledWith('group-1', 'user-1');
  });
});

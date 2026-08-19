import { NotFoundException } from '@nestjs/common';
import { GroupDeletionService } from '../group-deletion.service';

describe('GroupDeletionService', () => {
  it('deletes the group when it exists', async () => {
    const groupDelete = jest.fn().mockResolvedValue(undefined);
    const service = new GroupDeletionService({
      group: {
        findUnique: jest.fn().mockResolvedValue({ id: 'group-1' }),
        delete: groupDelete,
      },
    } as never);

    await service.deleteGroup('group-1');

    expect(groupDelete).toHaveBeenCalledWith({ where: { id: 'group-1' } });
  });

  it('throws NotFoundException when the group does not exist', async () => {
    const service = new GroupDeletionService({
      group: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as never);

    await expect(service.deleteGroup('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('looks up the group by id before deleting', async () => {
    const groupFindUnique = jest.fn().mockResolvedValue({ id: 'group-1' });
    const service = new GroupDeletionService({
      group: {
        findUnique: groupFindUnique,
        delete: jest.fn().mockResolvedValue(undefined),
      },
    } as never);

    await service.deleteGroup('group-1');

    expect(groupFindUnique).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      select: { id: true },
    });
  });
});

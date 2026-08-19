import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * Handles explicit group deletion initiated by the group leader.
 *
 * All relational data that references the group via a cascading foreign key
 * (e.g. group_members) is removed automatically by the database.  When
 * additional diary / media entities are introduced in M12, extend this service
 * to clean those up before deleting the group row.
 */
@Injectable()
export class GroupDeletionService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Delete the group identified by `groupId`.
   *
   * Authorization (leader-only) is enforced at the controller level via
   * `GroupLeaderGuard`.  This method only checks that the group actually
   * exists so callers receive a meaningful error if the id is wrong.
   *
   * @throws NotFoundException when the group does not exist.
   */
  async deleteGroup(groupId: string): Promise<void> {
    const group = await this.prismaService.group.findUnique({
      where: { id: groupId },
      select: { id: true },
    });

    if (group === null) {
      throw new NotFoundException('Group not found.');
    }

    await this.prismaService.group.delete({ where: { id: groupId } });
  }
}

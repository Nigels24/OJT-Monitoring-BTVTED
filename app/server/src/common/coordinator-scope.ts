import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

type Client = Prisma.TransactionClient;

/**
 * The coordinator's "My Block" scope: the ids of the blocks they own, or
 * `null` for the whole program.
 *
 * `scope: 'block'` is the default; `'all'` shows everything; a coordinator
 * with no blocks assigned falls back to everything and says so
 * (`noBlocksAssigned`) rather than showing an empty list that reads as "no
 * students exist". It is a view default, never an authorization boundary
 * (CLAUDE.md §2).
 *
 * The Students list and the summary report share this, so they always agree
 * on what "my block" means. (The journal, document and concern services each
 * still resolve it themselves, as they did before this existed.)
 */
export async function resolveBlockScope(
  client: Client,
  userId: string,
  scope: 'block' | 'all' | undefined,
): Promise<{ blockScopeIds: string[] | null; noBlocksAssigned: boolean }> {
  const coordinator = await client.coordinator.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!coordinator) {
    throw new NotFoundException('Coordinator profile not found');
  }
  if (scope === 'all') return { blockScopeIds: null, noBlocksAssigned: false };

  const ownBlocks = await client.block.findMany({
    where: { coordinatorId: coordinator.id },
    select: { id: true },
  });
  return ownBlocks.length > 0
    ? { blockScopeIds: ownBlocks.map((b) => b.id), noBlocksAssigned: false }
    : { blockScopeIds: null, noBlocksAssigned: true };
}

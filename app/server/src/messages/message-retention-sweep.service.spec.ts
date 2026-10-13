import { MessageRetentionSweepService } from './message-retention-sweep.service';
import { PrismaService } from '../prisma/prisma.service';

/** A PrismaService whose only reachable model is `message`. */
function fakePrisma(deleteMany: jest.Mock) {
  return { client: { message: { deleteMany } } } as unknown as PrismaService;
}

describe('MessageRetentionSweepService', () => {
  it('deletes only messages, filtered by the 30-day cutoff alone', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 4 });
    const service = new MessageRetentionSweepService(fakePrisma(deleteMany));

    const before = Date.now();
    await expect(service.runSweep()).resolves.toBe(4);

    expect(deleteMany).toHaveBeenCalledTimes(1);
    const { where } = (
      deleteMany.mock.calls[0] as [{ where: { createdAt: { lt: Date } } }]
    )[0];
    expect(Object.keys(where)).toEqual(['createdAt']);
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(where.createdAt.lt.getTime()).toBeGreaterThanOrEqual(
      before - thirtyDays,
    );
    expect(where.createdAt.lt.getTime()).toBeLessThanOrEqual(
      Date.now() - thirtyDays,
    );
  });

  it('does not start a second sweep while one is still running', async () => {
    let finish: (value: { count: number }) => void = () => undefined;
    const deleteMany = jest.fn().mockReturnValue(
      new Promise<{ count: number }>((resolve) => {
        finish = resolve;
      }),
    );
    const service = new MessageRetentionSweepService(fakePrisma(deleteMany));

    const first = service.runSweep();
    await expect(service.runSweep()).resolves.toBeNull();
    expect(deleteMany).toHaveBeenCalledTimes(1);

    finish({ count: 1 });
    await expect(first).resolves.toBe(1);
    // The guard is released once the first run finishes.
    deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.runSweep()).resolves.toBe(0);
  });

  it('swallows a failure and can run again', async () => {
    const deleteMany = jest
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ count: 2 });
    const service = new MessageRetentionSweepService(fakePrisma(deleteMany));

    await expect(service.runSweep()).resolves.toBeNull();
    await expect(service.runSweep()).resolves.toBe(2);
  });
});

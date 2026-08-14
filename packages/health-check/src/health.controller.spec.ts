import { describe, expect, it, vi } from 'vitest';

vi.mock('@appspine/common', () => ({
  PrismaService: class PrismaService {},
}));

import { HealthController } from './health.controller';

type HealthIndicator = () => Promise<unknown>;

describe('HealthController', () => {
  function createController() {
    const prismaService = { user: 'consumer Prisma client' };
    const pingCheck = vi.fn().mockResolvedValue({ database: { status: 'up' } });
    const check = vi.fn(async (indicators: HealthIndicator[]) =>
      Promise.all(indicators.map((indicator) => indicator())),
    );
    const controller = new HealthController(
      { check } as never,
      { pingCheck } as never,
      prismaService as never,
    );

    return { check, controller, pingCheck, prismaService };
  }

  it('delegates the database probe to Terminus with the consumer Prisma service', async () => {
    const { check, controller, pingCheck, prismaService } = createController();

    await expect(controller.check()).resolves.toEqual([{ database: { status: 'up' } }]);

    expect(check).toHaveBeenCalledOnce();
    expect(pingCheck).toHaveBeenCalledOnce();
    expect(pingCheck).toHaveBeenCalledWith('database', prismaService);
  });

  it('lets Terminus surface a failed database probe', async () => {
    const { controller, pingCheck } = createController();
    const failure = new Error('database unavailable');
    pingCheck.mockRejectedValueOnce(failure);

    await expect(controller.check()).rejects.toBe(failure);
  });
});

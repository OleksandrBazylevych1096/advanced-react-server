import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  it('returns ok payload', async () => {
    const expected = {
      status: 'ok',
      checks: { app: 'ok', database: 'ok' },
      timestamp: new Date().toISOString(),
    };
    const controller = new HealthController({
      getHealth: jest.fn().mockResolvedValue(expected),
    } as unknown as HealthService);

    await expect(controller.getHealth()).resolves.toEqual(expected);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createRetryPolicy } from './retry-policy';

describe('RetryPolicy', () => {
  it('limita o automático a três ciclos em 2 s, 4 s e 8 s', () => {
    const policy = createRetryPolicy();
    expect([policy.nextAutomaticDelay(), policy.nextAutomaticDelay(), policy.nextAutomaticDelay(), policy.nextAutomaticDelay()]).toEqual([2000, 4000, 8000, null]);
  });

  it('permite tentativa manual sem ampliar o limite nem registrar segredo', async () => {
    const logger = vi.fn();
    const policy = createRetryPolicy({ logger });
    const action = vi.fn().mockResolvedValue('ok');
    await expect(policy.runManual(action)).resolves.toBe('ok');
    expect(logger).toHaveBeenCalledWith({ event: 'manual_retry' });
    expect(JSON.stringify(logger.mock.calls)).not.toMatch(/https?:|token|key|secret/i);
  });
});

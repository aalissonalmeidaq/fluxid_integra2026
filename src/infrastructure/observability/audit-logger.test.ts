import { describe, expect, it, vi } from 'vitest';
import { AuditLogger } from './audit-logger';

describe('AuditLogger', () => {
  it('registra somente endpoint, falha, duração, transição e item sanitizados', () => {
    const sink = vi.fn();
    const logger = new AuditLogger(sink);
    logger.write({
      event: 'connectivity.transition', endpoint: 'lan', failure: 'network',
      durationMs: 120, transition: 'probing->degraded', itemId: 'item-1',
    });
    expect(sink).toHaveBeenCalledWith({
      event: 'connectivity.transition', endpoint: 'lan', failure: 'network',
      durationMs: 120, transition: 'probing->degraded', itemId: 'item-1',
    });
  });

  it.each(['url', 'publishableKey', 'token', 'email', 'payload', 'password', 'secret'])('rejeita o campo livre ou sensível %s', (field) => {
    const logger = new AuditLogger(vi.fn());
    expect(() => logger.write({ event: 'invalid', [field]: 'sensitive-value' })).toThrow(/campo não permitido/i);
  });

  it('rejeita valores que contenham URL completa ou aparência de credencial', () => {
    const logger = new AuditLogger(vi.fn());
    expect(() => logger.write({ event: 'probe', transition: 'https://private.example/path' })).toThrow(/valor sensível/i);
    expect(() => logger.write({ event: 'probe', itemId: 'Bearer abc.def.ghi' })).toThrow(/valor sensível/i);
  });
});

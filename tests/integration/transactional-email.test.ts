// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveTransactionalEmailMode } from '../../src/application/identity/transactional-email-policy';

describe('política de e-mail transacional', () => {
  it('usa captura local somente em desenvolvimento local', () => {
    expect(resolveTransactionalEmailMode({ environment: 'development', target: 'local', smtpConfigured: false }))
      .toEqual({ kind: 'local_capture' });
  });

  it('permite o serviço padrão somente em homologação controlada', () => {
    expect(resolveTransactionalEmailMode({ environment: 'staging', target: 'cloud', smtpConfigured: false }))
      .toEqual({ kind: 'supabase_default' });
  });

  it.each(['lan', 'cloud'] as const)('exige SMTP homologado em produção %s', (target) => {
    expect(() => resolveTransactionalEmailMode({ environment: 'production', target, smtpConfigured: false }))
      .toThrow(/SMTP homologado/i);
    expect(resolveTransactionalEmailMode({ environment: 'production', target, smtpConfigured: true }))
      .toEqual({ kind: 'approved_smtp' });
  });

  it('não permite captura local nem serviço padrão em produção', () => {
    expect(() => resolveTransactionalEmailMode({ environment: 'production', target: 'local', smtpConfigured: false }))
      .toThrow(/produção/i);
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { OFFLINE_SESSION_MAX_MS } from '@/domain/field/offline-session';
import { buildOfflineAccess, parseOfflineAccess, restoreOfflineAccess } from './offline-access';

const record = () => ({
  version: 1, actorId: 'user-1', organizationId: 'tenant-a', organizationName: 'Tenant A', organizationKind: 'tenant', endpointId: 'local', aal: 'aal1', displayName: 'Administrador A',
  permissions: ['trip.read', 'trip.operate'], confirmedAt: '2026-10-12T10:00:00.000Z',
});
const at = (iso: string) => new Date(iso);

// Spec 010, T083 (RF-016, RF-016a; research.md §19a): o registro de acesso offline guarda só identificadores, códigos de permissão e o instante da
// última confirmação do servidor. Nunca token nem dado de domínio. Restaura só com menos de 8 horas.
describe('parseOfflineAccess', () => {
  it('lê um registro válido', () => {
    expect(parseOfflineAccess(record())).toEqual(record());
  });

  it('descarta qualquer campo extra: token, e-mail, senha, dados de domínio nunca passam', () => {
    const dirty = { ...record(), access_token: 'jwt', refresh_token: 'r', token: 't', email: 'a@example.invalid', password: 'x', session: { id: 1 }, trips: [{ id: 'T1' }] };
    const parsed = parseOfflineAccess(dirty);
    expect(parsed).toEqual(record());
    expect(JSON.stringify(parsed)).not.toMatch(/jwt|refresh|token|example|password|trips/i);
  });

  it.each([
    null, undefined, 'x', 3, [], {}, { ...record(), version: 2 }, { ...record(), actorId: '' }, { ...record(), organizationId: 5 }, { ...record(), endpointId: undefined },
    { ...record(), aal: 'aal3' }, { ...record(), permissions: 'trip.read' }, { ...record(), permissions: ['TRIP READ'] }, { ...record(), permissions: [1] },
    { ...record(), displayName: 7 }, { ...record(), organizationName: 3 }, { ...record(), organizationKind: '' }, { ...record(), organizationName: undefined }, { ...record(), confirmedAt: 'ontem' }, { ...record(), confirmedAt: undefined },
  ])('recusa o registro inválido %#', (value) => {
    expect(parseOfflineAccess(value)).toBeNull();
  });

  it('limita a quantidade de permissões', () => {
    expect(parseOfflineAccess({ ...record(), permissions: Array.from({ length: 301 }, (_, n) => `area.acao_${n}`) })).toBeNull();
  });

  it('não repete permissão', () => {
    expect(parseOfflineAccess({ ...record(), permissions: ['trip.read', 'trip.read', 'trip.operate'] })?.permissions).toEqual(['trip.read', 'trip.operate']);
  });
});

describe('buildOfflineAccess', () => {
  it('monta o registro a partir do que o servidor acabou de confirmar', () => {
    expect(buildOfflineAccess({
      actorId: 'user-1', organizationId: 'tenant-a', organizationName: 'Tenant A', organizationKind: 'tenant', endpointId: 'local', aal: 'aal1', displayName: 'Administrador A', permissions: ['trip.operate'], confirmedAt: at('2026-10-12T10:00:00Z'),
    })).toEqual({ version: 1, actorId: 'user-1', organizationId: 'tenant-a', organizationName: 'Tenant A', organizationKind: 'tenant', endpointId: 'local', aal: 'aal1', displayName: 'Administrador A', permissions: ['trip.operate'], confirmedAt: '2026-10-12T10:00:00.000Z' });
  });
});

describe('restoreOfflineAccess', () => {
  it('menos de 8 horas desde a última confirmação: restaura', () => {
    const result = restoreOfflineAccess(record(), at('2026-10-12T17:59:00Z'));
    expect(result).toMatchObject({ ok: true, remainingMs: 60_000 });
    expect(result.ok && result.record.organizationId).toBe('tenant-a');
  });
  it('logo depois da confirmação, restaura com o teto inteiro menos o decorrido', () => {
    expect(restoreOfflineAccess(record(), at('2026-10-12T10:30:00Z'))).toMatchObject({ ok: true, remainingMs: OFFLINE_SESSION_MAX_MS - 30 * 60_000 });
  });
  it('passadas as 8 horas, não restaura', () => {
    expect(restoreOfflineAccess(record(), at('2026-10-12T18:00:00Z'))).toEqual({ ok: false, reason: 'expired' });
  });
  it('registro inválido ou ausente, não restaura', () => {
    expect(restoreOfflineAccess(null, at('2026-10-12T10:30:00Z'))).toEqual({ ok: false, reason: 'missing' });
    expect(restoreOfflineAccess({ lixo: true }, at('2026-10-12T10:30:00Z'))).toEqual({ ok: false, reason: 'invalid' });
  });
  it('a inatividade de 30 minutos não impede a restauração', () => {
    expect(restoreOfflineAccess(record(), at('2026-10-12T14:00:00Z')).ok).toBe(true);
  });
});

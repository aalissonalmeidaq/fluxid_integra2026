import { describe, expect, it } from 'vitest';
import {
  decodeTrackingCursor,
  encodeTrackingCursor,
  parseTrackingFilters,
  rescopeTrackingQuery,
  serializeTrackingFilters,
  type TrackingQuery,
} from './tracking-filters';

const TRIP = '11111111-1111-4111-8111-111111111111';
const SEAL = '22222222-2222-4222-8222-222222222222';
const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('filtros canônicos do rastreamento', () => {
  it('lê os nomes do contrato a partir da URL', () => {
    const result = parseTrackingFilters(new URLSearchParams(
      `from=2026-10-22T08:00:00-03:00&to=2026-10-22T18:00:00Z&trip_id=${TRIP}&seal_id=${SEAL}&status=open,acknowledged&origin=seal&quality=delayed`));
    expect(result).toEqual({
      ok: true,
      filters: {
        from: '2026-10-22T08:00:00-03:00', to: '2026-10-22T18:00:00Z', tripId: TRIP, sealId: SEAL,
        status: ['open', 'acknowledged'], origin: 'seal', quality: 'delayed',
      },
    });
  });

  it('sem parâmetros, devolve filtros vazios', () => {
    expect(parseTrackingFilters(new URLSearchParams())).toEqual({ ok: true, filters: {} });
  });

  it('recusa filtros desconhecidos, inclusive coordenadas e texto livre', () => {
    for (const query of ['lat=-7.2', 'lng=-39.3', 'q=Rua', 'driver_name=Maria', 'email=a@b.c']) {
      const result = parseTrackingFilters(new URLSearchParams(query));
      expect(result.ok, query).toBe(false);
      if (!result.ok) expect(result.errors[0]?.field).toBe(query.split('=')[0]);
    }
  });

  it('recusa id vazio ou que não é UUID', () => {
    expect(parseTrackingFilters(new URLSearchParams('trip_id=')).ok).toBe(false);
    expect(parseTrackingFilters(new URLSearchParams('cylinder_id=C262')).ok).toBe(false);
  });

  it('exige instante ISO 8601 com fuso e período em ordem', () => {
    expect(parseTrackingFilters(new URLSearchParams('from=2026-10-22T08:00:00')).ok).toBe(false);
    expect(parseTrackingFilters(new URLSearchParams('from=22/10/2026')).ok).toBe(false);
    const reversed = parseTrackingFilters(new URLSearchParams('from=2026-10-22T18:00:00Z&to=2026-10-22T08:00:00Z'));
    expect(reversed).toEqual({ ok: false, errors: [{ field: 'to', message: 'O fim do período deve ser depois do início.' }] });
  });

  it('recusa valores fora do vocabulário e parâmetros repetidos', () => {
    expect(parseTrackingFilters(new URLSearchParams('origin=gps')).ok).toBe(false);
    expect(parseTrackingFilters(new URLSearchParams('quality=good')).ok).toBe(false);
    expect(parseTrackingFilters(new URLSearchParams('status=open,lost')).ok).toBe(false);
    expect(parseTrackingFilters(new URLSearchParams(`trip_id=${TRIP}&trip_id=${TRIP}`)).ok).toBe(false);
  });

  it('serializa em ordem canônica e ida e volta preserva o recorte', () => {
    const filters = { quality: 'current' as const, tripId: TRIP, from: '2026-10-22T08:00:00Z', status: ['closed' as const, 'open' as const] };
    const params = serializeTrackingFilters(filters);
    expect(params.toString()).toBe(`from=2026-10-22T08%3A00%3A00Z&trip_id=${TRIP}&status=closed%2Copen&quality=current`);
    expect(parseTrackingFilters(params)).toEqual({ ok: true, filters });
  });
});

describe('cursor opaco (occurred_at, id)', () => {
  it('ida e volta preserva a posição', () => {
    const cursor = { occurredAt: '2026-10-22T14:02:00.123456Z', id: TRIP };
    const text = encodeTrackingCursor(cursor);
    expect(text).not.toContain(TRIP);
    expect(decodeTrackingCursor(text)).toEqual(cursor);
  });

  it('cursor adulterado ou vazio é ignorado', () => {
    expect(decodeTrackingCursor('')).toBeNull();
    expect(decodeTrackingCursor('nao-e-cursor')).toBeNull();
    expect(decodeTrackingCursor(encodeTrackingCursor({ occurredAt: 'ontem', id: TRIP }))).toBeNull();
    expect(decodeTrackingCursor(encodeTrackingCursor({ occurredAt: '2026-10-22T14:02:00Z', id: 'x' }))).toBeNull();
  });
});

describe('troca de empresa', () => {
  const query: TrackingQuery = { organizationId: ORG_A, filters: { tripId: TRIP }, cursor: { occurredAt: '2026-10-22T14:02:00Z', id: TRIP } };

  it('na mesma empresa, mantém filtros e cursor', () => {
    expect(rescopeTrackingQuery(query, ORG_A)).toBe(query);
  });

  it('em outra empresa, descarta filtros e cursor antes de qualquer novo resultado', () => {
    expect(rescopeTrackingQuery(query, ORG_B)).toEqual({ organizationId: ORG_B, filters: {}, cursor: null });
  });

  it('sem empresa ativa, não há consulta', () => {
    expect(rescopeTrackingQuery(query, null)).toBeNull();
  });
});

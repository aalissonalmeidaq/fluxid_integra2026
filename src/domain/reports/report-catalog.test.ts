import { describe, expect, it } from 'vitest';
import { REPORT_TYPES, defaultReportPeriod, parseReportQuery, reportDefinition, serializeReportQuery } from './report-catalog';

// Spec 015 (T070, parte do domínio; RF-024, RF-025, RF-037): catálogo dos seis relatórios com a matriz de leitura do contrato e os
// filtros aceitos por tipo; a consulta vive na URL, sem coordenadas nem texto livre. `report.export` nunca é permissão de leitura.
const ID = 'a1760000-0000-4000-8000-0000000000a1';

describe('catálogo de relatórios', () => {
  it('seis tipos com a matriz exata de leitura', () => {
    expect(REPORT_TYPES).toEqual(['trips', 'telemetry_availability', 'proximity', 'alerts', 'deliveries', 'custody']);
    expect(Object.fromEntries(REPORT_TYPES.map((type) => [type, reportDefinition(type).permission]))).toEqual({
      trips: 'trip.read', telemetry_availability: 'tracking.read', proximity: 'tracking.read', alerts: 'seal.read', deliveries: 'trip.read', custody: 'cylinder.history',
    });
    expect(REPORT_TYPES.some((type) => reportDefinition(type).permission === 'report.export')).toBe(false);
  });

  it('cada tipo tem rótulo e descrição em português', () => {
    for (const type of REPORT_TYPES) {
      expect(reportDefinition(type).label).toMatch(/\S/);
      expect(reportDefinition(type).description.length).toBeGreaterThan(20);
    }
  });

  it('período padrão: os últimos 30 dias até agora', () => {
    expect(defaultReportPeriod(new Date('2026-10-22T15:00:00Z'))).toEqual({ from: '2026-09-22T15:00:00.000Z', to: '2026-10-22T15:00:00.000Z' });
  });

  it('lê da URL só os filtros que o tipo aceita', () => {
    const now = new Date('2026-10-22T15:00:00Z');
    expect(parseReportQuery('proximity', new URLSearchParams(`from=2026-10-01T00:00:00Z&to=2026-10-22T00:00:00Z&cylinder_id=${ID}&status=open`), now))
      .toEqual({ ok: true, query: { type: 'proximity', filters: { from: '2026-10-01T00:00:00Z', to: '2026-10-22T00:00:00Z', cylinder_id: ID, status: 'open' } } });
    expect(parseReportQuery('trips', new URLSearchParams(`cylinder_id=${ID}`), now).ok).toBe(false);
    expect(parseReportQuery('trips', new URLSearchParams('lat=1'), now).ok).toBe(false);
  });

  it('sem período, usa o padrão; período inválido ou acima de 366 dias é recusado', () => {
    const now = new Date('2026-10-22T15:00:00Z');
    expect(parseReportQuery('alerts', new URLSearchParams(''), now)).toEqual({ ok: true, query: { type: 'alerts', filters: defaultReportPeriod(now) } });
    expect(parseReportQuery('alerts', new URLSearchParams('from=2026-10-22T18:00:00Z&to=2026-10-22T08:00:00Z'), now).ok).toBe(false);
    expect(parseReportQuery('alerts', new URLSearchParams('from=2025-01-01T00:00:00Z&to=2026-10-22T08:00:00Z'), now).ok).toBe(false);
  });

  it('tipo desconhecido é recusado; ida e volta preserva a consulta', () => {
    expect(parseReportQuery('faturamento', new URLSearchParams(''), new Date()).ok).toBe(false);
    const query = { type: 'trips' as const, filters: { from: '2026-10-01T00:00:00Z', to: '2026-10-22T00:00:00Z', vehicle_id: ID } };
    expect(parseReportQuery('trips', serializeReportQuery(query))).toEqual({ ok: true, query });
  });
});

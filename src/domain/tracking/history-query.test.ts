import { describe, expect, it } from 'vitest';
import { defaultHistoryPeriod, parseHistoryQuery, serializeHistoryQuery } from './history-query';

// Spec 015 (T056/T060; RF-021): a consulta do histórico vive na URL — assunto, id e período com fuso — sem coordenadas nem texto livre.
const ID = 'e1560000-0000-4000-8000-0000000000a1';

describe('consulta do histórico na URL', () => {
  it('lê assunto, id e período', () => {
    expect(parseHistoryQuery(new URLSearchParams(`subject=trip&id=${ID}&from=2026-10-22T08:00:00Z&to=2026-10-22T18:00:00Z`)))
      .toEqual({ ok: true, query: { subject: 'trip', subjectId: ID, from: '2026-10-22T08:00:00Z', to: '2026-10-22T18:00:00Z' } });
  });

  it('sem período, usa as 12 horas até agora', () => {
    const now = new Date('2026-10-22T18:00:00Z');
    expect(defaultHistoryPeriod(now)).toEqual({ from: '2026-10-22T06:00:00.000Z', to: '2026-10-22T18:00:00.000Z' });
    expect(parseHistoryQuery(new URLSearchParams(`subject=cylinder&id=${ID}`), now))
      .toEqual({ ok: true, query: { subject: 'cylinder', subjectId: ID, ...defaultHistoryPeriod(now) } });
  });

  it('recusa assunto desconhecido, id inválido, parâmetro estranho, período invertido ou acima de 31 dias', () => {
    for (const query of [`subject=vehicle&id=${ID}`, 'subject=trip&id=abc', `subject=trip&id=${ID}&lat=1`,
      `subject=trip&id=${ID}&from=2026-10-22T18:00:00Z&to=2026-10-22T08:00:00Z`,
      `subject=trip&id=${ID}&from=2026-09-01T00:00:00Z&to=2026-10-22T00:00:00Z`]) {
      expect(parseHistoryQuery(new URLSearchParams(query)).ok, query).toBe(false);
    }
  });

  it('sem assunto: pede para abrir a partir de uma viagem ou cilindro', () => {
    expect(parseHistoryQuery(new URLSearchParams(''))).toEqual({ ok: false, reason: 'missing_subject' });
  });

  it('ida e volta preserva a consulta', () => {
    const query = { subject: 'trip' as const, subjectId: ID, from: '2026-10-22T08:00:00Z', to: '2026-10-22T18:00:00Z' };
    expect(parseHistoryQuery(serializeHistoryQuery(query))).toEqual({ ok: true, query });
  });
});

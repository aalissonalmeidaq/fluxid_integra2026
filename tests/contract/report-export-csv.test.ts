// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { neutralize, toCsv } from '../../supabase/functions/report-export/csv';

// Spec 015 (T071; RF-027, RF-030, CS-007, CS-012): CSV UTF-8 com BOM, separador ";" (planilhas em português), cabeçalhos em português,
// texto que começa com =, +, -, @, tab ou CR neutralizado antes da citação (sem fórmula nem conteúdo ativo), e empresa, relatório,
// geração, critérios e fuso em colunas. Determinístico: o mesmo recorte gera o mesmo arquivo. Validação humana (27/10/2026): datas no
// horário de Brasília, no formato que a planilha em português reconhece, e situações por extenso, como na tela.
const META = { organization: 'Oxigênio Cariri', reportType: 'Ocorrências de proximidade', generatedAt: '2026-10-22T15:00:00Z', criteria: 'De 2026-10-22T08:00:00Z até 2026-10-22T18:00:00Z' };
const COLUMNS = [{ key: 'opened_at', label: 'Aberta em' }, { key: 'serial', label: 'Cilindro' }, { key: 'distance', label: 'Distância (m)' }, { key: 'note', label: 'Observação' }];

describe('CSV seguro', () => {
  it('neutraliza texto que viraria fórmula ou comando', () => {
    for (const value of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tsoma', '\rlinha']) expect(neutralize(value)).toBe(`'${value}`);
    expect(neutralize('Cilindro =1')).toBe('Cilindro =1');
    expect(neutralize('')).toBe('');
  });

  it('BOM, cabeçalho em português com as colunas de contexto e linhas com CRLF', () => {
    const csv = toCsv(COLUMNS, [{ opened_at: '2026-10-22T14:02:00+00:00', serial: 'OCC-A-1', distance: 231.5, note: null }], META);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Empresa;Relatório;Gerado em;Critérios;Fuso horário;Aberta em;Cilindro;Distância (m);Observação');
    expect(lines[1]).toBe('Oxigênio Cariri;Ocorrências de proximidade;22/10/2026 12:00:00;De 2026-10-22T08:00:00Z até 2026-10-22T18:00:00Z;Horário de Brasília (UTC-03:00);22/10/2026 11:02:00;OCC-A-1;231,5;');
    expect(lines.at(-1)).toBe('');
  });

  it('cita campos com separador, aspas, quebra de linha ou espaço nas pontas', () => {
    const csv = toCsv([{ key: 'note', label: 'Observação' }], [{ note: 'Parou; "abasteceu"\nseguiu' }, { note: ' borda ' }], META);
    expect(csv).toContain(';"Parou; ""abasteceu""\nseguiu"\r\n');
    expect(csv).toContain('" borda "');
  });

  it('neutraliza também dentro de campo citado', () => {
    const csv = toCsv([{ key: 'note', label: 'Observação' }], [{ note: '=HYPERLINK("http://x";"y")' }], META);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"";""y"")"`);
    expect(csv).not.toMatch(/;=HYPERLINK/);
  });

  it('número negativo vindo como número não é texto e não é alterado; texto de contexto também é neutralizado', () => {
    const csv = toCsv([{ key: 'v', label: 'Valor' }], [{ v: -12.5 }], { ...META, organization: '=Empresa' });
    expect(csv).toContain(";-12,5\r\n");
    expect(csv).toContain("'=Empresa;");
  });

  it('datas no horário de Brasília, inclusive com fração de segundo; data sem hora fica só como data', () => {
    const csv = toCsv([{ key: 'opened_at', label: 'Aberta em' }, { key: 'planned_date', label: 'Data planejada' }, { key: 'closed_at', label: 'Encerrada em' }],
      [{ opened_at: '2026-10-27T16:35:48.315083+00:00', planned_date: '2026-10-27', closed_at: null }], META);
    expect(csv).toContain(';27/10/2026 13:35:48;27/10/2026;\r\n');
  });

  it('situações e tipos por extenso, como na tela; texto livre e colunas sem vocabulário ficam como vieram', () => {
    const columns = [{ key: 'status', label: 'Situação' }, { key: 'detection_kind', label: 'Detecção' }, { key: 'kind', label: 'Tipo' },
      { key: 'severity', label: 'Severidade' }, { key: 'event_type', label: 'Evento' }, { key: 'note', label: 'Observação' }];
    const csv = toCsv(columns, [
      { status: 'historical_only', detection_kind: 'retrospective', kind: 'proximity_separation', severity: 'critical', event_type: 'trip_departed', note: 'closed' },
      { status: 'codigo_novo', detection_kind: 'live', kind: 'possible_loss', severity: 'high', event_type: 'trip_returned', note: 'texto' }], META);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[1]).toMatch(/;Só no histórico;Depois;Afastamento do motorista;Crítica;Saiu em viagem;closed$/);
    expect(lines[2]).toMatch(/;codigo_novo;Em tempo real;Possível extravio;Alta;Devolvido ao estoque pela viagem;texto$/);
  });

  it('mesmo recorte, mesmo arquivo', () => {
    const rows = [{ opened_at: 'a', serial: 'b', distance: 1, note: 'c' }];
    expect(toCsv(COLUMNS, rows, META)).toBe(toCsv(COLUMNS, rows, META));
  });

  it('sem linhas: só o cabeçalho', () => {
    expect(toCsv(COLUMNS, [], META).slice(1).split('\r\n').filter(Boolean)).toHaveLength(1);
  });
});

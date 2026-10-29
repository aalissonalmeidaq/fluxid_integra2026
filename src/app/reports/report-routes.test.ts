import { describe, expect, it } from 'vitest';
import { resolveReportRoute } from './report-routes';

// Spec 015 (T085; US5): /relatorios, /relatorios/:tipo e /relatorios/exportacoes/:id.
const ID = 'a17d0000-0000-4000-8000-000000000001';

describe('resolveReportRoute', () => {
  it('catálogo, relatório de um tipo e exportação', () => {
    expect(resolveReportRoute('/relatorios')).toEqual({ kind: 'catalog' });
    expect(resolveReportRoute('/relatorios/proximity')).toEqual({ kind: 'report', type: 'proximity' });
    expect(resolveReportRoute(`/relatorios/exportacoes/${ID}`)).toEqual({ kind: 'export', id: ID });
    expect(resolveReportRoute('/relatorios/')).toEqual({ kind: 'catalog' });
  });

  it('outras áreas não são de relatórios', () => {
    for (const path of ['/', '/relatorio', '/rastreamento', '/admin/relatorios']) expect(resolveReportRoute(path)).toBeNull();
  });

  it('tipo desconhecido, exportação sem id válido e caminho longo: não encontrado', () => {
    for (const path of ['/relatorios/faturamento', '/relatorios/exportacoes', '/relatorios/exportacoes/abc', `/relatorios/exportacoes/${ID}/x`, '/relatorios/proximity/x']) {
      expect(resolveReportRoute(path)).toEqual({ kind: 'not_found' });
    }
  });
});

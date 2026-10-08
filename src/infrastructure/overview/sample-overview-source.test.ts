import { afterEach, describe, expect, it, vi } from 'vitest';
import { OVERVIEW_BLOCK_IDS, type OverviewContentMap } from '@/domain/overview/overview-types';
import { sampleOverviewSource } from './sample-overview-source';

// RF-017, RF-032, RN-001, RN-004, RNF-004, CA-009: a fonte de exemplo é a única origem de números e textos da Visão geral.
const TERMOS_DE_ESTADO_FISICO = /entregue|entrega realizada|travad|trancad|comando executado|comando enviado/i;

async function carregarTodos() {
  const pares = await Promise.all(OVERVIEW_BLOCK_IDS.map(async (id) => [id, await sampleOverviewSource.load(id)] as const));
  return Object.fromEntries(pares) as unknown as OverviewContentMap;
}

describe('sampleOverviewSource', () => {
  afterEach(() => vi.restoreAllMocks());

  it('conhece os 7 blocos da Visão geral', () => {
    expect([...OVERVIEW_BLOCK_IDS]).toEqual(['indicadores', 'mapa', 'movimentacao', 'situacao', 'alertas', 'cilindros', 'desempenho']);
  });

  it('resolve todos os blocos em memória, sem rede nem armazenamento', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await carregarTodos();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('devolve o mesmo conteúdo a cada chamada, para qualquer pessoa e organização', async () => {
    expect(await carregarTodos()).toEqual(await carregarTodos());
  });

  it('os quatro cartões de indicadores têm ícone, valor em pt-BR, rótulo e nota', async () => {
    const { indicadores } = await carregarTodos();
    expect(indicadores.items.map((item) => item.label)).toEqual(['Cilindros cadastrados', 'Em viagem', 'Alertas críticos', 'Lacres conectados']);
    for (const item of indicadores.items) {
      expect(item.value).toMatch(/^\d{1,3}(\.\d{3})*$/);
      expect(item.note.length).toBeGreaterThan(0);
      expect(item.icon.length).toBeGreaterThan(0);
    }
  });

  it('cada indicador tem um tom próprio, para o cartão ter cor diferente por tipo de KPI', async () => {
    const { indicadores } = await carregarTodos();
    const tons = indicadores.items.map((item) => item.tone);
    expect(new Set(tons).size).toBe(indicadores.items.length);
    expect(tons).toEqual(['cadastro', 'viagem', 'critico', 'sucesso']);
  });

  it('os alertas trazem o detalhe: cilindro, ocorrência, tipo, gravidade, situação, e ao menos um é novo', async () => {
    const { alertas } = await carregarTodos();
    for (const alerta of alertas.items) {
      expect(alerta.cylinderId).toMatch(/^EX-/);
      expect(alerta.occurrence.length).toBeGreaterThan(10);
      expect(['critico', 'atencao', 'informativo']).toContain(alerta.severity);
      expect(alerta.status.length).toBeGreaterThan(0);
    }
    expect(alertas.items.some((alerta) => alerta.isNew)).toBe(true);
    expect(alertas.items.some((alerta) => !alerta.isNew)).toBe(true);
  });

  it('o mapa traz só o texto de fase futura e a região de exemplo, sem dados de operação', async () => {
    const { mapa } = await carregarTodos();
    expect(Object.keys(mapa)).toEqual(['message', 'center']);
    expect(Object.keys(mapa.center)).toEqual(['latitude', 'longitude', 'span']);
    expect(mapa.message).toMatch(/fase futura/i);
  });

  it('a movimentação tem de 7 a 30 dias, duas séries com rótulo e inteiros não negativos', async () => {
    const { movimentacao } = await carregarTodos();
    expect(movimentacao.days.length).toBeGreaterThanOrEqual(7);
    expect(movimentacao.days.length).toBeLessThanOrEqual(30);
    expect(movimentacao.series.map((serie) => serie.label)).toEqual(['Entradas', 'Saídas']);
    for (const dia of movimentacao.days) {
      expect(dia.label).toMatch(/^\d{2}\/\d{2}$/);
      for (const serie of movimentacao.series) {
        const valor = dia.values[serie.id] as number;
        expect(Number.isInteger(valor)).toBe(true);
        expect(valor).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('a rosca fecha 100% e a soma dos valores bate com o total', async () => {
    const { situacao } = await carregarTodos();
    expect(situacao.categories.map((categoria) => categoria.label)).toEqual(['Cheios', 'Com clientes', 'Vazios', 'Em manutenção']);
    expect(situacao.categories.reduce((soma, categoria) => soma + categoria.percent, 0)).toBe(100);
    expect(situacao.categories.reduce((soma, categoria) => soma + categoria.value, 0)).toBe(situacao.total);
  });

  it('alertas e cilindros recentes são listas curtas, com identificadores fictícios, e as medidas têm rótulo', async () => {
    const { alertas, cilindros, desempenho } = await carregarTodos();
    expect(alertas.items.length).toBeGreaterThan(0);
    expect(alertas.items.length).toBeLessThanOrEqual(6);
    expect(cilindros.items.length).toBeGreaterThan(0);
    expect(cilindros.items.length).toBeLessThanOrEqual(6);
    for (const cilindro of cilindros.items) expect(cilindro.id).toMatch(/^EX-/);
    expect(desempenho.items.map((item) => item.label)).toEqual([
      'Cilindros com teste hidrostático em dia',
      'Tempo médio de retorno de cilindros',
      'Alertas tratados',
    ]);
  });

  it('nenhum texto afirma estado físico nem traz identificador de tenant, pessoa ou e-mail', async () => {
    const texto = JSON.stringify(await carregarTodos());
    expect(texto).not.toMatch(TERMOS_DE_ESTADO_FISICO);
    expect(texto).not.toMatch(/@/);
    expect(texto).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(texto).not.toMatch(/organization_id|tenant|user_id/i);
  });
});

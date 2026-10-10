import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OverviewSource } from '@/application/overview/overview-source';
import { OverviewSourceProvider } from '@/app/overview/overview-source-context';
import type { OverviewBlockId } from '@/domain/overview/overview-types';
import { sampleOverviewSource } from '@/infrastructure/overview/sample-overview-source';
import { OverviewPage } from '../overview-page';

// RF-028, CA-006, RA-004, história 4: cada bloco trata os quatro estados sem quebrar a página nem mover o foco.
const TITULO_POR_BLOCO: Record<OverviewBlockId, string> = {
  indicadores: 'Indicadores principais',
  mapa: 'Mapa da operação',
  movimentacao: 'Movimentação de cilindros',
  situacao: 'Cilindros por situação',
  alertas: 'Alertas recentes',
  cilindros: 'Cilindros recentes',
  desempenho: 'Desempenho operacional',
};

const VAZIO: Partial<Record<OverviewBlockId, unknown>> = {
  indicadores: { items: [] },
  movimentacao: { series: [], days: [] },
  situacao: { total: 0, categories: [] },
  alertas: { items: [] },
  cilindros: { items: [] },
  desempenho: { items: [] },
};

function renderizar(source: OverviewSource) {
  return render(<OverviewSourceProvider source={source}><OverviewPage /></OverviewSourceProvider>);
}

const regiao = (id: OverviewBlockId) => screen.getByRole('region', { name: TITULO_POR_BLOCO[id] });

describe('Estados dos blocos da Visão geral', () => {
  it('loading: cada bloco anuncia o carregamento uma vez, sem mover o foco', () => {
    const antes = document.activeElement;
    renderizar({ load: () => new Promise(() => undefined) } as unknown as OverviewSource);
    for (const id of Object.keys(TITULO_POR_BLOCO) as OverviewBlockId[]) {
      expect(within(regiao(id)).getAllByRole('status')).toHaveLength(1);
      expect(regiao(id)).toHaveTextContent('Exemplo');
    }
    expect(document.activeElement).toBe(antes);
  });

  it('error: um bloco mostra a mensagem em texto e "Tentar de novo" enquanto os demais seguem funcionando', async () => {
    const source: OverviewSource = {
      load: ((id: OverviewBlockId) => (id === 'alertas' ? Promise.reject(new Error('falha')) : sampleOverviewSource.load(id))) as OverviewSource['load'],
    };
    renderizar(source);
    const alertas = await waitFor(() => {
      const bloco = regiao('alertas');
      expect(within(bloco).getByRole('alert')).toBeInTheDocument();
      return bloco;
    });
    expect(alertas).toHaveTextContent(/não foi possível carregar/i);
    expect(within(alertas).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    await waitFor(() => expect(within(regiao('cilindros')).getAllByRole('listitem').length).toBeGreaterThan(0));
    expect(within(regiao('indicadores')).getAllByRole('listitem')).toHaveLength(4);
  });

  it('"Tentar de novo" volta a loading e resolve, sem mover o foco', async () => {
    let tentativa = 0;
    const source: OverviewSource = {
      load: ((id: OverviewBlockId) => {
        if (id !== 'alertas') return sampleOverviewSource.load(id);
        tentativa += 1;
        return tentativa === 1 ? Promise.reject(new Error('falha')) : sampleOverviewSource.load(id);
      }) as OverviewSource['load'],
    };
    renderizar(source);
    const botao = await screen.findByRole('button', { name: 'Tentar de novo' });
    botao.focus();
    fireEvent.click(botao);
    await waitFor(() => expect(within(regiao('alertas')).getAllByRole('listitem').length).toBeGreaterThan(0));
    expect(within(regiao('alertas')).queryByRole('alert')).not.toBeInTheDocument();
    expect(tentativa).toBe(2);
  });

  it('empty: cada bloco com lista mostra texto explicativo, nunca área em branco', async () => {
    const source: OverviewSource = { load: ((id: OverviewBlockId) => (id in VAZIO ? Promise.resolve(VAZIO[id]) : sampleOverviewSource.load(id))) as OverviewSource['load'] };
    renderizar(source);
    for (const id of Object.keys(VAZIO) as OverviewBlockId[]) {
      await waitFor(() => expect(regiao(id)).toHaveTextContent(/nenhum item de exemplo/i));
    }
    expect(regiao('mapa')).toHaveTextContent(/fase futura/i);
  });

  it('texto longo em um cartão quebra dentro do cartão em vez de estourar a largura', async () => {
    const longo = 'Palavra'.repeat(40);
    const source: OverviewSource = {
      load: ((id: OverviewBlockId) => (id === 'indicadores'
        ? Promise.resolve({ items: [{ id: 'a', icon: 'cilindro', label: longo, value: '1', note: longo }] })
        : sampleOverviewSource.load(id))) as OverviewSource['load'],
    };
    renderizar(source);
    const rotulo = await screen.findAllByText(longo);
    for (const elemento of rotulo) expect(elemento.className).toMatch(/break-words/);
    expect(regiao('indicadores').className).toMatch(/min-w-0/);
  });

  it('o foco não se move em nenhum estado', async () => {
    const antes = document.activeElement;
    const resolver = vi.fn(sampleOverviewSource.load);
    renderizar({ load: resolver as OverviewSource['load'] });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(antes);
  });
});

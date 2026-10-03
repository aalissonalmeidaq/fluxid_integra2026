import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OverviewBlock } from './overview-block';

// RF-016, RF-028, RA-002, RA-004: todo bloco tem título, marca "Exemplo", um status único e os quatro estados.
describe('OverviewBlock', () => {
  it('renderiza uma região nomeada pelo título (h3) com a marca "Exemplo"', () => {
    render(<OverviewBlock id="alertas" title="Alertas recentes" state={{ status: 'ready', data: null }} onRetry={() => undefined}><p>conteúdo</p></OverviewBlock>);
    const regiao = screen.getByRole('region', { name: 'Alertas recentes' });
    expect(screen.getByRole('heading', { level: 3, name: 'Alertas recentes' })).toBeInTheDocument();
    expect(regiao).toHaveTextContent('Exemplo');
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
  });

  it('em loading mostra o indicador, anunciado uma vez, e não o conteúdo', () => {
    render(<OverviewBlock id="alertas" title="Alertas recentes" state={{ status: 'loading' }} onRetry={() => undefined}><p>conteúdo</p></OverviewBlock>);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryByText('conteúdo')).not.toBeInTheDocument();
  });

  it('em empty mostra texto explicativo em vez de área em branco', () => {
    render(<OverviewBlock id="alertas" title="Alertas recentes" state={{ status: 'empty' }} onRetry={() => undefined}><p>conteúdo</p></OverviewBlock>);
    expect(screen.getByText(/nenhum/i)).toBeInTheDocument();
    expect(screen.queryByText('conteúdo')).not.toBeInTheDocument();
  });

  it('em error mostra a mensagem e "Tentar de novo", que chama onRetry sem mover o foco', () => {
    const onRetry = vi.fn();
    render(<OverviewBlock id="alertas" title="Alertas recentes" state={{ status: 'error' }} onRetry={onRetry}><p>conteúdo</p></OverviewBlock>);
    const antes = document.activeElement;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(antes);
    expect(screen.queryByText('conteúdo')).not.toBeInTheDocument();
  });

  it('nunca tem mais de um role="status" por bloco', () => {
    render(<OverviewBlock id="alertas" title="Alertas recentes" state={{ status: 'ready', data: null }} onRetry={() => undefined}><p>conteúdo</p></OverviewBlock>);
    expect(screen.queryAllByRole('status').length).toBeLessThanOrEqual(1);
  });
});

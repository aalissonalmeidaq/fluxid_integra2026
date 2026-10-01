import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { Loading } from './loading';
import { SkipLink } from './skip-link';
import { SyncStatus, type SyncState } from './sync-status';
import { VisuallyHidden } from './visually-hidden';

// RF-021, RF-023, RA-003, RA-005: carregando, vazio, erro e sincronização com o mesmo vocabulário visual e anúncio
// único; nenhum estado depende só de cor.
describe('Loading', () => {
  it('anuncia uma única vez por uma região de status com texto', () => {
    render(<Loading label="Carregando membros" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Carregando membros');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('o indicador gira apenas se não houver preferência por movimento reduzido', () => {
    const { container } = render(<Loading label="Carregando" />);
    const indicador = container.querySelector('[data-indicador]') as HTMLElement;
    expect(indicador.getAttribute('class')).toMatch(/motion-safe:animate-spin/);
    expect(indicador.getAttribute('class')).not.toMatch(/(^|\s)animate-spin/);
    expect(indicador).toHaveAttribute('aria-hidden', 'true');
  });

  it('tem as variantes página, seção e botão', () => {
    const { rerender, container } = render(<Loading label="Carregando" variant="pagina" />);
    expect(container.firstElementChild).toHaveAttribute('data-variant', 'pagina');
    rerender(<Loading label="Carregando" variant="secao" />);
    expect(container.firstElementChild).toHaveAttribute('data-variant', 'secao');
    rerender(<Loading label="Enviando" variant="botao" />);
    expect(container.firstElementChild).toHaveAttribute('data-variant', 'botao');
  });

  it('não bloqueia o teclado: não captura foco nem usa aria-modal', () => {
    const { container } = render(
      <div>
        <button type="button">Antes</button>
        <Loading label="Carregando" />
      </div>,
    );
    expect(container.querySelector('[aria-modal]')).toBeNull();
    expect(container.querySelector('[tabindex]')).toBeNull();
  });
});

describe('EmptyState', () => {
  it('mostra título, orientação e a ação possível', () => {
    const onAction = vi.fn();
    render(<EmptyState title="Nenhum evento encontrado" description="Ajuste os filtros para ver outros eventos." action={{ label: 'Limpar filtros', onClick: onAction }} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Nenhum evento encontrado' })).toBeInTheDocument();
    expect(screen.getByText('Ajuste os filtros para ver outros eventos.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('funciona sem ação e aceita outro nível de título', () => {
    render(<EmptyState title="Sem papéis" description="Crie o primeiro papel." headingLevel={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Sem papéis' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ErrorState', () => {
  it('anuncia o erro como alerta e oferece tentar de novo', () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Não foi possível carregar" message="Verifique a conexão." onRetry={onRetry} />);
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível carregar');
    expect(alerta).toHaveTextContent('Verifique a conexão.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('sem permissão mostra a mensagem recebida e não oferece nova tentativa', () => {
    render(<ErrorState variant="sem-permissao" title="Acesso negado" message="Você não tem permissão para esta área." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Você não tem permissão para esta área.');
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).toBeNull();
  });

  it('a mensagem tem texto e ícone, nunca só cor', () => {
    const { container } = render(<ErrorState title="Erro" message="Algo deu errado." />);
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Erro');
  });
});

describe('SyncStatus', () => {
  const estados: Array<[SyncState, RegExp]> = [
    ['sincronizado', /sincronizado/i],
    ['sincronizando', /sincronizando/i],
    ['offline', /sem conexão/i],
    ['conflito', /conflito/i],
  ];

  it.each(estados)('o estado %s tem texto, ícone decorativo e região de status', (estado, texto) => {
    const { container } = render(<SyncStatus state={estado} />);
    expect(screen.getByRole('status')).toHaveTextContent(texto);
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('aceita um detalhe complementar', () => {
    render(<SyncStatus state="offline" detail="Suas alterações ficam guardadas até a conexão voltar." />);
    expect(screen.getByRole('status')).toHaveTextContent('Suas alterações ficam guardadas até a conexão voltar.');
  });

  it('só o estado sincronizando gira, e sem animação com movimento reduzido', () => {
    const { container, rerender } = render(<SyncStatus state="sincronizando" />);
    expect((container.querySelector('svg') as SVGElement).getAttribute('class')).toMatch(/motion-safe:animate-spin/);
    rerender(<SyncStatus state="sincronizado" />);
    expect((container.querySelector('svg') as SVGElement).getAttribute('class') ?? '').not.toMatch(/animate-spin/);
  });
});

describe('Utilitários de acessibilidade', () => {
  it('VisuallyHidden mantém o texto para tecnologia assistiva', () => {
    render(<VisuallyHidden>Texto para leitor de tela</VisuallyHidden>);
    expect(screen.getByText('Texto para leitor de tela').getAttribute('class')).toMatch(/sr-only/);
  });

  it('SkipLink aponta para o conteúdo principal e leva o foco até ele', () => {
    render(
      <div>
        <SkipLink targetId="main-content">Pular para o conteúdo principal</SkipLink>
        <main id="main-content" tabIndex={-1}>
          Conteúdo
        </main>
      </div>,
    );
    const link = screen.getByRole('link', { name: 'Pular para o conteúdo principal' });
    expect(link).toHaveAttribute('href', '#main-content');
    fireEvent.click(link);
    expect(screen.getByRole('main')).toHaveFocus();
  });
});

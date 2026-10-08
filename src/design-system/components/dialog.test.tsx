import { useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './dialog';

// RF-009: o diálogo prende o foco, fecha com Escape, devolve o foco ao acionador e anuncia o título.
function Acionador({ onClose = () => undefined }: { onClose?: () => void }): React.JSX.Element {
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setAberto(true)}>Abrir</button>
      {aberto && (
        <Dialog title="Confirmar ação" onClose={() => { setAberto(false); onClose(); }}>
          <button type="button">Primeiro</button>
          <input aria-label="Motivo" />
          <button type="button">Último</button>
        </Dialog>
      )}
    </div>
  );
}

describe('Dialog', () => {
  it('é um diálogo modal nomeado pelo título', () => {
    render(<Dialog title="Encerrar sessão" onClose={() => undefined}><button type="button">Ok</button></Dialog>);
    const dialogo = screen.getByRole('dialog', { name: 'Encerrar sessão' });
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: 'Encerrar sessão' })).toBeInTheDocument();
  });

  it('move o foco para o primeiro controle ao abrir', () => {
    render(<Acionador />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('button', { name: 'Primeiro' })).toHaveFocus();
  });

  it('aceita indicar o controle que recebe o foco inicial', () => {
    function Exemplo(): React.JSX.Element {
      const ref = useRef<HTMLInputElement>(null);
      return (
        <Dialog title="Motivo" onClose={() => undefined} initialFocusRef={ref}>
          <button type="button">Antes</button>
          <input ref={ref} aria-label="Justificativa" />
        </Dialog>
      );
    }
    render(<Exemplo />);
    expect(screen.getByLabelText('Justificativa')).toHaveFocus();
  });

  it('prende o foco: Tab no último volta ao primeiro e Shift+Tab no primeiro vai ao último', () => {
    render(<Acionador />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const primeiro = screen.getByRole('button', { name: 'Primeiro' });
    const ultimo = screen.getByRole('button', { name: 'Último' });
    ultimo.focus();
    fireEvent.keyDown(ultimo, { key: 'Tab' });
    expect(primeiro).toHaveFocus();
    fireEvent.keyDown(primeiro, { key: 'Tab', shiftKey: true });
    expect(ultimo).toHaveFocus();
  });

  it('fecha com Escape', () => {
    const onClose = vi.fn();
    render(<Acionador onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('devolve o foco ao acionador ao fechar', () => {
    render(<Acionador />);
    const abrir = screen.getByRole('button', { name: 'Abrir' });
    abrir.focus();
    fireEvent.click(abrir);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(abrir).toHaveFocus();
  });

  it('devolve o foco ao elemento indicado em returnFocusTo', () => {
    const destino = document.createElement('button');
    document.body.appendChild(destino);
    const { unmount } = render(
      <Dialog title="Teste" onClose={() => undefined} returnFocusTo={destino}>
        <button type="button">Ok</button>
      </Dialog>,
    );
    unmount();
    expect(destino).toHaveFocus();
    destino.remove();
  });

  it('o conteúdo longo rola dentro do diálogo e as ações ficam alcançáveis', () => {
    render(
      <Dialog title="Longo" onClose={() => undefined} footer={<button type="button">Confirmar</button>}>
        <p>Conteúdo</p>
      </Dialog>,
    );
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.className).toContain('overflow-y-auto');
    expect(dialogo.className).toContain('max-h-full');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
  });

  it('não fecha ao clicar fora, para não descartar ações sensíveis por engano', () => {
    const onClose = vi.fn();
    const { container } = render(
      <Dialog title="Sensível" onClose={onClose}>
        <button type="button">Ok</button>
      </Dialog>,
    );
    act(() => { fireEvent.click(container.firstElementChild as Element); });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('usa a largura compacta por padrão e a padrão nos formulários de cadastro', () => {
    const { rerender } = render(<Dialog title="Confirmar" onClose={() => undefined}><button type="button">Ok</button></Dialog>);
    expect(screen.getByRole('dialog')).toHaveClass('max-w-compacto');
    rerender(<Dialog title="Cadastrar" size="padrao" onClose={() => undefined}><button type="button">Ok</button></Dialog>);
    expect(screen.getByRole('dialog')).toHaveClass('max-w-padrao');
    expect(screen.getByRole('dialog')).not.toHaveClass('max-w-compacto');
  });
});

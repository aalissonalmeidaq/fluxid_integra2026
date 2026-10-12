import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Spec 009 (RF-022, RNF-005): o leitor é baixado só quando alguém o abre. Sem conexão e sem o arquivo em cache, o carregamento falha: a tela
// não pode cair; mostra o motivo em texto, oferece fechar e, depois, tentar de novo.
vi.mock('./identifier-reader-dialog', () => { throw new Error('sem conexão'); });
vi.spyOn(console, 'error').mockImplementation(() => undefined);

const { LazyIdentifierReaderDialog } = await import('./lazy-identifier-reader');

describe('LazyIdentifierReaderDialog: falha ao carregar o leitor', () => {
  it('mostra um diálogo com o motivo em texto, sem derrubar a tela', async () => {
    render(<div><p>conteúdo da tela</p><LazyIdentifierReaderDialog onClose={vi.fn()} onRead={vi.fn()} /></div>);
    expect(await screen.findByRole('dialog', { name: 'Ler cilindro' })).toBeInTheDocument();
    expect(screen.getByText(/Não foi possível abrir a leitura agora/)).toBeInTheDocument();
    expect(screen.getByText(/Digite o código no campo da tela/)).toBeInTheDocument();
    expect(screen.getByText('conteúdo da tela')).toBeInTheDocument();
  });

  it('"Fechar" e Escape fecham o aviso', async () => {
    const onClose = vi.fn();
    render(<LazyIdentifierReaderDialog onClose={onClose} onRead={vi.fn()} />);
    await screen.findByRole('dialog', { name: 'Ler cilindro' });
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('o aviso é um alerta (anunciado), não só texto solto', async () => {
    render(<LazyIdentifierReaderDialog onClose={vi.fn()} onRead={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Não foi possível abrir a leitura agora/);
  });
});

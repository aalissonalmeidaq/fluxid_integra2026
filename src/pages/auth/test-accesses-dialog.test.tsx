import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import manifesto from '@/domain/demo/acessos-demonstracao.json';
import TestAccesses from './test-accesses-dialog';

// Spec 014 (RF-006 a RF-008, RF-010; contracts/acessos-de-teste.md): o botão e o modal dos acessos de teste.
function abrir() {
  const onUse = vi.fn();
  render(<TestAccesses onUse={onUse} />);
  const botao = screen.getByRole('button', { name: 'Acessos de teste' });
  fireEvent.click(botao);
  return { onUse, botao, dialogo: screen.getByRole('dialog', { name: 'Acessos de teste' }) };
}

describe('Acessos de teste', () => {
  it('o botão é secundário, com alvo de toque de 44 px, e abre o diálogo com o nome "Acessos de teste"', () => {
    render(<TestAccesses onUse={vi.fn()} />);
    const botao = screen.getByRole('button', { name: 'Acessos de teste' });
    expect(botao).toHaveAttribute('data-variant', 'secundario');
    expect(botao.className).toMatch(/min-h-alvo/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(botao);
    expect(screen.getByRole('dialog', { name: 'Acessos de teste' })).toBeInTheDocument();
  });

  it('avisa que os acessos são públicos e que os dados podem ser alterados', () => {
    const { dialogo } = abrir();
    expect(dialogo).toHaveTextContent('Use um destes acessos para conhecer o FluxID como cada perfil da empresa Oxigênio Cariri.');
    expect(within(dialogo).getByText(/Estes acessos são públicos e valem só para a empresa da demonstração/)).toBeInTheDocument();
    expect(dialogo).toHaveTextContent('não cadastre dados reais');
  });

  it('lista os 5 perfis na ordem do JSON, com papel, descrição, e-mail e senha visíveis', () => {
    const { dialogo } = abrir();
    const itens = within(within(dialogo).getByRole('list', { name: 'Perfis de demonstração' })).getAllByRole('listitem');
    expect(itens).toHaveLength(5);
    expect(itens[0]).toHaveTextContent('Administrador da empresa');
    manifesto.accounts.forEach((conta, indice) => {
      const item = itens[indice]!;
      expect(item).toHaveTextContent(conta.description);
      expect(item).toHaveTextContent(conta.email);
      expect(item).toHaveTextContent(conta.password);
    });
    for (const papel of ['Operador de estoque', 'Operador técnico', 'Auditor da empresa', 'Motorista']) {
      expect(within(dialogo).getByRole('heading', { name: papel })).toBeInTheDocument();
    }
  });

  it('"Usar este acesso" entrega e-mail e senha do perfil e fecha o diálogo', () => {
    const { onUse } = abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Usar este acesso de Operador técnico' }));
    const conta = manifesto.accounts.find((item) => item.role_code === 'technical_operator')!;
    expect(onUse).toHaveBeenCalledWith(conta.email, conta.password);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Escape fecha sem usar nenhum acesso e devolve o foco ao botão', () => {
    const { onUse, botao, dialogo } = abrir();
    fireEvent.keyDown(dialogo, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onUse).not.toHaveBeenCalled();
    expect(botao).toHaveFocus();
  });

  it('"Fechar" e o clique fora também fecham e devolvem o foco', () => {
    const primeiro = abrir();
    fireEvent.click(within(primeiro.dialogo).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(primeiro.botao).toHaveFocus();

    fireEvent.click(primeiro.botao);
    const fundo = screen.getByRole('dialog').parentElement!;
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('listitem')[0]!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(fundo);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(primeiro.botao).toHaveFocus();
    expect(primeiro.onUse).not.toHaveBeenCalled();
  });

  it('cada "Usar este acesso" tem alvo de toque de 44 px', () => {
    const { dialogo } = abrir();
    const usar = within(dialogo).getAllByRole('button', { name: /^Usar este acesso de / });
    expect(usar).toHaveLength(5);
    for (const botao of usar) expect(botao.className).toMatch(/min-h-alvo/);
  });
});

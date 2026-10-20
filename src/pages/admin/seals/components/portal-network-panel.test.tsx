import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalNetworkPanel } from './portal-network-panel';

// Spec 013, US4 (T058; RF-016; contracts/telas.md): o bloco "Rede de configuração" explica o primeiro contato e revela a senha padrão sob
// pedido, com o motivo; a senha é fixa no firmware (sem botão de troca) e nunca vai para o armazenamento do navegador.
afterEach(() => { localStorage.clear(); sessionStorage.clear(); });

const reveal = (outcome: { kind: string; value?: string }) => vi.fn(async () => outcome as never);

describe('PortalNetworkPanel', () => {
  it('explica o nome da rede, o primeiro contato e que a senha é fixa no firmware', () => {
    render(<PortalNetworkPanel reveal={reveal({ kind: 'success', value: 'x' })} online />);
    const bloco = screen.getByRole('region', { name: 'Rede de configuração' });
    expect(within(bloco).getByText('FluxID-Lacre-', { selector: 'strong' })).toBeInTheDocument();
    expect(within(bloco).getByText(/4 últimos caracteres do código/)).toBeInTheDocument();
    expect(within(bloco).getAllByRole('listitem').length).toBeGreaterThanOrEqual(3);
    expect(within(bloco).getByText(/fixa no firmware/)).toBeInTheDocument();
    expect(within(bloco).queryByRole('button', { name: /Trocar/ })).not.toBeInTheDocument();
  });

  it('mostrar a senha pede o motivo antes de revelar e mostra num campo copiável', async () => {
    const service = reveal({ kind: 'success', value: 'senha-de-teste-do-portal' });
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<PortalNetworkPanel reveal={service} online />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar a senha' }));
    const dialogo = screen.getByRole('dialog', { name: /Mostrar a senha da rede de configuração/ });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Mostrar a senha' }));
    expect(within(dialogo).getByText('Escreva uma justificativa de 5 a 500 caracteres.')).toBeInTheDocument();
    expect(service).not.toHaveBeenCalled();
    fireEvent.change(within(dialogo).getByLabelText('Justificativa'), { target: { value: 'Instalação no depósito' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Mostrar a senha' }));
    expect(service).toHaveBeenCalledWith('Instalação no depósito');
    const campo = await screen.findByLabelText('Senha da rede de configuração');
    expect(campo).toHaveValue('senha-de-teste-do-portal');
    expect(campo).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar a senha' }));
    expect(writeText).toHaveBeenCalledWith('senha-de-teste-do-portal');
    expect(await screen.findByText('Senha copiada.')).toBeInTheDocument();
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('senha-de-teste');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar a senha' }));
    expect(screen.queryByLabelText('Senha da rede de configuração')).not.toBeInTheDocument();
  });

  it('sem a senha configurada no servidor, explica como configurar', async () => {
    render(<PortalNetworkPanel reveal={reveal({ kind: 'not_configured' })} online />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar a senha' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.change(within(dialogo).getByLabelText('Justificativa'), { target: { value: 'Instalação no depósito' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Mostrar a senha' }));
    expect(await within(dialogo).findByText(/não foi configurada no servidor/)).toBeInTheDocument();
  });

  it('sem conexão, não revela', () => {
    render(<PortalNetworkPanel reveal={reveal({ kind: 'success', value: 'x' })} online={false} />);
    expect(screen.getByRole('button', { name: 'Mostrar a senha' })).toBeDisabled();
  });
});

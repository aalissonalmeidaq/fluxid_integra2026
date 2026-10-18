import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PushState } from '@/application/seals/push-subscription';
import { PushSettings } from './push-settings';

// Spec 012 (T057; RF-036b; caso de borda do iPhone): "Notificações deste aparelho" no perfil. Ativar só no clique; o estado da
// permissão do navegador e o que fazer em cada caso aparecem em texto.
const controller = (initial: PushState, after: PushState = { state: 'on' }) => ({
  status: vi.fn(async () => initial), enable: vi.fn(async () => after), disable: vi.fn(async () => ({ state: 'off' }) as PushState),
});

describe('PushSettings', () => {
  it('desligado: o botão ativa e só então o navegador pede a permissão', async () => {
    const c = controller({ state: 'off' });
    render(<PushSettings controller={c} online />);
    expect(c.enable).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar notificações' }));
    expect(await screen.findByText('Notificações ativas neste aparelho.')).toBeInTheDocument();
    expect(c.enable).toHaveBeenCalledTimes(1);
  });

  it('ligado: desativar', async () => {
    const c = controller({ state: 'on' });
    render(<PushSettings controller={c} online />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar notificações' }));
    expect(await screen.findByRole('button', { name: 'Ativar notificações' })).toBeInTheDocument();
    expect(c.disable).toHaveBeenCalled();
  });

  it('permissão negada explica como liberar', async () => {
    render(<PushSettings controller={controller({ state: 'denied' })} online />);
    expect(await screen.findByText(/bloqueadas neste navegador/)).toBeInTheDocument();
  });

  it('iPhone fora da tela de início explica a instalação', async () => {
    render(<PushSettings controller={controller({ state: 'install_required' })} online />);
    expect(await screen.findByText(/Adicionar à Tela de Início/)).toBeInTheDocument();
  });

  it('sem suporte ou sem configuração', async () => {
    render(<PushSettings controller={controller({ state: 'unsupported' })} online />);
    expect(await screen.findByText(/não recebe notificações/)).toBeInTheDocument();
  });

  it('offline: o botão fica desabilitado com o motivo', async () => {
    render(<PushSettings controller={controller({ state: 'off' })} online={false} />);
    expect(await screen.findByRole('button', { name: 'Ativar notificações' })).toBeDisabled();
    expect(screen.getByText(/Sem conexão/)).toBeInTheDocument();
  });

  it('a seção diz o que chega e o que não chega pela notificação', async () => {
    render(<PushSettings controller={controller({ state: 'off' })} online />);
    expect(await screen.findByRole('heading', { name: 'Notificações deste aparelho' })).toBeInTheDocument();
    expect(screen.getByText(/sem localização nem nome de cliente/)).toBeInTheDocument();
  });
});

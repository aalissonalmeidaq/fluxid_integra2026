import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DriverTrackingState } from '@/application/tracking/tracking-sync-service';
import { DriverTrackingPanelView } from './driver-tracking-panel';

// Spec 015 (T053; RF-007a a RF-007c, RF-007g, RF-016): painel do motorista na viagem em andamento. Indicação contínua da coleta, o motivo
// da degradação (localização negada, só com a tela aberta, notificação recusada), as posições pendentes, o limite offline, a pausa por
// falta de autenticação e a diferença entre presença pontual e proximidade contínua — sempre em texto e ícone.
const NOW = new Date('2026-10-22T15:00:00Z');
const base: DriverTrackingState = {
  phase: 'collecting', tripId: 't1', platform: 'android_native', capability: 'full', degradation: null, collectUntil: '2026-10-22T23:00:00Z',
  pending: 0, lastSyncAt: '2026-10-22T14:59:00Z', lastError: null,
};
const renderPanel = (patch: Partial<DriverTrackingState> = {}, onEnable = vi.fn(), online = true) =>
  render(<DriverTrackingPanelView state={{ ...base, ...patch }} now={() => NOW} onEnable={onEnable} online={online} />);

describe('painel de coleta do motorista', () => {
  it('coleta ativa: indicação contínua, último envio e o limite caso a conexão caia', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Localização da viagem' })).toBeInTheDocument();
    expect(screen.getByText('Coleta ativa')).toBeInTheDocument();
    expect(screen.getByText(/a cada minuto, mesmo com a tela apagada/)).toBeInTheDocument();
    expect(screen.getByText('Último envio: há 1 minuto')).toBeInTheDocument();
    // Conectado, o limite é uma condição ("se cair"), não o estado atual: lido ao sol, não pode parecer que o celular está sem sinal.
    expect(screen.getByText('Se a conexão cair, a coleta continua neste aparelho até 22/10/2026 20:00.')).toBeInTheDocument();
    expect(screen.queryByText(/^Sem conexão/)).toBeNull();
    expect(screen.getByText('Nenhuma posição aguardando envio.')).toBeInTheDocument();
  });

  it('sem conexão: diz que está sem conexão e até quando a coleta continua', () => {
    renderPanel({}, vi.fn(), false);
    expect(screen.getByText('Sem conexão: a coleta continua neste aparelho até 22/10/2026 20:00.')).toBeInTheDocument();
  });

  it('a situação da coleta aparece em destaque, com ícone e texto em tamanho de corpo', () => {
    renderPanel({ platform: 'web_visible', capability: 'foreground_only', degradation: 'foreground_only' });
    const status = screen.getByText('Só com esta tela aberta');
    expect(status.closest('[data-tone="pendente"]')).not.toBeNull();
    expect(status.closest('[data-tone]')?.className).toContain('text-corpo');
  });

  it('falha ao iniciar: a ação é tentar de novo, não permitir localização', () => {
    const onEnable = vi.fn();
    renderPanel({ phase: 'error', lastError: 'UNKNOWN' }, onEnable);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onEnable).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Permitir localização' })).toBeNull();
  });

  it('posições pendentes aparecem em número, sem coordenadas', () => {
    renderPanel({ pending: 12 });
    expect(screen.getByText('12 posições aguardando envio.')).toBeInTheDocument();
    expect(screen.queryByText(/-7[.,]2/)).toBeNull();
  });

  it('no navegador: só com a tela aberta, com orientação', () => {
    renderPanel({ platform: 'web_visible', capability: 'foreground_only', degradation: 'foreground_only' });
    expect(screen.getByText('Só com esta tela aberta')).toBeInTheDocument();
    expect(screen.getByText(/aplicativo FluxID para Android/)).toBeInTheDocument();
  });

  it('localização negada: a viagem continua e há como permitir de novo', () => {
    const onEnable = vi.fn();
    renderPanel({ capability: 'denied', degradation: 'denied' }, onEnable);
    expect(screen.getByText('Localização negada')).toBeInTheDocument();
    expect(screen.getByText(/A viagem continua/)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Permitir localização' });
    // É a única saída para o gestor voltar a acompanhar a carga: ação principal, não secundária.
    expect(button.className).toContain('bg-azul-profundo');
    fireEvent.click(button);
    expect(onEnable).toHaveBeenCalled();
  });

  it('notificação recusada: visibilidade reduzida, com orientação', () => {
    renderPanel({ degradation: 'notifications_denied' });
    expect(screen.getByText('Notificação desativada')).toBeInTheDocument();
    expect(screen.getByText(/Ative as notificações do FluxID/)).toBeInTheDocument();
  });

  it('janela offline vencida: coleta pausada, fila preservada e pedido de nova entrada', () => {
    renderPanel({ phase: 'paused_auth', pending: 480 });
    expect(screen.getByText('Coleta pausada')).toBeInTheDocument();
    expect(screen.getByText(/mais de 8 horas sem conexão/)).toBeInTheDocument();
    expect(screen.getByText('480 posições aguardando envio.')).toBeInTheDocument();
  });

  it('sessão expirada: pede para entrar de novo', () => {
    renderPanel({ phase: 'auth_required' });
    expect(screen.getByText('Entre de novo')).toBeInTheDocument();
  });

  it('sem conexão ao iniciar: explica que começa quando a conexão voltar', () => {
    renderPanel({ phase: 'error', lastError: 'OFFLINE' });
    expect(screen.getByText(/começa quando a conexão voltar/)).toBeInTheDocument();
  });

  it('explica que a leitura na entrega é presença pontual, não proximidade contínua', () => {
    renderPanel();
    expect(screen.getByText(/confirma que o cilindro estava com você naquele momento/)).toBeInTheDocument();
  });
});

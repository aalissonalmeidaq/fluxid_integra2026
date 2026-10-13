import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConflictView } from '@/application/field/conflict-service';
import { ConflictPanel } from './conflict-panel';

// Spec 010, T042 (RF-013, CA-002; contracts/telas-e-fluxos.md §3): o painel do conflito, com o que a pessoa fez, o que aconteceu, o estado atual e as decisões.
const conflict = (over: Partial<ConflictView> = {}): ConflictView => ({
  conflictId: 'c1', itemId: 'q1', tripId: 'T1', reasonCode: 'TRIP_CLOSED', reasonText: 'A viagem foi encerrada depois que você registrou isto.',
  summary: { operation: 'trip.deliver', queuedAt: '2026-10-13T11:00:00Z', stopPosition: 2, positionInformed: true, recipientInformed: true },
  remote: { from: 'cancelled' }, createdAt: '2026-10-13T11:05:00Z', ...over,
});
const setup = (over: Record<string, unknown> = {}) => {
  const props = { conflict: conflict(), online: true, canDecide: true, returnFocusTo: null, onClose: vi.fn(), onDiscard: vi.fn(async () => ({ ok: true as const })), onResubmit: vi.fn(async () => ({ ok: true as const })), ...over };
  render(<ConflictPanel {...props} />);
  return props;
};

describe('painel do conflito', () => {
  it('mostra o que você fez (sem coordenadas nem nome), o que aconteceu e o estado atual', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Conflito na sincronização' })).toBeInTheDocument();
    expect(screen.getByText('Entrega da parada 2')).toBeInTheDocument();
    expect(screen.getByText(/Posição informada: sim/)).toBeInTheDocument();
    expect(screen.getByText(/Recebedor informado: sim/)).toBeInTheDocument();
    expect(screen.getByText('A viagem foi encerrada depois que você registrou isto.')).toBeInTheDocument();
    expect(screen.getByText('Estado atual')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/-?\d+[.,]\d{4}/);
  });

  it('reenviar chama a decisão e fecha', async () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar' }));
    await waitFor(() => expect(props.onResubmit).toHaveBeenCalled());
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
  });

  it('descartar pede a justificativa de 5 a 500 caracteres e só então chama a decisão', async () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    fireEvent.change(await screen.findByLabelText('Justificativa'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar registro' }));
    expect(props.onDiscard).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Viagem cancelada pelo despacho' } });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar registro' }));
    await waitFor(() => expect(props.onDiscard).toHaveBeenCalledWith('Viagem cancelada pelo despacho'));
  });

  it('sem conexão as decisões ficam desabilitadas, com o motivo', () => {
    setup({ online: false });
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reenviar' })).toBeDisabled();
    expect(screen.getByText('Exige conexão: a decisão fica registrada no servidor.')).toBeInTheDocument();
  });

  it('sem permissão de decidir, não oferece as decisões', () => {
    setup({ canDecide: false });
    expect(screen.queryByRole('button', { name: 'Descartar' })).toBeNull();
    expect(screen.getByText('Só quem pode operar viagens decide sobre este registro.')).toBeInTheDocument();
  });

  it('recusa do servidor aparece em texto e o painel continua aberto', async () => {
    const props = setup({ onResubmit: vi.fn(async () => ({ ok: false as const, reason: 'unavailable' as const })) });
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar' }));
    expect(await screen.findByText('Não foi possível registrar a decisão agora. Tente de novo.')).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('Escape fecha o painel', () => {
    const props = setup();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalled();
  });
});

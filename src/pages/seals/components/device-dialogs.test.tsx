import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BindSealDialog } from './bind-seal-dialog';

// Spec 012 (T093; História 5): vínculo escolhendo o lacre na lista de lacres ativos sem cilindro. Spec 013 (RF-018): o cadastro do
// dispositivo e a chave mostrada uma vez saíram; o lacre chega pelo Master e cria a própria chave. Nada vai para o armazenamento do navegador.
afterEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('BindSealDialog', () => {
  const seal = (id: string, label: string) => ({
    deviceId: id, deviceCode: `DSP-${id}`, label, status: 'active' as const, health: 'ok' as const, lockState: 'none' as const, sealState: 'closed' as const,
    batteryPct: 90, signalDbm: -60, lastSeenAt: '2026-10-17T14:00:00Z', reportIntervalS: 60, position: null, pendingCommand: null, watch: null, violation: null,
    approvedAt: '2026-10-17T13:00:00Z', origin: 'enrollment' as const, readyToBind: true, inactiveReason: null, inTrip: false,
  });

  it('lista os lacres ativos sem cilindro e vincula o escolhido', () => {
    const onConfirm = vi.fn();
    render(<BindSealDialog serialNumber="CIL-0042" seals={[seal('AAAA0001', 'Lacre 1'), seal('AAAA0002', 'Lacre 2')]} busy={false} error={null}
      returnFocusTo={null} onCancel={vi.fn()} onConfirm={onConfirm} now={() => new Date('2026-10-17T14:01:00Z')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    expect(screen.getByText('Escolha um lacre.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Lacre 2/));
    fireEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    expect(onConfirm).toHaveBeenCalledWith('AAAA0002');
  });

  it('sem lacre ativo disponível, explica', () => {
    render(<BindSealDialog serialNumber="CIL-0042" seals={[]} busy={false} error={null} returnFocusTo={null} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText(/Nenhum lacre ativo sem cilindro/)).toBeInTheDocument();
  });
});

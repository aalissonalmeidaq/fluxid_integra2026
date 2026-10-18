import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BindSealDialog } from './bind-seal-dialog';
import { DeviceFormDialog } from './device-form-dialog';
import { DeviceKeyReveal } from './device-key-reveal';

// Spec 012 (T093; RF-031 a RF-033; História 5): cadastro do dispositivo, chave mostrada uma única vez com "Copiar" e confirmação antes de
// fechar, e vínculo escolhendo o lacre na lista de lacres ativos sem cilindro. Nada disso vai para o armazenamento do navegador.
afterEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('DeviceFormDialog', () => {
  it('nome de 2 a 60 caracteres e intervalo; um único envio', () => {
    const onConfirm = vi.fn();
    render(<DeviceFormDialog busy={false} error={null} returnFocusTo={null} onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(screen.getByText(/de 2 a 60 caracteres/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nome do lacre'), { target: { value: 'Lacre do pátio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(onConfirm).toHaveBeenCalledWith('Lacre do pátio', 60);
  });
});

describe('DeviceKeyReveal', () => {
  it('mostra o código e a chave uma vez, copia e só fecha depois da confirmação', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onDone = vi.fn();
    render(<DeviceKeyReveal deviceCode="DSP-7KQ2M9XT" deviceKey="fxk_chave-de-teste" returnFocusTo={null} onDone={onDone} />);
    expect(screen.getByText('DSP-7KQ2M9XT')).toBeInTheDocument();
    expect(screen.getByText('fxk_chave-de-teste')).toBeInTheDocument();
    expect(screen.getByText(/não aparece de novo/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar a chave' }));
    expect(writeText).toHaveBeenCalledWith('fxk_chave-de-teste');
    expect(await screen.findByText('Chave copiada.')).toBeInTheDocument();
    const done = screen.getByRole('button', { name: 'Concluir' });
    expect(done).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Já guardei a chave para gravar no lacre'));
    fireEvent.click(done);
    expect(onDone).toHaveBeenCalled();
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('fxk_');
  });
});

describe('BindSealDialog', () => {
  const seal = (id: string, label: string) => ({
    deviceId: id, deviceCode: `DSP-${id}`, label, status: 'active' as const, health: 'ok' as const, lockState: 'none' as const, sealState: 'closed' as const,
    batteryPct: 90, signalDbm: -60, lastSeenAt: '2026-10-17T14:00:00Z', reportIntervalS: 60, position: null, pendingCommand: null, watch: null, violation: null,
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

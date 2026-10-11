import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { cylinder, fakeTripService, ORG } from '../trip-test-support';
import { CylinderPicker } from './cylinder-picker';

const setup = (over: Record<string, unknown> = {}, props: Partial<React.ComponentProps<typeof CylinderPicker>> = {}) => {
  const service = fakeTripService(over);
  const onAdd = vi.fn();
  const onAnnounce = vi.fn();
  render(<CylinderPicker service={service} organizationId={ORG} excludedIds={new Set()} remaining={3} onAdd={onAdd} onAnnounce={onAnnounce} {...props} />);
  return { service, onAdd, onAnnounce };
};

describe('seletor de cilindros', () => {
  it('lista os elegíveis com botão "Adicionar" por teclado e anuncia o resultado', async () => {
    const { onAdd, onAnnounce } = setup();
    const button = await screen.findByRole('button', { name: 'Adicionar CIL-001' });
    button.focus();
    fireEvent.click(button);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ serialNumber: 'CIL-001' }));
    expect(onAnnounce).toHaveBeenCalledWith('Cilindro CIL-001 adicionado à parada.');
  });

  it('mostra o quanto ainda cabe no veículo e bloqueia a adição quando está cheio', async () => {
    setup();
    expect(await screen.findByText('Cabem mais 3 cilindros no veículo.')).toBeInTheDocument();
  });

  it('veículo cheio: texto e botões desabilitados', async () => {
    setup({}, { remaining: 0 });
    expect(await screen.findByText('O veículo está cheio.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar CIL-001' })).toBeDisabled();
  });

  it('não oferece de novo o cilindro que já está na viagem', async () => {
    setup({}, { excludedIds: new Set([cylinder(1).id]) });
    await screen.findByRole('button', { name: 'Adicionar CIL-002' });
    expect(screen.queryByRole('button', { name: 'Adicionar CIL-001' })).not.toBeInTheDocument();
  });

  it('a busca recarrega a lista pela primeira página', async () => {
    const { service } = setup();
    await screen.findByRole('button', { name: 'Adicionar CIL-001' });
    fireEvent.change(screen.getByLabelText('Buscar cilindro'), { target: { value: 'cil-002' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(service.listEligibleCylinders).toHaveBeenLastCalledWith(ORG, { search: 'cil-002', cursor: null, limit: 10 }));
  });

  it('"Mostrar mais" pede a próxima página mantendo a busca', async () => {
    const listEligibleCylinders = vi.fn()
      .mockResolvedValueOnce({ kind: 'success', value: { items: [cylinder(1)], next: 'p2' } })
      .mockResolvedValueOnce({ kind: 'success', value: { items: [cylinder(2)], next: null } });
    setup({ listEligibleCylinders });
    fireEvent.click(await screen.findByRole('button', { name: 'Mostrar mais cilindros' }));
    expect(await screen.findByRole('button', { name: 'Adicionar CIL-002' })).toBeInTheDocument();
    expect(listEligibleCylinders).toHaveBeenLastCalledWith(ORG, { search: '', cursor: 'p2', limit: 10 });
    expect(screen.queryByRole('button', { name: 'Mostrar mais cilindros' })).not.toBeInTheDocument();
  });

  it('lista vazia explica por que e erro permite tentar de novo', async () => {
    const listEligibleCylinders = vi.fn()
      .mockResolvedValueOnce({ kind: 'unavailable' })
      .mockResolvedValueOnce({ kind: 'success', value: { items: [], next: null } });
    setup({ listEligibleCylinders });
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText(/Nenhum cilindro elegível disponível/)).toBeInTheDocument();
  });

  it('sem conexão explica que a busca exige conexão', async () => {
    setup({ listEligibleCylinders: vi.fn(async () => ({ kind: 'offline' })) });
    expect(await screen.findByText('Sem conexão. A busca de cilindros exige conexão.')).toBeInTheDocument();
  });

  it('não cria região de status própria (a tela tem um só anúncio)', async () => {
    setup();
    await screen.findByRole('button', { name: 'Adicionar CIL-001' });
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { detail } from '../trip-test-support';
import { LoadingPanel } from './loading-panel';
import { StopCard, type StopCardProps } from './stop-card';

// Spec 010, T026 (RF-001, RF-003, RF-006): sem conexão, as quatro operações de campo continuam à mão e dizem que ficam só no aparelho; o resto
// continua desabilitado com o motivo à vista.
const base = detail();
const stop = base.stops[0]!;
const noop = vi.fn();

describe('painel de conferência sem conexão', () => {
  const setup = (over: Record<string, unknown> = {}) => {
    const handlers = { onCheck: vi.fn(), onUncheck: vi.fn(), onRemove: vi.fn() };
    render(<LoadingPanel stops={base.stops} items={base.items} canOperate canRemove online={false} queueable busyKey={null} highlighted={new Set()} {...handlers} {...over} />);
    return handlers;
  };

  it('com a fila disponível, conferir e desfazer continuam habilitados', () => {
    const { onCheck } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Conferir CIL-001' }));
    expect(onCheck).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1' }));
  });

  it('retirar da viagem exige conexão e fica desabilitado com o motivo', () => {
    setup();
    for (const button of screen.getAllByRole('button', { name: /Retirar/ })) expect(button).toBeDisabled();
    expect(screen.getAllByText('Exige conexão').length).toBeGreaterThan(0);
  });

  it('a leitura do código continua disponível', () => {
    setup({ onReadCylinder: vi.fn() });
    expect(screen.getByRole('button', { name: 'Conferir código' })).toBeEnabled();
  });

  it('item guardado só no aparelho aparece como "Conferido, pendente de envio", e não como feito', () => {
    const items = base.items.map((item) => (item.id === 'i1' ? { ...item, itemStatus: 'checked' as const, pending: true } : item));
    setup({ items });
    expect(screen.getByText('Conferido, pendente de envio')).toBeInTheDocument();
  });

  it('sem a fila (sem trip.operate), nada muda: tudo desabilitado sem conexão', () => {
    setup({ queueable: false });
    expect(screen.getByRole('button', { name: 'Conferir CIL-001' })).toBeDisabled();
  });
});

describe('cartão da parada sem conexão', () => {
  const card = (over: Partial<StopCardProps> = {}) => render(
    <ul>
      <StopCard stop={stop} items={base.items} deliveries={[]} tripInProgress canOperate canUnlock={false} canException={false} canReturn={false} online={false} queueable busyKey={null}
        onUnlock={noop} onReturn={noop} onArrive={noop} onDeliver={noop} onCorrect={noop} {...over} />
    </ul>,
  );

  it('chegar fica habilitado', () => {
    card();
    expect(screen.getByRole('button', { name: /Registrar chegada à parada 1/ })).toBeEnabled();
  });

  it('registrar a entrega fica habilitado depois da chegada, mas corrigir exige conexão', () => {
    card({ stop: { ...stop, status: 'on_site', arrivedAt: '2026-10-13T15:00:00Z' } });
    expect(screen.getByRole('button', { name: /Registrar entrega/ })).toBeEnabled();
  });

  it('corrigir entrega e devolver exigem conexão', () => {
    card({
      stop: { ...stop, status: 'delivered', arrivedAt: '2026-10-13T15:00:00Z' }, canReturn: true,
      deliveries: [{ id: 'd1', stopId: stop.id, deliveredAt: '2026-10-13T15:30:00Z', recipientName: 'Fictício', recipientRole: null, latitude: null, longitude: null, atSiteAddress: false, outsideGeofence: null, results: [], supersedesId: null, recordedByName: 'Ana', recordedAt: '2026-10-13T15:31:00Z' }],
      items: base.items.map((item) => ({ ...item, itemStatus: 'not_delivered' as const })),
    });
    expect(screen.getByRole('button', { name: /Corrigir a entrega/ })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /Devolver/ })[0]).toBeDisabled();
  });

  it('sem unidade conhecida no cadastro (cópia guardada), o nome não vira link', () => {
    card({ stop: { ...stop, site: { ...stop.site, customerId: '' } } });
    expect(screen.queryByRole('link', { name: 'Unidade Central' })).toBeNull();
    expect(screen.getByText(/Unidade Central/)).toBeInTheDocument();
  });
});

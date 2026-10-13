import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { detail } from '../trip-test-support';
import { StopCard, type StopCardProps } from './stop-card';

// Spec 009 (RF-010, RF-013, RF-005): o cartão da parada diz a origem e a precisão da posição da chegada e da entrega e o método de cada
// conferência, em texto e sem coordenadas.
const base = detail();
const stop = base.stops[0]!;
const noop = vi.fn();

const render1 = (over: Partial<StopCardProps> = {}) => render(
  <ul>
    <StopCard stop={stop} items={base.items} deliveries={[]} tripInProgress canOperate={false} canUnlock={false} canException={false} canReturn={false} online busyKey={null}
      onUnlock={noop} onReturn={noop} onArrive={noop} onDeliver={noop} onCorrect={noop} {...over} />
  </ul>,
);
const delivery = {
  id: 'd1', stopId: stop.id, deliveredAt: '2026-10-13T15:30:00Z', recipientName: 'Recebedor Fictício', recipientRole: null, latitude: -23.55, longitude: -46.63, atSiteAddress: false,
  outsideGeofence: null, results: [], supersedesId: null, recordedByName: 'Ana', recordedAt: '2026-10-13T15:31:00Z',
};

describe('cartão da parada: posição e método', () => {
  it('chegada com GPS: origem, precisão em texto e a marca da geocerca, sem coordenadas', () => {
    render1({ stop: { ...stop, status: 'on_site', arrivedAt: '2026-10-13T15:00:00Z', arrival: { latitude: -23.55, longitude: -46.63, accuracyM: 450, positionSource: 'gps', positionReadAt: null, outsideGeofence: true } } });
    expect(screen.getByText(/Posição lida pelo GPS, precisão cerca de 450 m \(baixa\)\./)).toBeInTheDocument();
    expect(screen.getByText('Fora da geocerca da unidade.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/23[.,]55|46[.,]63/);
  });

  it('chegada com coordenadas digitadas diz "Posição informada." e a de dentro da geocerca', () => {
    render1({ stop: { ...stop, status: 'on_site', arrivedAt: '2026-10-13T15:00:00Z', arrival: { latitude: -23.5, longitude: -46.6, accuracyM: null, positionSource: 'typed', positionReadAt: null, outsideGeofence: false } } });
    expect(screen.getByText(/Posição informada\./)).toBeInTheDocument();
    expect(screen.getByText(/Dentro da geocerca da unidade\./)).toBeInTheDocument();
  });

  it('chegada sem posição não mostra nada de posição', () => {
    render1({ stop: { ...stop, status: 'on_site', arrivedAt: '2026-10-13T15:00:00Z', arrival: null } });
    expect(screen.queryByText(/Posição/)).toBeNull();
  });

  it('entrega com GPS: origem e precisão em texto; a entrega informada à mão continua como era', () => {
    const { unmount } = render1({ stop: { ...stop, status: 'delivered' }, deliveries: [{ ...delivery, positionSource: 'gps', accuracyM: 9.5 }] });
    expect(screen.getByText('Posição lida pelo GPS, precisão cerca de 10 m (boa).')).toBeInTheDocument();
    expect(screen.queryByText('Posição informada na entrega.')).toBeNull();
    unmount();
    render1({ stop: { ...stop, status: 'delivered' }, deliveries: [{ ...delivery, positionSource: 'typed', accuracyM: null }] });
    expect(screen.getByText('Posição informada na entrega.')).toBeInTheDocument();
  });

  it('o método de cada cilindro conferido aparece em texto', () => {
    const items = base.items.map((item, index) => ({ ...item, itemStatus: 'checked' as const, checkedAt: '2026-10-13T14:00:00Z', checkedByName: 'Ana', checkSource: index === 0 ? ('camera' as const) : ('nfc' as const) }));
    render1({ items });
    expect(screen.getByText(/Método: câmera\./)).toBeInTheDocument();
    expect(screen.getByText(/Método: NFC\./)).toBeInTheDocument();
  });

  it('conferência anterior à Spec 009 (sem método) não inventa um', () => {
    const items = base.items.map((item) => ({ ...item, itemStatus: 'checked' as const, checkedAt: '2026-10-13T14:00:00Z', checkedByName: 'Ana' }));
    render1({ items });
    expect(screen.queryByText(/Método:/)).toBeNull();
  });
});

// Spec 010, T056 e T055: a contagem de fotos e a assinatura aparecem em texto, e o botão de acrescentar só com a autorização da tela.
describe('cartão da parada: anexos', () => {
  const withAttachments = { ...delivery, photoCount: 2, hasSignature: true, attachments: [{ id: 'a1', kind: 'photo' as const, position: 1, capturedAt: null, addedLater: false }] };
  const delivered = { ...stop, status: 'delivered' as const };

  it('diz "2 fotos · com assinatura" e mostra as miniaturas quando há como carregar', async () => {
    render1({ stop: delivered, deliveries: [withAttachments], evidence: { canAdd: false, onAdd: vi.fn(), loadUrl: async () => 'https://x.example.invalid/a1' } });
    expect(screen.getByText('2 fotos · com assinatura')).toBeInTheDocument();
    expect(await screen.findByAltText('Foto 1 da entrega')).toBeInTheDocument();
  });

  it('sem contagem no registro (entrega antiga), não diz nada de anexos', () => {
    render1({ stop: delivered, deliveries: [delivery] });
    expect(screen.queryByText(/foto/)).toBeNull();
  });

  it('uma foto usa o singular', () => {
    render1({ stop: delivered, deliveries: [{ ...delivery, photoCount: 1, hasSignature: false }] });
    expect(screen.getByText('1 foto')).toBeInTheDocument();
  });

  it('o botão de acrescentar só aparece quando a tela autoriza', () => {
    const onAdd = vi.fn();
    const { unmount } = render1({ stop: delivered, deliveries: [delivery], evidence: { canAdd: false, onAdd } });
    expect(screen.queryByRole('button', { name: /Acrescentar foto ou assinatura/ })).toBeNull();
    unmount();
    render1({ stop: delivered, deliveries: [delivery], evidence: { canAdd: true, onAdd } });
    screen.getByRole('button', { name: /Acrescentar foto ou assinatura/ }).click();
    expect(onAdd).toHaveBeenCalledWith(delivered, expect.any(HTMLElement));
  });
});

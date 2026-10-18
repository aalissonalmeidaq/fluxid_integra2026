import L from 'leaflet';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OsmMap, PointsMap, ShapeMap } from './osm-map';

describe('OsmMap (um ponto)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('monta o mapa sob demanda, com região nomeada, o ponto em texto e o link para o mapa inteiro', async () => {
    render(<OsmMap title="Localização da unidade" latitude={-23.55} longitude={-46.63} />);
    const mapa = await screen.findByRole('group', { name: 'Localização da unidade' });
    await waitFor(() => expect(mapa.querySelector('.leaflet-container, .leaflet-pane')).not.toBeNull());
    expect(screen.getByText(/-23.55, -46.63/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Abrir no OpenStreetMap/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('desenha um marcador vetorial por ponto, sem imagem de marcador', async () => {
    const { container } = render(<OsmMap title="Localização da unidade" latitude={-23.55} longitude={-46.63} />);
    await waitFor(() => expect(container.querySelector('.fluxid-map-point')).not.toBeNull());
    expect(container.querySelector('img.leaflet-marker-icon')).toBeNull();
  });

  it('desenha a área circular da geocerca e enquadra todo o seu limite', async () => {
    const fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds');
    const { container } = render(<OsmMap title="Geocerca do pátio" latitude={-23.55} longitude={-46.63}
      shape={{ kind: 'circle', center: { latitude: -23.55, longitude: -46.63 }, radiusM: 200 }} />);
    await waitFor(() => expect(container.querySelector('.fluxid-map-geofence')).not.toBeNull());
    expect(fitBounds).toHaveBeenCalled();
  });

  it('desenha no mapa o perímetro poligonal informado', async () => {
    const { container } = render(<OsmMap title="Geocerca do pátio" latitude={-23.55} longitude={-46.63}
      shape={{ kind: 'polygon', vertices: [
        { latitude: -23.55, longitude: -46.63 },
        { latitude: -23.551, longitude: -46.631 },
        { latitude: -23.552, longitude: -46.629 },
      ] }} />);
    await waitFor(() => expect(container.querySelector('.fluxid-map-geofence')).not.toBeNull());
    expect(container.querySelector('path.fluxid-map-geofence')).not.toBeNull();
  });

  it('várias geocercas: a esperada em destaque, as próximas discretas, e o ponto entra no enquadramento', async () => {
    const fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds');
    const { container } = render(<OsmMap title="Lacre e geocercas" latitude={-7.2583} longitude={-39.3097} shapes={[
      { kind: 'circle', center: { latitude: -7.2583, longitude: -39.3097 }, radiusM: 150, emphasis: 'destaque', label: 'Bancada' },
      { kind: 'circle', center: { latitude: -7.25, longitude: -39.30 }, radiusM: 100, emphasis: 'discreta', label: 'Depósito' },
    ]} />);
    await waitFor(() => expect(container.querySelectorAll('.fluxid-map-geofence')).toHaveLength(2));
    expect(container.querySelector('.fluxid-map-geofence--destaque')).not.toBeNull();
    expect(container.querySelector('.fluxid-map-geofence--discreta')).not.toBeNull();
    const bounds = fitBounds.mock.calls.at(-1)?.[0] as L.LatLngBounds;
    expect(bounds.contains(L.latLng(-7.2583, -39.3097))).toBe(true);
  });

  it('o ponto fora da geocerca continua no quadro (o mapa enquadra os dois)', async () => {
    const fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds');
    render(<OsmMap title="Lacre longe" latitude={-7.2583} longitude={-39.3097}
      shape={{ kind: 'circle', center: { latitude: -23.55, longitude: -46.63 }, radiusM: 100 }} />);
    await waitFor(() => expect(fitBounds).toHaveBeenCalled());
    const bounds = fitBounds.mock.calls.at(-1)?.[0] as L.LatLngBounds;
    expect(bounds.contains(L.latLng(-7.2583, -39.3097))).toBe(true);
    expect(bounds.contains(L.latLng(-23.55, -46.63))).toBe(true);
  });

  it('sem conexão troca o mapa por um aviso e mantém as coordenadas em texto', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OsmMap title="Localização da unidade" latitude={-23.55} longitude={-46.63} />);
    expect(screen.queryByRole('group', { name: 'Localização da unidade' })).not.toBeInTheDocument();
    expect(screen.getByText(/O mapa precisa de conexão/)).toBeInTheDocument();
    expect(screen.getByText(/-23.55, -46.63/)).toBeInTheDocument();
  });

  it('coordenadas fora do intervalo não montam o mapa', () => {
    const { container } = render(<OsmMap title="Localização" latitude={120} longitude={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ShapeMap (geometria sem marcador artificial)', () => {
  it('desenha a geocerca, mantém a descrição textual e oferece o mapa completo', async () => {
    const { container } = render(<ShapeMap title="Mapa da geocerca" focus={{ latitude: -23.55, longitude: -46.63 }}
      shape={{ kind: 'circle', center: { latitude: -23.55, longitude: -46.63 }, radiusM: 200 }}
      caption="Círculo de 200 metros de raio." />);
    expect(await screen.findByRole('group', { name: 'Mapa da geocerca' })).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('.fluxid-map-geofence')).not.toBeNull());
    expect(container.querySelector('.fluxid-map-point')).toBeNull();
    expect(screen.getByText('Círculo de 200 metros de raio.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir no OpenStreetMap' })).toHaveAttribute('target', '_blank');
  });
});

describe('OsmMap (correção do ponto)', () => {
  it('sem onPick o mapa só mostra: o clique não escolhe nada e o quadro não é marcado como editável', async () => {
    const { container } = render(<OsmMap title="Localização da unidade" latitude={-23.55} longitude={-46.63} />);
    const mapa = await screen.findByRole('group', { name: 'Localização da unidade' });
    await waitFor(() => expect(container.querySelector('.fluxid-map-point')).not.toBeNull());
    expect(mapa).not.toHaveClass('fluxid-map--editable');
  });

  it('com onPick, o clique no mapa informa a latitude e a longitude escolhidas e o marcador acompanha o novo ponto', async () => {
    const onPick = vi.fn();
    const { container, rerender } = render(<OsmMap title="Ponto" latitude={-23.55} longitude={-46.63} onPick={onPick} />);
    const mapa = await screen.findByRole('group', { name: 'Ponto' });
    await waitFor(() => expect(container.querySelector('.fluxid-map-point')).not.toBeNull());
    expect(mapa).toHaveClass('fluxid-map--editable');
    fireEvent.click(mapa, { clientX: 5, clientY: 5 });
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    const [latitude, longitude] = onPick.mock.calls[0] as [number, number];
    expect(Number.isFinite(latitude) && Number.isFinite(longitude)).toBe(true);
    expect(Math.abs(latitude)).toBeLessThanOrEqual(90);
    // O ponto novo troca o marcador sem recriar o mapa: ainda há um só marcador.
    rerender(<OsmMap title="Ponto" latitude={-22.9} longitude={-43.2} onPick={onPick} />);
    await waitFor(() => expect(container.querySelectorAll('.fluxid-map-point')).toHaveLength(1));
    expect(screen.getByText(/-22.9, -43.2/)).toBeInTheDocument();
  });
});

describe('PointsMap (vários pontos)', () => {
  it('desenha um marcador por ponto e marca em outra cor o que não foi confirmado', async () => {
    const { container } = render(
      <PointsMap
        title="Unidades"
        fallback={{ latitude: -14, longitude: -51, zoom: 4 }}
        points={[
          { id: '1', label: 'Matriz', latitude: -23.55, longitude: -46.63, confirmed: true, details: ['Hospital Alfa', 'São Paulo/SP'] },
          { id: '2', label: 'Filial', latitude: -22.9, longitude: -43.2, confirmed: false },
        ]}
      />,
    );
    await waitFor(() => expect(container.querySelectorAll('.fluxid-map-point')).toHaveLength(2));
    expect(container.querySelectorAll('.fluxid-map-point--unconfirmed')).toHaveLength(1);
  });

  it('sem pontos abre na região de reserva, sem marcador', async () => {
    const { container } = render(<PointsMap title="Unidades" points={[]} fallback={{ latitude: -14, longitude: -51, zoom: 4 }} />);
    await screen.findByRole('group', { name: 'Unidades' });
    expect(container.querySelector('.fluxid-map-point')).toBeNull();
  });

  describe('zoom conforme a quantidade de pontos', () => {
    const FALLBACK = { latitude: -14, longitude: -51, zoom: 4 };
    afterEach(() => vi.restoreAllMocks());

    it('um ponto abre em nível de rua, não no zoom da região de reserva', async () => {
      const setView = vi.spyOn(L.Map.prototype, 'setView');
      render(<PointsMap title="Unidades" fallback={FALLBACK} points={[{ id: '1', label: 'Matriz', latitude: -23.55, longitude: -46.63 }]} />);
      await waitFor(() => expect(setView).toHaveBeenCalled());
      expect(setView.mock.calls[0]?.[1]).toBe(15);
    });

    it('vários pontos enquadram todos de uma vez, com zoom máximo de rua', async () => {
      const fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds');
      render(
        <PointsMap
          title="Unidades"
          fallback={FALLBACK}
          points={[
            { id: '1', label: 'Matriz', latitude: -23.55, longitude: -46.63 },
            { id: '2', label: 'Filial', latitude: -3.1, longitude: -60.0 },
          ]}
        />,
      );
      await waitFor(() => expect(fitBounds).toHaveBeenCalledTimes(1));
      const bounds = fitBounds.mock.calls[0]?.[0] as L.LatLngBounds;
      expect(bounds.contains([-23.55, -46.63])).toBe(true);
      expect(bounds.contains([-3.1, -60.0])).toBe(true);
      expect(fitBounds.mock.calls[0]?.[1]).toMatchObject({ maxZoom: 16 });
    });

    it('sem pontos usa a região e o zoom de reserva', async () => {
      const setView = vi.spyOn(L.Map.prototype, 'setView');
      render(<PointsMap title="Unidades" fallback={FALLBACK} points={[]} />);
      await waitFor(() => expect(setView).toHaveBeenCalled());
      expect(setView.mock.calls[0]?.[1]).toBe(4);
    });
  });
});

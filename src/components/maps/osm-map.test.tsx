import L from 'leaflet';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OsmMap, PointsMap } from './osm-map';

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

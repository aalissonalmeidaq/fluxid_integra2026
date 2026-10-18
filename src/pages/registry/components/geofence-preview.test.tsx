import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MapShape } from '@/components/maps/map-types';
import { GeofencePreview } from './geofence-preview';

vi.mock('@/components/maps/osm-map', () => ({
  ShapeMap: ({ title, shape, focus, caption }: { title: string; shape: MapShape; focus: { latitude: number; longitude: number }; caption: string }) => (
    <div role="group" aria-label={title} data-shape={JSON.stringify(shape)} data-focus={`${focus.latitude},${focus.longitude}`}>{caption}</div>
  ),
}));

describe('GeofencePreview', () => {
  it('círculo: mostra o raio e o centro sobre o mapa', () => {
    render(<GeofencePreview value={{ shape: 'circle', center: { lat: -23.55, lng: -46.633 }, radiusM: 200 }} />);
    const map = screen.getByRole('group', { name: 'Mapa da geocerca' });
    expect(JSON.parse(map.getAttribute('data-shape') ?? '')).toEqual({
      kind: 'circle', center: { latitude: -23.55, longitude: -46.633 }, radiusM: 200,
    });
    expect(map).toHaveTextContent('Círculo de 200 metros de raio, com centro em -23.55 e -46.633.');
  });

  it('círculo incompleto não abre mapa vazio e orienta completar a geometria', () => {
    render(<GeofencePreview value={{ shape: 'circle', center: null, radiusM: 100 }} />);
    expect(screen.queryByRole('group', { name: 'Mapa da geocerca' })).not.toBeInTheDocument();
    expect(screen.getByText(/Círculo ainda incompleto/)).toHaveTextContent('Complete a geometria para visualizá-la no mapa.');
  });

  it('polígono: mostra os vértices geográficos sobre o mapa e enquadra pelo centro médio', () => {
    render(<GeofencePreview value={{ shape: 'polygon', vertices: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }] }} />);
    const map = screen.getByRole('group', { name: 'Mapa da geocerca' });
    expect(JSON.parse(map.getAttribute('data-shape') ?? '')).toEqual({
      kind: 'polygon', vertices: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 1 }],
    });
    expect(map.getAttribute('data-focus')).toBe(`${1 / 3},${2 / 3}`);
    expect(map).toHaveTextContent('Polígono com 3 vértices');
  });

  it('polígono incompleto não produz uma visualização esquemática', () => {
    render(<GeofencePreview value={{ shape: 'polygon', vertices: [] }} />);
    expect(screen.queryByRole('group', { name: 'Mapa da geocerca' })).not.toBeInTheDocument();
    expect(screen.getByText(/Polígono ainda sem vértices/)).toBeInTheDocument();
  });
});

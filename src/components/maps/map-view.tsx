import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import React, { useEffect, useRef } from 'react';
import type { MapPoint } from './map-types';
import './map-view.css';

// Mapa Leaflet com blocos do OpenStreetMap. Carregado sob demanda (map-lazy.tsx): fora das telas com mapa, nada disto entra no
// pacote de entrada. Só os blocos do mapa saem para o OpenStreetMap (o navegador pede a região vista, sem cookies nem dados do
// FluxID); nenhum dado de cadastro vai na requisição. Marcadores são vetores, sem imagens, e os textos dos balões são montados
// com `textContent`, nunca com HTML.
export interface MapViewProps {
  title: string;
  points: readonly MapPoint[];
  // Onde o mapa abre quando não há pontos.
  fallback: { latitude: number; longitude: number; zoom: number };
  // Zoom quando há um ponto só (padrão 15, nível de rua). Com vários pontos o mapa enquadra todos, no maior zoom que os comporta.
  singleZoom?: number;
  className?: string;
}

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function popupContent(point: MapPoint): HTMLElement {
  const root = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = point.label;
  root.append(name);
  for (const line of point.details ?? []) {
    root.append(document.createElement('br'));
    root.append(document.createTextNode(line));
  }
  if (point.href) {
    root.append(document.createElement('br'));
    const link = document.createElement('a');
    link.href = point.href;
    link.textContent = 'Abrir a unidade';
    root.append(link);
  }
  return root;
}

export default function MapView({ title, points, fallback, singleZoom = 15, className }: MapViewProps): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return undefined;
    const map = L.map(element, { attributionControl: true, scrollWheelZoom: false });
    map.attributionControl.setPrefix(false);
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    }).addTo(map);

    const layers = points.map((point) =>
      L.circleMarker([point.latitude, point.longitude], { radius: 9, className: point.confirmed === false ? 'fluxid-map-point fluxid-map-point--unconfirmed' : 'fluxid-map-point' })
        .bindPopup(popupContent(point))
        .bindTooltip(point.label)
        .addTo(map));

    if (layers.length === 0) map.setView([fallback.latitude, fallback.longitude], fallback.zoom);
    else if (layers.length === 1) map.setView([points[0]?.latitude ?? fallback.latitude, points[0]?.longitude ?? fallback.longitude], singleZoom);
    else map.fitBounds(L.latLngBounds(points.map((point) => [point.latitude, point.longitude] as [number, number])), { padding: [32, 32], maxZoom: 16 });

    // O quadro pode mudar de tamanho depois da montagem (colunas, gaveta): o Leaflet precisa recalcular.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => map.invalidateSize());
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      map.remove();
    };
  }, [points, fallback.latitude, fallback.longitude, fallback.zoom, singleZoom]);

  return (
    <div
      ref={container}
      role="group"
      aria-label={title}
      className={['fluxid-map aspect-square w-full rounded-card border border-borda bg-cinza-gelo tablet:aspect-video', className].filter(Boolean).join(' ')}
    />
  );
}

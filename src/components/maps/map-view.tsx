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
  // Presente, o mapa é editável: um clique (ou toque) escolhe o novo ponto. A alternativa por teclado fica nos campos de coordenadas.
  onPick?: (latitude: number, longitude: number) => void;
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

export default function MapView({ title, points, fallback, singleZoom = 15, onPick, className }: MapViewProps): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  // Depois da primeira exibição, trocar o ponto só recentra o mapa: o zoom escolhido pela pessoa é mantido.
  const framed = useRef(false);
  const pick = useRef(onPick);
  const editable = onPick !== undefined;

  // O clique usa sempre a função mais recente, sem recriar o mapa a cada renderização.
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const element = container.current;
    if (!element) return undefined;
    const instance = L.map(element, { attributionControl: true, scrollWheelZoom: false });
    instance.attributionControl.setPrefix(false);
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    }).addTo(instance);
    if (editable) instance.on('click', (event: L.LeafletMouseEvent) => pick.current?.(Math.round(event.latlng.lat * 1e6) / 1e6, Math.round(event.latlng.lng * 1e6) / 1e6));
    layer.current = L.layerGroup().addTo(instance);
    map.current = instance;
    framed.current = false;

    // O quadro pode mudar de tamanho depois da montagem (colunas, gaveta): o Leaflet precisa recalcular.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => instance.invalidateSize());
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      instance.remove();
      map.current = null;
      layer.current = null;
    };
  }, [editable]);

  useEffect(() => {
    const instance = map.current;
    const group = layer.current;
    if (!instance || !group) return;
    group.clearLayers();
    for (const point of points) {
      L.circleMarker([point.latitude, point.longitude], { radius: 9, className: point.confirmed === false ? 'fluxid-map-point fluxid-map-point--unconfirmed' : 'fluxid-map-point' })
        .bindPopup(popupContent(point))
        .bindTooltip(point.label)
        .addTo(group);
    }

    const first = points[0];
    if (!first) instance.setView([fallback.latitude, fallback.longitude], fallback.zoom);
    else if (points.length === 1) instance.setView([first.latitude, first.longitude], framed.current && editable ? instance.getZoom() : singleZoom);
    else instance.fitBounds(L.latLngBounds(points.map((point) => [point.latitude, point.longitude] as [number, number])), { padding: [32, 32], maxZoom: 16 });
    framed.current = true;
  }, [points, fallback.latitude, fallback.longitude, fallback.zoom, singleZoom, editable]);

  return (
    <div
      ref={container}
      role="group"
      aria-label={title}
      className={['fluxid-map aspect-square w-full rounded-card border border-borda bg-cinza-gelo tablet:aspect-video', editable ? 'fluxid-map--editable' : '', className].filter(Boolean).join(' ')}
    />
  );
}

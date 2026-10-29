import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import React, { useEffect, useRef } from 'react';
import { popupContent } from './map-popup';
import type { MapPoint, MapShape, MapTrail } from './map-types';
import './map-view.css';

// Mapa Leaflet com blocos do OpenStreetMap. Carregado sob demanda (map-lazy.tsx): fora das telas com mapa, nada disto entra no
// pacote de entrada. Só os blocos do mapa saem para o OpenStreetMap (o navegador pede a região vista, sem cookies nem dados do
// FluxID); nenhum dado de cadastro vai na requisição. Marcadores são vetores, sem imagens, e os textos dos balões são montados
// com `textContent`, nunca com HTML.
export interface MapViewProps {
  title: string;
  points: readonly MapPoint[];
  shapes?: readonly MapShape[];
  // Onde o mapa abre quando não há pontos.
  fallback: { latitude: number; longitude: number; zoom: number };
  // Zoom quando há um ponto só (padrão 15, nível de rua). Com vários pontos o mapa enquadra todos, no maior zoom que os comporta.
  singleZoom?: number;
  // Presente, o mapa é editável: um clique (ou toque) escolhe o novo ponto. A alternativa por teclado fica nos campos de coordenadas.
  onPick?: (latitude: number, longitude: number) => void;
  // Spec 015: trechos do trajeto (uma linha por trecho) e a seleção de um ponto pelo clique, sincronizada com a lista.
  trails?: readonly MapTrail[];
  onSelect?: (id: string) => void;
  className?: string;
}

const pointClass = (point: MapPoint): string => [
  'fluxid-map-point',
  point.confirmed === false ? 'fluxid-map-point--unconfirmed' : '',
  point.origin ? `fluxid-map-point--${point.origin}` : '',
  point.selected ? 'fluxid-map-point--selected' : '',
].filter(Boolean).join(' ');

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export default function MapView({ title, points, shapes = [], fallback, singleZoom = 15, onPick, trails = [], onSelect, className }: MapViewProps): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  // Depois da primeira exibição, trocar o ponto só recentra o mapa: o zoom escolhido pela pessoa é mantido.
  const framed = useRef(false);
  const pick = useRef(onPick);
  const select = useRef(onSelect);
  const editable = onPick !== undefined;

  // O clique usa sempre a função mais recente, sem recriar o mapa a cada renderização.
  useEffect(() => {
    pick.current = onPick;
    select.current = onSelect;
  }, [onPick, onSelect]);

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
    const shapeBounds = L.latLngBounds([]);
    for (const shape of shapes) {
      const className = ['fluxid-map-geofence', shape.emphasis ? `fluxid-map-geofence--${shape.emphasis}` : ''].filter(Boolean).join(' ');
      const boundary = shape.kind === 'circle'
        ? L.circle([shape.center.latitude, shape.center.longitude], { radius: shape.radiusM, className })
        : L.polygon(shape.vertices.map((vertex) => [vertex.latitude, vertex.longitude]), { className });
      if (shape.label) boundary.bindTooltip(shape.label);
      boundary.addTo(group);
      shapeBounds.extend(shape.kind === 'circle'
        ? L.latLng(shape.center.latitude, shape.center.longitude).toBounds(shape.radiusM * 2)
        : boundary.getBounds());
    }
    const trailBounds = L.latLngBounds([]);
    for (const trail of trails) {
      if (trail.coordinates.length < 2) continue;
      const line = L.polyline(trail.coordinates.map((c) => [c.latitude, c.longitude] as [number, number]), {
        className: `fluxid-map-trail fluxid-map-trail--${trail.origin}`, interactive: false,
      }).addTo(group);
      trailBounds.extend(line.getBounds());
    }
    for (const point of points) {
      const marker = L.circleMarker([point.latitude, point.longitude], { radius: point.origin === 'seal' ? 7 : 9, className: pointClass(point) })
        .bindTooltip(point.label);
      // No rastreamento, o clique seleciona o item da lista; nos demais mapas, abre o balão.
      if (point.origin) marker.on('click', () => select.current?.(point.id));
      else {
        const popup = popupContent(point);
        marker.bindPopup(popup.element).on('popupopen', popup.refresh);
      }
      // O ponto recebe foco pelo teclado: leva o nome da dica e responde a Enter ou Espaço como ao clique. O elemento só existe
      // quando o ponto entra no mapa.
      marker.on('add', () => {
        const element = marker.getElement();
        if (!element) return;
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        element.setAttribute('aria-label', point.label);
        element.addEventListener('keydown', (event) => {
          const { key } = event as KeyboardEvent;
          if (key !== 'Enter' && key !== ' ') return;
          event.preventDefault();
          if (point.origin) select.current?.(point.id);
          else marker.openPopup();
        });
      });
      marker.addTo(group);
    }
    if (trailBounds.isValid()) {
      for (const point of points) trailBounds.extend([point.latitude, point.longitude]);
      instance.fitBounds(trailBounds, { padding: [32, 32], maxZoom: 17 });
      framed.current = true;
      return;
    }

    const first = points[0];
    // Com formas, o quadro inclui também os pontos: um lacre fora da geocerca não pode sumir do mapa.
    if (shapeBounds.isValid()) for (const point of points) shapeBounds.extend([point.latitude, point.longitude]);
    if (shapeBounds.isValid()) instance.fitBounds(shapeBounds, { padding: [32, 32], maxZoom: 17 });
    else if (!first) instance.setView([fallback.latitude, fallback.longitude], fallback.zoom);
    else if (points.length === 1) instance.setView([first.latitude, first.longitude], framed.current && editable ? instance.getZoom() : singleZoom);
    else instance.fitBounds(L.latLngBounds(points.map((point) => [point.latitude, point.longitude] as [number, number])), { padding: [32, 32], maxZoom: 16 });
    framed.current = true;
  }, [points, shapes, trails, fallback.latitude, fallback.longitude, fallback.zoom, singleZoom, editable]);

  return (
    <div
      ref={container}
      role="group"
      aria-label={title}
      className={['fluxid-map aspect-square w-full rounded-card border border-borda-suave bg-cinza-gelo tablet:aspect-video', editable ? 'fluxid-map--editable' : '', className].filter(Boolean).join(' ')}
    />
  );
}

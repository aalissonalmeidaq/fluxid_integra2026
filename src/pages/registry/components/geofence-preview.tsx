import React from 'react';
import type { LatLng } from '@/domain/registry/geofence-geometry';

export type GeofencePreviewShape =
  | { shape: 'circle'; center: LatLng | null; radiusM: number | null }
  | { shape: 'polygon'; vertices: readonly LatLng[] };

const SIZE = 200;
const MARGIN = 16;

// Descrição em texto da forma: é a alternativa do desenho para leitores de tela (forma, tamanho e vértices).
function describeShape(value: GeofencePreviewShape): string {
  if (value.shape === 'circle') {
    if (value.radiusM === null || value.center === null) return 'Círculo ainda incompleto: informe o centro e o raio.';
    return `Círculo de ${value.radiusM} metros de raio, com centro em ${value.center.lat} e ${value.center.lng}.`;
  }
  if (value.vertices.length === 0) return 'Polígono ainda sem vértices.';
  const list = value.vertices.map((vertex, index) => `${index + 1}: ${vertex.lat}, ${vertex.lng}`).join('; ');
  return `Polígono com ${value.vertices.length} ${value.vertices.length === 1 ? 'vértice' : 'vértices'} (${list}).`;
}

// Pré-visualização esquemática em SVG, sem mapa nem biblioteca: só mostra a forma e a proporção. A decisão "ponto dentro" é do servidor.
export function GeofencePreview({ value }: { value: GeofencePreviewShape }): React.JSX.Element {
  const description = describeShape(value);
  let drawing: React.ReactNode = null;
  if (value.shape === 'circle' && value.center !== null && value.radiusM !== null) {
    drawing = <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - MARGIN} className="fill-info-fundo stroke-azul-profundo" strokeWidth={2} />;
  } else if (value.shape === 'polygon' && value.vertices.length >= 2) {
    const lats = value.vertices.map((vertex) => vertex.lat);
    const lngs = value.vertices.map((vertex) => vertex.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const span = Math.max(maxLat - minLat, maxLng - minLng) || 1;
    const scale = (SIZE - 2 * MARGIN) / span;
    // Latitude cresce para o norte: o eixo vertical do desenho é invertido.
    const points = value.vertices.map((vertex) => `${MARGIN + (vertex.lng - minLng) * scale},${SIZE - MARGIN - (vertex.lat - minLat) * scale}`).join(' ');
    drawing = <polygon points={points} className="fill-info-fundo stroke-azul-profundo" strokeWidth={2} strokeLinejoin="round" />;
  }
  return (
    <figure className="flex flex-col gap-2">
      <svg role="img" aria-label={description} viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full tablet:w-1/2 rounded-card border border-borda-suave bg-branco">
        {drawing}
      </svg>
      <figcaption className="text-legenda text-texto-secundario">{description} Desenho esquemático, sem mapa.</figcaption>
    </figure>
  );
}

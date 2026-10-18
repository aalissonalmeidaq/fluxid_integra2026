import React from 'react';
import { ShapeMap } from '@/components/maps/osm-map';
import type { MapShape } from '@/components/maps/map-types';
import { Alert } from '@/design-system';
import type { LatLng } from '@/domain/registry/geofence-geometry';

export type GeofencePreviewShape =
  | { shape: 'circle'; center: LatLng | null; radiusM: number | null }
  | { shape: 'polygon'; vertices: readonly LatLng[] };

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

const validCoordinate = ({ lat, lng }: LatLng): boolean =>
  Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180;

function mapOf(value: GeofencePreviewShape): { shape: MapShape; focus: { latitude: number; longitude: number } } | null {
  if (value.shape === 'circle') {
    if (value.center === null || value.radiusM === null || value.radiusM <= 0 || !validCoordinate(value.center)) return null;
    return {
      shape: { kind: 'circle', center: { latitude: value.center.lat, longitude: value.center.lng }, radiusM: value.radiusM },
      focus: { latitude: value.center.lat, longitude: value.center.lng },
    };
  }
  const vertices = value.vertices.filter(validCoordinate);
  if (vertices.length < 3) return null;
  return {
    shape: { kind: 'polygon', vertices: vertices.map((vertex) => ({ latitude: vertex.lat, longitude: vertex.lng })) },
    focus: {
      latitude: vertices.reduce((total, vertex) => total + vertex.lat, 0) / vertices.length,
      longitude: vertices.reduce((total, vertex) => total + vertex.lng, 0) / vertices.length,
    },
  };
}

// Toda visualização válida usa o mapa real. A decisão de domínio "ponto dentro" continua exclusiva do servidor.
export function GeofencePreview({ value }: { value: GeofencePreviewShape }): React.JSX.Element {
  const description = describeShape(value);
  const map = mapOf(value);
  if (!map) return <Alert variant="informacao">{description} Complete a geometria para visualizá-la no mapa.</Alert>;
  return <ShapeMap title="Mapa da geocerca" shape={map.shape} focus={map.focus} caption={description} />;
}

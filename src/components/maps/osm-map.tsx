import React, { lazy, Suspense, useMemo } from 'react';
import { useOnlineStatus } from '@/app/use-online-status';
import { Icon, Loading } from '@/design-system';
import type { MapPoint } from './map-types';

// Mapas de visualização (Leaflet + OpenStreetMap, carregados sob demanda). Sem conexão, o mapa dá lugar a um aviso; a alternativa
// em texto traz sempre o ponto e o link para abrir o mapa inteiro.
const MapView = lazy(() => import('./map-view'));

const validPoint = (latitude: number, longitude: number): boolean =>
  Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;

function MapFrame({ title, points, fallback, singleZoom, className }: { title: string; points: readonly MapPoint[]; fallback: { latitude: number; longitude: number; zoom: number }; singleZoom?: number; className?: string }): React.JSX.Element {
  const online = useOnlineStatus();
  if (!online) {
    return (
      <div className={['flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-borda-controle bg-cinza-gelo p-6 text-center tablet:aspect-video', className].filter(Boolean).join(' ')}>
        <span className="text-azul-profundo"><Icon name="mapa" size={32} /></span>
        <p className="text-corpo text-grafite">O mapa precisa de conexão. Os pontos continuam descritos em texto.</p>
      </div>
    );
  }
  return (
    <Suspense fallback={<Loading label="Carregando o mapa…" />}>
      <MapView title={title} points={points} fallback={fallback} {...(singleZoom !== undefined ? { singleZoom } : {})} {...(className ? { className } : {})} />
    </Suspense>
  );
}

// Vários pontos (Visão geral): enquadra todos. Sem pontos, abre na região de `fallback`.
export function PointsMap({ title, points, fallback, className }: { title: string; points: readonly MapPoint[]; fallback: { latitude: number; longitude: number; zoom: number }; className?: string }): React.JSX.Element {
  return <MapFrame title={title} points={points} fallback={fallback} {...(className ? { className } : {})} />;
}

export interface OsmMapProps {
  title: string;
  latitude: number;
  longitude: number;
  zoom?: number;
  // Texto que aparece abaixo do mapa, antes do ponto (por exemplo, "Confira se o marcador está na porta").
  caption?: string;
  className?: string;
}

// Um ponto só (formulário e detalhe da unidade), com o texto do ponto e o link para o mapa completo.
export function OsmMap({ title, latitude, longitude, zoom = 16, caption, className }: OsmMapProps): React.JSX.Element | null {
  const points = useMemo<MapPoint[]>(() => (validPoint(latitude, longitude) ? [{ id: 'ponto', label: title, latitude, longitude }] : []), [title, latitude, longitude]);
  const fallback = useMemo(() => ({ latitude, longitude, zoom }), [latitude, longitude, zoom]);
  if (points.length === 0) return null;
  const linkUrl = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
  return (
    <figure className={['m-0 flex min-w-0 flex-col gap-2', className].filter(Boolean).join(' ')}>
      <MapFrame title={title} points={points} fallback={fallback} singleZoom={zoom} />
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-legenda text-texto-secundario">
        <span>{caption ? `${caption} ` : ''}Ponto: {latitude}, {longitude}</span>
        <a className="font-semibold text-azul-profundo underline" href={linkUrl} target="_blank" rel="noopener noreferrer">Abrir no OpenStreetMap</a>
      </figcaption>
    </figure>
  );
}

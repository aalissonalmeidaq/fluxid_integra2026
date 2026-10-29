import React, { Suspense, lazy } from 'react';
import type { TrackingRoute } from '@/app/tracking/tracking-routes';
import { ErrorState, Loading } from '@/design-system';

// Área do rastreamento (Spec 015): cada tela é um chunk próprio, carregado só quando a rota é aberta; o mapa (Leaflet) continua sob
// demanda dentro da tela. Nada disso entra no pacote de entrada.
const ActiveTripsPage = lazy(() => import('./active-trips-page').then((m) => ({ default: m.ActiveTripsPage })));
const TripTrackingPage = lazy(() => import('./trip-tracking-page').then((m) => ({ default: m.TripTrackingPage })));
const TrackingHistoryPage = lazy(() => import('./tracking-history-page').then((m) => ({ default: m.TrackingHistoryPage })));
const ProximityOccurrencePage = lazy(() => import('./proximity-occurrence-page').then((m) => ({ default: m.ProximityOccurrencePage })));
const EmailCategoriesPage = lazy(() => import('@/pages/settings/email-notification-settings').then((m) => ({ default: m.EmailCategoriesPage })));
const MyDriverTripsPage = lazy(() => import('./my-driver-trips-page').then((m) => ({ default: m.MyDriverTripsPage })));
const ProximityRulePage = lazy(() => import('./proximity-rule-settings').then((m) => ({ default: m.ProximityRulePage })));

function Page({ route }: { route: TrackingRoute }): React.JSX.Element {
  if (route.kind === 'active_trips') return <ActiveTripsPage />;
  if (route.kind === 'trip') return <TripTrackingPage tripId={route.id} />;
  if (route.kind === 'rule') return <ProximityRulePage />;
  if (route.kind === 'email') return <EmailCategoriesPage />;
  if (route.kind === 'history') return <TrackingHistoryPage />;
  if (route.kind === 'occurrence') return <ProximityOccurrencePage occurrenceId={route.id} />;
  if (route.kind === 'driver_trips') return <MyDriverTripsPage />;
  return <ErrorState variant="sem-permissao" title="Página não encontrada" message="Este endereço não existe nesta área." />;
}

export function TrackingArea({ route }: { route: TrackingRoute }): React.JSX.Element {
  return (
    <Suspense fallback={<Loading variant="pagina" busy label="Carregando a página…" />}>
      <Page route={route} />
    </Suspense>
  );
}

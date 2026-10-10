import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { closeModal, isPlainClick, navigateInApp } from '@/app/registry/registry-navigation';
import { resolveTripRoute, type TripRoute } from '@/app/trips/trip-routes';
import { ErrorState, Loading } from '@/design-system';
import { RegistryFormModal } from '@/pages/registry/components/form-modal';

// Cada tela das viagens é um chunk próprio, carregado só quando a rota é aberta; nada disso entra no pacote de entrada.
const TripListPage = lazy(() => import('./trip-list-page').then((m) => ({ default: m.TripListPage })));
const TripDetailPage = lazy(() => import('./trip-detail-page').then((m) => ({ default: m.TripDetailPage })));
const TripFormPage = lazy(() => import('./trip-form-page').then((m) => ({ default: m.TripFormPage })));

// Planejar e editar abrem em modal por cima da lista ou do detalhe (a tela de trás continua montada). O endereço do modal segue
// valendo como link direto: abrir /viagens/nova mostra a lista com o modal aberto.
interface ModalLayer {
  under: React.JSX.Element;
  title: string;
  parent: string;
}

function modalLayer(route: TripRoute): ModalLayer | null {
  if (route.kind === 'new') return { under: <TripListPage />, title: 'Planejar viagem', parent: '/viagens' };
  if (route.kind === 'edit') return { under: <TripDetailPage />, title: 'Editar viagem', parent: `/viagens/${route.id}` };
  return null;
}

const isFormRoute = (route: TripRoute | null): boolean => route !== null && (route.kind === 'new' || route.kind === 'edit');

// Os links de "Planejar" e "Editar" são âncoras comuns (funcionam em nova aba e sem JavaScript); o clique simples abre o modal.
function useModalLinks(): void {
  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      const anchor = event.target.closest('a');
      if (!anchor || !isPlainClick(event, anchor)) return;
      const url = new URL(anchor.href);
      if (!isFormRoute(resolveTripRoute(url.pathname))) return;
      event.preventDefault();
      navigateInApp(`${url.pathname}${url.search}`, { modal: true });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
}

function Page({ route, layer }: { route: TripRoute; layer: ModalLayer | null }): React.JSX.Element {
  if (layer) return layer.under;
  if (route.kind === 'list') return <TripListPage />;
  if (route.kind === 'detail') return <TripDetailPage />;
  return <ErrorState variant="sem-permissao" title="Página não encontrada" message="Este endereço não existe nesta área." />;
}

export function TripsArea({ route }: { route: TripRoute }): React.JSX.Element {
  const layer = modalLayer(route);
  // Depois de salvar, a tela de trás é remontada para mostrar os dados novos.
  const [version, setVersion] = useState(0);
  const fallback = <Loading variant="pagina" busy label="Carregando a página…" />;
  useModalLinks();
  const parent = layer?.parent ?? '/';
  const onClose = useCallback(() => closeModal(parent), [parent]);
  const onNavigate = useCallback((path: string) => {
    setVersion((current) => current + 1);
    navigateInApp(path, { replace: true });
  }, []);

  return (
    <>
      <Suspense fallback={fallback}><div key={version} inert={layer ? true : undefined}><Page route={route} layer={layer} /></div></Suspense>
      {layer && (
        <RegistryFormModal title={layer.title} onClose={onClose} onNavigate={onNavigate}>
          <Suspense fallback={fallback}><TripFormPage /></Suspense>
        </RegistryFormModal>
      )}
    </>
  );
}

import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { closeModal, isPlainClick, navigateInApp } from '@/app/registry/registry-navigation';
import { type RegistryRoute, resolveRegistryRoute } from '@/app/registry/registry-routes';
import { ErrorState, Loading } from '@/design-system';
import { RegistryFormModal } from './components/form-modal';

// Cada tela dos cadastros é um chunk próprio, carregado só quando a rota é aberta (RF-047); nada disso entra no pacote de entrada.
// Cada história registra aqui o `React.lazy` da sua tela no mesmo passo em que a cria (US1 e US2: clientes e unidades;
// US3: geocercas; US4: veículos; US5: motoristas), de modo que `typecheck` e `build` nunca dependem de página inexistente.
const CustomerListPage = lazy(() => import('./customers/customer-list-page').then((m) => ({ default: m.CustomerListPage })));
const CustomerDetailPage = lazy(() => import('./customers/customer-detail-page').then((m) => ({ default: m.CustomerDetailPage })));
const SiteDetailPage = lazy(() => import('./customers/site-detail-page').then((m) => ({ default: m.SiteDetailPage })));
const CustomerFormPage = lazy(() => import('./customers/customer-form-page').then((m) => ({ default: m.CustomerFormPage })));
const SiteFormPage = lazy(() => import('./customers/site-form-page').then((m) => ({ default: m.SiteFormPage })));

const GeofenceListPage = lazy(() => import('./geofences/geofence-list-page').then((m) => ({ default: m.GeofenceListPage })));
const GeofenceDetailPage = lazy(() => import('./geofences/geofence-detail-page').then((m) => ({ default: m.GeofenceDetailPage })));
const GeofenceFormPage = lazy(() => import('./geofences/geofence-form-page').then((m) => ({ default: m.GeofenceFormPage })));

const VehicleListPage = lazy(() => import('./vehicles/vehicle-list-page').then((m) => ({ default: m.VehicleListPage })));
const VehicleDetailPage = lazy(() => import('./vehicles/vehicle-detail-page').then((m) => ({ default: m.VehicleDetailPage })));
const VehicleFormPage = lazy(() => import('./vehicles/vehicle-form-page').then((m) => ({ default: m.VehicleFormPage })));

const DriverListPage = lazy(() => import('./drivers/driver-list-page').then((m) => ({ default: m.DriverListPage })));
const DriverDetailPage = lazy(() => import('./drivers/driver-detail-page').then((m) => ({ default: m.DriverDetailPage })));
const DriverFormPage = lazy(() => import('./drivers/driver-form-page').then((m) => ({ default: m.DriverFormPage })));

// Cadastro e edição abrem em modal por cima da lista ou do detalhe (a tela de trás continua montada). O endereço do modal segue
// valendo como link direto: abrir /clientes/novo mostra a lista com o modal aberto.
interface ModalLayer {
  under: React.JSX.Element;
  form: React.JSX.Element;
  title: string;
  parent: string;
}

function modalLayer(route: RegistryRoute): ModalLayer | null {
  switch (route.area) {
    case 'customers':
      if (route.kind === 'new') return { under: <CustomerListPage />, form: <CustomerFormPage />, title: 'Cadastrar cliente', parent: '/clientes' };
      if (route.kind === 'edit') return { under: <CustomerDetailPage />, form: <CustomerFormPage />, title: 'Editar cliente', parent: `/clientes/${route.id}` };
      if (route.kind === 'site_new') return { under: <CustomerDetailPage />, form: <SiteFormPage />, title: 'Cadastrar unidade', parent: `/clientes/${route.customerId}` };
      if (route.kind === 'site_edit') {
        return { under: <SiteDetailPage />, form: <SiteFormPage />, title: 'Editar unidade', parent: `/clientes/${route.customerId}/unidades/${route.siteId}` };
      }
      return null;
    case 'geofences':
      if (route.kind === 'new') return { under: <GeofenceListPage />, form: <GeofenceFormPage />, title: 'Cadastrar geocerca', parent: '/geocercas' };
      if (route.kind === 'edit') return { under: <GeofenceDetailPage />, form: <GeofenceFormPage />, title: 'Editar geocerca', parent: `/geocercas/${route.id}` };
      return null;
    case 'vehicles':
      if (route.kind === 'new') return { under: <VehicleListPage />, form: <VehicleFormPage />, title: 'Cadastrar veículo', parent: '/veiculos' };
      if (route.kind === 'edit') return { under: <VehicleDetailPage />, form: <VehicleFormPage />, title: 'Editar veículo', parent: `/veiculos/${route.id}` };
      return null;
    case 'drivers':
      if (route.kind === 'new') return { under: <DriverListPage />, form: <DriverFormPage />, title: 'Cadastrar motorista', parent: '/motoristas' };
      if (route.kind === 'edit') return { under: <DriverDetailPage />, form: <DriverFormPage />, title: 'Editar motorista', parent: `/motoristas/${route.id}` };
      return null;
    default:
      return null;
  }
}

const isFormRoute = (route: RegistryRoute | null): boolean => route !== null && ['new', 'edit', 'site_new', 'site_edit'].includes(route.kind);

// Os links de "Cadastrar" e "Editar" são âncoras comuns (funcionam em nova aba e sem JavaScript); o clique simples abre o
// modal sem recarregar a página.
function useModalLinks(): void {
  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      const anchor = event.target.closest('a');
      if (!anchor || !isPlainClick(event, anchor)) return;
      const url = new URL(anchor.href);
      if (!isFormRoute(resolveRegistryRoute(url.pathname))) return;
      event.preventDefault();
      navigateInApp(`${url.pathname}${url.search}`, { modal: true });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
}

// A tela de trás (ou a tela inteira, fora de um modal) de cada rota. É sempre o mesmo elemento na mesma posição, para a lista não
// ser remontada, nem perder a rolagem, quando o modal abre por cima dela.
function Page({ route, layer }: { route: RegistryRoute; layer: ModalLayer | null }): React.JSX.Element {
  if (layer) return layer.under;
  if (route.area === 'customers') {
    if (route.kind === 'list') return <CustomerListPage />;
    if (route.kind === 'detail') return <CustomerDetailPage />;
    if (route.kind === 'site_detail') return <SiteDetailPage />;
  }
  if (route.area === 'geofences') {
    if (route.kind === 'list') return <GeofenceListPage />;
    if (route.kind === 'detail') return <GeofenceDetailPage />;
  }
  if (route.area === 'vehicles') {
    if (route.kind === 'list') return <VehicleListPage />;
    if (route.kind === 'detail') return <VehicleDetailPage />;
  }
  if (route.area === 'drivers') {
    if (route.kind === 'list') return <DriverListPage />;
    if (route.kind === 'detail') return <DriverDetailPage />;
  }
  return <ErrorState variant="sem-permissao" title="Página não encontrada" message="Este endereço não existe nesta área." />;
}

export function RegistryArea({ route }: { route: RegistryRoute }): React.JSX.Element {
  const layer = modalLayer(route);
  // Depois de salvar uma edição, a tela de trás é remontada para mostrar os dados novos.
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
          <Suspense fallback={fallback}>{layer.form}</Suspense>
        </RegistryFormModal>
      )}
    </>
  );
}

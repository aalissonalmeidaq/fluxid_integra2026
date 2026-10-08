import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionsContext, type PermissionsContextValue } from '@/app/navigation/permissions-context';
import type { MapPoint } from '@/components/maps/map-types';
import type { ActorPermissions } from '@/domain/navigation/visible-screens';
import { MapBlock } from './map-block';

// O mapa da Visão geral mostra as unidades reais só para quem tem `customer.read`; sem a permissão (ou sem o serviço), mostra a
// região de exemplo, marcada como "Exemplo".

const registry = vi.hoisted(() => ({ current: { service: null as unknown, organizationId: '' } }));
vi.mock('@/pages/registry/use-registry-service', () => ({ useRegistryService: () => registry.current }));

const mapa = vi.hoisted(() => ({ calls: [] as Array<{ title: string; points: readonly MapPoint[] }> }));
vi.mock('@/components/maps/osm-map', () => ({
  PointsMap: (props: { title: string; points: readonly MapPoint[] }) => {
    mapa.calls.push({ title: props.title, points: props.points });
    return <div role="group" aria-label={props.title} data-points={props.points.length} />;
  },
}));

const withPermissions = (tenant: string[]): PermissionsContextValue => ({
  status: 'ready', retry: () => undefined, permissions: { tenant, platform: [] } as unknown as ActorPermissions,
});
const renderBlock = (value: PermissionsContextValue) => render(<PermissionsContext.Provider value={value}><MapBlock /></PermissionsContext.Provider>);
const POINT = { id: 's1', name: 'Matriz', customerId: 'c1', customerName: 'Hospital Alfa', city: 'Recife', state: 'PE', latitude: -8, longitude: -35, confirmed: true };

describe('MapBlock', () => {
  beforeEach(() => {
    mapa.calls.length = 0;
    registry.current = { service: null, organizationId: '' };
  });

  it('sem a permissão de ler clientes mostra a região de exemplo, marcada como exemplo, e nunca consulta o servidor', async () => {
    const listSitePoints = vi.fn();
    registry.current = { service: { listSitePoints }, organizationId: 'org-a' };
    renderBlock(withPermissions(['cylinder.read']));
    expect(await screen.findByRole('group', { name: 'Mapa da região de exemplo' })).toBeInTheDocument();
    expect(screen.getByText('Exemplo')).toBeInTheDocument();
    expect(listSitePoints).not.toHaveBeenCalled();
  });

  it('com a permissão mas sem serviço (ou sem organização ativa), também mostra o exemplo', async () => {
    registry.current = { service: null, organizationId: 'org-a' };
    const { unmount } = renderBlock(withPermissions(['customer.read']));
    expect(await screen.findByRole('group', { name: 'Mapa da região de exemplo' })).toBeInTheDocument();
    unmount();
    registry.current = { service: { listSitePoints: vi.fn() }, organizationId: '' };
    renderBlock(withPermissions(['customer.read']));
    expect(await screen.findByRole('group', { name: 'Mapa da região de exemplo' })).toBeInTheDocument();
  });

  it('com permissões ainda não carregadas conta como sem permissão', async () => {
    registry.current = { service: { listSitePoints: vi.fn() }, organizationId: 'org-a' };
    renderBlock({ status: 'loading', permissions: null, retry: () => undefined });
    expect(await screen.findByRole('group', { name: 'Mapa da região de exemplo' })).toBeInTheDocument();
  });

  it('com a permissão mostra as unidades reais, sem a marca de exemplo, com a lista em texto', async () => {
    const listSitePoints = vi.fn(async () => ({ kind: 'success' as const, value: { items: [POINT, { ...POINT, id: 's2', name: 'Filial', confirmed: false }], total: 2 } }));
    registry.current = { service: { listSitePoints }, organizationId: 'org-a' };
    renderBlock(withPermissions(['customer.read']));
    expect(await screen.findByRole('group', { name: 'Mapa das unidades dos clientes' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/2 unidades com coordenadas/)).toBeInTheDocument());
    expect(listSitePoints).toHaveBeenCalledWith('org-a');
    expect(screen.queryByText('Exemplo')).not.toBeInTheDocument();
    const points = mapa.calls.at(-1)?.points ?? [];
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({ label: 'Matriz', confirmed: true, href: '/clientes/c1/unidades/s1', details: ['Hospital Alfa', 'Recife/PE', 'Coordenadas confirmadas'] });
    expect(points[1]?.details?.[2]).toBe('Coordenadas sem confirmação');
    expect(screen.getByRole('link', { name: 'Matriz' })).toHaveAttribute('href', '/clientes/c1/unidades/s1');
  });

  it('uma unidade só usa o singular e mais unidades que o limite informam o total', async () => {
    const um = vi.fn(async () => ({ kind: 'success' as const, value: { items: [POINT], total: 1 } }));
    registry.current = { service: { listSitePoints: um }, organizationId: 'org-a' };
    const { unmount } = renderBlock(withPermissions(['customer.read']));
    expect(await screen.findByText(/1 unidade com coordenadas/)).toBeInTheDocument();
    unmount();
    const muitas = vi.fn(async () => ({ kind: 'success' as const, value: { items: [POINT], total: 800 } }));
    registry.current = { service: { listSitePoints: muitas }, organizationId: 'org-a' };
    renderBlock(withPermissions(['customer.read']));
    expect(await screen.findByText('Mostrando 1 de 800 unidades com coordenadas.')).toBeInTheDocument();
  });

  it('sem unidades com coordenadas orienta o cadastro e não mostra a lista', async () => {
    const vazio = vi.fn(async () => ({ kind: 'success' as const, value: { items: [], total: 0 } }));
    registry.current = { service: { listSitePoints: vazio }, organizationId: 'org-a' };
    renderBlock(withPermissions(['customer.read']));
    expect(await screen.findByText(/Nenhuma unidade com coordenadas ainda/)).toBeInTheDocument();
    expect(screen.queryByText('Lista das unidades no mapa')).not.toBeInTheDocument();
  });

  it('falha ao carregar mostra o erro e "Tentar de novo" consulta outra vez', async () => {
    const listSitePoints = vi.fn()
      .mockResolvedValueOnce({ kind: 'unavailable' })
      .mockResolvedValueOnce({ kind: 'success', value: { items: [POINT], total: 1 } });
    registry.current = { service: { listSitePoints }, organizationId: 'org-a' };
    renderBlock(withPermissions(['customer.read']));
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText(/1 unidade com coordenadas/)).toBeInTheDocument();
    expect(listSitePoints).toHaveBeenCalledTimes(2);
  });

  it('descarta a resposta de uma consulta que terminou depois de o bloco ser desmontado', async () => {
    let resolver: (value: unknown) => void = () => undefined;
    const listSitePoints = vi.fn(() => new Promise((resolve) => { resolver = resolve; }));
    registry.current = { service: { listSitePoints }, organizationId: 'org-a' };
    const { unmount } = renderBlock(withPermissions(['customer.read']));
    unmount();
    resolver({ kind: 'success', value: { items: [POINT], total: 1 } });
    await Promise.resolve();
    expect(mapa.calls.every((call) => call.points.length === 0)).toBe(true);
  });
});

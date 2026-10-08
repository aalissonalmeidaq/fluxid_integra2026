import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryService } from '@/application/registry/registry-service';
import type { GeofenceListItem } from '@/application/registry/registry-views';
import { GeofenceListView } from './geofence-list-page';

const ORG = '20000000-0000-4000-8000-00000000000a';

const item = (n: number, over: Partial<GeofenceListItem> = {}): GeofenceListItem => ({
  id: `84000000-0000-4000-8000-${String(n).padStart(12, '0')}`, name: `Geocerca ${n}`, shape: n % 2 ? 'circle' : 'polygon', status: 'active', siteId: '82000000-0000-4000-8000-000000000001',
  siteName: 'Matriz', customerId: '81000000-0000-4000-8000-000000000001', customerName: 'Hospital Teste', ...over,
});

function fakeService(page: { items: GeofenceListItem[]; total: number; next: string | null } | Record<string, unknown>) {
  const result = 'items' in page ? { kind: 'success', value: page } : page;
  return {
    listGeofences: vi.fn(async () => result),
    listCustomers: vi.fn(async () => ({ kind: 'success', value: { items: [{ id: '81000000-0000-4000-8000-000000000001', legalName: 'Hospital Teste' }], total: 1, next: null } })),
  } as unknown as RegistryService & Record<'listGeofences' | 'listCustomers', ReturnType<typeof vi.fn>>;
}

describe('lista de geocercas (história 3)', () => {
  it('mostra o total, a forma e a situação em texto, com links para unidade e cliente', async () => {
    render(<GeofenceListView organizationId={ORG} service={fakeService({ items: [item(1), item(2, { status: 'inactive' })], total: 2, next: null })} />);
    expect(await screen.findByText('2 geocercas encontradas')).toHaveAttribute('role', 'status');
    const table = screen.getByRole('table', { name: 'Geocercas da organização' });
    expect(within(table).getByText('Círculo')).toBeInTheDocument();
    expect(within(table).getByText('Polígono')).toBeInTheDocument();
    expect(within(table).getByText(/Inativo/)).toBeInTheDocument();
    expect(within(table).getAllByRole('link', { name: 'Matriz' })[0]).toHaveAttribute('href', expect.stringMatching(/\/unidades\//));
  });

  it('busca e filtros (forma, situação e cliente) chamam o serviço', async () => {
    const service = fakeService({ items: [item(1)], total: 1, next: null });
    render(<GeofenceListView organizationId={ORG} service={service} />);
    await screen.findByRole('link', { name: 'Geocerca 1' });
    fireEvent.change(screen.getByLabelText('Buscar geocerca'), { target: { value: 'portão' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(service.listGeofences).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ search: 'portão', status: 'active', limit: 25 })));
    fireEvent.change(screen.getByLabelText('Forma'), { target: { value: 'polygon' } });
    fireEvent.change(screen.getByLabelText('Situação cadastral'), { target: { value: 'all' } });
    await screen.findByRole('option', { name: 'Hospital Teste' });
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: '81000000-0000-4000-8000-000000000001' } });
    await waitFor(() => expect(service.listGeofences).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ shape: 'polygon', status: 'all', customerId: '81000000-0000-4000-8000-000000000001' })));
  });

  it('"Mostrar mais" usa o cursor e mantém os filtros', async () => {
    const service = fakeService({ items: [item(1)], total: 2, next: 'c2' });
    render(<GeofenceListView organizationId={ORG} service={service} />);
    await screen.findByRole('link', { name: 'Geocerca 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar mais geocercas' }));
    await waitFor(() => expect(service.listGeofences).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ cursor: 'c2', status: 'active' })));
  });

  it('estado vazio orienta a criar pela unidade; erro e sem serviço têm estados próprios', async () => {
    const { unmount } = render(<GeofenceListView organizationId={ORG} service={fakeService({ items: [], total: 0, next: null })} />);
    expect(await screen.findByText('Nenhuma geocerca encontrada')).toBeInTheDocument();
    expect(screen.getByText(/Crie a primeira pelo detalhe de uma unidade/)).toBeInTheDocument();
    unmount();
    const failing = render(<GeofenceListView organizationId={ORG} service={fakeService({ kind: 'unavailable' })} />);
    expect(await screen.findByText('Não foi possível carregar geocercas')).toBeInTheDocument();
    failing.unmount();
    render(<GeofenceListView organizationId={ORG} service={null} />);
    expect(screen.getByText('Conexão indisponível')).toBeInTheDocument();
  });
});

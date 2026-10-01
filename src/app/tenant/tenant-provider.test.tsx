import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AuthContext, type AuthContextValue } from '@/app/auth/auth-context';
import { ConnectivityContext, initialResult, type ConnectivityContextValue } from '@/app/connectivity-context';
import { useSync } from '@/app/sync-context';
import type { AuthState } from '@/domain/identity/session';
import type { MembershipRecord } from '@/domain/identity/tenant-selection';
import { TenantContextService } from '@/application/identity/tenant-context-service';
import { TenantProvider } from './tenant-provider';
import { useTenant } from './tenant-context';

const A = '20000000-0000-0000-0000-00000000000a';
const B = '20000000-0000-0000-0000-00000000000b';

const membership = (organizationId: string, name: string, over: Partial<MembershipRecord> = {}): MembershipRecord => ({
  membershipId: `m-${name}`, organizationId, membershipStatus: 'active',
  organization: { id: organizationId, kind: 'tenant', status: 'active', displayName: name }, ...over,
});

function makeService(records: MembershipRecord[]) {
  const state = { records };
  const database = { lock: vi.fn(), unlock: vi.fn(), activeTenant: '' };
  const service = new TenantContextService({
    database: {
      lock: () => { database.lock(); database.activeTenant = ''; },
      unlock: (id: string) => { database.unlock(id); database.activeTenant = id; },
      get activeTenant() { return database.activeTenant; },
    } as never,
    fetchMemberships: async () => state.records,
  });
  return { service, state, database };
}

function Probe() {
  const tenant = useTenant();
  const { createRunner, resolving } = useSync();
  return (
    <div>
      <span data-testid="status">{tenant.status}</span>
      <span data-testid="selection">{tenant.selection.kind}</span>
      <span data-testid="active">{tenant.activeOrganizationId ?? 'nenhum'}</span>
      <span data-testid="switching">{String(tenant.switching)}</span>
      <span data-testid="options">{tenant.options.map((option) => option.displayName).join('|')}</span>
      <span data-testid="runner">{createRunner ? 'sim' : 'não'}</span>
      <span data-testid="resolving">{String(resolving)}</span>
      <button onClick={() => void tenant.select(A)}>escolher A</button>
      <button onClick={() => void tenant.select(B)}>escolher B</button>
      <button onClick={tenant.beginSwitch}>trocar</button>
      <button onClick={tenant.cancelSwitch}>cancelar</button>
      <button onClick={() => void tenant.reload()}>recarregar</button>
    </div>
  );
}

const connectivity: ConnectivityContextValue = { result: { ...initialResult, state: 'connected' }, client: null, config: null, reconnect: vi.fn(), reportOperationalError: vi.fn() };
const authValue = (state: AuthState): AuthContextValue => ({ state, login: vi.fn(), logout: vi.fn(), confirmMfa: vi.fn(), verifySession: vi.fn(async () => true), mfa: null });
const authenticated: AuthState = { status: 'authenticated', aal: 'aal1' };

function renderProvider(service: TenantContextService | null, state: AuthState = authenticated, extra: { refreshMs?: number } = {}) {
  const runners = new Map<string, () => never>();
  const createRunnerFor = vi.fn((organizationId: string) => {
    if (!runners.has(organizationId)) runners.set(organizationId, (() => ({ run: async () => ({ state: 'ready' as const }) })) as never);
    return runners.get(organizationId)!;
  });
  const tree = (value: AuthState) => (
    <ConnectivityContext.Provider value={connectivity}>
      <AuthContext.Provider value={authValue(value)}>
        <TenantProvider service={service} createRunnerFor={createRunnerFor} {...extra}><Probe /></TenantProvider>
      </AuthContext.Provider>
    </ConnectivityContext.Provider>
  );
  const view = render(tree(state));
  return { ...view, createRunnerFor, rerenderWith: (value: AuthState) => view.rerender(tree(value)) };
}

const text = (id: string) => screen.getByTestId(id).textContent;
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('TenantProvider', () => {
  it('sem sessão autenticada permanece ocioso e não consulta vínculos', async () => {
    const { service } = makeService([membership(A, 'Tenant A')]);
    const load = vi.spyOn(service, 'load');
    renderProvider(service, { status: 'signed_out' });
    await flush();
    expect(load).not.toHaveBeenCalled();
    expect(text('status')).toBe('idle');
    expect(text('runner')).toBe('não');
  });

  it('sinaliza a resolução do tenant ao SyncGate: ativa enquanto carrega e inativa ao resolver, sair ou sem serviço', async () => {
    const { service } = makeService([membership(A, 'Tenant A'), membership(B, 'Tenant B')]);
    const { rerenderWith } = renderProvider(service);
    expect(text('resolving')).toBe('true');
    await flush();
    expect(text('resolving')).toBe('false');
    rerenderWith({ status: 'signed_out' });
    await flush();
    expect(text('resolving')).toBe('false');
  });

  it('não sinaliza resolução sem sessão autenticada nem sem serviço', async () => {
    renderProvider(null);
    await flush();
    expect(text('resolving')).toBe('false');
  });

  it('com um único vínculo seleciona sozinho e disponibiliza o executor de sincronização do tenant', async () => {
    const { service } = makeService([membership(A, 'Tenant A')]);
    const { createRunnerFor } = renderProvider(service);
    expect(text('status')).toBe('loading');
    await flush();
    expect(text('status')).toBe('ready');
    expect(text('active')).toBe(A);
    expect(text('runner')).toBe('sim');
    expect(createRunnerFor).toHaveBeenCalledWith(A);
  });

  it('com mais de um vínculo exige escolha e não oferece executor sem tenant ativo', async () => {
    const { service } = makeService([membership(A, 'Tenant A'), membership(B, 'Tenant B')]);
    renderProvider(service);
    await flush();
    expect(text('selection')).toBe('choose');
    expect(text('active')).toBe('nenhum');
    expect(text('runner')).toBe('não');
  });

  it('seleciona o tenant escolhido, encerra o modo de troca e troca o executor para o novo contexto', async () => {
    const { service } = makeService([membership(A, 'Tenant A'), membership(B, 'Tenant B')]);
    const { createRunnerFor } = renderProvider(service);
    await flush();
    fireEvent.click(screen.getByText('escolher A'));
    await flush();
    fireEvent.click(screen.getByText('trocar'));
    expect(text('switching')).toBe('true');
    fireEvent.click(screen.getByText('escolher B'));
    await flush();
    expect(text('active')).toBe(B);
    expect(text('switching')).toBe('false');
    expect(createRunnerFor).toHaveBeenCalledWith(A);
    expect(createRunnerFor).toHaveBeenCalledWith(B);
  });

  it('expõe as opções elegíveis para oferecer a troca de organização e as limpa ao sair', async () => {
    const { service } = makeService([membership(A, 'Tenant A'), membership(B, 'Tenant B')]);
    const { rerenderWith } = renderProvider(service);
    await flush();
    fireEvent.click(screen.getByText('escolher A'));
    await flush();
    expect(text('options')).toBe('Tenant A|Tenant B');
    rerenderWith({ status: 'signed_out' });
    await flush();
    expect(text('options')).toBe('');
  });

  it('cancelar a troca mantém o tenant ativo', async () => {
    const { service } = makeService([membership(A, 'Tenant A')]);
    renderProvider(service);
    await flush();
    fireEvent.click(screen.getByText('trocar'));
    fireEvent.click(screen.getByText('cancelar'));
    expect(text('switching')).toBe('false');
    expect(text('active')).toBe(A);
  });

  it('não muda de tenant e mantém o modo de troca quando a seleção é recusada', async () => {
    const { service, state } = makeService([membership(A, 'Tenant A'), membership(B, 'Tenant B')]);
    renderProvider(service);
    await flush();
    fireEvent.click(screen.getByText('escolher A'));
    await flush();
    fireEvent.click(screen.getByText('trocar'));
    state.records = [membership(A, 'Tenant A'), membership(B, 'Tenant B', { membershipStatus: 'blocked' })];
    fireEvent.click(screen.getByText('escolher B'));
    await flush();
    expect(text('active')).toBe(A);
    expect(text('switching')).toBe('true');
  });

  it('encerrar a sessão libera o contexto e a base local', async () => {
    const { service, database } = makeService([membership(A, 'Tenant A')]);
    const { rerenderWith } = renderProvider(service);
    await flush();
    expect(text('active')).toBe(A);
    rerenderWith({ status: 'signed_out', notice: 'signed_out' });
    await flush();
    expect(text('active')).toBe('nenhum');
    expect(text('runner')).toBe('não');
    expect(database.activeTenant).toBe('');
  });

  it('reavalia periodicamente e descarta o tenant que deixou de ser elegível', async () => {
    const { service, state } = makeService([membership(A, 'Tenant A')]);
    renderProvider(service, authenticated, { refreshMs: 1000 });
    await flush();
    state.records = [membership(A, 'Tenant A', { organization: { id: A, kind: 'tenant', status: 'suspended', displayName: 'Tenant A' } })];
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(text('active')).toBe('nenhum');
    expect(text('selection')).toBe('none');
  });

  it('recarregar sob demanda reaplica a elegibilidade', async () => {
    const { service, state } = makeService([membership(A, 'Tenant A')]);
    renderProvider(service);
    await flush();
    state.records = [];
    fireEvent.click(screen.getByText('recarregar'));
    await flush();
    expect(text('selection')).toBe('none');
  });

  it('sinaliza erro quando a consulta de vínculos falha, sem conceder contexto', async () => {
    const failing = new TenantContextService({ database: { lock: vi.fn(), unlock: vi.fn(), activeTenant: '' } as never, fetchMemberships: async () => { throw new Error('offline'); } });
    renderProvider(failing);
    await flush();
    expect(text('status')).toBe('error');
    expect(text('active')).toBe('nenhum');
  });

  it('sem serviço (destino indisponível) não concede contexto', async () => {
    renderProvider(null);
    await flush();
    expect(text('active')).toBe('nenhum');
    expect(text('runner')).toBe('não');
  });
});

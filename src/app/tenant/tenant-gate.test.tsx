import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { TenantContext, type TenantContextValue } from './tenant-context';
import { TenantGate } from './tenant-gate';
import { TenantIndicator } from './tenant-indicator';

const A = '20000000-0000-0000-0000-00000000000a';
const B = '20000000-0000-0000-0000-00000000000b';
const optionA = { organizationId: A, displayName: 'Tenant A', kind: 'tenant' as const };
const optionB = { organizationId: B, displayName: 'Tenant B', kind: 'tenant' as const };

function value(over: Partial<TenantContextValue> = {}): TenantContextValue {
  return {
    status: 'ready', selection: { kind: 'selected', option: optionA }, options: [optionA], activeOrganizationId: A, switching: false,
    select: vi.fn(async () => ({ ok: true as const, snapshot: { status: 'ready' as const, selection: { kind: 'selected' as const, option: optionA }, options: [optionA], activeOrganizationId: A } })),
    beginSwitch: vi.fn(), cancelSwitch: vi.fn(), reload: vi.fn(async () => undefined), ...over,
  };
}

const renderGate = (ctx: TenantContextValue, child = <p>Área do tenant</p>) =>
  render(<TenantContext.Provider value={ctx}><TenantGate>{child}</TenantGate></TenantContext.Provider>);

describe('TenantGate', () => {
  it.each(['idle', 'loading'] as const)('não libera a área enquanto os acessos estão %s e informa o andamento', (status) => {
    renderGate(value({ status, selection: { kind: 'none' }, activeOrganizationId: null, options: [] }));
    expect(screen.queryByText('Área do tenant')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/verificando seus acessos/i);
  });

  it('em erro bloqueia, anuncia e oferece nova tentativa', () => {
    const ctx = value({ status: 'error', selection: { kind: 'none' }, activeOrganizationId: null, options: [] });
    renderGate(ctx);
    expect(screen.getByRole('alert')).toHaveTextContent(/não foi possível confirmar seus acessos/i);
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(ctx.reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Área do tenant')).not.toBeInTheDocument();
  });

  it('sem vínculo elegível nega o acesso com orientação e não libera a área', () => {
    renderGate(value({ selection: { kind: 'none' }, activeOrganizationId: null, options: [] }));
    expect(screen.getByRole('alert')).toHaveTextContent(/nenhum acesso ativo/i);
    expect(screen.queryByText('Área do tenant')).not.toBeInTheDocument();
  });

  it('com mais de um vínculo exige a escolha antes da área', () => {
    renderGate(value({ selection: { kind: 'choose', options: [optionA, optionB] }, options: [optionA, optionB], activeOrganizationId: null }));
    expect(screen.getByRole('heading', { name: 'Escolha a organização' })).toBeInTheDocument();
    expect(screen.queryByText('Área do tenant')).not.toBeInTheDocument();
  });

  it('libera a área do tenant selecionado', () => {
    renderGate(value());
    expect(screen.getByText('Área do tenant')).toBeInTheDocument();
  });

  it('durante a troca voluntária esconde a área do tenant atual e permite cancelar', () => {
    const ctx = value({ switching: true, options: [optionA, optionB] });
    renderGate(ctx);
    expect(screen.queryByText('Área do tenant')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(ctx.cancelSwitch).toHaveBeenCalledTimes(1);
  });

  it('remonta a área ao trocar de tenant, descartando o estado do contexto anterior', () => {
    function Counter() {
      const [count, setCount] = useState(0);
      return <button onClick={() => setCount((current) => current + 1)}>cliques: {count}</button>;
    }
    const view = renderGate(value(), <Counter />);
    fireEvent.click(screen.getByRole('button', { name: /cliques/ }));
    expect(screen.getByRole('button', { name: 'cliques: 1' })).toBeInTheDocument();
    const next = value({ activeOrganizationId: B, selection: { kind: 'selected', option: optionB }, options: [optionA, optionB] });
    view.rerender(<TenantContext.Provider value={next}><TenantGate><Counter /></TenantGate></TenantContext.Provider>);
    expect(screen.getByRole('button', { name: 'cliques: 0' })).toBeInTheDocument();
  });
});

describe('TenantIndicator', () => {
  const renderIndicator = (ctx: TenantContextValue) => render(<TenantContext.Provider value={ctx}><TenantIndicator /></TenantContext.Provider>);

  it('não aparece sem tenant ativo', () => {
    const { container } = renderIndicator(value({ activeOrganizationId: null, selection: { kind: 'none' }, options: [] }));
    expect(container).toBeEmptyDOMElement();
  });

  it('identifica a organização ativa em texto', () => {
    renderIndicator(value());
    expect(screen.getByText('Tenant A')).toBeInTheDocument();
    expect(screen.getByText(/organização ativa/i)).toBeInTheDocument();
  });

  it('com um único vínculo não oferece troca', () => {
    renderIndicator(value());
    expect(screen.queryByRole('button', { name: /trocar organização/i })).not.toBeInTheDocument();
  });

  it('com mais de um vínculo oferece a troca com alvo de 44 px', () => {
    const ctx = value({ options: [optionA, optionB] });
    renderIndicator(ctx);
    const button = screen.getByRole('button', { name: /trocar organização/i });
    expect(button.className).toMatch(/min-h-(11|alvo)/);
    fireEvent.click(button);
    expect(ctx.beginSwitch).toHaveBeenCalledTimes(1);
  });
});

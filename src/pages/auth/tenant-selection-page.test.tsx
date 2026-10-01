import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SelectResult } from '@/application/identity/tenant-context-service';
import type { TenantOption } from '@/domain/identity/tenant-selection';
import { TenantSelectionView } from './tenant-selection-page';

const A = '20000000-0000-0000-0000-00000000000a';
const OWNER = '20000000-0000-0000-0000-000000000001';
const options: TenantOption[] = [
  { organizationId: OWNER, displayName: 'FluxID', kind: 'owner' },
  { organizationId: A, displayName: 'Tenant A', kind: 'tenant' },
];
const snapshot = { status: 'ready', selection: { kind: 'none' }, options, activeOrganizationId: null } as const;
const success = (): SelectResult => ({ ok: true, snapshot });

function renderView(onSelect = vi.fn(async () => success()), extra: { onCancel?: () => void; currentOrganizationId?: string | null } = {}) {
  render(<TenantSelectionView options={options} onSelect={onSelect} {...extra} />);
  return { onSelect };
}

describe('TenantSelectionView', () => {
  it('apresenta o título como foco inicial e uma ação por organização, sem expor identificadores', () => {
    renderView();
    const heading = screen.getByRole('heading', { level: 2, name: 'Escolha a organização' });
    expect(heading).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Entrar em Tenant A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar em FluxID' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(A);
    expect(document.body.textContent).not.toContain(OWNER);
  });

  it('identifica a organização proprietária por texto e não só por posição ou cor', () => {
    renderView();
    expect(screen.getByText(/plataforma FluxID/i)).toBeInTheDocument();
    expect(screen.getByText(/organização contratante/i)).toBeInTheDocument();
  });

  it('envia a escolha e informa o andamento sem permitir escolha dupla', async () => {
    let release!: (result: SelectResult) => void;
    const onSelect = vi.fn(() => new Promise<SelectResult>((resolve) => { release = resolve; }));
    renderView(onSelect);
    fireEvent.click(screen.getByRole('button', { name: 'Entrar em Tenant A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Entrar em Tenant A' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(A);
    expect(screen.getByRole('status')).toHaveTextContent(/confirmando seu acesso/i);
    expect(screen.getByRole('button', { name: 'Entrar em FluxID' })).toBeDisabled();
    release(success());
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it.each([
    ['not_eligible', /não está mais disponível/i],
    ['unavailable', /não foi possível confirmar/i],
    ['switch_failed', /trocar de organização com segurança/i],
  ] as const)('anuncia %s como alerta e devolve o foco a ele', async (reason, text) => {
    renderView(vi.fn(async () => ({ ok: false, reason }) as SelectResult));
    fireEvent.click(screen.getByRole('button', { name: 'Entrar em Tenant A' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Entrar em Tenant A' })).toBeEnabled();
  });

  it('só oferece cancelar quando já existe um tenant ativo para manter', () => {
    renderView();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it('cancelar mantém o tenant atual e marca a organização atual em texto', () => {
    const onCancel = vi.fn();
    renderView(undefined, { onCancel, currentOrganizationId: A });
    expect(screen.getByText(/organização atual/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('não repete a seleção da organização atual', () => {
    const { onSelect } = renderView(undefined, { onCancel: vi.fn(), currentOrganizationId: A });
    expect(screen.getByRole('button', { name: 'Entrar em Tenant A' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar em Tenant A' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('usa alvos de toque de 44 px', () => {
    renderView();
    for (const button of screen.getAllByRole('button')) expect(button.className).toMatch(/min-h-(11|alvo)/);
  });

  it('trata exceção da seleção como indisponível, sem travar a tela', async () => {
    renderView(vi.fn(async () => { throw new Error('boom'); }));
    fireEvent.click(screen.getByRole('button', { name: 'Entrar em Tenant A' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível confirmar/i);
    expect(screen.getByRole('button', { name: 'Entrar em Tenant A' })).toBeEnabled();
  });
});

// Spec 003: apresentação no padrão do design system, sem mudar a seleção nem a limpeza do contexto anterior.
describe('TenantSelectionView: apresentação (Spec 003)', () => {
  it('lista as organizações em cartões da lista do padrão, cada uma operável pelo teclado', () => {
    renderView();
    const list = screen.getByRole('list', { name: 'Organizações disponíveis' });
    expect(list).toHaveAttribute('data-variant', 'cartoes');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    for (const button of screen.getAllByRole('button')) expect(button.tagName).toBe('BUTTON');
  });

  it('a falha de seleção usa o alerta de erro do padrão, com ícone e foco', async () => {
    renderView(vi.fn(async () => ({ ok: false, reason: 'unavailable' }) as SelectResult));
    fireEvent.click(screen.getByRole('button', { name: 'Entrar em Tenant A' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-variant', 'erro');
    expect(alert.querySelector('svg')).not.toBeNull();
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('o andamento usa o indicador de carregamento do padrão', async () => {
    let release!: (result: SelectResult) => void;
    renderView(vi.fn(() => new Promise<SelectResult>((resolve) => { release = resolve; })));
    fireEvent.click(screen.getByRole('button', { name: 'Entrar em Tenant A' }));
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'botao');
    release(success());
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});

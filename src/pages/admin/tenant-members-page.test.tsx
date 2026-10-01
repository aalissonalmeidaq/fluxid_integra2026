import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { MembershipService } from '@/application/identity/membership-service';
import { TenantMembersView } from './tenant-members-page';

const ORG = '20000000-0000-0000-0000-00000000000a';
const ROLE = '50000000-0000-0000-0000-000000000004';
const members = [
  { id: 'm1', display_name: 'Operador A', email: 'operador-a@example.invalid', status: 'active', version: 1 },
  { id: 'm2', display_name: 'Pessoa Bloqueada', email: 'bloqueada@example.invalid', status: 'blocked', version: 3 },
];

function fakeService(overrides: Partial<Record<'list' | 'invite' | 'resend' | 'changeStatus', unknown>> = {}) {
  return {
    list: vi.fn(async () => ({ kind: 'success' as const, value: { members, roles: [{ id: ROLE, name: 'Operador técnico' }] } })),
    invite: vi.fn(async () => ({ kind: 'success' as const, value: { id: 'inv-1', status: 'sent' } })),
    resend: vi.fn(async () => ({ kind: 'success' as const, value: { id: 'inv-2', status: 'sent' } })),
    changeStatus: vi.fn(async (input: { status: string; expectedVersion: number }) => ({ kind: 'success' as const, value: { id: 'm1', organization_id: ORG, status: input.status, version: input.expectedVersion + 1 } })),
    ...overrides,
  } as unknown as MembershipService & Record<'list' | 'invite' | 'resend' | 'changeStatus', ReturnType<typeof vi.fn>>;
}

const renderView = (service: ReturnType<typeof fakeService> | null) => render(<TenantMembersView organizationId={ORG} service={service} />);

describe('TenantMembersPage', () => {
  it('apresenta carregamento e depois a lista com nome, e-mail e estado em texto', async () => {
    renderView(fakeService());
    expect(screen.getByRole('status')).toHaveTextContent(/carregando/i);
    expect(await screen.findByRole('heading', { name: 'Operador A' })).toBeInTheDocument();
    expect(screen.getByText('operador-a@example.invalid')).toBeInTheDocument();
    expect(screen.getByText('Ativo', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Bloqueado', { exact: true })).toBeInTheDocument();
  });

  it('apresenta estado vazio', async () => {
    renderView(fakeService({ list: vi.fn(async () => ({ kind: 'success', value: { members: [], roles: [] } })) }));
    expect(await screen.findByText(/nenhuma pessoa vinculada/i)).toBeInTheDocument();
  });

  it.each([
    ['access_denied', /acesso negado/i],
    ['unavailable', /não foi possível/i],
  ] as const)('anuncia erro de listagem %s como alerta sem exibir dados', async (kind, text) => {
    renderView(fakeService({ list: vi.fn(async () => ({ kind })) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByRole('heading', { name: 'Operador A' })).not.toBeInTheDocument();
  });

  it('sem conexão ativa informa indisponibilidade e não tenta operar', async () => {
    renderView(null);
    expect(await screen.findByRole('alert')).toHaveTextContent(/conexão indisponível/i);
  });

  it('convida uma pessoa com papel e justificativa e anuncia o envio', async () => {
    const service = fakeService();
    renderView(service);
    await screen.findByRole('heading', { name: 'Operador A' });
    fireEvent.click(screen.getByRole('button', { name: 'Convidar pessoa' }));
    fireEvent.change(screen.getByLabelText('E-mail do convite'), { target: { value: 'Nova@Example.Invalid' } });
    fireEvent.change(screen.getByLabelText('Papel inicial'), { target: { value: ROLE } });
    fireEvent.change(screen.getByLabelText('Justificativa do convite'), { target: { value: 'Acesso aprovado pelo administrador' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));
    await waitFor(() => expect(service.invite).toHaveBeenCalledWith({ organizationId: ORG, email: 'Nova@Example.Invalid', roleId: ROLE, justification: 'Acesso aprovado pelo administrador' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/convite enviado/i);
  });

  it.each([
    ['delivery_pending', /aguarde alguns minutos/i],
    ['conflict', /já existe um convite/i],
    ['mfa_required', /segundo fator/i],
    ['access_denied', /acesso negado/i],
  ] as const)('traduz %s no convite sem informar sucesso', async (kind, text) => {
    renderView(fakeService({ invite: vi.fn(async () => ({ kind })) }));
    await screen.findByRole('heading', { name: 'Operador A' });
    fireEvent.click(screen.getByRole('button', { name: 'Convidar pessoa' }));
    fireEvent.change(screen.getByLabelText('E-mail do convite'), { target: { value: 'nova@example.invalid' } });
    fireEvent.change(screen.getByLabelText('Papel inicial'), { target: { value: ROLE } });
    fireEvent.change(screen.getByLabelText('Justificativa do convite'), { target: { value: 'Acesso aprovado pelo administrador' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByText(/convite enviado/i)).not.toBeInTheDocument();
  });

  it('bloqueia um vínculo com justificativa, versão esperada e atualiza o estado', async () => {
    const service = fakeService();
    renderView(service);
    await screen.findByRole('heading', { name: 'Operador A' });
    fireEvent.click(screen.getByRole('button', { name: 'Bloquear Operador A' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName(/bloquear/i);
    fireEvent.change(within(dialog).getByLabelText('Justificativa da alteração'), { target: { value: 'Afastamento temporário aprovado' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar bloqueio' }));
    await waitFor(() => expect(service.changeStatus).toHaveBeenCalledWith({ organizationId: ORG, membershipId: 'm1', status: 'blocked', expectedVersion: 1, justification: 'Afastamento temporário aprovado' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getAllByText('Bloqueado', { exact: true })).toHaveLength(2);
  });

  it('exige justificativa antes de confirmar e permite cancelar devolvendo o foco', async () => {
    const service = fakeService();
    renderView(service);
    await screen.findByRole('heading', { name: 'Operador A' });
    const trigger = screen.getByRole('button', { name: 'Bloquear Operador A' });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar bloqueio' }));
    expect(service.changeStatus).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('oferece reativação para vínculo bloqueado', async () => {
    const service = fakeService();
    renderView(service);
    await screen.findByRole('heading', { name: 'Pessoa Bloqueada' });
    fireEvent.click(screen.getByRole('button', { name: 'Reativar Pessoa Bloqueada' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Justificativa da alteração'), { target: { value: 'Retorno confirmado pelo gestor' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar reativação' }));
    await waitFor(() => expect(service.changeStatus).toHaveBeenCalledWith(expect.objectContaining({ membershipId: 'm2', status: 'active', expectedVersion: 3 })));
  });

  it('não altera o estado exibido quando o último administrador é protegido', async () => {
    renderView(fakeService({ changeStatus: vi.fn(async () => ({ kind: 'last_admin' })) }));
    await screen.findByRole('heading', { name: 'Operador A' });
    fireEvent.click(screen.getByRole('button', { name: 'Bloquear Operador A' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Justificativa da alteração'), { target: { value: 'Afastamento temporário aprovado' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar bloqueio' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/último administrador/i);
    expect(screen.getByText('Ativo', { exact: true })).toBeInTheDocument();
  });

  it('usa alvos de toque de 44 px nas ações', async () => {
    renderView(fakeService());
    await screen.findByRole('heading', { name: 'Operador A' });
    for (const name of ['Convidar pessoa', 'Bloquear Operador A']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/min-h-11/);
    }
  });
});

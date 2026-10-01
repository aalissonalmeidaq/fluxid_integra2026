import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RbacService } from '@/application/identity/rbac-service';
import type { MembershipService } from '@/application/identity/membership-service';
import { TenantRolesView } from './tenant-roles-page';

const ORG = '20000000-0000-0000-0000-00000000000a';
const ADMIN_ROLE = '50000000-0000-0000-0000-000000000003';
const CUSTOM = '50000000-0000-0000-0000-0000000000f1';
const M1 = '30000000-0000-0000-0000-00000000000a';
const M2 = '30000000-0000-0000-0000-0000000000f3';
const JUSTIFICATION = 'Alteração aprovada pela gestão';

const access = {
  roles: [
    { id: ADMIN_ROLE, code: 'tenant_admin', name: 'Administrador do tenant', description: 'Administra o tenant', system: true, active: true, version: 1, permissions: ['audit.read', 'tenant.manage'] },
    { id: CUSTOM, code: 'custom_a', name: 'Auditor interno', description: 'Consulta auditoria', system: false, active: true, version: 3, permissions: ['audit.read'] },
  ],
  permissions: [
    { code: 'audit.read', description: 'Consultar auditoria', critical: false, delegable: true },
    { code: 'tenant.manage', description: 'Administrar tenant', critical: true, delegable: true },
    { code: 'platform.manage', description: 'Administrar plataforma', critical: true, delegable: false },
  ],
  assignments: [{ membership_id: M1, role_id: ADMIN_ROLE }],
};
const members = [
  { id: M1, display_name: 'Ana Admin', email: 'ana@example.invalid', status: 'active', version: 1 },
  { id: M2, display_name: 'Beto Operador', email: 'beto@example.invalid', status: 'active', version: 1 },
];

function fakeServices(overrides: Record<string, unknown> = {}) {
  const rbac = {
    list: vi.fn(async () => ({ kind: 'success' as const, value: access })),
    saveRole: vi.fn(async () => ({ kind: 'success' as const, value: { id: 'novo', version: 1 } })),
    setRoleActive: vi.fn(async () => ({ kind: 'success' as const, value: { id: CUSTOM, version: 4, active: false } })),
    assignRole: vi.fn(async () => ({ kind: 'success' as const, value: undefined })),
    removeRole: vi.fn(async () => ({ kind: 'success' as const, value: undefined })),
    ...overrides,
  };
  const membership = { list: vi.fn(async () => ({ kind: 'success' as const, value: { members, roles: [] } })) };
  return { rbac: rbac as unknown as RbacService & Record<string, ReturnType<typeof vi.fn>>, membership: membership as unknown as MembershipService };
}

const renderView = (services = fakeServices()) => {
  render(<TenantRolesView organizationId={ORG} rbac={services.rbac} members={services.membership} />);
  return services;
};
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('TenantRolesPage: leitura', () => {
  it('apresenta carregamento e depois papéis com tipo, estado e permissões em texto', async () => {
    renderView();
    expect(screen.getByRole('status')).toHaveTextContent(/carregando/i);
    expect(await screen.findByRole('heading', { name: 'Administrador do tenant' })).toBeInTheDocument();
    const custom = screen.getByRole('heading', { name: 'Auditor interno' }).closest('li')!;
    expect(within(custom).getByText('Personalizado')).toBeInTheDocument();
    expect(within(custom).getByText('Ativo')).toBeInTheDocument();
    expect(within(custom).getByText('audit.read')).toBeInTheDocument();
    const system = screen.getByRole('heading', { name: 'Administrador do tenant' }).closest('li')!;
    expect(within(system).getByText('Preestabelecido')).toBeInTheDocument();
    expect(within(system).getByText(/não pode ser alterado/i)).toBeInTheDocument();
    expect(within(system).queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
  });

  it('marca permissão crítica com texto, não só com cor', async () => {
    renderView();
    const system = (await screen.findByRole('heading', { name: 'Administrador do tenant' })).closest('li')!;
    expect(within(system).getByText(/tenant\.manage/)).toBeInTheDocument();
    expect(within(system).getAllByText(/crítica/i).length).toBeGreaterThan(0);
  });

  it.each([
    ['access_denied', /acesso negado/i],
    ['unavailable', /não foi possível carregar/i],
  ] as const)('anuncia %s como alerta e não exibe papéis', async (kind, text) => {
    renderView(fakeServices({ list: vi.fn(async () => ({ kind })) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByRole('heading', { name: 'Auditor interno' })).not.toBeInTheDocument();
  });

  it('sem conexão informa indisponibilidade', async () => {
    render(<TenantRolesView organizationId={ORG} rbac={null} members={null} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/conexão indisponível/i);
  });

  it('apresenta estado vazio quando não há papéis', async () => {
    renderView(fakeServices({ list: vi.fn(async () => ({ kind: 'success', value: { roles: [], permissions: [], assignments: [] } })) }));
    expect(await screen.findByText(/nenhum papel/i)).toBeInTheDocument();
  });
});

describe('TenantRolesPage: papel personalizado', () => {
  it('permite escolher somente permissões delegáveis e desabilita as demais com explicação em texto', async () => {
    renderView();
    await screen.findByRole('heading', { name: 'Auditor interno' });
    fireEvent.click(screen.getByRole('button', { name: 'Novo papel' }));
    expect(screen.getByRole('checkbox', { name: /audit\.read/ })).toBeEnabled();
    const blocked = screen.getByRole('checkbox', { name: /platform\.manage/ });
    expect(blocked).toBeDisabled();
    expect(screen.getByText(/não delegável/i)).toBeInTheDocument();
  });

  it('cria papel com nome, permissões e justificativa e anuncia o resultado', async () => {
    const services = renderView();
    await screen.findByRole('heading', { name: 'Auditor interno' });
    fireEvent.click(screen.getByRole('button', { name: 'Novo papel' }));
    fill('Nome do papel', '  Conferente ');
    fill('Descrição', 'Confere registros');
    fireEvent.click(screen.getByRole('checkbox', { name: /audit\.read/ }));
    fill('Justificativa do papel', JUSTIFICATION);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar papel' }));
    await waitFor(() => expect(services.rbac.saveRole).toHaveBeenCalledWith({ organizationId: ORG, name: 'Conferente', description: 'Confere registros', permissions: ['audit.read'], justification: JUSTIFICATION }));
    expect(await screen.findByRole('status')).toHaveTextContent(/papel salvo/i);
    expect(services.rbac.list).toHaveBeenCalledTimes(2);
  });

  it('valida nome e justificativa no cliente sem chamar o servidor', async () => {
    const services = renderView();
    await screen.findByRole('heading', { name: 'Auditor interno' });
    fireEvent.click(screen.getByRole('button', { name: 'Novo papel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar papel' }));
    expect(services.rbac.saveRole).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nome do papel')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Justificativa do papel')).toHaveAttribute('aria-invalid', 'true');
  });

  it('edita papel personalizado enviando a versão esperada e as permissões atuais', async () => {
    const services = renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Auditor interno' }));
    expect(screen.getByLabelText('Nome do papel')).toHaveValue('Auditor interno');
    expect(screen.getByRole('checkbox', { name: /audit\.read/ })).toBeChecked();
    fill('Justificativa do papel', JUSTIFICATION);
    fireEvent.click(screen.getByRole('checkbox', { name: /tenant\.manage/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar papel' }));
    await waitFor(() => expect(services.rbac.saveRole).toHaveBeenCalledWith(expect.objectContaining({ roleId: CUSTOM, expectedVersion: 3, permissions: ['audit.read', 'tenant.manage'] })));
  });

  it.each([
    ['not_delegable', /não pode ser delegada/i],
    ['immutable', /preestabelecidos não podem/i],
    ['conflict', /alterado por outra pessoa/i],
    ['mfa_required', /segundo fator/i],
    ['access_denied', /acesso negado/i],
  ] as const)('traduz %s ao salvar e não informa sucesso', async (kind, text) => {
    renderView(fakeServices({ saveRole: vi.fn(async () => ({ kind })) }));
    await screen.findByRole('heading', { name: 'Auditor interno' });
    fireEvent.click(screen.getByRole('button', { name: 'Novo papel' }));
    fill('Nome do papel', 'Conferente');
    fill('Justificativa do papel', JUSTIFICATION);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar papel' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByText(/papel salvo/i)).not.toBeInTheDocument();
  });
});

describe('TenantRolesPage: ativação e atribuição', () => {
  it('inativa papel personalizado com justificativa e versão, devolvendo o foco ao acionador', async () => {
    const services = renderView();
    const trigger = await screen.findByRole('button', { name: 'Inativar Auditor interno' });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName(/inativar auditor interno/i);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar inativação' }));
    expect(services.rbac.setRoleActive).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Justificativa da alteração'), { target: { value: JUSTIFICATION } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar inativação' }));
    await waitFor(() => expect(services.rbac.setRoleActive).toHaveBeenCalledWith({ organizationId: ORG, roleId: CUSTOM, active: false, expectedVersion: 3, justification: JUSTIFICATION }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('atribui um papel ativo a uma pessoa e recarrega as atribuições', async () => {
    const services = renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Atribuir papel a Beto Operador' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Papel'), { target: { value: CUSTOM } });
    fireEvent.change(within(dialog).getByLabelText('Justificativa da alteração'), { target: { value: JUSTIFICATION } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar atribuição' }));
    await waitFor(() => expect(services.rbac.assignRole).toHaveBeenCalledWith({ organizationId: ORG, membershipId: M2, roleId: CUSTOM, justification: JUSTIFICATION }));
    expect(await screen.findByRole('status')).toHaveTextContent(/papel atribuído/i);
  });

  it('remove o papel atribuído com confirmação e justificativa', async () => {
    const services = renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Administrador do tenant de Ana Admin' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Justificativa da alteração'), { target: { value: JUSTIFICATION } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar remoção' }));
    await waitFor(() => expect(services.rbac.removeRole).toHaveBeenCalledWith({ organizationId: ORG, membershipId: M1, roleId: ADMIN_ROLE, justification: JUSTIFICATION }));
  });

  it('anuncia a proteção do último administrador sem alterar a tela', async () => {
    renderView(fakeServices({ removeRole: vi.fn(async () => ({ kind: 'last_admin' })) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Administrador do tenant de Ana Admin' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Justificativa da alteração'), { target: { value: JUSTIFICATION } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar remoção' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/último administrador/i);
    expect(screen.getByRole('button', { name: 'Remover Administrador do tenant de Ana Admin' })).toBeInTheDocument();
  });

  it('cancela o diálogo com Escape e devolve o foco', async () => {
    renderView();
    const trigger = await screen.findByRole('button', { name: 'Atribuir papel a Beto Operador' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('usa alvos de toque de 44 px nas ações principais', async () => {
    renderView();
    await screen.findByRole('heading', { name: 'Auditor interno' });
    for (const name of ['Novo papel', 'Editar Auditor interno', 'Inativar Auditor interno', 'Atribuir papel a Beto Operador']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/min-h-11/);
    }
  });
});

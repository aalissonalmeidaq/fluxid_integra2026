// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error script operacional em JavaScript, sem tipos
import { criarPrimeiroMaster, validarEntrada } from '../../scripts/operacao/primeiro-master.mjs';

const entrada = { email: 'master@empresa.com.br', nome: 'Master FluxID', senha: 'Senha-Forte-2026!' };

type Linha = Record<string, unknown>;

function criarAdmin(opcoes: { masterExistente?: boolean; owner?: boolean; falharEm?: string; usuarioExistente?: boolean } = {}) {
  const gravado: Record<string, Linha[]> = {};
  const removidos: string[] = [];
  const consulta = (tabela: string) => {
    const api = {
      select: () => api,
      eq: () => api,
      delete: () => { removidos.push(tabela); return { eq: () => Promise.resolve({ error: null }) }; },
      limit: () => Promise.resolve({ data: tabela === 'membership_roles' && opcoes.masterExistente ? [{ membership_id: 'm' }] : [], error: null }),
      maybeSingle: () => Promise.resolve({ data: opcoes.owner ? { id: 'org-1' } : null, error: null }),
      single: () => Promise.resolve(opcoes.falharEm === tabela
        ? { data: null, error: { message: 'falha simulada' } }
        : { data: { id: tabela === 'organizations' ? 'org-1' : 'vinculo-1' }, error: null }),
      upsert: (linha: Linha) => api.insert(linha),
      insert: (linha: Linha) => {
        (gravado[tabela] ??= []).push(linha);
        const erro = opcoes.falharEm === tabela ? { message: 'falha simulada' } : null;
        return Object.assign(Promise.resolve({ error: erro }), { select: () => api });
      },
    };
    return api;
  };
  const deleteUser = vi.fn().mockResolvedValue({ error: null });
  const createUser = vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  const listUsers = vi.fn().mockResolvedValue({ data: { users: opcoes.usuarioExistente ? [{ id: 'user-existente', email: 'MASTER@empresa.com.br' }] : [] }, error: null });
  return { admin: { from: consulta, auth: { admin: { createUser, deleteUser, listUsers } } }, gravado, removidos, deleteUser, createUser };
}

describe('primeiro Master FluxID', () => {
  it('reprova e-mail inválido e senha fraca sem expor a senha', () => {
    const erros = validarEntrada({ email: 'x', nome: 'A', senha: 'curta' }).join(' ');
    expect(erros).toMatch(/e-mail/);
    expect(erros).toMatch(/senha/);
    expect(erros).not.toContain('curta');
  });

  it('cria usuário, perfil, vínculo ativo, papel Master e auditoria sem a senha', async () => {
    const { admin, gravado, createUser } = criarAdmin();
    await expect(criarPrimeiroMaster(admin, entrada)).resolves.toMatchObject({ criado: true, userId: 'user-1' });
    expect(createUser).toHaveBeenCalledWith({ email: entrada.email, password: entrada.senha, email_confirm: true });
    expect(gravado.organizations?.[0]).toMatchObject({ kind: 'owner' });
    expect(gravado.memberships?.[0]).toMatchObject({ status: 'active', user_id: 'user-1' });
    expect(gravado.membership_roles?.[0]).toMatchObject({ role_id: '50000000-0000-0000-0000-000000000001' });
    expect(gravado.audit_logs?.[0]).toMatchObject({ action: 'master.bootstrap', result: 'success' });
    expect(JSON.stringify(gravado)).not.toContain(entrada.senha);
  });

  it('reaproveita o usuário já criado no Auth, sem recriá-lo nem apagá-lo em caso de falha', async () => {
    const ok = criarAdmin({ usuarioExistente: true });
    await expect(criarPrimeiroMaster(ok.admin, entrada)).resolves.toMatchObject({ criado: true, userId: 'user-existente' });
    expect(ok.createUser).not.toHaveBeenCalled();
    expect(ok.gravado.membership_roles?.[0]).toMatchObject({ role_id: '50000000-0000-0000-0000-000000000001' });

    const falha = criarAdmin({ usuarioExistente: true, owner: true, falharEm: 'memberships' });
    await expect(criarPrimeiroMaster(falha.admin, entrada)).rejects.toThrow(/vínculo/);
    expect(falha.deleteUser).not.toHaveBeenCalled();
  });

  it('não altera nada quando já existe um Master', async () => {
    const { admin, createUser } = criarAdmin({ masterExistente: true });
    await expect(criarPrimeiroMaster(admin, entrada)).resolves.toMatchObject({ criado: false });
    expect(createUser).not.toHaveBeenCalled();
  });

  it('desfaz o usuário do Auth quando uma etapa falha', async () => {
    const { admin, deleteUser, removidos } = criarAdmin({ owner: true, falharEm: 'memberships' });
    await expect(criarPrimeiroMaster(admin, entrada)).rejects.toThrow(/vínculo/);
    expect(deleteUser).toHaveBeenCalledWith('user-1');
    expect(removidos).toContain('profiles');
  });
});

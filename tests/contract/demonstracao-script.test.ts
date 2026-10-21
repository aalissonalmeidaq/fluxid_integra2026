// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import manifestoPublicado from '../../src/domain/demo/acessos-demonstracao.json';
// @ts-expect-error script operacional em JavaScript, sem tipos
import { executar, restaurarDemonstracao, validarManifesto, validarUrl } from '../../scripts/operacao/demonstracao.mjs';

// Spec 014 (RF-005; contracts/restauracao-da-demonstracao.md): o script que cria ou restaura a demonstração, com um dublê do Admin API.
const RESUMO = { code: 'DEMO_RESTORED', tenant: 'unchanged', accounts: { restored: 0, unchanged: 5 }, cylinder: 'unchanged', seal: 'absent', warnings: [] };
const CHAVE = 'chave-de-servico-ficticia-do-teste';

type Usuario = { id: string; email: string };

function criarAdmin(opcoes: { usuarios?: Usuario[]; marcas?: Record<string, unknown> } = {}) {
  const ordem: string[] = [];
  const usuarios = opcoes.usuarios ?? [];
  const rpc = vi.fn(async (_nome: string, args: { p_phase: string }) => {
    ordem.push(`rpc:${args.p_phase}`);
    if (args.p_phase === 'markers') return { data: opcoes.marcas ?? { code: 'DEMO_MARKED', accounts: 5 }, error: null };
    return { data: RESUMO, error: null };
  });
  const listUsers = vi.fn(async () => ({ data: { users: usuarios }, error: null }));
  const getUserById = vi.fn(async (id: string) => {
    const achado = usuarios.find((usuario) => usuario.id === id);
    return achado ? { data: { user: achado }, error: null } : { data: { user: null }, error: { status: 404, message: 'User not found' } };
  });
  const createUser = vi.fn(async (atributos: { id: string }) => { ordem.push('auth:create'); return { data: { user: { id: atributos.id } }, error: null }; });
  const updateUserById = vi.fn(async (id: string) => { ordem.push('auth:update'); return { data: { user: { id } }, error: null }; });
  return { admin: { rpc, auth: { admin: { listUsers, getUserById, createUser, updateUserById } } }, ordem, rpc, createUser, updateUserById };
}

const manifesto = () => structuredClone(manifestoPublicado);

describe('script da demonstração', () => {
  it('valida o JSON antes de tudo e não toca em nada quando ele é inválido', async () => {
    const ruim = manifesto();
    ruim.accounts[0]!.role_code = 'master_fluxid';
    expect(validarManifesto(ruim).join(' ')).toMatch(/papel/);
    expect(validarManifesto(manifesto())).toEqual([]);
    const { admin, rpc, createUser } = criarAdmin();
    await expect(restaurarDemonstracao(admin, ruim)).rejects.toThrow(/inválido/);
    expect(rpc).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it('chama markers, acerta o Auth e chama state, nessa ordem, e repassa o resumo', async () => {
    const { admin, ordem, rpc } = criarAdmin();
    await expect(restaurarDemonstracao(admin, manifesto())).resolves.toEqual(RESUMO);
    expect(ordem).toEqual(['rpc:markers', ...Array(5).fill('auth:create'), 'rpc:state']);
    expect(rpc).toHaveBeenCalledWith('demo_restore', { p_manifest: manifesto(), p_phase: 'markers' });
  });

  it('cria o usuário com o id do JSON, a senha publicada e o e-mail confirmado', async () => {
    const { admin, createUser } = criarAdmin();
    await restaurarDemonstracao(admin, manifesto());
    const conta = manifestoPublicado.accounts[0]!;
    expect(createUser).toHaveBeenCalledWith({ id: conta.user_id, email: conta.email, password: conta.password, email_confirm: true });
  });

  it('atualiza senha e e-mail confirmado de quem já existe', async () => {
    const usuarios = manifestoPublicado.accounts.map((conta) => ({ id: conta.user_id, email: conta.email }));
    const { admin, createUser, updateUserById } = criarAdmin({ usuarios });
    await restaurarDemonstracao(admin, manifesto());
    expect(createUser).not.toHaveBeenCalled();
    const conta = manifestoPublicado.accounts[4]!;
    expect(updateUserById).toHaveBeenCalledWith(conta.user_id, { email: conta.email, password: conta.password, email_confirm: true });
  });

  it('para sem alterar nada quando um e-mail de demonstração já pertence a outro usuário', async () => {
    const conta = manifestoPublicado.accounts[1]!;
    const { admin, rpc, createUser, updateUserById } = criarAdmin({ usuarios: [{ id: '99999999-0000-4000-8000-000000000001', email: conta.email.toUpperCase() }] });
    await expect(restaurarDemonstracao(admin, manifesto())).rejects.toThrow(/outro usuário/);
    expect(rpc).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('para sem mexer no Auth quando a empresa tem vínculos que não são de demonstração', async () => {
    const { admin, createUser, rpc } = criarAdmin({ marcas: { code: 'DEMO_FOREIGN_MEMBERS' } });
    await expect(restaurarDemonstracao(admin, manifesto())).rejects.toThrow(/vínculos que não são de demonstração/);
    expect(createUser).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('recusa URL fora de https://<ref>.supabase.co sem --permitir-fora-da-nuvem', () => {
    expect(() => validarUrl('https://abcdefghijklmnop.supabase.co', [])).not.toThrow();
    expect(() => validarUrl('http://127.0.0.1:54321', [])).toThrow(/nuvem/);
    expect(() => validarUrl('https://evil.example.com', [])).toThrow(/nuvem/);
    expect(() => validarUrl('http://127.0.0.1:54321', ['--permitir-fora-da-nuvem'])).not.toThrow();
  });

  it('sem a URL ou a chave, explica o que falta e não cria cliente', async () => {
    const criarCliente = vi.fn();
    const log = vi.fn();
    const erro = vi.fn();
    await expect(executar({ env: { SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co' }, argv: [], criarCliente, log, erro })).resolves.toBe(1);
    expect(criarCliente).not.toHaveBeenCalled();
    expect(erro.mock.calls.flat().join(' ')).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('imprime só o resumo: nunca a chave nem as senhas', async () => {
    const { admin } = criarAdmin();
    const linhas: string[] = [];
    const saida = (...partes: unknown[]) => { linhas.push(partes.map(String).join(' ')); };
    const codigo = await executar({
      env: { SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co', SUPABASE_SERVICE_ROLE_KEY: CHAVE },
      argv: [], criarCliente: () => admin, log: saida, erro: saida,
    });
    expect(codigo).toBe(0);
    const texto = linhas.join('\n');
    expect(texto).toMatch(/unchanged/);
    expect(texto).not.toContain(CHAVE);
    for (const conta of manifestoPublicado.accounts) expect(texto).not.toContain(conta.password);
  });
});

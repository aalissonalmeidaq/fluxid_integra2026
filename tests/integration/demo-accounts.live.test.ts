// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import manifesto from '../../src/domain/demo/acessos-demonstracao.json';
import { callFunction, endAllSessions, login, logout, publishableKey, restGet, supabaseUrl } from '../support/auth-harness';
import { sql } from '../support/seal-db';

// Spec 014 (MS-002): os 5 acessos de demonstração entram no Supabase local recriado pelo seed com as senhas publicadas, chegam ao
// "Oxigênio Cariri" e o administrador vê o C262. Exige `npx supabase db reset` (carrega supabase/seeds/demonstracao.sql).
const DEMO = manifesto.tenant.id;
const contas = manifesto.accounts;
const credenciais = (indice: number) => ({ email: contas[indice]!.email, password: contas[indice]!.password });

interface Vinculo { organization_id: string; status: string; organizations: { display_name: string } | null }

describe('acessos de demonstração ao vivo', () => {
  const tokens: string[] = [];

  beforeAll(async () => {
    for (let indice = 0; indice < contas.length; indice += 1) await endAllSessions(credenciais(indice));
  });

  afterAll(async () => {
    for (const token of tokens) await logout(token);
  });

  it('os 5 perfis entram com as senhas publicadas e chegam ao Oxigênio Cariri', async () => {
    for (let indice = 0; indice < contas.length; indice += 1) {
      const entrada = await login(credenciais(indice));
      expect(entrada.status, contas[indice]!.role_code).toBe(200);
      const token = entrada.body.session.access_token as string;
      tokens[indice] = token;
      const vinculos = await restGet('memberships?select=organization_id,status,organizations(display_name)', token);
      expect(vinculos.status).toBe(200);
      expect(vinculos.body as Vinculo[]).toEqual([{ organization_id: DEMO, status: 'active', organizations: { display_name: 'Oxigênio Cariri' } }]);
    }
  });

  it('o administrador de demonstração vê o C262 em estoque', async () => {
    const lista = await callFunction('query-cylinders', { operation: 'list', organization_id: DEMO, search: 'C262' }, tokens[0]);
    expect(lista.status).toBe(200);
    const itens = lista.body.items as Array<{ serial_number: string; stock_status: string; status: string }>;
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ serial_number: 'C262', stock_status: 'in_stock', status: 'active' });
  });

  // Spec 014, História 3 (RF-012, RF-016, MS-003): fora do tenant da demonstração tudo é negado, e as negações por permissão ficam na
  // auditoria como para qualquer usuário.
  it('cada perfil recebe "Acesso negado" nas funções da plataforma, e a negação fica auditada', async () => {
    const inicio = sql('select now()::text;');
    for (let indice = 0; indice < contas.length; indice += 1) {
      const token = tokens[indice]!;
      expect((await callFunction('manage-organizations', { operation: 'list' }, token)).status, contas[indice]!.role_code).toBe(403);
      expect((await callFunction('platform-seals', { operation: 'list_enrollments', offset: 0, limit: 10 }, token)).status).toBe(403);
      expect((await callFunction('query-audit', { scope: 'global', limit: 10 }, token)).status).toBe(403);
    }
    const ids = contas.map((conta) => `'${conta.user_id}'`).join(',');
    const negadas = Number(sql(`select count(distinct actor_user_id) from public.audit_logs where result = 'denied' and actor_user_id in (${ids}) and occurred_at >= '${inicio}';`));
    expect(negadas).toBe(5);
  });

  it('pedir dados do Tenant A: negado pela organização e inexistente pelo id', async () => {
    const TENANT_A = '20000000-0000-0000-0000-00000000000a';
    const lista = await callFunction('query-cylinders', { operation: 'list', organization_id: TENANT_A }, tokens[0]);
    expect(lista).toMatchObject({ status: 403, body: { code: 'ACCESS_DENIED' } });
    const alheio = sql(`select coalesce((select id::text from public.cylinders where organization_id = '${TENANT_A}' limit 1), '00000000-0000-4000-8000-000000000000');`);
    const pelaDemo = await callFunction('query-cylinders', { operation: 'get', organization_id: DEMO, cylinder_id: alheio }, tokens[0]);
    expect(pelaDemo).toMatchObject({ status: 404, body: { code: 'NOT_FOUND' } });
  });

  it('o convite na empresa da demonstração é recusado com DEMO_RESTRICTED', async () => {
    const papel = sql(`select id from public.roles where organization_id = '${DEMO}' and code = 'stock_operator';`);
    const convite = await callFunction('invite-user', { operation: 'invite', organization_id: DEMO, email: 'alguem@empresa.com.br', role_id: papel,
      justification: 'Convite feito por um visitante' }, tokens[0]);
    expect(convite).toMatchObject({ status: 403, body: { code: 'DEMO_RESTRICTED' } });
  });

  it('a troca de senha pela sessão do próprio visitante é recusada e a senha publicada continua valendo', async () => {
    const resposta = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: { apikey: publishableKey, authorization: `Bearer ${tokens[1]}`, 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'Outra-Senha-Forte-123!' }),
    });
    expect(resposta.status).toBeGreaterThanOrEqual(400);
    const conta = contas[1]!;
    await endAllSessions({ email: conta.email, password: conta.password });
    const entrada = await login({ email: conta.email, password: conta.password });
    expect(entrada.status).toBe(200);
    tokens[1] = entrada.body.session.access_token as string;
  });
});

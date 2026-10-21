// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import manifesto from '../../src/domain/demo/acessos-demonstracao.json';
// @ts-expect-error script operacional em JavaScript, sem tipos
import { restaurarDemonstracao } from '../../scripts/operacao/demonstracao.mjs';
import { endAllSessions, login, logout, supabaseUrl } from '../support/auth-harness';
import { sql } from '../support/seal-db';

// Spec 014 (RF-005, MS-004; quickstart, seção 4): o script contra o Supabase LOCAL, partindo do seed. Um visitante bloqueia um
// vínculo e inativa o C262; o script devolve tudo ao publicado, a segunda execução responde unchanged e os 5 perfis entram.
// A chave de serviço local vem do próprio `supabase status` (ou de SUPABASE_SERVICE_ROLE_KEY), nunca de arquivo versionado.
function chaveLocal(): string {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const saida = execFileSync('npx', ['supabase', 'status', '--output', 'json'], { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'ignore'] });
  return (JSON.parse(saida.slice(saida.indexOf('{'))) as { SERVICE_ROLE_KEY: string }).SERVICE_ROLE_KEY;
}

const C262 = () => sql(`select cylinder_id from private.demo_tenant where organization_id = '${manifesto.tenant.id}';`);

describe('restauração da demonstração ao vivo', () => {
  let admin: ReturnType<typeof createClient>;
  const tokens: string[] = [];

  beforeAll(() => {
    admin = createClient(supabaseUrl, chaveLocal(), { auth: { persistSession: false, autoRefreshToken: false } });
  });

  afterAll(async () => {
    for (const token of tokens) await logout(token);
  });

  it('devolve ao publicado o que um visitante mudou e a segunda execução responde unchanged', async () => {
    const operador = manifesto.accounts.find((conta) => conta.role_code === 'stock_operator')!;
    sql(`update public.memberships set status = 'blocked', blocked_at = now() where id = '${operador.membership_id}';`);
    sql(`update public.cylinders set status = 'inactive', inactivation_reason = 'lost', stock_status = 'out_of_stock' where id = '${C262()}';`);

    const primeira = await restaurarDemonstracao(admin, manifesto);
    expect(primeira).toMatchObject({ code: 'DEMO_RESTORED', cylinder: 'restored' });
    expect(primeira.accounts.restored).toBeGreaterThanOrEqual(1);
    expect(sql(`select status from public.memberships where id = '${operador.membership_id}';`)).toBe('active');
    expect(sql(`select status || ':' || stock_status from public.cylinders where id = '${C262()}';`)).toBe('active:in_stock');

    const segunda = await restaurarDemonstracao(admin, manifesto);
    expect(segunda).toMatchObject({ code: 'DEMO_RESTORED', tenant: 'unchanged', cylinder: 'unchanged', accounts: { restored: 0, unchanged: 5 } });
    expect(sql(`select count(*) from public.cylinders where organization_id = '${manifesto.tenant.id}' and serial_number = 'C262';`)).toBe('1');
  });

  it('depois do script, os 5 perfis entram com as senhas publicadas', async () => {
    for (const conta of manifesto.accounts) {
      await endAllSessions({ email: conta.email, password: conta.password });
      const entrada = await login({ email: conta.email, password: conta.password });
      expect(entrada.status, conta.role_code).toBe(200);
      tokens.push(entrada.body.session.access_token as string);
    }
  });
});

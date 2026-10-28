// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildEmailMessage, type EmailItem } from '../../supabase/functions/email-notifications/email-provider';

// Spec 015 (T101; RF-031, RF-033, RF-038): Broadcast, auditoria, logs e e-mail levam só o mínimo. Nada de coordenada, precisão, endereço,
// token, URL assinada, e-mail ou nome de pessoa. Leitura estática das migrações e das funções da spec: uma chave nova com um desses nomes
// reprova aqui antes de chegar ao banco.
const ROOT = join(__dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const SPEC_MIGRATIONS = readdirSync(MIGRATIONS).filter((name) => name >= '20261022090000' && name.endsWith('.sql'));
const read = (path: string) => readFileSync(path, 'utf8');
const SENSITIVE_KEY = /'(latitude|longitude|lat|lng|lon|accuracy|accuracy_m|coordinates?|location|point|geom|address|token|signed_url|url|email|phone|full_name|display_name|name)'/i;

// Trecho de cada chamada `fn(` até o parêntese que a fecha.
function calls(source: string, fn: string): string[] {
  const found: string[] = [];
  let index = source.indexOf(`${fn}(`);
  while (index !== -1) {
    let depth = 0;
    let end = index + fn.length;
    for (; end < source.length; end += 1) {
      if (source[end] === '(') depth += 1;
      else if (source[end] === ')' && --depth === 0) break;
    }
    found.push(source.slice(index, end + 1));
    index = source.indexOf(`${fn}(`, end);
  }
  return found;
}

describe('minimização de dados do rastreamento', () => {
  it('as migrações da spec existem e são lidas', () => {
    expect(SPEC_MIGRATIONS.length).toBeGreaterThan(20);
  });

  it('Broadcast leva só o tipo do evento e o id da viagem; a tela busca o resto com autorização', () => {
    const sends = SPEC_MIGRATIONS.flatMap((name) => calls(read(join(MIGRATIONS, name)), 'realtime.send'));
    expect(sends.length).toBeGreaterThan(0);
    for (const send of sends) {
      const keys = [...send.matchAll(/'([a-z_]+)',\s*p_/g)].map((match) => match[1]);
      expect(keys.sort(), send).toEqual(['kind', 'trip_id']);
    }
  });

  it('nenhuma auditoria da spec grava coordenada, endereço, token, URL, e-mail ou nome', () => {
    const audits = SPEC_MIGRATIONS.flatMap((name) => calls(read(join(MIGRATIONS, name)), 'private.tracking_audit')
      .filter((call) => !call.startsWith('private.tracking_audit(p_organization uuid')).map((call) => ({ name, call })));
    expect(audits.length).toBeGreaterThan(10);
    for (const { name, call } of audits) expect(call, name).not.toMatch(SENSITIVE_KEY);
  });

  it('as funções da spec não escrevem log', () => {
    for (const fn of ['query-tracking', 'manage-tracking', 'report-export', 'email-notifications']) {
      const dir = join(ROOT, 'supabase', 'functions', fn);
      for (const file of readdirSync(dir).filter((name) => name.endsWith('.ts'))) {
        expect(read(join(dir, file)), `${fn}/${file}`).not.toMatch(/console\.(log|info|warn|error|debug)/);
      }
    }
  });

  it('a coleta no aplicativo não escreve posição em log', () => {
    for (const dir of ['src/application/tracking', 'src/app/tracking', 'src/infrastructure/tracking']) {
      const path = join(ROOT, dir);
      let files: string[];
      try { files = readdirSync(path).filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.')); } catch { continue; }
      for (const file of files) expect(read(join(path, file)), `${dir}/${file}`).not.toMatch(/console\.(log|info|warn|error|debug)/);
    }
  });

  it('o e-mail ignora coordenada, endereço, token e URL assinada mesmo que cheguem no item', () => {
    const item = {
      id: 'a1000000-0000-4000-8000-000000000001', category: 'proximity_confirmed', transition: 'opened', to: 'gestor@example.invalid',
      organization: 'Tenant A', occurred_at: '2026-10-22T15:04:00Z', severity: 'critical', kind: 'proximity_separation', identifier: 'CIL-008',
      path: '/rastreamento/ocorrencias/a1000000-0000-4000-8000-000000000001',
      latitude: -7.2314, longitude: -39.3101, accuracy_m: 12, address: 'Praça da Sé, 1', signed_url: 'https://x.invalid/sign/abc', token: 'abc.def',
    } as EmailItem;
    const { subject, text } = buildEmailMessage(item, 'https://fluxid.example');
    expect(`${subject}\n${text}`).not.toMatch(/-7\.23|-39\.31|Praça|sign\/abc|abc\.def|±|12 m/);
  });
});

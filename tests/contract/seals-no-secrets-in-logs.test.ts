// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 012 (T037; RF-039, RF-040, CA-004, CA-008, CA-010): a chave do dispositivo, a senha de rede Wi-Fi, a chave VAPID privada e as
// coordenadas nunca aparecem em log, auditoria ou evento. Varredura estática do código das funções e das migrations do lacre; a suíte
// `.live` confere também o conteúdo gravado de verdade.
const ROOT = path.resolve(import.meta.dirname, '../..');
const FUNCTIONS = ['seal-gateway', 'query-seals', 'manage-seals', 'seal-push'].map((name) => path.join(ROOT, 'supabase/functions', name));
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');
const read = (file: string) => fs.readFileSync(file, 'utf8');
const sourcesOf = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => path.join(dir, f)) : []);
const sealMigrations = fs.readdirSync(MIGRATIONS).filter((f) => /_seals_/.test(f)).map((f) => path.join(MIGRATIONS, f));

describe('nenhum segredo nem coordenada em log ou auditoria', () => {
  it('as funções do lacre não escrevem nada no console', () => {
    const files = FUNCTIONS.flatMap(sourcesOf);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(read(file), path.relative(ROOT, file)).not.toMatch(/console\.(log|info|warn|error|debug)/);
  });

  it('a auditoria gravada pelas funções nunca leva corpo, chave ou metadados', () => {
    for (const file of FUNCTIONS.flatMap(sourcesOf).filter((f) => f.endsWith('index.ts'))) {
      const text = read(file);
      if (!text.includes("from('audit_logs')")) continue;
      expect(text, path.relative(ROOT, file)).toMatch(/metadata: \{\}/);
    }
  });

  it('nenhuma auditoria das migrations do lacre leva chave, senha, justificativa ou coordenada', () => {
    const statements = sealMigrations.flatMap((file) => [...read(file).matchAll(/insert into public\.audit_logs[\s\S]*?;/g)].map((m) => [file, m[0]] as const));
    for (const [file, statement] of statements) {
      expect(statement, path.relative(ROOT, file)).not.toMatch(/latitude|longitude|point|password|secret|key_hash|device_key|justification|close_note/i);
    }
  });

  it('as chamadas a write_audit_event das migrations do lacre nunca levam a senha de rede nem o segredo do Vault (US7)', () => {
    const calls = sealMigrations.flatMap((file) => [...read(file).matchAll(/write_audit_event\([\s\S]*?\);/g)].map((m) => [file, m[0]] as const));
    expect(calls.some(([file]) => file.endsWith('_seals_wifi.sql'))).toBe(true);
    for (const [file, call] of calls) expect(call, path.relative(ROOT, file)).not.toMatch(/p_password|decrypted|wifi_secret_id|senha-ficticia/i);
  });

  it('os resumos das mensagens recebidas não guardam coordenada nem senha', () => {
    const ingest = read(sealMigrations.find((f) => f.endsWith('_seals_ingest.sql'))!);
    expect(ingest).toMatch(/- 'latitude' - 'longitude' - 'accuracy_m' - 'password'/);
  });

  it('nenhum arquivo versionado tem chave real de dispositivo, chave VAPID privada ou service_role', () => {
    const files = [...FUNCTIONS.flatMap(sourcesOf), ...sealMigrations, path.join(ROOT, 'supabase/functions/_shared/seal-protocol.ts')];
    for (const file of files) {
      const text = read(file);
      expect(text, path.relative(ROOT, file)).not.toMatch(/fxk_[A-Za-z0-9_-]{20,}/);
      expect(text, path.relative(ROOT, file)).not.toMatch(/VAPID_PRIVATE_KEY\s*=\s*\S/);
      expect(text, path.relative(ROOT, file)).not.toMatch(/sb_secret_|service_role_key\s*=/i);
    }
  });
});

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Acesso direto ao banco do Supabase LOCAL, só para as suítes `.live` da Spec 012 (preparar dispositivos antes da US5 e simular a
// passagem do tempo). Usa o psql do próprio contêiner; nunca roda contra a nuvem e não lê nenhuma chave.
const CONTAINER = process.env.FLUXID_DB_CONTAINER ?? 'supabase_db_fluxid';
const FIXTURES = path.resolve(import.meta.dirname, 'sql/seals-fixtures.sql');

export function sql(query: string): string {
  return execFileSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    input: query, encoding: 'utf8',
  }).trim();
}

export function loadSealFixtures(): void {
  sql(readFileSync(FIXTURES, 'utf8'));
}

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

export function createTestDevice(org: string, key: string, createdBy: string): { device_id: string; device_code: string } {
  return JSON.parse(sql(`select tests_support.seal_device(${literal(org)}, ${literal(key)}, ${literal(createdBy)})::text;`)) as {
    device_id: string; device_code: string;
  };
}

export function bindTestDevice(deviceId: string, cylinderId: string, by: string): string {
  return sql(`select tests_support.seal_bind(${literal(deviceId)}, ${literal(cylinderId)}, ${literal(by)});`);
}

export function ageDevice(deviceId: string, seconds: number): void {
  sql(`select tests_support.seal_age(${literal(deviceId)}, ${Math.trunc(seconds)});`);
}

export function createTestCylinder(org: string, serial: string): string {
  return sql(`select tests_support.seal_cylinder(${literal(org)}, ${literal(serial)});`);
}

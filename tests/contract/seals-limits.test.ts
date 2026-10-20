// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEAL_ENROLLMENT_LIMITS, SEAL_LIMITS } from '../../src/domain/seals/seal-limits';
import { BATCH_MAX, SEAL_PROTOCOLS } from '../../supabase/functions/_shared/seal-protocol';

// Spec 012 (data-model.md, "Limites"; RF-007a): os limites do TypeScript são os de private.seal_limits(), e a borda do lacre usa o
// mesmo tamanho de lote e as mesmas versões de protocolo. A mesma lista é conferida no banco por supabase/tests/012_limits_contract.
const MIGRATIONS = path.resolve(import.meta.dirname, '../../supabase/migrations');
const schema = fs.readFileSync(path.join(MIGRATIONS, fs.readdirSync(MIGRATIONS).find((name) => name.endsWith('_seals_schema.sql'))!), 'utf8');

function sqlLimits(): Record<string, unknown> {
  const body = /create function private\.seal_limits\(\)[\s\S]*?jsonb_build_object\(([\s\S]*?)\)\s*\$\$;/.exec(schema)?.[1];
  expect(body).toBeDefined();
  const out: Record<string, unknown> = {};
  for (const [, key = '', value = ''] of body!.matchAll(/'(\w+)',\s*(jsonb_build_array\(([^)]*)\)|-?\d+)/g)) {
    out[key] = value.startsWith('jsonb_build_array') ? value.slice(18, -1).split(',').map((v) => Number(v.trim())) : Number(value);
  }
  return out;
}

const camel = (key: string) => key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

describe('limites únicos do lacre', () => {
  it('private.seal_limits() devolve exatamente os limites do TypeScript', () => {
    const fromSql = Object.fromEntries(Object.entries(sqlLimits()).map(([k, v]) => [camel(k), v]));
    expect(fromSql).toEqual({ ...SEAL_LIMITS, protocols: [...SEAL_LIMITS.protocols] });
  });

  it('a borda do lacre usa o mesmo lote máximo e as mesmas versões de protocolo', () => {
    expect(BATCH_MAX).toBe(SEAL_LIMITS.batchMax);
    expect([...SEAL_PROTOCOLS]).toEqual([...SEAL_LIMITS.protocols]);
  });

  it('private.seal_enrollment_limits() e o firmware usam os limites do pedido de aprovação (Spec 013)', () => {
    const enrollment = fs.readFileSync(path.join(MIGRATIONS, fs.readdirSync(MIGRATIONS).find((name) => name.endsWith('_seals_enrollment_schema.sql'))!), 'utf8');
    const body = /create function private\.seal_enrollment_limits\(\)[\s\S]*?jsonb_build_object\(([\s\S]*?)\)\s*\$\$;/.exec(enrollment)?.[1];
    expect(body).toBeDefined();
    const fromSql = Object.fromEntries([...body!.matchAll(/'(\w+)',\s*(-?\d+)/g)].map(([, k = '', v = '']) => [camel(k), Number(v)]));
    expect(fromSql).toEqual({ ...SEAL_ENROLLMENT_LIMITS });
    const config = fs.readFileSync(path.resolve(import.meta.dirname, '../../firmware/include/config.h'), 'utf8');
    const define = (name: string) => Number(new RegExp(`#define ${name} (-?\\d+)`).exec(config)?.[1]);
    expect(define('RECUSADO_TENTA_DE_NOVO_S')).toBe(SEAL_ENROLLMENT_LIMITS.refusedRetryS);
    expect(define('PORTAL_ABERTO_S')).toBe(SEAL_ENROLLMENT_LIMITS.portalOpenS);
    expect(define('PORTAL_FECHADO_S')).toBe(SEAL_ENROLLMENT_LIMITS.portalClosedS);
    expect(define('BOTAO_PORTAL_S')).toBe(SEAL_ENROLLMENT_LIMITS.portalButtonHoldS);
  });

  it('as restrições das tabelas usam os mesmos números', () => {
    expect(schema).toContain(`report_interval_s between ${SEAL_LIMITS.reportIntervalMinS} and ${SEAL_LIMITS.reportIntervalMaxS}`);
    expect(schema).toContain(`between ${SEAL_LIMITS.justificationMin} and ${SEAL_LIMITS.justificationMax}`);
  });
});

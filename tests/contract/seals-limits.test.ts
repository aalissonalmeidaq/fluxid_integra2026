// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEAL_LIMITS } from '../../src/domain/seals/seal-limits';
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

  it('as restrições das tabelas usam os mesmos números', () => {
    expect(schema).toContain(`report_interval_s between ${SEAL_LIMITS.reportIntervalMinS} and ${SEAL_LIMITS.reportIntervalMaxS}`);
    expect(schema).toContain(`between ${SEAL_LIMITS.justificationMin} and ${SEAL_LIMITS.justificationMax}`);
  });
});

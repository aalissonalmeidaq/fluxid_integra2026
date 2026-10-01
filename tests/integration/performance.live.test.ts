// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { callFunction, endAllSessions, login, logout, USERS } from '../support/auth-harness';

// RNF-003: p95 do login válido em até 3 s. RNF-004: p95 da confirmação de recuperação em até 2 s.
// Mede o tempo de resposta das Edge Functions reais (Auth e banco inclusos) no Supabase local. O resultado e o ambiente
// são registrados em specs/002-autenticacao-multitenancy-rbac/validation.md §2. Em cloud ou LAN a medição é outra.
const SAMPLES = 20;
const LOGIN_BUDGET_MS = 3000;
const RECOVERY_BUDGET_MS = 2000;

const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!;

describe('Desempenho ao vivo (RNF-003, RNF-004)', () => {
  it(`p95 do login válido em até ${LOGIN_BUDGET_MS} ms`, async () => {
    await endAllSessions(USERS.perf);
    const samples: number[] = [];
    for (let index = 0; index < SAMPLES; index += 1) {
      const startedAt = performance.now();
      const result = await login(USERS.perf);
      samples.push(performance.now() - startedAt);
      expect(result.status, 'o login medido precisa ser válido').toBe(200);
      await logout(result.body.session.access_token);
    }
    console.info(`PERF login p95=${Math.round(p95(samples))}ms max=${Math.round(Math.max(...samples))}ms amostras=${SAMPLES}`);
    expect(p95(samples), `amostras (ms): ${samples.map(Math.round).join(', ')}`).toBeLessThanOrEqual(LOGIN_BUDGET_MS);
  });

  it(`p95 da confirmação de recuperação em até ${RECOVERY_BUDGET_MS} ms`, async () => {
    const samples: number[] = [];
    for (let index = 0; index < SAMPLES; index += 1) {
      const startedAt = performance.now();
      const result = await callFunction('password-recovery', { email: USERS.perf.email });
      samples.push(performance.now() - startedAt);
      expect(result.status, 'a solicitação medida precisa ser aceita').toBe(202);
    }
    console.info(`PERF recuperação p95=${Math.round(p95(samples))}ms max=${Math.round(Math.max(...samples))}ms amostras=${SAMPLES}`);
    expect(p95(samples), `amostras (ms): ${samples.map(Math.round).join(', ')}`).toBeLessThanOrEqual(RECOVERY_BUDGET_MS);
  });
});

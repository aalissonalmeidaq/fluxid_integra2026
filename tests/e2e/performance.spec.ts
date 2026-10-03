import { test, expect } from '@playwright/test';
import { MockBackend } from './support/mock-backend';

// RNF-003: 95% dos logins válidos mostram o resultado em até 3 s. RNF-004: 95% das recuperações válidas mostram a
// confirmação em até 2 s. O teste mede a parcela que pertence à interface (do clique até o resultado visível) com o
// backend simulado respondendo de imediato. O tempo do Supabase real e o ambiente de referência são registrados em
// specs/002-autenticacao-multitenancy-rbac/validation.md; este teste não substitui essa medição.
const SAMPLES = 20;
const LOGIN_BUDGET_MS = 3000;
const RECOVERY_BUDGET_MS = 2000;

function percentile95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}

test.describe('Desempenho percebido (RNF-003, RNF-004)', () => {
  test(`p95 do login válido até o resultado visível em até ${LOGIN_BUDGET_MS} ms`, async ({ browser }, testInfo) => {
    testInfo.setTimeout(120_000);
    const samples: number[] = [];
    for (let index = 0; index < SAMPLES; index += 1) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      const backend = new MockBackend();
      backend.loginResponses = [backend.authenticated()];
      backend.statusResponse = backend.activeStatus('aal1');
      await backend.install(page);
      await page.goto('/');
      await page.getByLabel('E-mail').fill('operador-a@example.invalid');
      await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
      const submit = page.getByRole('button', { name: 'Entrar', exact: true });
      await submit.waitFor();
      const startedAt = Date.now();
      await submit.click();
      await page.getByRole('button', { name: 'Minha conta' }).waitFor();
      samples.push(Date.now() - startedAt);
      await context.close();
    }
    const p95 = percentile95(samples);
    testInfo.annotations.push({ type: 'p95-login-ms', description: String(p95) });
    expect(p95, `amostras (ms): ${samples.join(', ')}`).toBeLessThanOrEqual(LOGIN_BUDGET_MS);
  });

  test(`p95 da confirmação de recuperação em até ${RECOVERY_BUDGET_MS} ms`, async ({ browser }, testInfo) => {
    testInfo.setTimeout(120_000);
    const samples: number[] = [];
    for (let index = 0; index < SAMPLES; index += 1) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      await new MockBackend().install(page);
      await page.goto('/');
      await page.getByRole('link', { name: /esqueci minha senha/i }).or(page.getByRole('button', { name: /esqueci minha senha/i })).click();
      await page.getByLabel('E-mail').fill('operador-a@example.invalid');
      const submit = page.getByRole('button', { name: 'Enviar instruções' });
      const startedAt = Date.now();
      await submit.click();
      await page.getByRole('status').filter({ hasText: /enviaremos as instruções/i }).waitFor();
      samples.push(Date.now() - startedAt);
      await context.close();
    }
    const p95 = percentile95(samples);
    testInfo.annotations.push({ type: 'p95-recovery-ms', description: String(p95) });
    expect(p95, `amostras (ms): ${samples.join(', ')}`).toBeLessThanOrEqual(RECOVERY_BUDGET_MS);
  });
});

import { describe, expect, it } from 'vitest';
import {
  EMPTY_FUNCTIONAL_DIFF_SHA256,
  assertNonEmptyFunctionalDiff,
  isValidFunctionalDiffHash,
} from '../../scripts/governanca-ia/registro-utils.mjs';

describe('utilitários de integridade do RIA', () => {
  it('impede o gerador de aceitar diff funcional vazio', () => {
    expect(() => assertNonEmptyFunctionalDiff('')).toThrow(/diff funcional preparado está vazio/i);
    expect(() => assertNonEmptyFunctionalDiff('   \n')).toThrow(/diff funcional preparado está vazio/i);
  });

  it('gera hash SHA-256 apenas para conteúdo funcional não vazio', () => {
    expect(assertNonEmptyFunctionalDiff('diff --git a/src/a.ts b/src/a.ts')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('faz o validador rejeitar o hash vazio conhecido', () => {
    expect(isValidFunctionalDiffHash(EMPTY_FUNCTIONAL_DIFF_SHA256)).toBe(false);
    expect(isValidFunctionalDiffHash('')).toBe(false);
  });
});

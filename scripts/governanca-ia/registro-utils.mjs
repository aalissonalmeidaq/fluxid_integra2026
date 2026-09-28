import { createHash } from 'node:crypto';

export const EMPTY_FUNCTIONAL_DIFF_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export function assertNonEmptyFunctionalDiff(diff) {
  if (!diff || !diff.trim()) {
    throw new Error('O diff funcional preparado está vazio; não é possível gerar um RIA para este ciclo.');
  }

  return createHash('sha256').update(diff).digest('hex');
}

export function isValidFunctionalDiffHash(hash) {
  return typeof hash === 'string'
    && /^[a-f0-9]{64}$/i.test(hash)
    && hash.toLowerCase() !== EMPTY_FUNCTIONAL_DIFF_SHA256;
}

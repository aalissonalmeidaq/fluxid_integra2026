// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ALERT_KIND_LABEL } from '../../supabase/functions/_shared/alert-kinds';
import { ALERT_KINDS, alertKind } from '@/domain/seals/seal-vocabulary';

// Spec 015: o CSV e o e-mail usam as mesmas palavras da tela para o tipo do alerta. A lista das funções não pode ficar para trás.
describe('tipos de alerta nas funções servidoras', () => {
  it('cobre todo tipo da tela, com o mesmo texto', () => {
    for (const kind of ALERT_KINDS) expect(ALERT_KIND_LABEL[kind], kind).toBe(alertKind(kind).label);
  });
});

// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSealRequest, parseSealResponse } from '../../supabase/functions/_shared/seal-protocol';

// Spec 013, pedido de aprovação (contracts/pedido-de-aprovacao.md; CA-006 da Spec 012). Os exemplos enrollment-* são a referência
// usada pela borda, pelo simulador e pelos testes nativos do firmware. Nenhuma resposta revela organização, cilindro ou o motivo de um 401.

const DIR = path.resolve(import.meta.dirname, '../fixtures/seal-protocol');
const fixtures = Object.fromEntries(readdirSync(DIR).filter((f) => f.startsWith('enrollment-') && f.endsWith('.json'))
  .map((f) => [f, JSON.parse(readFileSync(path.join(DIR, f), 'utf8')) as Record<string, unknown>]));

const REVEALING = /organi[sz]ation|tenant|cylinder|cilindro|customer|reason|motivo|key|chave/i;

describe('exemplos do pedido de aprovação', () => {
  it('existem todos os exemplos do contrato', () => {
    expect(Object.keys(fixtures).sort()).toEqual([
      'enrollment-approved-200.json', 'enrollment-conflict-401.json', 'enrollment-networks-forgotten.json',
      'enrollment-pending-approval-202.json', 'enrollment-pending-request.json', 'enrollment-rate-limited-429.json',
      'enrollment-refused-403.json', 'enrollment-returned-202.json', 'enrollment-withdrawn-202.json',
    ]);
  });

  it('nenhum exemplo revela organização, cilindro, chave ou o motivo de um 401', () => {
    for (const [nome, body] of Object.entries(fixtures)) {
      const keys = JSON.stringify(body).match(/"(\w+)":/g)?.map((k) => k.slice(1, -2)) ?? [];
      expect(keys.filter((k) => REVEALING.test(k)), nome).toEqual([]);
    }
    expect(fixtures['enrollment-conflict-401.json']).toEqual({ error: 'unauthorized' });
  });

  it('enquanto aguarda, o lacre manda só boot, network_change e networks_forgotten, e o esquema os aceita', () => {
    for (const nome of ['enrollment-pending-request.json', 'enrollment-networks-forgotten.json']) {
      const parsed = parseSealRequest(fixtures[nome]);
      expect(parsed.ok, nome).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.value.messages.every((m) => m.problem === null), nome).toBe(true);
      const kinds = parsed.value.messages.map((m) => (m.type === 'event' ? `event:${(m.data as { code: string }).code}` : m.type));
      expect(kinds.every((k) => ['event:boot', 'network_change', 'event:networks_forgotten'].includes(k)), nome).toBe(true);
    }
  });

  it('as respostas 202 têm só a situação, o intervalo e, quando houver, o esquecimento das redes', () => {
    expect(fixtures['enrollment-pending-approval-202.json']).toEqual({ status: 'pending_approval', report_interval_s: 60 });
    expect(fixtures['enrollment-returned-202.json']).toEqual({ status: 'pending_approval', report_interval_s: 60, forget_networks: 'all' });
    expect(fixtures['enrollment-withdrawn-202.json']).toEqual({ status: 'pending_approval', report_interval_s: 60, forget_networks: 'extras' });
    expect(fixtures['enrollment-refused-403.json']).toEqual({ status: 'refused' });
    expect(fixtures['enrollment-rate-limited-429.json']).toEqual({ error: 'rate_limited' });
  });

  it('a aprovação é uma resposta 200 como a da Spec 012', () => {
    expect(parseSealResponse(fixtures['enrollment-approved-200.json'])).toEqual({ ok: true });
  });
});

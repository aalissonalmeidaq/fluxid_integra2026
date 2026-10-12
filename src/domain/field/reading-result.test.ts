// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decideConference, decideDelivery, describeUnresolved, type ResolutionLike } from './reading-result';

// RF-001, RF-001a, RF-003, RN-001, RN-005: a leitura IDENTIFICA; o que acontece com o cilindro lido vem destas regras puras e os
// textos são os do contrato de telas.
const TRIP = 'trip-1';
const found = (over: { cylinderId?: string; serial?: string; status?: string; trip?: { id: string; number: number } | null } = {}): ResolutionLike => ({
  kind: 'found',
  value: { cylinder: { id: over.cylinderId ?? 'c1', serialNumber: over.serial ?? 'FLD-001', status: over.status ?? 'active' }, trip: over.trip ?? null },
});
const items = [
  { id: 'i1', cylinderId: 'c1', status: 'planned' },
  { id: 'i2', cylinderId: 'c2', status: 'checked' },
  { id: 'i3', cylinderId: 'c3', status: 'removed' },
];

describe('decideConference', () => {
  it('cilindro previsto e ainda não conferido: manda conferir o item', () => {
    expect(decideConference(found(), items, TRIP, 'camera')).toEqual({ action: 'check', itemId: 'i1', serial: 'FLD-001' });
  });

  it('cilindro já conferido: não cria evento e avisa', () => {
    expect(decideConference(found({ cylinderId: 'c2', serial: 'FLD-002' }), items, TRIP, 'camera')).toEqual({
      action: 'none', message: { tone: 'info', message: 'Cilindro FLD-002 já estava conferido.' },
    });
  });

  it('cilindro retirado da viagem: avisa que não está mais previsto', () => {
    expect(decideConference(found({ cylinderId: 'c3', serial: 'FLD-003' }), items, TRIP, 'camera')).toEqual({
      action: 'none', message: { tone: 'error', message: 'Cilindro FLD-003 não está mais previsto nesta viagem.' },
    });
  });

  it('cilindro da organização que não é desta viagem, sem a viagem à vista: só diz que não pertence', () => {
    expect(decideConference(found({ cylinderId: 'c9', serial: 'FLD-009' }), items, TRIP, 'camera')).toEqual({
      action: 'none', message: { tone: 'error', message: 'Cilindro FLD-009 não pertence a esta viagem.' },
    });
  });

  it('com trip.read (a viagem veio na resposta), diz em qual viagem ele está reservado', () => {
    const result = decideConference(found({ cylinderId: 'c9', serial: 'FLD-009', trip: { id: 'trip-7', number: 7 } }), items, TRIP, 'camera');
    expect(result).toEqual({ action: 'none', message: { tone: 'error', message: 'Cilindro FLD-009 não pertence a esta viagem. Está reservado na viagem n.º 7.' } });
  });

  it('a própria viagem na resposta nunca é citada como "outra viagem"', () => {
    const result = decideConference(found({ cylinderId: 'c9', serial: 'FLD-009', trip: { id: TRIP, number: 4 } }), items, TRIP, 'camera');
    expect(result).toMatchObject({ action: 'none', message: { message: 'Cilindro FLD-009 não pertence a esta viagem.' } });
  });

  it('cilindro inativo fora da viagem: diz que está inativo', () => {
    expect(decideConference(found({ cylinderId: 'c9', serial: 'FLD-009', status: 'inactive' }), items, TRIP, 'camera')).toMatchObject({
      action: 'none', message: { tone: 'error', message: 'Cilindro FLD-009 está inativo.' },
    });
  });

  it('o resultado não depende só de cor: sempre há texto', () => {
    for (const outcome of [found(), found({ cylinderId: 'c2' }), { kind: 'not_found' } as const]) {
      const decision = decideConference(outcome, items, TRIP, 'camera');
      if (decision.action === 'none') expect(decision.message.message.length).toBeGreaterThan(5);
    }
  });
});

describe('describeUnresolved', () => {
  it('não encontrado (inclui o de outra organização): a mesma frase, sem dado nenhum', () => {
    expect(describeUnresolved({ kind: 'not_found' }, 'camera')).toEqual({ tone: 'error', message: 'Cilindro não encontrado.' });
  });

  it('não encontrado por NFC: acrescenta a dica do formato', () => {
    expect(describeUnresolved({ kind: 'not_found' }, 'nfc')).toEqual({ tone: 'error', message: 'Cilindro não encontrado. Confira o formato do valor cadastrado.' });
  });

  it('identificador desativado: diz a quem valia', () => {
    expect(describeUnresolved({ kind: 'deactivated', cylinder: { serialNumber: 'FLD-004' } }, 'camera')).toEqual({
      tone: 'warning', message: 'Este identificador foi desativado. Valia para o cilindro FLD-004.',
    });
  });

  it.each([
    ['invalid', 'Código inválido. Tente ler de novo.'],
    ['offline', 'Sem conexão. Registrar exige conexão.'],
    ['access_denied', 'Você não tem permissão para esta leitura.'],
    ['session_expired', 'Sua sessão expirou. Entre de novo para continuar.'],
    ['unavailable', 'Não foi possível consultar agora. Tente de novo.'],
  ] as const)('%s: "%s"', (kind, message) => {
    expect(describeUnresolved({ kind }, 'camera')).toMatchObject({ tone: 'error', message });
  });
});

describe('decideConference com resposta que não achou o cilindro', () => {
  it('devolve a mensagem de quem não foi resolvido', () => {
    expect(decideConference({ kind: 'not_found' }, items, TRIP, 'nfc')).toEqual({ action: 'none', message: describeUnresolved({ kind: 'not_found' }, 'nfc') });
  });
});

describe('decideDelivery', () => {
  const stop = [
    { id: 'i1', cylinderId: 'c1', status: 'in_transit' },
    { id: 'i2', cylinderId: 'c2', status: 'in_transit' },
    { id: 'i4', cylinderId: 'c4', status: 'delivered' },
  ];

  it('cilindro previsto na parada e em trânsito: marca como entregue', () => {
    expect(decideDelivery(found(), stop, new Set(), 'camera')).toEqual({ action: 'deliver', itemId: 'i1', serial: 'FLD-001' });
  });

  it('cilindro já marcado nesta entrega: não marca de novo e avisa', () => {
    expect(decideDelivery(found(), stop, new Set(['i1']), 'camera')).toEqual({
      action: 'none', message: { tone: 'info', message: 'Cilindro FLD-001 já está marcado como entregue.' },
    });
  });

  it('cilindro que não é desta parada é recusado e não entra na entrega', () => {
    expect(decideDelivery(found({ cylinderId: 'c9', serial: 'FLD-009' }), stop, new Set(), 'camera')).toEqual({
      action: 'none', message: { tone: 'error', message: 'Cilindro FLD-009 não está previsto nesta parada.' },
    });
  });

  it('cilindro da parada que já não está em trânsito (já entregue) também não entra', () => {
    expect(decideDelivery(found({ cylinderId: 'c4', serial: 'FLD-004' }), stop, new Set(), 'camera')).toEqual({
      action: 'none', message: { tone: 'error', message: 'Cilindro FLD-004 não está previsto nesta parada.' },
    });
  });

  it('não encontrado: a mesma frase de sempre', () => {
    expect(decideDelivery({ kind: 'not_found' }, stop, new Set(), 'nfc')).toEqual({ action: 'none', message: describeUnresolved({ kind: 'not_found' }, 'nfc') });
  });

  it('na correção, os cilindros pendentes são os não entregues', () => {
    const pending = [{ id: 'i5', cylinderId: 'c5', status: 'not_delivered' }];
    expect(decideDelivery(found({ cylinderId: 'c5', serial: 'FLD-005' }), pending, new Set(), 'camera')).toEqual({ action: 'deliver', itemId: 'i5', serial: 'FLD-005' });
  });
});

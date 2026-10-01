import { describe, expect, it } from 'vitest';
import { eligibleOptions, requestSelection, resolveSelection, type MembershipRecord } from './tenant-selection';

const A = '20000000-0000-0000-0000-00000000000a';
const B = '20000000-0000-0000-0000-00000000000b';
const C = '20000000-0000-0000-0000-00000000000c';
const OWNER = '20000000-0000-0000-0000-000000000001';

const record = (organizationId: string, over: Partial<MembershipRecord> = {}): MembershipRecord => ({
  membershipId: `m-${organizationId.slice(-1)}`,
  organizationId,
  membershipStatus: 'active',
  organization: { id: organizationId, kind: 'tenant', status: 'active', displayName: `Tenant ${organizationId.slice(-1).toUpperCase()}` },
  ...over,
});

describe('eligibleOptions', () => {
  it('lista somente vínculos ativos em organizações ativas', () => {
    const options = eligibleOptions([
      record(A),
      record(B, { membershipStatus: 'blocked' }),
      record(C, { organization: { id: C, kind: 'tenant', status: 'suspended', displayName: 'Tenant C' } }),
    ]);
    expect(options).toEqual([{ organizationId: A, displayName: 'Tenant A', kind: 'tenant' }]);
  });

  it.each(['invited', 'blocked', 'inactive'] as const)('exclui vínculo %s', (membershipStatus) => {
    expect(eligibleOptions([record(A, { membershipStatus })])).toEqual([]);
  });

  it.each(['suspended', 'inactive'] as const)('exclui tenant %s', (status) => {
    expect(eligibleOptions([record(A, { organization: { id: A, kind: 'tenant', status, displayName: 'Tenant A' } })])).toEqual([]);
  });

  it('não confia em registro sem organização ou com organização de outro identificador', () => {
    expect(eligibleOptions([record(A, { organization: null })])).toEqual([]);
    expect(eligibleOptions([record(A, { organization: { id: B, kind: 'tenant', status: 'active', displayName: 'Tenant B' } })])).toEqual([]);
  });

  it('inclui a organização proprietária como contexto e ordena por nome de forma determinística', () => {
    const options = eligibleOptions([
      record(B),
      record(OWNER, { organization: { id: OWNER, kind: 'owner', status: 'active', displayName: 'FluxID' } }),
      record(A),
    ]);
    expect(options.map((option) => option.displayName)).toEqual(['FluxID', 'Tenant A', 'Tenant B']);
    expect(eligibleOptions([record(B), record(A)])).toEqual(eligibleOptions([record(A), record(B)]));
  });

  it('desempata nomes iguais pelo identificador, mantendo a ordem determinística', () => {
    const same = (id: string) => record(id, { organization: { id, kind: 'tenant', status: 'active', displayName: 'Filial' } });
    expect(eligibleOptions([same(B), same(A)]).map((option) => option.organizationId)).toEqual([A, B]);
    expect(eligibleOptions([same(A), same(B)]).map((option) => option.organizationId)).toEqual([A, B]);
  });

  it('não repete a mesma organização', () => {
    expect(eligibleOptions([record(A), record(A, { membershipId: 'outro' })])).toHaveLength(1);
  });

  it('retorna vazio sem vínculos', () => {
    expect(eligibleOptions([])).toEqual([]);
  });
});

describe('resolveSelection', () => {
  const optionA = { organizationId: A, displayName: 'Tenant A', kind: 'tenant' as const };
  const optionB = { organizationId: B, displayName: 'Tenant B', kind: 'tenant' as const };

  it('sem opções elegíveis não há contexto', () => {
    expect(resolveSelection([], null)).toEqual({ kind: 'none' });
  });

  it('com um único vínculo ativo seleciona sem etapa de escolha', () => {
    expect(resolveSelection([optionA], null)).toEqual({ kind: 'selected', option: optionA });
  });

  it('com mais de um vínculo exige escolha antes de acessar áreas do tenant', () => {
    expect(resolveSelection([optionA, optionB], null)).toEqual({ kind: 'choose', options: [optionA, optionB] });
  });

  it('mantém a seleção atual enquanto ela continua elegível', () => {
    expect(resolveSelection([optionA, optionB], B)).toEqual({ kind: 'selected', option: optionB });
  });

  it('descarta a seleção que deixou de ser elegível (tenant suspenso ou vínculo bloqueado)', () => {
    expect(resolveSelection([optionA, optionB], C)).toEqual({ kind: 'choose', options: [optionA, optionB] });
    expect(resolveSelection([optionA], C)).toEqual({ kind: 'selected', option: optionA });
    expect(resolveSelection([], C)).toEqual({ kind: 'none' });
  });
});

describe('requestSelection', () => {
  const options = [
    { organizationId: A, displayName: 'Tenant A', kind: 'tenant' as const },
    { organizationId: B, displayName: 'Tenant B', kind: 'tenant' as const },
  ];

  it('aceita somente organização elegível para o usuário', () => {
    expect(requestSelection(options, B)).toEqual({ ok: true, option: options[1] });
  });

  it('trata o identificador do cliente como pedido: não elegível é recusado', () => {
    expect(requestSelection(options, C)).toEqual({ ok: false, reason: 'not_eligible' });
  });

  it.each([undefined, null, '', 42, {}, ['x']])('recusa identificador adulterado %j', (value) => {
    expect(requestSelection(options, value)).toEqual({ ok: false, reason: 'not_eligible' });
  });

  it('recusa quando não há opções elegíveis', () => {
    expect(requestSelection([], A)).toEqual({ ok: false, reason: 'not_eligible' });
  });
});

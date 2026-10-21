import { describe, expect, it } from 'vitest';
import {
  ENROLLMENT_STATUSES, ENROLLMENT_TRANSITIONS, CONFLICT_PRESENTATION, approvalBlock, canTransition, enrollmentStatus, isReadyToBind,
  portalNetworkName, signalText, validateJustification,
} from './seal-enrollment';

// Spec 013 (data-model.md, "Situações"; RF-010 a RF-016, RN-006): o vocabulário do pedido, o sinal em texto, a regra do "pronto
// para vincular", a justificativa e o que impede a aprovação. O banco confere de novo; aqui a regra serve à tela.
describe('situações do pedido', () => {
  it('as situações são as do data-model, com texto, ícone e tom', () => {
    expect([...ENROLLMENT_STATUSES]).toEqual(['pending', 'approved', 'refused', 'expired', 'returned']);
    expect(ENROLLMENT_STATUSES.map((s) => enrollmentStatus(s).label)).toEqual(['Aguardando vinculação a uma empresa', 'Em operação', 'Recusado', 'Expirado', 'Devolvido']);
    for (const s of ENROLLMENT_STATUSES) expect(enrollmentStatus(s).icon).toBeTruthy();
  });

  it('situação desconhecida é recusada', () => {
    expect(() => enrollmentStatus('blocked' as never)).toThrow(/desconhecid/);
  });

  it('o conflito é uma marca, com texto e ícone, e não uma situação', () => {
    expect(CONFLICT_PRESENTATION).toMatchObject({ label: 'Outro aparelho com este código', icon: 'alerta' });
    expect(ENROLLMENT_STATUSES).not.toContain('conflict');
  });
});

describe('transições', () => {
  it('seguem o diagrama do data-model', () => {
    expect(ENROLLMENT_TRANSITIONS).toEqual({
      pending: ['approved', 'refused', 'expired'],
      approved: ['pending', 'returned'],
      refused: ['approved'],
      expired: ['pending'],
      returned: ['approved'],
    });
    expect(canTransition('refused', 'approved')).toBe(true);
    expect(canTransition('refused', 'pending')).toBe(false);
    expect(canTransition('approved', 'refused')).toBe(false);
  });
});

describe('sinal em texto', () => {
  it('forte a partir de -60, médio de -61 a -75 e fraco abaixo de -75', () => {
    expect(signalText(-40)).toBe('forte');
    expect(signalText(-60)).toBe('forte');
    expect(signalText(-61)).toBe('médio');
    expect(signalText(-75)).toBe('médio');
    expect(signalText(-76)).toBe('fraco');
    expect(signalText(null)).toBeNull();
  });
});

describe('pronto para vincular', () => {
  it('é o lacre ativo e sem cilindro', () => {
    expect(isReadyToBind({ status: 'active', cylinder: null })).toBe(true);
    expect(isReadyToBind({ status: 'active', cylinder: { id: 'c1' } })).toBe(false);
    expect(isReadyToBind({ status: 'inactive', cylinder: null })).toBe(false);
  });
});

describe('justificativa', () => {
  it('tem de 5 a 500 caracteres depois de juntar os espaços', () => {
    expect(validateJustification('  Lacre   da bancada  ')).toEqual({ ok: true, value: 'Lacre da bancada' });
    expect(validateJustification('  abcd ')).toMatchObject({ ok: false, error: expect.stringMatching(/5 a 500/) });
    expect(validateJustification('x'.repeat(501))).toMatchObject({ ok: false });
    expect(validateJustification('x'.repeat(500)).ok).toBe(true);
  });
});

describe('o que impede a aprovação', () => {
  const base = { status: 'pending' as const, conflict: false, lastOrganizationId: null, lastOrganizationName: null };

  it('pedido sem impedimento pode ser aprovado para qualquer tenant', () => {
    expect(approvalBlock(base, 'tenant-a')).toBeNull();
  });

  it('com conflito não pode, e o motivo vem em texto', () => {
    expect(approvalBlock({ ...base, conflict: true }, 'tenant-a')).toMatch(/Outro aparelho com este código/);
  });

  it('só aguardando, devolvido ou recusado podem ser aprovados', () => {
    expect(approvalBlock({ ...base, status: 'approved' }, 'tenant-a')).toMatch(/em operação/);
    expect(approvalBlock({ ...base, status: 'expired' }, 'tenant-a')).toMatch(/expirou/);
    expect(approvalBlock({ ...base, status: 'refused' }, 'tenant-a')).toBeNull();
    expect(approvalBlock({ ...base, status: 'returned' }, 'tenant-a')).toBeNull();
  });

  it('para tenant diferente do último, exige o esquecimento das redes (RN-006)', () => {
    const withLast = { ...base, lastOrganizationId: 'tenant-a', lastOrganizationName: 'Tenant A' };
    expect(approvalBlock(withLast, 'tenant-a')).toBeNull();
    expect(approvalBlock(withLast, 'tenant-b')).toMatch(/redes da empresa Tenant A/);
  });
});

describe('nome da rede de configuração', () => {
  it('é FluxID-Lacre- mais os 4 últimos caracteres do código', () => {
    expect(portalNetworkName('DSP-7KQ2M9XT')).toBe('FluxID-Lacre-M9XT');
  });
});

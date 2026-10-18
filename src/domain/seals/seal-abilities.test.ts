import { describe, expect, it } from 'vitest';
import { sealAbilities, type SealContext } from './seal-abilities';

// Spec 012 (RF-025, RF-033, RF-034, RF-034f, RF-043, RN-005): o que a tela oferece a cada pessoa e por que uma ação está desabilitada.
// O servidor repete todas as regras; aqui só se decide o que mostrar.
const base: SealContext = {
  permissions: ['seal.read', 'seal.operate', 'seal.admin'],
  online: true,
  deviceActive: true,
  bound: true,
  lockState: 'locked',
  tripInProgress: false,
  underWatch: false,
  unlockIsException: false,
};

describe('sealAbilities', () => {
  it('quem só vê não opera nada, com o motivo', () => {
    const a = sealAbilities({ ...base, permissions: ['seal.read'] });
    expect(a.lock).toEqual({ allowed: false, reason: 'Você não tem permissão para operar lacres.' });
    expect(a.closeAlert.allowed).toBe(false);
    expect(a.manageDevice.allowed).toBe(false);
    expect(a.changeWifi.allowed).toBe(false);
  });

  it('offline desabilita todo comando, com o motivo (RF-043)', () => {
    const a = sealAbilities({ ...base, online: false });
    for (const action of [a.bind, a.unbind, a.lock, a.unlock, a.changeWifi, a.closeAlert, a.manageDevice]) {
      expect(action).toEqual({ allowed: false, reason: 'Sem conexão: comandos de lacre exigem conexão.' });
    }
  });

  it('desvincular não é possível com viagem em andamento (RF-034)', () => {
    expect(sealAbilities({ ...base, tripInProgress: true }).unbind).toEqual({
      allowed: false, reason: 'O cilindro está numa viagem em andamento.',
    });
  });

  it('vincular só sem vínculo e com o lacre ativo', () => {
    expect(sealAbilities(base).bind.allowed).toBe(false);
    expect(sealAbilities({ ...base, bound: false }).bind.allowed).toBe(true);
    expect(sealAbilities({ ...base, bound: false, deviceActive: false }).bind).toEqual({ allowed: false, reason: 'O dispositivo está desativado.' });
  });

  it('travar e destravar exigem vínculo', () => {
    const a = sealAbilities({ ...base, bound: false });
    expect(a.lock).toEqual({ allowed: false, reason: 'O cilindro não tem lacre vinculado.' });
    expect(a.unlock.allowed).toBe(false);
  });

  it('destravar pela tela é sempre fora da regra da entrega e pede o segundo fator (RF-025, RN-005)', () => {
    expect(sealAbilities(base).unlock).toEqual({ allowed: true, needsMfa: true });
    expect(sealAbilities({ ...base, unlockIsException: true }).unlock).toEqual({ allowed: true, needsMfa: true });
    expect(sealAbilities({ ...base, lockState: 'locked_violation' }).unlock).toEqual({ allowed: true, needsMfa: true });
    expect(sealAbilities({ ...base, lockState: 'locked_comm_loss' }).unlock).toEqual({ allowed: true, needsMfa: true });
  });

  it('trocar rede com viagem ou vigilância pede confirmação do risco (RF-034f)', () => {
    expect(sealAbilities(base).changeWifi).toEqual({ allowed: true, needsRiskConfirm: false });
    expect(sealAbilities({ ...base, tripInProgress: true }).changeWifi).toEqual({ allowed: true, needsRiskConfirm: true });
    expect(sealAbilities({ ...base, underWatch: true }).changeWifi).toEqual({ allowed: true, needsRiskConfirm: true });
    expect(sealAbilities({ ...base, permissions: ['seal.read', 'seal.operate'] }).changeWifi).toEqual({
      allowed: false, reason: 'Só quem administra dispositivos altera as redes do lacre.',
    });
  });

  it('dispositivo desativado não recebe comando de trava nem de rede', () => {
    const a = sealAbilities({ ...base, deviceActive: false });
    expect(a.lock).toEqual({ allowed: false, reason: 'O dispositivo está desativado.' });
    expect(a.changeWifi).toEqual({ allowed: false, reason: 'O dispositivo está desativado.' });
  });
});

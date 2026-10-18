// O que a tela do lacre oferece e por que uma ação está desabilitada (Spec 012: RF-025, RF-033, RF-034, RF-034f, RF-043, RN-005).
// O servidor repete todas as regras; esta função só decide o que mostrar e com qual explicação.
import type { LockState } from './seal-vocabulary';

export interface SealContext {
  permissions: readonly string[];
  online: boolean;
  deviceActive: boolean;
  bound: boolean;
  lockState: LockState;
  tripInProgress: boolean;
  underWatch: boolean;
  // Destravar pela tela é sempre fora da regra da entrega (RF-025): o campo fica para a explicação na entrega (US3).
  unlockIsException: boolean;
}

export type Ability =
  | { allowed: false; reason: string }
  | { allowed: true; needsMfa?: boolean; needsRiskConfirm?: boolean };

export interface SealAbilities {
  bind: Ability;
  unbind: Ability;
  lock: Ability;
  unlock: Ability;
  changeWifi: Ability;
  closeAlert: Ability;
  manageDevice: Ability;
}

const OFFLINE = 'Sem conexão: comandos de lacre exigem conexão.';
const NO_OPERATE = 'Você não tem permissão para operar lacres.';
const NO_ADMIN = 'Só quem administra dispositivos altera as redes do lacre.';
const INACTIVE = 'O dispositivo está desativado.';
const NOT_BOUND = 'O cilindro não tem lacre vinculado.';
const IN_TRIP = 'O cilindro está numa viagem em andamento.';
const deny = (reason: string): Ability => ({ allowed: false, reason });

export function sealAbilities(c: SealContext): SealAbilities {
  const operate = c.permissions.includes('seal.operate');
  const admin = c.permissions.includes('seal.admin');
  // A primeira regra que falha decide o motivo: conexão, permissão e depois o estado do lacre.
  const gate = (allowed: boolean, reason: string, ...checks: [boolean, string][]): Ability | null => {
    if (!c.online) return deny(OFFLINE);
    if (!allowed) return deny(reason);
    for (const [ok, why] of checks) if (!ok) return deny(why);
    return null;
  };

  // O destravamento automático só acontece na entrega comprovada; pedir pela tela é sempre exceção, com segundo fator (RN-005).
  const exceptional = true;
  const risky = c.tripInProgress || c.underWatch;

  return {
    bind: gate(operate, NO_OPERATE, [c.deviceActive, INACTIVE], [!c.bound, 'O lacre já está vinculado.']) ?? { allowed: true },
    unbind: gate(operate, NO_OPERATE, [c.bound, NOT_BOUND], [!c.tripInProgress, IN_TRIP]) ?? { allowed: true },
    lock: gate(operate, NO_OPERATE, [c.deviceActive, INACTIVE], [c.bound, NOT_BOUND]) ?? { allowed: true },
    unlock: gate(operate, NO_OPERATE, [c.deviceActive, INACTIVE], [c.bound, NOT_BOUND]) ?? { allowed: true, needsMfa: exceptional },
    changeWifi: gate(admin, NO_ADMIN, [c.deviceActive, INACTIVE]) ?? { allowed: true, needsRiskConfirm: risky },
    closeAlert: gate(operate, NO_OPERATE) ?? { allowed: true },
    manageDevice: gate(admin, 'Só quem administra dispositivos cadastra, desativa ou troca a chave.') ?? { allowed: true },
  };
}

// O que a pessoa pode fazer numa viagem, vindo das permissões do servidor. A decisão final de cada ação é sempre do servidor; isto só
// decide o que a tela oferece (RN-002).
export interface TripAbilities {
  write: boolean;
  operate: boolean;
  exception: boolean;
  cancel: boolean;
  unlock: boolean;
  history: boolean;
  recipient: boolean;
}

export const NO_ABILITIES: TripAbilities = { write: false, operate: false, exception: false, cancel: false, unlock: false, history: false, recipient: false };

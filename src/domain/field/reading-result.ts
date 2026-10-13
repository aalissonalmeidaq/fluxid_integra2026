import type { ReadingSource } from './reading-source';

// O que fazer com o cilindro lido e o que dizer à pessoa (RF-001, RF-001a, RF-003, RN-001, RN-005). A leitura IDENTIFICA; quem muda a
// situação do cilindro é a operação da viagem (Spec 008), validada pelo servidor. Aqui só há regras puras e os textos do contrato de
// telas; o resultado nunca depende só de cor, e nenhum valor lido aparece nas mensagens.
export type ReadingTone = 'success' | 'warning' | 'error' | 'info';
export interface ReadingMessage { tone: ReadingTone; message: string }

// Forma mínima da resposta de `resolve` (casa com `ResolveOutcome` do serviço de campo, sem depender da camada de aplicação).
export type ResolutionLike =
  | { kind: 'found'; value: { cylinder: { id: string; serialNumber: string; status: string }; trip: { id: string; number: number } | null } }
  | { kind: 'not_found' }
  | { kind: 'deactivated'; cylinder: { serialNumber: string } }
  | { kind: 'invalid' | 'offline' | 'access_denied' | 'session_expired' | 'unavailable' };

export interface ItemLike { id: string; cylinderId: string; status: string }

const NFC_HINT = ' Confira o formato do valor cadastrado.';

// Mensagem de uma leitura que não chegou a achar um cilindro ativo.
export function describeUnresolved(outcome: Exclude<ResolutionLike, { kind: 'found' }>, source: ReadingSource): ReadingMessage {
  switch (outcome.kind) {
    case 'not_found': return { tone: 'error', message: `Cilindro não encontrado.${source === 'nfc' ? NFC_HINT : ''}` };
    case 'deactivated': return { tone: 'warning', message: `Este identificador foi desativado. Valia para o cilindro ${outcome.cylinder.serialNumber}.` };
    case 'invalid': return { tone: 'error', message: 'Código inválido. Tente ler de novo.' };
    case 'offline': return { tone: 'error', message: 'Sem conexão. Registrar exige conexão.' };
    case 'access_denied': return { tone: 'error', message: 'Você não tem permissão para esta leitura.' };
    case 'session_expired': return { tone: 'error', message: 'Sua sessão expirou. Entre de novo para continuar.' };
    case 'unavailable': return { tone: 'error', message: 'Não foi possível consultar agora. Tente de novo.' };
  }
}

export type ConferenceDecision =
  | { action: 'check'; itemId: string; serial: string }
  | { action: 'none'; message: ReadingMessage };

// Conferência de carga: só o item previsto e ainda não conferido da PRÓPRIA viagem é conferido. A viagem que reserva um cilindro de
// fora só vem na resposta a quem tem a permissão de ver viagens (o servidor decide); aqui ela só é citada quando existe e é outra.
export function decideConference(outcome: ResolutionLike, items: readonly ItemLike[], currentTripId: string, source: ReadingSource): ConferenceDecision {
  if (outcome.kind !== 'found') return { action: 'none', message: describeUnresolved(outcome, source) };
  const { cylinder, trip } = outcome.value;
  const item = items.find((candidate) => candidate.cylinderId === cylinder.id);
  if (item?.status === 'planned') return { action: 'check', itemId: item.id, serial: cylinder.serialNumber };
  if (item?.status === 'checked') return { action: 'none', message: { tone: 'info', message: `Cilindro ${cylinder.serialNumber} já estava conferido.` } };
  if (item) return { action: 'none', message: { tone: 'error', message: `Cilindro ${cylinder.serialNumber} não está mais previsto nesta viagem.` } };
  if (cylinder.status === 'inactive') return { action: 'none', message: { tone: 'error', message: `Cilindro ${cylinder.serialNumber} está inativo.` } };
  const elsewhere = trip && trip.id !== currentTripId ? ` Está reservado na viagem n.º ${trip.number}.` : '';
  return { action: 'none', message: { tone: 'error', message: `Cilindro ${cylinder.serialNumber} não pertence a esta viagem.${elsewhere}` } };
}

export type DeliveryDecision =
  | { action: 'deliver'; itemId: string; serial: string }
  | { action: 'none'; message: ReadingMessage };

// Entrega: só um cilindro da parada que ainda está pendente (em trânsito, ou não entregue na correção) é marcado como "entregue".
// Marcar não salva nada: a entrega só vale quando a pessoa a salva, uma vez, como na Spec 008. `stopItems` são os itens da parada; só
// contam os pendentes (em trânsito no registro original, não entregues na correção).
export function decideDelivery(outcome: ResolutionLike, stopItems: readonly ItemLike[], marked: ReadonlySet<string>, source: ReadingSource): DeliveryDecision {
  if (outcome.kind !== 'found') return { action: 'none', message: describeUnresolved(outcome, source) };
  const { cylinder } = outcome.value;
  const item = stopItems.find((candidate) => candidate.cylinderId === cylinder.id && (candidate.status === 'in_transit' || candidate.status === 'not_delivered'));
  if (!item) return { action: 'none', message: { tone: 'error', message: `Cilindro ${cylinder.serialNumber} não está previsto nesta parada.` } };
  if (marked.has(item.id)) return { action: 'none', message: { tone: 'info', message: `Cilindro ${cylinder.serialNumber} já está marcado como entregue.` } };
  return { action: 'deliver', itemId: item.id, serial: cylinder.serialNumber };
}

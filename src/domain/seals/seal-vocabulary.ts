// Vocabulário do lacre (Spec 012, data-model.md). O banco tem as mesmas listas nas restrições de
// supabase/migrations/*_seals_schema.sql; seal-vocabulary.test.ts reprova divergência. Cada valor tem texto, ícone oficial e tom do
// selo de status: a saúde, a trava e a severidade nunca dependem só de cor (RF-042).
import type { IconName } from '@/design-system/icons/tipos';

export type Tone = 'ativo' | 'conectado' | 'pendente' | 'bloqueado' | 'erro';
export interface Presentation { label: string; icon: IconName; tone: Tone }

export const HEALTH_STATES = ['ok', 'no_gps', 'low_battery', 'no_comm', 'off', 'never_seen'] as const;
export type HealthState = (typeof HEALTH_STATES)[number];
const HEALTH: Record<HealthState, Presentation> = {
  ok: { label: 'Funcionando', icon: 'verificado', tone: 'ativo' },
  no_gps: { label: 'Sem GPS', icon: 'gps', tone: 'pendente' },
  low_battery: { label: 'Bateria baixa', icon: 'alerta', tone: 'pendente' },
  no_comm: { label: 'Sem comunicação', icon: 'sem-sinal', tone: 'erro' },
  off: { label: 'Desligado', icon: 'sem-sinal', tone: 'erro' },
  never_seen: { label: 'Nunca comunicou', icon: 'antena', tone: 'bloqueado' },
};

export const LOCK_STATES = ['none', 'locked', 'unlocked', 'unconfirmed', 'locked_violation', 'locked_comm_loss'] as const;
export type LockState = (typeof LOCK_STATES)[number];
const LOCK: Record<LockState, Presentation> = {
  none: { label: 'Sem trava', icon: 'lacre', tone: 'bloqueado' },
  locked: { label: 'Travada', icon: 'bloqueio', tone: 'ativo' },
  unlocked: { label: 'Destravada', icon: 'lacre', tone: 'conectado' },
  unconfirmed: { label: 'Não confirmada', icon: 'alerta', tone: 'pendente' },
  locked_violation: { label: 'Travada por violação de geocerca', icon: 'geocerca', tone: 'erro' },
  locked_comm_loss: { label: 'Travada por perda de comunicação', icon: 'sem-sinal', tone: 'erro' },
};

export const SEAL_STATES = ['closed', 'open', 'broken', 'unknown'] as const;
export type SealState = (typeof SEAL_STATES)[number];
const SEAL: Record<SealState, Presentation> = {
  closed: { label: 'Lacre fechado', icon: 'lacre', tone: 'ativo' },
  open: { label: 'Lacre aberto', icon: 'alerta', tone: 'erro' },
  broken: { label: 'Lacre rompido', icon: 'rompimento', tone: 'erro' },
  unknown: { label: 'Lacre sem sensor', icon: 'lacre', tone: 'bloqueado' },
};

export const COMMAND_KINDS = ['lock', 'unlock', 'wifi_add', 'wifi_remove', 'wifi_reset'] as const;
export type CommandKind = (typeof COMMAND_KINDS)[number];
export const COMMAND_KIND_LABELS: Record<CommandKind, string> = {
  lock: 'Travar', unlock: 'Destravar', wifi_add: 'Adicionar rede', wifi_remove: 'Remover rede', wifi_reset: 'Voltar à rede padrão',
};

export const COMMAND_ORIGINS = [
  'trip_start', 'delivery', 'delivery_correction', 'trip_cancel', 'geofence_violation', 'manual', 'exceptional', 'admin_network',
] as const;
export type CommandOrigin = (typeof COMMAND_ORIGINS)[number];
const ORIGIN: Record<CommandOrigin, string> = {
  trip_start: 'Início da viagem', delivery: 'Entrega', delivery_correction: 'Correção da entrega', trip_cancel: 'Cancelamento da viagem',
  geofence_violation: 'Violação de geocerca', manual: 'Pedido manual', exceptional: 'Destravamento excepcional', admin_network: 'Rede Wi-Fi',
};

export const COMMAND_STATUSES = ['pending', 'delivered', 'confirmed', 'failed', 'cancelled', 'expired'] as const;
export type CommandStatus = (typeof COMMAND_STATUSES)[number];
const COMMAND_STATUS: Record<CommandStatus, Presentation> = {
  pending: { label: 'Pendente', icon: 'historico', tone: 'pendente' },
  delivered: { label: 'Entregue ao lacre', icon: 'sincronizar', tone: 'conectado' },
  confirmed: { label: 'Confirmado', icon: 'verificado', tone: 'ativo' },
  failed: { label: 'Com erro', icon: 'alerta', tone: 'erro' },
  cancelled: { label: 'Cancelado', icon: 'bloqueio', tone: 'bloqueado' },
  expired: { label: 'Expirado', icon: 'alerta', tone: 'erro' },
};

export const ALERT_KINDS = [
  'possible_loss', 'no_comm', 'device_off', 'no_gps', 'low_battery', 'weak_signal', 'seal_open', 'seal_broken', 'geofence_violation',
  'comm_loss_lock', 'command_failed', 'command_expired', 'command_not_delivered', 'watch_suspended', 'rate_limited', 'wifi_change_failed',
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];
const ALERT: Record<AlertKind, Presentation> = {
  possible_loss: { label: 'Possível extravio', icon: 'localizacao', tone: 'erro' },
  no_comm: { label: 'Sem comunicação', icon: 'sem-sinal', tone: 'pendente' },
  device_off: { label: 'Lacre desligado', icon: 'sem-sinal', tone: 'pendente' },
  no_gps: { label: 'Sem GPS', icon: 'gps', tone: 'pendente' },
  low_battery: { label: 'Bateria baixa', icon: 'alerta', tone: 'pendente' },
  weak_signal: { label: 'Sinal fraco', icon: 'antena', tone: 'pendente' },
  seal_open: { label: 'Lacre aberto', icon: 'alerta', tone: 'erro' },
  seal_broken: { label: 'Lacre rompido', icon: 'rompimento', tone: 'erro' },
  geofence_violation: { label: 'Violação de geocerca', icon: 'geocerca', tone: 'erro' },
  comm_loss_lock: { label: 'Travado por perda de comunicação', icon: 'bloqueio', tone: 'erro' },
  command_failed: { label: 'Comando com erro', icon: 'alerta', tone: 'erro' },
  command_expired: { label: 'Comando expirado', icon: 'historico', tone: 'pendente' },
  command_not_delivered: { label: 'Comando não entregue', icon: 'historico', tone: 'pendente' },
  watch_suspended: { label: 'Vigilância suspensa', icon: 'geocerca', tone: 'pendente' },
  rate_limited: { label: 'Envios acima do limite', icon: 'alerta', tone: 'pendente' },
  wifi_change_failed: { label: 'Troca de rede falhou', icon: 'rede', tone: 'pendente' },
};

export const ALERT_SEVERITIES = ['medium', 'high', 'critical'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];
const SEVERITY: Record<AlertSeverity, Presentation> = {
  medium: { label: 'Média', icon: 'alerta', tone: 'pendente' },
  high: { label: 'Alta', icon: 'alerta', tone: 'erro' },
  critical: { label: 'Crítica', icon: 'rompimento', tone: 'erro' },
};

export const ALERT_STATUSES = ['open', 'acknowledged', 'closed'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];
export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = { open: 'Aberto', acknowledged: 'Reconhecido', closed: 'Encerrado' };

function pick<K extends string, V>(table: Record<K, V>, value: K, what: string): V {
  if (!Object.prototype.hasOwnProperty.call(table, value)) throw new Error(`${what} desconhecido: ${String(value)}`);
  return table[value];
}

export const health = (v: HealthState): Presentation => pick(HEALTH, v, 'estado de saúde');
export const sealState = (v: SealState): Presentation => pick(SEAL, v, 'estado do lacre');
export const commandStatus = (v: CommandStatus): Presentation => pick(COMMAND_STATUS, v, 'situação de comando');
export const commandOrigin = (v: CommandOrigin): string => pick(ORIGIN, v, 'origem de comando');
export const alertKind = (v: AlertKind): Presentation => pick(ALERT, v, 'tipo de alerta');
export const alertSeverity = (v: AlertSeverity): Presentation => pick(SEVERITY, v, 'severidade');

// Trava física do cilindro (RF-030): o último estado confirmado e, enquanto houver comando de trava pendente no prazo, a marca
// "travamento pendente" ou "destravamento pendente". O pendente que já é o estado atual não muda nada.
export function lockState(v: LockState, pendingKind?: 'lock' | 'unlock' | null): Presentation {
  const base = pick(LOCK, v, 'estado da trava');
  const locked = v === 'locked' || v === 'locked_violation' || v === 'locked_comm_loss';
  if (pendingKind === 'lock' && !locked) return { label: 'Travamento pendente', icon: 'historico', tone: 'pendente' };
  if (pendingKind === 'unlock' && v !== 'unlocked') return { label: 'Destravamento pendente', icon: 'historico', tone: 'pendente' };
  return base;
}

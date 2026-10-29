// Elegibilidade dos avisos por e-mail (Spec 015, US6; RF-032 a RF-034; contracts/avisos-email.md). Regra pura, igual à do servidor, para
// explicar na tela por que uma categoria está ou não disponível. Quem decide o envio é sempre o banco, no momento de enfileirar e de novo
// no momento de enviar.
export const EMAIL_CATEGORIES = ['proximity_confirmed', 'seal_high_critical', 'seal_recovered'] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export type EmailEvent =
  | { category: 'proximity_confirmed'; detection: 'live' | 'retrospective'; tripActive: boolean }
  | { category: 'seal_high_critical' | 'seal_recovered'; severity: 'medium' | 'high' | 'critical' };

export interface RecipientContext {
  released: readonly EmailCategory[];
  optedIn: readonly EmailCategory[];
  permissions: readonly string[];
  activeMembership: boolean;
}

export type IneligibleReason = 'membership_inactive' | 'no_permission' | 'not_released' | 'not_opted_in' | 'severity' | 'historical';
export type Eligibility = { eligible: true } | { eligible: false; reason: IneligibleReason };

const LABELS: Record<EmailCategory, string> = {
  proximity_confirmed: 'Afastamento confirmado',
  seal_high_critical: 'Alerta alto ou crítico de lacre',
  seal_recovered: 'Lacre recuperado',
};

export const categoryLabel = (category: EmailCategory): string => LABELS[category];

// Administrar as categorias (`notification_category.manage`) não entra aqui: não torna ninguém destinatário.
export const categoryPermission = (category: EmailCategory): 'tracking.read' | 'seal.read' =>
  category === 'proximity_confirmed' ? 'tracking.read' : 'seal.read';

export function preferenceAvailability(category: EmailCategory, released: readonly EmailCategory[], permissions: readonly string[]):
  { allowed: boolean; reason: 'not_released' | 'no_permission' | null } {
  if (!released.includes(category)) return { allowed: false, reason: 'not_released' };
  if (!permissions.includes(categoryPermission(category))) return { allowed: false, reason: 'no_permission' };
  return { allowed: true, reason: null };
}

export function emailEligibility(event: EmailEvent, recipient: RecipientContext): Eligibility {
  if (!recipient.activeMembership) return { eligible: false, reason: 'membership_inactive' };
  const availability = preferenceAvailability(event.category, recipient.released, recipient.permissions);
  if (availability.reason) return { eligible: false, reason: availability.reason };
  if (!recipient.optedIn.includes(event.category)) return { eligible: false, reason: 'not_opted_in' };
  if (event.category === 'proximity_confirmed') {
    return event.detection === 'retrospective' && !event.tripActive ? { eligible: false, reason: 'historical' } : { eligible: true };
  }
  return event.severity === 'medium' ? { eligible: false, reason: 'severity' } : { eligible: true };
}

// Estado de um aviso no detalhe do alerta (RF-035): texto por extenso e o motivo sanitizado da falha ou do cancelamento.
const STATUS: Record<string, string> = {
  pending: 'Na fila', processing: 'Enviando', sent: 'Enviado', retry: 'Nova tentativa agendada', failed: 'Falhou', cancelled: 'Cancelado',
};
const FAILURE: Record<string, string> = {
  DELIVERY_REJECTED: 'o provedor recusou o envio', PROVIDER_UNAVAILABLE: 'o provedor de e-mail estava indisponível',
  PROVIDER_TIMEOUT: 'o provedor de e-mail não respondeu a tempo', PERMISSION_LOST: 'a pessoa perdeu a permissão de leitura',
  CATEGORY_DISABLED: 'a categoria foi retirada', PREFERENCE_OFF: 'a pessoa desligou o aviso', MEMBERSHIP_INACTIVE: 'a pessoa não está mais na empresa',
};

export const deliveryStatusText = (status: string): string => STATUS[status] ?? 'Situação desconhecida';
export const deliveryFailureText = (code: string | null): string | null => (code ? FAILURE[code] ?? 'erro no envio' : null);

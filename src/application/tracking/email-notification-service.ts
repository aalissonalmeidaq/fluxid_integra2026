// Avisos por e-mail (Spec 015, T099; US6, RF-032, RF-035) sobre `query-tracking` e `manage-tracking`: categorias da empresa (só quem tem
// notification_category.manage), preferência própria (qualquer pessoa vinculada) e estado dos avisos de um alerta (sem destinatário).
// A permissão e as categorias permitidas são decididas no banco; a resposta vira estado de tela. Fora do React.
import { EMAIL_CATEGORIES, type EmailCategory } from '@/domain/tracking/email-notification-eligibility';
import type { TrackingTransport } from './tracking-ports';

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const isCategory = (value: unknown): value is EmailCategory => typeof value === 'string' && (EMAIL_CATEGORIES as readonly string[]).includes(value);
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export interface CategoriesView {
  version: number;
  enabled: EmailCategory[];
}

export interface PreferenceView {
  category: EmailCategory;
  allowed: boolean;
  enabled: boolean;
  reason: 'not_released' | 'no_permission' | null;
}

export interface DeliveryView {
  category: EmailCategory;
  transition: 'opened' | 'recovered';
  status: 'pending' | 'processing' | 'sent' | 'retry' | 'failed' | 'cancelled';
  updatedAt: string;
  sentAt: string | null;
  errorCode: string | null;
}

export type EmailOutcome<T> =
  | { kind: 'success'; value: T }
  | { kind: 'conflict' | 'not_allowed' | 'offline' | 'unavailable' | 'unknown' | 'session_expired' | 'access_denied' };

function toCategories(payload: Raw): CategoriesView | null {
  if (typeof payload.version !== 'number' || !Array.isArray(payload.categories)) return null;
  const enabled = payload.categories.filter((c): c is Raw => isObject(c) && isCategory(c.category) && c.enabled === true).map((c) => c.category as EmailCategory);
  return { version: payload.version, enabled };
}

function toPreferences(payload: Raw): PreferenceView[] | null {
  if (!Array.isArray(payload.categories)) return null;
  const items = payload.categories.filter((c): c is Raw => isObject(c) && isCategory(c.category));
  return items.map((c) => ({
    category: c.category as EmailCategory, allowed: c.allowed === true, enabled: c.enabled === true,
    reason: c.reason === 'not_released' || c.reason === 'no_permission' ? c.reason : null,
  }));
}

const STATUSES = ['pending', 'processing', 'sent', 'retry', 'failed', 'cancelled'];
function toDeliveries(payload: Raw): DeliveryView[] | null {
  if (!Array.isArray(payload.items)) return null;
  return payload.items
    .filter((i): i is Raw => isObject(i) && isCategory(i.category) && typeof i.status === 'string' && STATUSES.includes(i.status) && typeof i.updated_at === 'string')
    .map((i) => ({
      category: i.category as EmailCategory, transition: i.transition === 'recovered' ? 'recovered' : 'opened', status: i.status as DeliveryView['status'],
      updatedAt: i.updated_at as string, sentAt: text(i.sent_at), errorCode: text(i.error_code),
    }));
}

export class EmailNotificationService {
  constructor(private readonly transport: TrackingTransport, private readonly isOnline: () => boolean = () => true) {}

  private async run<T>(fn: 'query-tracking' | 'manage-tracking', body: Raw, pick: (payload: Raw) => T | null): Promise<EmailOutcome<T>> {
    const write = fn === 'manage-tracking';
    if (!this.isOnline()) return { kind: 'offline' };
    try {
      const response = await this.transport.call(fn, body);
      const payload = isObject(response.body) ? response.body : {};
      if (response.status >= 200 && response.status < 300) {
        const value = pick(payload);
        return value === null ? { kind: write ? 'unknown' : 'unavailable' } : { kind: 'success', value };
      }
      if (response.status === 401 || payload.code === 'AUTH_REQUIRED') return { kind: 'session_expired' };
      if (payload.code === 'ACCESS_DENIED') return { kind: 'access_denied' };
      if (payload.code === 'VERSION_CONFLICT') return { kind: 'conflict' };
      if (payload.code === 'CATEGORY_NOT_ALLOWED') return { kind: 'not_allowed' };
      return { kind: write ? 'unknown' : 'unavailable' };
    } catch {
      return { kind: write ? 'unknown' : 'unavailable' };
    }
  }

  categories(organizationId: string): Promise<EmailOutcome<CategoriesView>> {
    return this.run('query-tracking', { operation: 'get_notification_categories', organization_id: organizationId }, toCategories);
  }

  setCategories(organizationId: string, enabled: readonly EmailCategory[], version: number, requestId: string): Promise<EmailOutcome<CategoriesView>> {
    return this.run('manage-tracking', {
      operation: 'set_notification_categories', organization_id: organizationId, request_id: requestId, categories: [...enabled], version,
    }, toCategories);
  }

  myPreferences(organizationId: string): Promise<EmailOutcome<PreferenceView[]>> {
    return this.run('query-tracking', { operation: 'get_my_email_preferences', organization_id: organizationId }, toPreferences);
  }

  setMyPreferences(organizationId: string, enabled: readonly EmailCategory[], requestId: string): Promise<EmailOutcome<PreferenceView[]>> {
    return this.run('manage-tracking', {
      operation: 'set_my_email_preferences', organization_id: organizationId, request_id: requestId, categories: [...enabled],
    }, toPreferences);
  }

  deliveries(organizationId: string, alertId: string): Promise<EmailOutcome<DeliveryView[]>> {
    return this.run('query-tracking', { operation: 'get_email_deliveries', organization_id: organizationId, alert_id: alertId }, toDeliveries);
  }
}

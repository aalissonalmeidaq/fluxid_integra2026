import { describe, expect, it, vi } from 'vitest';
import type { TrackingTransport } from './tracking-ports';
import { EmailNotificationService } from './email-notification-service';

// Spec 015 (T099; US6, RF-032, RF-035): categorias da empresa (só quem administra), preferência própria e estado dos avisos de um alerta,
// fora do React. Permissões separadas: administrar não lê preferências, e a preferência não precisa de administração.
const ORG = 'org-a';
const transport = (status: number, body: unknown) => ({ call: vi.fn(async () => ({ status, body })) }) satisfies TrackingTransport;
const CATEGORIES = [{ category: 'proximity_confirmed', enabled: true }, { category: 'seal_high_critical', enabled: false }, { category: 'seal_recovered', enabled: false }];

describe('avisos por e-mail', () => {
  it('lê as categorias da empresa com a versão', async () => {
    const t = transport(200, { code: 'FOUND', version: 3, categories: CATEGORIES });
    expect(await new EmailNotificationService(t).categories(ORG)).toEqual({ kind: 'success', value: { version: 3, enabled: ['proximity_confirmed'] } });
    expect(t.call).toHaveBeenCalledWith('query-tracking', { operation: 'get_notification_categories', organization_id: ORG });
  });

  it('libera categorias com versão e pedido; conflito de versão e acesso negado viram estado', async () => {
    const t = transport(200, { code: 'UPDATED', version: 4, categories: CATEGORIES });
    expect(await new EmailNotificationService(t).setCategories(ORG, ['proximity_confirmed'], 3, 'req-1'))
      .toEqual({ kind: 'success', value: { version: 4, enabled: ['proximity_confirmed'] } });
    expect(t.call).toHaveBeenCalledWith('manage-tracking', {
      operation: 'set_notification_categories', organization_id: ORG, request_id: 'req-1', categories: ['proximity_confirmed'], version: 3,
    });
    expect(await new EmailNotificationService(transport(409, { code: 'VERSION_CONFLICT', version: 5 })).setCategories(ORG, [], 3, 'r'))
      .toEqual({ kind: 'conflict' });
    expect(await new EmailNotificationService(transport(403, { code: 'ACCESS_DENIED' })).categories(ORG)).toEqual({ kind: 'access_denied' });
  });

  it('lê e grava a preferência própria com o motivo de cada categoria indisponível', async () => {
    const prefs = [
      { category: 'proximity_confirmed', allowed: true, enabled: true, reason: null },
      { category: 'seal_high_critical', allowed: false, enabled: false, reason: 'no_permission' },
      { category: 'seal_recovered', allowed: false, enabled: false, reason: 'not_released' },
    ];
    const read = transport(200, { code: 'FOUND', categories: prefs });
    expect(await new EmailNotificationService(read).myPreferences(ORG)).toEqual({ kind: 'success', value: [
      { category: 'proximity_confirmed', allowed: true, enabled: true, reason: null },
      { category: 'seal_high_critical', allowed: false, enabled: false, reason: 'no_permission' },
      { category: 'seal_recovered', allowed: false, enabled: false, reason: 'not_released' },
    ] });
    const write = transport(200, { code: 'UPDATED', categories: prefs });
    await new EmailNotificationService(write).setMyPreferences(ORG, ['proximity_confirmed'], 'req-2');
    expect(write.call).toHaveBeenCalledWith('manage-tracking', {
      operation: 'set_my_email_preferences', organization_id: ORG, request_id: 'req-2', categories: ['proximity_confirmed'],
    });
    expect(await new EmailNotificationService(transport(409, { code: 'CATEGORY_NOT_ALLOWED' })).setMyPreferences(ORG, ['seal_recovered'], 'r'))
      .toEqual({ kind: 'not_allowed' });
  });

  it('estado dos avisos de um alerta, sem destinatário', async () => {
    const t = transport(200, { code: 'FOUND', items: [
      { category: 'seal_high_critical', transition: 'opened', status: 'failed', updated_at: '2026-10-22T15:05:00Z', sent_at: null, error_code: 'DELIVERY_REJECTED' },
    ] });
    expect(await new EmailNotificationService(t).deliveries(ORG, 'alert-1')).toEqual({ kind: 'success', value: [
      { category: 'seal_high_critical', transition: 'opened', status: 'failed', updatedAt: '2026-10-22T15:05:00Z', sentAt: null, errorCode: 'DELIVERY_REJECTED' },
    ] });
    expect(t.call).toHaveBeenCalledWith('query-tracking', { operation: 'get_email_deliveries', organization_id: ORG, alert_id: 'alert-1' });
  });

  it('sem conexão não chama o servidor; resposta estranha não vira sucesso', async () => {
    const t = transport(200, {});
    expect(await new EmailNotificationService(t, () => false).myPreferences(ORG)).toEqual({ kind: 'offline' });
    expect(t.call).not.toHaveBeenCalled();
    expect(await new EmailNotificationService(transport(200, { code: 'FOUND', categories: 'x' })).myPreferences(ORG)).toEqual({ kind: 'unavailable' });
    expect(await new EmailNotificationService(transport(401, {})).deliveries(ORG, 'a')).toEqual({ kind: 'session_expired' });
  });
});

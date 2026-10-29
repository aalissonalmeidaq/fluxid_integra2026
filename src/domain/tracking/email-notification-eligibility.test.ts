import { describe, expect, it } from 'vitest';
import {
  categoryLabel, categoryPermission, deliveryFailureText, deliveryStatusText, EMAIL_CATEGORIES, emailEligibility, preferenceAvailability,
  type RecipientContext,
} from './email-notification-eligibility';

// Spec 015 (T088; US6, RF-032 a RF-034; contracts/avisos-email.md): um aviso só sai com a categoria liberada, a escolha da pessoa, o
// vínculo ativo, a permissão exata da categoria e um evento elegível. Administrar categorias não torna ninguém destinatário.
const READY: RecipientContext = {
  released: [...EMAIL_CATEGORIES], optedIn: [...EMAIL_CATEGORIES], permissions: ['seal.read', 'tracking.read'], activeMembership: true,
};

describe('elegibilidade dos avisos por e-mail', () => {
  it('cada categoria exige a sua leitura', () => {
    expect(categoryPermission('proximity_confirmed')).toBe('tracking.read');
    expect(categoryPermission('seal_high_critical')).toBe('seal.read');
    expect(categoryPermission('seal_recovered')).toBe('seal.read');
  });

  it('afastamento ao vivo e retrospectivo com viagem ativa geram; retrospectivo de viagem encerrada não', () => {
    expect(emailEligibility({ category: 'proximity_confirmed', detection: 'live', tripActive: true }, READY)).toEqual({ eligible: true });
    expect(emailEligibility({ category: 'proximity_confirmed', detection: 'retrospective', tripActive: true }, READY)).toEqual({ eligible: true });
    expect(emailEligibility({ category: 'proximity_confirmed', detection: 'retrospective', tripActive: false }, READY))
      .toEqual({ eligible: false, reason: 'historical' });
  });

  it('só alerta alto ou crítico gera; médio não', () => {
    expect(emailEligibility({ category: 'seal_high_critical', severity: 'critical' }, READY).eligible).toBe(true);
    expect(emailEligibility({ category: 'seal_recovered', severity: 'high' }, READY).eligible).toBe(true);
    expect(emailEligibility({ category: 'seal_high_critical', severity: 'medium' }, READY)).toEqual({ eligible: false, reason: 'severity' });
  });

  it('sem liberação, sem escolha, sem permissão ou sem vínculo: nada sai, com o motivo', () => {
    const event = { category: 'seal_high_critical', severity: 'high' } as const;
    expect(emailEligibility(event, { ...READY, activeMembership: false })).toEqual({ eligible: false, reason: 'membership_inactive' });
    expect(emailEligibility(event, { ...READY, permissions: ['tracking.read', 'notification_category.manage'] }))
      .toEqual({ eligible: false, reason: 'no_permission' });
    expect(emailEligibility(event, { ...READY, released: ['proximity_confirmed'] })).toEqual({ eligible: false, reason: 'not_released' });
    expect(emailEligibility(event, { ...READY, optedIn: [] })).toEqual({ eligible: false, reason: 'not_opted_in' });
    expect(emailEligibility({ category: 'proximity_confirmed', detection: 'live', tripActive: true }, { ...READY, permissions: ['seal.read'] }))
      .toEqual({ eligible: false, reason: 'no_permission' });
  });

  it('a preferência só fica disponível com a categoria liberada e a leitura da categoria', () => {
    expect(preferenceAvailability('seal_recovered', [], ['seal.read'])).toEqual({ allowed: false, reason: 'not_released' });
    expect(preferenceAvailability('proximity_confirmed', ['proximity_confirmed'], ['seal.read'])).toEqual({ allowed: false, reason: 'no_permission' });
    expect(preferenceAvailability('proximity_confirmed', ['proximity_confirmed'], ['tracking.read'])).toEqual({ allowed: true, reason: null });
  });

  it('cada categoria tem nome por extenso', () => {
    expect(EMAIL_CATEGORIES.map(categoryLabel)).toEqual(['Afastamento confirmado', 'Alerta alto ou crítico de lacre', 'Lacre recuperado']);
  });
});

describe('estado do aviso', () => {
  it('diz a situação e o motivo por extenso, sem expor detalhe do provedor', () => {
    expect(deliveryStatusText('retry')).toBe('Nova tentativa agendada');
    expect(deliveryFailureText('DELIVERY_REJECTED')).toBe('o provedor recusou o envio');
    expect(deliveryFailureText('ALGO_NOVO')).toBe('erro no envio');
    expect(deliveryFailureText(null)).toBeNull();
  });
});

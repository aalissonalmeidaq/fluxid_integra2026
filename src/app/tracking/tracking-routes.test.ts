import { describe, expect, it } from 'vitest';
import { requiredTrackingPermission, resolveTrackingRoute } from './tracking-routes';

// Spec 015 (T031; US1): /rastreamento e /rastreamento/viagens/:id, protegidas por tracking.read.
const ID = 'b1560000-0000-4000-8000-0000000000a1';

describe('resolveTrackingRoute', () => {
  it('lista de viagens em andamento e acompanhamento de uma viagem', () => {
    expect(resolveTrackingRoute('/rastreamento')).toEqual({ kind: 'active_trips' });
    expect(resolveTrackingRoute(`/rastreamento/viagens/${ID}`)).toEqual({ kind: 'trip', id: ID });
    expect(resolveTrackingRoute('/rastreamento/regra')).toEqual({ kind: 'rule' });
    expect(resolveTrackingRoute('/rastreamento/historico')).toEqual({ kind: 'history' });
    expect(resolveTrackingRoute(`/rastreamento/ocorrencias/${ID}`)).toEqual({ kind: 'occurrence', id: ID });
  });

  it('ignora a barra final', () => {
    expect(resolveTrackingRoute('/rastreamento/')).toEqual({ kind: 'active_trips' });
    expect(resolveTrackingRoute(`/rastreamento/viagens/${ID}/`)).toEqual({ kind: 'trip', id: ID });
  });

  it('caminhos de outras áreas não são do rastreamento', () => {
    for (const path of ['/', '/viagens', `/viagens/${ID}`, '/rastreamentos', '/admin/rastreamento']) expect(resolveTrackingRoute(path)).toBeNull();
  });

  it('id inválido, seção desconhecida e caminho longo caem em "não encontrado"', () => {
    for (const path of ['/rastreamento/viagens', '/rastreamento/viagens/abc', `/rastreamento/viagens/${ID}/x`, '/rastreamento/outra', '/rastreamento/regra/x', '/rastreamento/historico/x', '/rastreamento/ocorrencias', '/rastreamento/ocorrencias/abc', `/rastreamento/ocorrencias/${ID}/x`]) {
      expect(resolveTrackingRoute(path)).toEqual({ kind: 'not_found' });
    }
  });

  it('as rotas pedem tracking.read; os avisos por e-mail pedem notification_category.manage', () => {
    expect(requiredTrackingPermission({ kind: 'active_trips' })).toBe('tracking.read');
    expect(requiredTrackingPermission({ kind: 'trip', id: ID })).toBe('tracking.read');
    expect(requiredTrackingPermission({ kind: 'email' })).toBe('notification_category.manage');
  });

  it('/rastreamento/avisos abre a liberação das categorias de e-mail', () => {
    expect(resolveTrackingRoute('/rastreamento/avisos')).toEqual({ kind: 'email' });
    expect(resolveTrackingRoute('/rastreamento/avisos/x')).toEqual({ kind: 'not_found' });
  });

  // Spec 015 (validação humana): a coleta da pessoa motorista, fora de /rastreamento porque não exige tracking.read.
  it('/minha-viagem abre as viagens da própria pessoa motorista, sem permissão de leitura', () => {
    expect(resolveTrackingRoute('/minha-viagem')).toEqual({ kind: 'driver_trips' });
    expect(resolveTrackingRoute('/minha-viagem/')).toEqual({ kind: 'driver_trips' });
    expect(resolveTrackingRoute('/minha-viagem/x')).toEqual({ kind: 'not_found' });
    expect(requiredTrackingPermission({ kind: 'driver_trips' })).toBeNull();
  });
});

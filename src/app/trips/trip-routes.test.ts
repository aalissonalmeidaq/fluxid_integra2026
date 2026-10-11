import { describe, expect, it } from 'vitest';
import { requiredTripPermission, resolveTripRoute } from './trip-routes';

const ID = '99000000-0000-4000-8000-00000000000a';

describe('resolveTripRoute', () => {
  it('lista, nova, detalhe e edição', () => {
    expect(resolveTripRoute('/viagens')).toEqual({ kind: 'list' });
    expect(resolveTripRoute('/viagens/nova')).toEqual({ kind: 'new' });
    expect(resolveTripRoute(`/viagens/${ID}`)).toEqual({ kind: 'detail', id: ID });
    expect(resolveTripRoute(`/viagens/${ID}/editar`)).toEqual({ kind: 'edit', id: ID });
  });

  it('ignora a barra final', () => {
    expect(resolveTripRoute('/viagens/')).toEqual({ kind: 'list' });
    expect(resolveTripRoute(`/viagens/${ID}/`)).toEqual({ kind: 'detail', id: ID });
  });

  it('caminhos de outras áreas não são de viagens', () => {
    for (const path of ['/', '/cilindros', '/clientes', '/viagem', '/viagensx', '/admin/viagens']) expect(resolveTripRoute(path)).toBeNull();
  });

  it('id que não é UUID, rota desconhecida e caminho longo caem em "não encontrado"', () => {
    for (const path of ['/viagens/abc', '/viagens/novo', '/viagens/nova/x', `/viagens/${ID}/apagar`, `/viagens/${ID}/editar/mais`, '/viagens/1/2/3']) {
      expect(resolveTripRoute(path)).toEqual({ kind: 'not_found' });
    }
  });
});

describe('requiredTripPermission', () => {
  it('planejar e editar exigem trip.write; o resto, trip.read', () => {
    expect(requiredTripPermission({ kind: 'new' })).toBe('trip.write');
    expect(requiredTripPermission({ kind: 'edit', id: ID })).toBe('trip.write');
    expect(requiredTripPermission({ kind: 'list' })).toBe('trip.read');
    expect(requiredTripPermission({ kind: 'detail', id: ID })).toBe('trip.read');
    expect(requiredTripPermission({ kind: 'not_found' })).toBe('trip.read');
  });
});

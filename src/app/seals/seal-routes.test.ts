import { describe, expect, it } from 'vitest';
import { requiredSealPermission, resolveSealRoute } from './seal-routes';

// Spec 012 (contracts/telas-e-rotas.md): /lacres, /lacres/:id, /alertas e /alertas/:id.
const ID = 'a1200000-0000-4000-8000-0000000000a1';

describe('resolveSealRoute', () => {
  it('lista e detalhe de lacres e de alertas', () => {
    expect(resolveSealRoute('/lacres')).toEqual({ kind: 'seal_list' });
    expect(resolveSealRoute(`/lacres/${ID}`)).toEqual({ kind: 'seal_detail', id: ID });
    expect(resolveSealRoute('/alertas')).toEqual({ kind: 'alert_list' });
    expect(resolveSealRoute(`/alertas/${ID}`)).toEqual({ kind: 'alert_detail', id: ID });
  });

  it('ignora a barra final', () => {
    expect(resolveSealRoute('/lacres/')).toEqual({ kind: 'seal_list' });
    expect(resolveSealRoute(`/alertas/${ID}/`)).toEqual({ kind: 'alert_detail', id: ID });
  });

  it('caminhos de outras áreas não são do lacre', () => {
    for (const path of ['/', '/viagens', '/lacre', '/lacresx', '/admin/lacres', '/alerta']) expect(resolveSealRoute(path)).toBeNull();
  });

  it('id que não é UUID e caminho longo caem em "não encontrado"', () => {
    for (const path of ['/lacres/abc', `/lacres/${ID}/apagar`, '/alertas/1', `/alertas/${ID}/x`]) {
      expect(resolveSealRoute(path)).toEqual({ kind: 'not_found' });
    }
  });
});

describe('requiredSealPermission', () => {
  it('toda tela do lacre exige seal.read; as ações são decididas dentro dela', () => {
    expect(requiredSealPermission({ kind: 'seal_list' })).toBe('seal.read');
    expect(requiredSealPermission({ kind: 'alert_detail', id: ID })).toBe('seal.read');
    expect(requiredSealPermission({ kind: 'not_found' })).toBe('seal.read');
  });
});

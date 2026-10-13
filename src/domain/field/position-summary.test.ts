// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { positionSummary } from './position-summary';

// RF-010, RN-003: o resumo diz a origem e a precisão em texto, sem coordenadas, e nunca afirma que a posição é uma prova.
describe('positionSummary', () => {
  it('GPS com precisão boa', () => {
    expect(positionSummary('gps', 12.4)).toBe('Posição lida pelo GPS, precisão cerca de 12 m (boa).');
  });

  it('GPS com precisão baixa (acima de 100 m) avisa em texto', () => {
    expect(positionSummary('gps', 450)).toBe('Posição lida pelo GPS, precisão cerca de 450 m (baixa).');
  });

  it('GPS sem precisão informada não inventa uma', () => {
    expect(positionSummary('gps', null)).toBe('Posição lida pelo GPS.');
  });

  it('coordenadas digitadas são "informada"', () => {
    expect(positionSummary('typed', null)).toBe('Posição informada.');
  });

  it('"no endereço da unidade"', () => {
    expect(positionSummary('site_address', null)).toBe('Entrega no endereço da unidade.');
  });

  it('sem origem (registro anterior à Spec 009), não diz nada', () => {
    expect(positionSummary(null, null)).toBeNull();
    expect(positionSummary(undefined, 10)).toBeNull();
  });
});

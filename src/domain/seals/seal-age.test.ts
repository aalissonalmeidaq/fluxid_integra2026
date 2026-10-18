import { describe, expect, it } from 'vitest';
import { contactAge, positionAge } from './seal-age';

// Spec 012 (RF-011): a idade da posição em texto, no fuso de São Paulo, sem depender do relógio do sistema.
const NOW = new Date('2026-10-17T17:30:00Z'); // 14:30 em São Paulo
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString();

describe('positionAge', () => {
  it('menos de um minuto é "agora"', () => {
    expect(positionAge(ago(0), NOW)).toBe('agora');
    expect(positionAge(ago(59), NOW)).toBe('agora');
  });

  it('minutos e horas no singular e no plural', () => {
    expect(positionAge(ago(60), NOW)).toBe('há 1 minuto');
    expect(positionAge(ago(120), NOW)).toBe('há 2 minutos');
    expect(positionAge(ago(59 * 60), NOW)).toBe('há 59 minutos');
    expect(positionAge(ago(3600), NOW)).toBe('há 1 hora');
    expect(positionAge(ago(3 * 3600 + 120), NOW)).toBe('há 3 horas');
  });

  it('de outro dia mostra o dia e a hora no fuso de São Paulo', () => {
    expect(positionAge('2026-10-16T17:05:00Z', NOW)).toBe('ontem às 14:05');
    expect(positionAge('2026-10-10T12:00:00Z', NOW)).toBe('10/10/2026 às 09:00');
  });

  it('a mais de 12 horas no mesmo dia também mostra a hora', () => {
    expect(positionAge('2026-10-17T03:15:00Z', NOW)).toBe('hoje às 00:15');
  });

  it('horário um pouco no futuro (relógio do lacre adiantado) conta como "agora"', () => {
    expect(positionAge(new Date(NOW.getTime() + 90_000).toISOString(), NOW)).toBe('agora');
  });

  it('horário ausente ou inválido não inventa idade', () => {
    expect(positionAge(null, NOW)).toBe('sem posição');
    expect(positionAge('ontem', NOW)).toBe('sem posição');
  });
});

describe('contactAge', () => {
  it('o último contato usa a mesma idade da posição', () => {
    expect(contactAge(ago(150), NOW)).toBe('há 2 minutos');
  });

  it('lacre que nunca comunicou mostra "nunca", e não "sem posição"', () => {
    expect(contactAge(null, NOW)).toBe('nunca');
  });
});

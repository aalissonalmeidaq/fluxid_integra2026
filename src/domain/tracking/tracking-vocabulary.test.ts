import { describe, expect, it } from 'vitest';
import { DEGRADATION_REASONS, FRESHNESS } from './tracking-types';
import { comparisonText, degradationText, freshness, originLabel, presenceText } from './tracking-vocabulary';

// Spec 015 (US1; RF-002, RF-003, RF-007c): cada condição tem texto e ícone, nunca só cor.
describe('vocabulário do rastreamento', () => {
  it('cada frescor tem texto, ícone e tom próprios', () => {
    const labels = FRESHNESS.map((value) => freshness(value).label);
    expect(labels).toEqual(['Atual', 'Atrasada', 'Sem posição', 'Inconclusiva']);
    expect(new Set(FRESHNESS.map((value) => freshness(value).icon)).size).toBe(FRESHNESS.length);
  });

  it('cada motivo de degradação tem uma frase para o gestor', () => {
    for (const reason of DEGRADATION_REASONS) expect(degradationText(reason)).toMatch(/\S/);
    expect(degradationText('foreground_only')).toBe('O celular só envia a posição com o aplicativo aberto');
  });

  it('a origem é dita por extenso', () => {
    expect(originLabel('mobile')).toBe('Celular do motorista');
    expect(originLabel('seal')).toBe('Lacre');
  });

  it('comparação diz o resultado e a distância, ou o motivo de ser inconclusiva', () => {
    expect(comparisonText('outside', 'beyond_limit', 222.4)).toBe('Fora do limite: 222 m');
    expect(comparisonText('inside', 'within_limit', 18)).toBe('Dentro do limite: 18 m');
    expect(comparisonText('inconclusive', 'stale', null)).toBe('Inconclusiva: posição antiga');
    expect(comparisonText('inconclusive', 'imprecise', null)).toBe('Inconclusiva: posição imprecisa');
    expect(comparisonText('inconclusive', 'seal_missing', null)).toBe('Inconclusiva: sem posição do lacre');
  });

  it('presença diz como o cilindro foi lido', () => {
    expect(presenceText('nfc')).toBe('Leitura presencial por NFC');
    expect(presenceText('camera')).toBe('Leitura presencial pela câmera');
    expect(presenceText('typed')).toBe('Leitura presencial digitada');
  });
});

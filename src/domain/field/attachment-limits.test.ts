// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_WARNING_RATIO, canAddPhoto, fitWithin, isSignatureBlank, MAX_PHOTOS, MAX_QUEUE_ATTACHMENT_BYTES, MAX_QUEUE_OPERATIONS, MAX_SIGNATURES, PHOTO_CONTENT_TYPE,
  PHOTO_MAX_BYTES, PHOTO_MAX_LONG_EDGE_PX, PHOTO_QUALITY_STEPS, queueUsage, SIGNATURE_CONTENT_TYPE, SIGNATURE_MAX_BYTES,
} from './attachment-limits';

// RF-018, RF-019, RF-020, RF-026, RNF-004 e data-model.md §4: os limites da spec viram constantes nomeadas.
describe('limites', () => {
  it('são os da spec', () => {
    expect(MAX_PHOTOS).toBe(3);
    expect(MAX_SIGNATURES).toBe(1);
    expect(PHOTO_MAX_LONG_EDGE_PX).toBe(1600);
    expect(PHOTO_MAX_BYTES).toBe(1_572_864);
    expect(SIGNATURE_MAX_BYTES).toBe(204_800);
    expect(PHOTO_CONTENT_TYPE).toBe('image/jpeg');
    expect(SIGNATURE_CONTENT_TYPE).toBe('image/png');
    expect(MAX_QUEUE_OPERATIONS).toBe(200);
    expect(MAX_QUEUE_ATTACHMENT_BYTES).toBe(52_428_800);
    expect(ATTACHMENT_WARNING_RATIO).toBe(0.8);
  });
  it('a qualidade da foto desce em passos, de 0,85 a 0,35', () => {
    expect(PHOTO_QUALITY_STEPS[0]).toBe(0.85);
    expect(PHOTO_QUALITY_STEPS.at(-1)).toBe(0.35);
    expect([...PHOTO_QUALITY_STEPS].sort((a, b) => b - a)).toEqual([...PHOTO_QUALITY_STEPS]);
  });
});

describe('canAddPhoto', () => {
  it('até 3 fotos; a quarta é recusada com o motivo', () => {
    expect(canAddPhoto(0)).toEqual({ allowed: true });
    expect(canAddPhoto(2)).toEqual({ allowed: true });
    expect(canAddPhoto(3)).toEqual({ allowed: false, reason: 'Limite de 3 fotos por entrega.' });
  });
  it('sem espaço no aparelho, novas fotos deixam de ser aceitas e a entrega segue sem elas', () => {
    expect(canAddPhoto(0, { attachmentBytes: MAX_QUEUE_ATTACHMENT_BYTES })).toEqual({ allowed: false, reason: 'Sem espaço para novas fotos. A entrega será registrada sem elas.' });
    expect(canAddPhoto(0, { attachmentBytes: MAX_QUEUE_ATTACHMENT_BYTES - 1 }).allowed).toBe(true);
  });
});

describe('fitWithin', () => {
  it('reduz pelo lado maior mantendo a proporção', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });
  it('não amplia imagem pequena', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it('nunca devolve lado menor que 1', () => {
    expect(fitWithin(16000, 2)).toEqual({ width: 1600, height: 1 });
  });
  it('recusa dimensão inválida', () => {
    expect(() => fitWithin(0, 100)).toThrow();
    expect(() => fitWithin(100, Number.NaN)).toThrow();
  });
});

describe('queueUsage', () => {
  it('abaixo de 80% está tudo bem', () => {
    expect(queueUsage(10, 1_000_000)).toMatchObject({ operations: 'ok', attachments: 'ok', acceptNewPhotos: true, acceptNewOperations: true });
  });
  it('a 80% avisa', () => {
    expect(queueUsage(160, 0).operations).toBe('warn');
    expect(queueUsage(0, MAX_QUEUE_ATTACHMENT_BYTES * 0.8).attachments).toBe('warn');
  });
  it('no limite de anexos, recusa foto nova, mas nunca a operação principal', () => {
    const usage = queueUsage(300, MAX_QUEUE_ATTACHMENT_BYTES);
    expect(usage).toMatchObject({ operations: 'full', attachments: 'full', acceptNewPhotos: false, acceptNewOperations: true });
  });
});

describe('isSignatureBlank', () => {
  it('sem traço é vazia', () => expect(isSignatureBlank(0, 300 * 150)).toBe(true));
  it('poucos pixels riscados (um toque sem querer) é vazia', () => expect(isSignatureBlank(30, 300 * 150)).toBe(true));
  it('um traço de verdade não é vazio', () => expect(isSignatureBlank(900, 300 * 150)).toBe(false));
  it('área sem pixels é vazia', () => expect(isSignatureBlank(0, 0)).toBe(true));
});

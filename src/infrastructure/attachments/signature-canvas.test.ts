import { describe, expect, it, vi } from 'vitest';
import { SIGNATURE_MAX_BYTES } from '@/domain/field/attachment-limits';
import { SignaturePad, type SignatureSurface } from './signature-canvas';

// Spec 010, T060 (RF-020; research.md §12): traço por ponteiro (dedo, caneta e mouse), limpar e refazer, assinatura vazia não vale e a saída é PNG de até 200 KB.
const png = (size: number): ArrayBuffer => { const bytes = new Uint8Array(size); bytes.set([0x89, 0x50, 0x4e, 0x47]); return bytes.buffer; };

function surface(over: Partial<SignatureSurface> = {}): SignatureSurface & { segments: unknown[]; cleared: number } {
  const state = { segments: [] as unknown[], cleared: 0, ink: 0 };
  return Object.assign({
    width: 400,
    height: 160,
    clear: vi.fn(() => { state.cleared += 1; state.ink = 0; }),
    drawSegment: vi.fn((from: unknown, to: unknown) => { state.segments.push([from, to]); state.ink += 300; }),
    countInkedPixels: vi.fn(() => state.ink),
    toPng: vi.fn(async () => png(5_000)),
  }, over, { get segments() { return state.segments; }, get cleared() { return state.cleared; } }) as never;
}

describe('assinatura por ponteiro', () => {
  it('começa vazia e limpa o fundo', () => {
    const s = surface();
    const pad = new SignaturePad(s);
    expect(pad.isBlank()).toBe(true);
    expect(s.clear).toHaveBeenCalledTimes(1);
  });

  it('o traço (descer, mover, subir) desenha segmentos e deixa de ser vazia', () => {
    const s = surface();
    const pad = new SignaturePad(s);
    pad.down({ x: 10, y: 10 });
    pad.move({ x: 20, y: 25 });
    pad.move({ x: 40, y: 30 });
    pad.up();
    expect(s.drawSegment).toHaveBeenCalledTimes(2);
    expect(pad.isBlank()).toBe(false);
  });

  it('mover sem ter descido (ponteiro passando) não desenha', () => {
    const s = surface();
    const pad = new SignaturePad(s);
    pad.move({ x: 10, y: 10 });
    expect(s.drawSegment).not.toHaveBeenCalled();
    pad.down({ x: 1, y: 1 });
    pad.up();
    pad.move({ x: 5, y: 5 });
    expect(s.drawSegment).not.toHaveBeenCalled();
  });

  it('um toque sem querer (poucos pixels) continua vazio', () => {
    const s = surface({ countInkedPixels: vi.fn(() => 12) });
    const pad = new SignaturePad(s);
    pad.down({ x: 1, y: 1 });
    pad.move({ x: 2, y: 2 });
    pad.up();
    expect(pad.isBlank()).toBe(true);
  });

  it('limpar refaz a área e volta a vazia', () => {
    const s = surface();
    const pad = new SignaturePad(s);
    pad.down({ x: 0, y: 0 });
    pad.move({ x: 30, y: 30 });
    pad.up();
    pad.clear();
    expect(pad.isBlank()).toBe(true);
    expect(s.clear).toHaveBeenCalledTimes(2);
  });

  it('exportar vazia não gera nada', async () => {
    const pad = new SignaturePad(surface());
    expect(await pad.export()).toEqual({ ok: false, failure: 'blank' });
  });

  it('exporta PNG com UUID e SHA-256, em fundo branco', async () => {
    const s = surface();
    const pad = new SignaturePad(s, { now: () => new Date('2026-10-13T12:00:00Z') });
    pad.down({ x: 0, y: 0 });
    pad.move({ x: 50, y: 50 });
    pad.up();
    const result = await pad.export();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signature).toMatchObject({ contentType: 'image/png', sizeBytes: 5_000, capturedAt: '2026-10-13T12:00:00.000Z' });
    expect(result.signature.id).toMatch(/^[0-9a-f-]{36}$/);
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', result.signature.bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(result.signature.sha256).toBe(digest);
  });

  it('PNG acima de 200 KB: tenta de novo em escala menor até caber', async () => {
    const toPng = vi.fn()
      .mockResolvedValueOnce(png(SIGNATURE_MAX_BYTES + 1))
      .mockResolvedValueOnce(png(SIGNATURE_MAX_BYTES - 1));
    const pad = new SignaturePad(surface({ toPng }));
    pad.down({ x: 0, y: 0 });
    pad.move({ x: 50, y: 50 });
    pad.up();
    const result = await pad.export();
    expect(result.ok).toBe(true);
    expect(toPng.mock.calls.map((call) => call[0])).toEqual([1, 0.75]);
  });

  it('se nem em escala menor cabe: "grande demais"', async () => {
    const pad = new SignaturePad(surface({ toPng: vi.fn(async () => png(SIGNATURE_MAX_BYTES + 1)) }));
    pad.down({ x: 0, y: 0 });
    pad.move({ x: 50, y: 50 });
    pad.up();
    expect(await pad.export()).toEqual({ ok: false, failure: 'too_large' });
  });

  it('o codificador devolve algo que não é PNG: recusa', async () => {
    const pad = new SignaturePad(surface({ toPng: vi.fn(async () => Uint8Array.from([1, 2, 3, 4]).buffer as ArrayBuffer) }));
    pad.down({ x: 0, y: 0 });
    pad.move({ x: 50, y: 50 });
    pad.up();
    expect(await pad.export()).toEqual({ ok: false, failure: 'invalid_image' });
  });
});

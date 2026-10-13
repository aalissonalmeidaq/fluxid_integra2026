import { describe, expect, it, vi } from 'vitest';
import { PHOTO_MAX_BYTES, PHOTO_QUALITY_STEPS } from '@/domain/field/attachment-limits';
import { capturePhoto, hasExif, stripJpegMetadata, type ImagePipeline, type PhotoFailure } from './photo-capture';

// Spec 010, T052 (RF-018, RF-019; research.md §11): a foto é reduzida (lado maior até 1.600 px), recodificada em JPEG até 1,5 MB, sem EXIF, e recebe um UUID e um
// SHA-256. O navegador (decodificar e codificar por canvas) entra por uma interface simulável.
const jpegWith = (segments: number[][], scan = [0xff, 0xda, 0, 4, 0, 0, 1, 2, 3, 0xff, 0xd9]): Uint8Array =>
  Uint8Array.from([0xff, 0xd8, ...segments.flat(), ...scan]);
const app = (marker: number, payload: string): number[] => [0xff, marker, 0, payload.length + 2, ...[...payload].map((c) => c.charCodeAt(0))];
const JFIF = app(0xe0, 'JFIF\0');
const EXIF = app(0xe1, 'Exif\0\0GPS-FICTICIO');
const COMMENT = app(0xfe, 'comentario');

const file = (size = 10): Blob => new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
const pipeline = (over: Partial<ImagePipeline> = {}): ImagePipeline & { encode: ReturnType<typeof vi.fn> } => ({
  decode: vi.fn(async () => ({ width: 4000, height: 3000 })),
  encode: vi.fn(async () => jpegWith([JFIF]).buffer as ArrayBuffer),
  ...over,
}) as never;
const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

describe('captura de foto', () => {
  it('reduz o lado maior a 1.600 px, mantendo a proporção, e devolve JPEG com UUID e SHA-256', async () => {
    const p = pipeline();
    const result = await capturePhoto(file(), p, { now: () => new Date('2026-10-13T12:00:00Z') });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(p.encode).toHaveBeenCalledWith(expect.anything(), 1600, 1200, PHOTO_QUALITY_STEPS[0]);
    expect(result.photo).toMatchObject({ contentType: 'image/jpeg', width: 1600, height: 1200, capturedAt: '2026-10-13T12:00:00.000Z' });
    expect(result.photo.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(result.photo.sha256).toBe(hex(await crypto.subtle.digest('SHA-256', result.photo.bytes)));
    expect(result.photo.sizeBytes).toBe(result.photo.bytes.byteLength);
  });

  it('nunca amplia uma imagem pequena', async () => {
    const p = pipeline({ decode: vi.fn(async () => ({ width: 800, height: 600 })) });
    await capturePhoto(file(), p);
    expect(p.encode).toHaveBeenCalledWith(expect.anything(), 800, 600, PHOTO_QUALITY_STEPS[0]);
  });

  it('reduz a qualidade em passos até caber em 1,5 MB', async () => {
    const big = new Uint8Array(PHOTO_MAX_BYTES + 10);
    big.set([0xff, 0xd8, 0xff]);
    const small = jpegWith([JFIF]).buffer as ArrayBuffer;
    const encode = vi.fn()
      .mockResolvedValueOnce(big.buffer)
      .mockResolvedValueOnce(big.buffer)
      .mockResolvedValueOnce(small);
    const result = await capturePhoto(file(), pipeline({ encode }));
    expect(encode.mock.calls.map((call) => call[3])).toEqual([PHOTO_QUALITY_STEPS[0], PHOTO_QUALITY_STEPS[1], PHOTO_QUALITY_STEPS[2]]);
    expect(result.ok).toBe(true);
  });

  it('se nem a menor qualidade cabe, devolve "foto grande demais"', async () => {
    const big = new Uint8Array(PHOTO_MAX_BYTES + 10);
    big.set([0xff, 0xd8, 0xff]);
    const encode = vi.fn(async () => big.buffer as ArrayBuffer);
    const result = await capturePhoto(file(), pipeline({ encode }));
    expect(result).toEqual({ ok: false, failure: 'too_large' satisfies PhotoFailure });
    expect(encode).toHaveBeenCalledTimes(PHOTO_QUALITY_STEPS.length);
  });

  it('imagem corrompida ou que não decodifica: "imagem inválida", sem derrubar nada', async () => {
    const result = await capturePhoto(file(), pipeline({ decode: vi.fn(async () => { throw new Error('corrompida'); }) }));
    expect(result).toEqual({ ok: false, failure: 'invalid_image' });
  });

  it('arquivo vazio ou de dimensões inválidas: "imagem inválida"', async () => {
    expect(await capturePhoto(new Blob([]), pipeline())).toEqual({ ok: false, failure: 'invalid_image' });
    expect(await capturePhoto(file(), pipeline({ decode: vi.fn(async () => ({ width: 0, height: 10 })) }))).toEqual({ ok: false, failure: 'invalid_image' });
  });

  it('saída que não é JPEG (o navegador ignorou o tipo): recusa', async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).buffer as ArrayBuffer;
    expect(await capturePhoto(file(), pipeline({ encode: vi.fn(async () => png) }))).toEqual({ ok: false, failure: 'invalid_image' });
  });

  it('a foto devolvida não traz EXIF nem comentário, mesmo que o codificador deixe passar', async () => {
    const dirty = jpegWith([JFIF, EXIF, COMMENT]).buffer as ArrayBuffer;
    const result = await capturePhoto(file(), pipeline({ encode: vi.fn(async () => dirty) }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(hasExif(new Uint8Array(result.photo.bytes))).toBe(false);
    expect(new TextDecoder('latin1').decode(result.photo.bytes)).not.toMatch(/Exif|GPS-FICTICIO|comentario/);
  });
});

describe('remoção de metadados do JPEG', () => {
  it('tira APP1 (EXIF), APP2 a APP15 e comentários, mantém JFIF e os dados da imagem', () => {
    const cleaned = stripJpegMetadata(jpegWith([JFIF, EXIF, app(0xe2, 'ICC_PROFILE'), app(0xed, 'Photoshop'), COMMENT]));
    expect(hasExif(cleaned)).toBe(false);
    expect([...cleaned.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    expect(cleaned.byteLength).toBe(jpegWith([JFIF]).byteLength);
    expect(new TextDecoder('latin1').decode(cleaned)).toContain('JFIF');
  });

  it('mantém as tabelas e o quadro da imagem', () => {
    const dqt = [0xff, 0xdb, 0, 5, 1, 2, 3];
    const sof = [0xff, 0xc0, 0, 5, 8, 0, 1];
    const cleaned = stripJpegMetadata(jpegWith([JFIF, EXIF, dqt, sof]));
    expect([...cleaned]).toEqual([...jpegWith([JFIF, dqt, sof])]);
  });

  it('um EXIF em qualquer posição antes dos dados é removido', () => {
    expect(hasExif(jpegWith([EXIF]))).toBe(true);
    expect(hasExif(stripJpegMetadata(jpegWith([EXIF, JFIF])))).toBe(false);
  });

  it('arquivo que não é JPEG ou truncado é devolvido sem quebrar', () => {
    const notJpeg = Uint8Array.from([1, 2, 3]);
    expect(stripJpegMetadata(notJpeg)).toEqual(notJpeg);
    expect(() => stripJpegMetadata(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff]))).not.toThrow();
  });
});

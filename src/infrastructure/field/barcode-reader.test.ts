// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBarcodeReader, type BarcodeEnv, type BarcodeFrame } from './barcode-reader';
import { ReaderError } from './reader-error';

// RF-001, RF-008, RF-018: a câmera só aparece onde o navegador lê QR Code ou Data Matrix, em contexto seguro; nenhuma imagem sai
// do aparelho e mais de um código no mesmo quadro não é aceito.
class FakeDetector {
  static formats = ['qr_code', 'data_matrix', 'ean_13'];
  static failFormats = false;
  static frames: { rawValue: string }[][] = [];
  static getSupportedFormats(): Promise<string[]> {
    return FakeDetector.failFormats ? Promise.reject(new Error('falha')) : Promise.resolve(FakeDetector.formats);
  }
  constructor(readonly options: { formats: string[] }) {}
  detect(): Promise<{ rawValue: string }[]> {
    return Promise.resolve(FakeDetector.frames.shift() ?? []);
  }
}

const tracks = { stopped: 0 };
const stream = { getTracks: () => [{ stop: () => { tracks.stopped += 1; } }] } as unknown as MediaStream;
const video = (): HTMLVideoElement => ({ srcObject: null, play: () => Promise.resolve() }) as unknown as HTMLVideoElement;

const env = (over: Partial<BarcodeEnv> = {}): BarcodeEnv => ({
  detector: FakeDetector as unknown as BarcodeEnv['detector'],
  mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } as unknown as BarcodeEnv['mediaDevices'],
  isSecureContext: true,
  intervalMs: 10,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  FakeDetector.formats = ['qr_code', 'data_matrix', 'ean_13'];
  FakeDetector.failFormats = false;
  FakeDetector.frames = [];
  tracks.stopped = 0;
});
afterEach(() => vi.useRealTimers());

describe('supportedFormats', () => {
  it('devolve só QR Code e Data Matrix entre os formatos do navegador', async () => {
    expect(await createBarcodeReader(env()).supportedFormats()).toEqual(['qr_code', 'data_matrix']);
  });

  it('devolve só o que o navegador realmente lê', async () => {
    FakeDetector.formats = ['qr_code'];
    expect(await createBarcodeReader(env()).supportedFormats()).toEqual(['qr_code']);
  });

  it('sem detector, sem câmera ou fora de contexto seguro, não há suporte', async () => {
    expect(await createBarcodeReader(env({ detector: null })).supportedFormats()).toEqual([]);
    expect(await createBarcodeReader(env({ mediaDevices: undefined })).supportedFormats()).toEqual([]);
    expect(await createBarcodeReader(env({ isSecureContext: false })).supportedFormats()).toEqual([]);
  });

  it('falha na consulta de formatos vale como sem suporte', async () => {
    FakeDetector.failFormats = true;
    expect(await createBarcodeReader(env()).supportedFormats()).toEqual([]);
  });

  it('nenhum dos formatos desejados vale como sem suporte', async () => {
    FakeDetector.formats = ['ean_13'];
    expect(await createBarcodeReader(env()).supportedFormats()).toEqual([]);
  });
});

describe('start', () => {
  it('entrega cada código lido, sem espaços nas pontas, e continua lendo', async () => {
    FakeDetector.frames = [[{ rawValue: ' CIL-1 ' }], [], [{ rawValue: 'CIL-2' }]];
    const frames: BarcodeFrame[] = [];
    const stop = await createBarcodeReader(env()).start(video(), (frame) => frames.push(frame));
    await vi.advanceTimersByTimeAsync(100);
    expect(frames).toEqual([{ kind: 'read', value: 'CIL-1' }, { kind: 'read', value: 'CIL-2' }]);
    stop();
  });

  it('mais de um código no mesmo quadro não entrega nenhum valor e avisa', async () => {
    FakeDetector.frames = [[{ rawValue: 'A' }, { rawValue: 'B' }]];
    const frames: BarcodeFrame[] = [];
    const stop = await createBarcodeReader(env()).start(video(), (frame) => frames.push(frame));
    await vi.advanceTimersByTimeAsync(50);
    expect(frames).toEqual([{ kind: 'multiple' }]);
    stop();
  });

  it('ignora código vazio', async () => {
    FakeDetector.frames = [[{ rawValue: '   ' }]];
    const frames: BarcodeFrame[] = [];
    const stop = await createBarcodeReader(env()).start(video(), (frame) => frames.push(frame));
    await vi.advanceTimersByTimeAsync(50);
    expect(frames).toEqual([]);
    stop();
  });

  it('parar desliga a câmera e a leitura', async () => {
    FakeDetector.frames = [[{ rawValue: 'A' }], [{ rawValue: 'B' }]];
    const frames: BarcodeFrame[] = [];
    const stop = await createBarcodeReader(env()).start(video(), (frame) => frames.push(frame));
    stop();
    await vi.advanceTimersByTimeAsync(100);
    expect(frames).toEqual([]);
    expect(tracks.stopped).toBe(1);
  });

  it('parar duas vezes desliga as faixas uma vez só', async () => {
    const stop = await createBarcodeReader(env()).start(video(), () => undefined);
    stop();
    stop();
    expect(tracks.stopped).toBe(1);
  });

  it('permissão negada vira erro "denied"', async () => {
    const denied = Object.assign(new Error('x'), { name: 'NotAllowedError' });
    const reader = createBarcodeReader(env({ mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(denied) } as unknown as BarcodeEnv['mediaDevices'] }));
    await expect(reader.start(video(), () => undefined)).rejects.toMatchObject({ kind: 'denied' });
  });

  it('câmera ocupada ou ausente vira erro "unavailable"', async () => {
    const reader = createBarcodeReader(env({ mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('em uso')) } as unknown as BarcodeEnv['mediaDevices'] }));
    const failure = await reader.start(video(), () => undefined).catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(ReaderError);
    expect(failure).toMatchObject({ kind: 'unavailable' });
  });

  it('sem suporte, não abre a câmera', async () => {
    const getUserMedia = vi.fn();
    const reader = createBarcodeReader(env({ detector: null, mediaDevices: { getUserMedia } as unknown as BarcodeEnv['mediaDevices'] }));
    await expect(reader.start(video(), () => undefined)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

// RF-018: nenhuma imagem sai do aparelho; o adaptador só devolve texto.
describe('nenhuma imagem sai do aparelho', () => {
  it('o quadro de vídeo vai só ao detector e o que sobe é texto', async () => {
    FakeDetector.frames = [[{ rawValue: 'A' }]];
    const frames: BarcodeFrame[] = [];
    const stop = await createBarcodeReader(env()).start(video(), (frame) => frames.push(frame));
    await vi.advanceTimersByTimeAsync(50);
    for (const frame of frames) expect(JSON.stringify(frame)).not.toMatch(/data:image|blob:/);
    stop();
  });
});

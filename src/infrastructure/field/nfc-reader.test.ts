// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createNfcReader, type NfcEnv, type NfcRead } from './nfc-reader';

// RF-007, RF-008: o leitor NFC só existe onde o navegador o tem (Chrome no Android, contexto seguro) e entrega o número de série e
// os textos gravados; etiqueta sem número de série utilizável e sem texto vira "ilegível".
interface FakeReading { serialNumber: string; message: { records: { recordType: string; data?: DataView; encoding?: string }[] } }

class FakeNdefReader {
  static scanError: Error | null = null;
  static instance: FakeNdefReader | null = null;
  onreading: ((event: FakeReading) => void) | null = null;
  onreadingerror: (() => void) | null = null;
  aborted = false;
  constructor() { FakeNdefReader.instance = this; }
  scan(options?: { signal?: AbortSignal }): Promise<void> {
    options?.signal?.addEventListener('abort', () => { this.aborted = true; });
    return FakeNdefReader.scanError ? Promise.reject(FakeNdefReader.scanError) : Promise.resolve();
  }
}

const text = (value: string): { recordType: string; data: DataView; encoding: string } => ({
  recordType: 'text', data: new DataView(new TextEncoder().encode(value).buffer), encoding: 'utf-8',
});
const env = (over: Partial<NfcEnv> = {}): NfcEnv => ({ reader: FakeNdefReader as unknown as NfcEnv['reader'], isSecureContext: true, ...over });
const emit = (reading: FakeReading): void => FakeNdefReader.instance!.onreading!(reading);

describe('isSupported', () => {
  it('só com o leitor do navegador e em contexto seguro', () => {
    expect(createNfcReader(env()).isSupported()).toBe(true);
    expect(createNfcReader(env({ reader: null })).isSupported()).toBe(false);
    expect(createNfcReader(env({ isSecureContext: false })).isSupported()).toBe(false);
  });
});

describe('start', () => {
  it('entrega o número de série e os textos gravados', async () => {
    const reads: NfcRead[] = [];
    FakeNdefReader.scanError = null;
    const stop = await createNfcReader(env()).start((read) => reads.push(read), () => undefined);
    emit({ serialNumber: '04:a2:3b:1c', message: { records: [text('CIL-0007'), { recordType: 'url' }] } });
    expect(reads).toEqual([{ serialNumber: '04:a2:3b:1c', texts: ['CIL-0007'] }]);
    stop();
  });

  it('decodifica o texto na codificação do registro', async () => {
    const reads: NfcRead[] = [];
    const stop = await createNfcReader(env()).start((read) => reads.push(read), () => undefined);
    emit({ serialNumber: '04:a2', message: { records: [{ recordType: 'text', data: new DataView(new Uint8Array([0x43, 0xe7, 0x41]).buffer), encoding: 'iso-8859-1' }] } });
    expect(reads[0]!.texts).toEqual(['CçA']);
    stop();
  });

  it('etiqueta sem número de série utilizável e sem texto chama o aviso de ilegível', async () => {
    const reads: NfcRead[] = [];
    const unreadable = vi.fn();
    const stop = await createNfcReader(env()).start((read) => reads.push(read), unreadable);
    emit({ serialNumber: '', message: { records: [] } });
    emit({ serialNumber: '00:00:00', message: { records: [{ recordType: 'url' }] } });
    expect(reads).toEqual([]);
    expect(unreadable).toHaveBeenCalledTimes(2);
    stop();
  });

  it('erro de leitura do navegador também vira "ilegível"', async () => {
    const unreadable = vi.fn();
    const stop = await createNfcReader(env()).start(() => undefined, unreadable);
    FakeNdefReader.instance!.onreadingerror!();
    expect(unreadable).toHaveBeenCalledTimes(1);
    stop();
  });

  it('parar aborta a leitura', async () => {
    const stop = await createNfcReader(env()).start(() => undefined, () => undefined);
    stop();
    expect(FakeNdefReader.instance!.aborted).toBe(true);
  });

  it('permissão negada vira erro "denied"', async () => {
    FakeNdefReader.scanError = Object.assign(new Error('x'), { name: 'NotAllowedError' });
    await expect(createNfcReader(env()).start(() => undefined, () => undefined)).rejects.toMatchObject({ kind: 'denied' });
    FakeNdefReader.scanError = null;
  });

  it('NFC desligado ou ocupado vira erro "unavailable"', async () => {
    FakeNdefReader.scanError = new Error('NFC desligado');
    await expect(createNfcReader(env()).start(() => undefined, () => undefined)).rejects.toMatchObject({ kind: 'unavailable' });
    FakeNdefReader.scanError = null;
  });

  it('sem suporte, nem tenta ler', async () => {
    await expect(createNfcReader(env({ reader: null })).start(() => undefined, () => undefined)).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

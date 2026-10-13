import type { Page } from '@playwright/test';

// Leitores simulados da Spec 009 para os E2E: sem câmera, NFC nem GPS de verdade. O detector de código, a câmera e o leitor NFC falsos
// são injetados antes da página abrir; o teste "lê" um código enfileirando-o. O comportamento real de câmera, NFC e GPS só se valida em
// aparelho Android com Chrome, na validação humana (quickstart.md).
export interface ReaderOptions {
  camera?: boolean;
  nfc?: boolean;
}

export interface FieldReaders {
  // Aponta a câmera para um ou mais códigos no mesmo quadro (dois ou mais valem como "mais de um código no quadro").
  scan: (...values: string[]) => Promise<void>;
  // Encosta uma etiqueta NFC no aparelho.
  tapNfc: (reading: { serialNumber: string; texts?: string[] }) => Promise<void>;
  // Etiqueta que o aparelho não conseguiu ler.
  tapUnreadableNfc: () => Promise<void>;
}

interface FakeState {
  frames: string[][];
  nfc: { onreading: ((event: unknown) => void) | null; onreadingerror: (() => void) | null } | null;
}

export async function installFieldReaders(page: Page, options: ReaderOptions = {}): Promise<FieldReaders> {
  await page.addInitScript((opts: ReaderOptions) => {
    const fake: FakeState = { frames: [], nfc: null };
    (window as unknown as { __fluxidFake: FakeState }).__fluxidFake = fake;
    if (opts.camera) {
      (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {
        static async getSupportedFormats(): Promise<string[]> { return ['qr_code', 'data_matrix']; }
        async detect(): Promise<{ rawValue: string }[]> { return (fake.frames.shift() ?? []).map((rawValue) => ({ rawValue })); }
      };
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) } });
      HTMLMediaElement.prototype.play = (): Promise<void> => Promise.resolve();
      // O fluxo é falso (o WebKit do Playwright nem tem `MediaStream`); o vídeo só guarda a referência, porque o detector também é falso.
      Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
        configurable: true,
        get(this: { __fluxidSource?: unknown }) { return this.__fluxidSource ?? null; },
        set(this: { __fluxidSource?: unknown }, value: unknown) { this.__fluxidSource = value; },
      });
    }
    if (opts.nfc) {
      (window as unknown as { NDEFReader: unknown }).NDEFReader = class {
        onreading: ((event: unknown) => void) | null = null;
        onreadingerror: (() => void) | null = null;
        constructor() { fake.nfc = this; }
        async scan(): Promise<void> { /* a leitura é disparada pelo teste */ }
      };
    }
  }, options);
  return {
    scan: (...values) => page.evaluate((codes) => { (window as unknown as { __fluxidFake: FakeState }).__fluxidFake.frames.push(codes); }, values),
    tapNfc: async (reading) => {
      await aguardarNfc(page);
      await page.evaluate((read) => {
      const record = (text: string) => ({ recordType: 'text', encoding: 'utf-8', data: new DataView(new TextEncoder().encode(text).buffer) });
      (window as unknown as { __fluxidFake: FakeState }).__fluxidFake.nfc!.onreading!({ serialNumber: read.serialNumber, message: { records: (read.texts ?? []).map(record) } });
      }, reading);
    },
    tapUnreadableNfc: async () => {
      await aguardarNfc(page);
      await page.evaluate(() => { (window as unknown as { __fluxidFake: FakeState }).__fluxidFake.nfc!.onreadingerror!(); });
    },
  };
}

// O leitor NFC só existe depois que a tela o liga; o toque espera por ele para não correr contra a tela.
async function aguardarNfc(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __fluxidFake: FakeState }).__fluxidFake.nfc !== null);
}

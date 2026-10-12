import { normalizeSerial } from '@/domain/field/identifier-candidates';
import { isPermissionError, ReaderError } from './reader-error';

// Leitura de etiqueta NFC pelo navegador (Web NFC: só Chrome no Android, em contexto seguro) (RF-007, RF-008). Entrega o número de
// série e os textos gravados; quem monta os candidatos é o domínio. Nenhum valor lido sai daqui além do retorno ao chamador.
interface NdefRecord { recordType: string; data?: DataView; encoding?: string }
interface NdefReadingEvent { serialNumber: string; message: { records: readonly NdefRecord[] } }
interface NdefReaderInstance {
  onreading: ((event: NdefReadingEvent) => void) | null;
  onreadingerror: (() => void) | null;
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
}
type NdefReaderConstructor = new () => NdefReaderInstance;

export interface NfcEnv {
  reader: NdefReaderConstructor | null | undefined;
  isSecureContext: boolean;
}

export interface NfcRead {
  serialNumber: string;
  texts: string[];
}

export interface NfcReader {
  isSupported: () => boolean;
  // Liga a leitura e chama `onRead` a cada etiqueta e `onUnreadable` quando a etiqueta não tem número de série utilizável nem texto.
  // Devolve a função que desliga a leitura.
  start: (onRead: (read: NfcRead) => void, onUnreadable: () => void) => Promise<() => void>;
}

export function browserNfcEnv(): NfcEnv {
  const candidate = (globalThis as { NDEFReader?: NdefReaderConstructor }).NDEFReader;
  return {
    reader: typeof candidate === 'function' ? candidate : null,
    // Só `false` é inseguro: fora de navegador (testes) a propriedade nem existe.
    isSecureContext: globalThis.isSecureContext !== false,
  };
}

function textsOf(records: readonly NdefRecord[]): string[] {
  const texts: string[] = [];
  for (const record of records) {
    if (record.recordType !== 'text' || !record.data) continue;
    try {
      texts.push(new TextDecoder(record.encoding || 'utf-8').decode(record.data));
    } catch {
      // Codificação desconhecida: o registro é ignorado.
    }
  }
  return texts;
}

export function createNfcReader(env: NfcEnv = browserNfcEnv()): NfcReader {
  const isSupported = (): boolean => env.isSecureContext && typeof env.reader === 'function';

  const start = async (onRead: (read: NfcRead) => void, onUnreadable: () => void): Promise<() => void> => {
    if (!isSupported()) throw new ReaderError('unavailable');
    const reader = new env.reader!();
    const controller = new AbortController();
    reader.onreading = (event) => {
      const texts = textsOf(event.message?.records ?? []);
      if (normalizeSerial(event.serialNumber) === null && texts.every((text) => text.trim() === '')) return onUnreadable();
      onRead({ serialNumber: event.serialNumber, texts });
    };
    reader.onreadingerror = onUnreadable;
    try {
      await reader.scan({ signal: controller.signal });
    } catch (cause) {
      throw new ReaderError(isPermissionError(cause) ? 'denied' : 'unavailable');
    }
    return () => controller.abort();
  };

  return { isSupported, start };
}

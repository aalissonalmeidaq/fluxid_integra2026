import { isPermissionError, ReaderError } from './reader-error';

// Leitura de QR Code e Data Matrix pela câmera, no próprio navegador (RF-001, RF-008, RF-018). Nenhum quadro, imagem ou fluxo de
// vídeo sai daqui: o detector olha o vídeo e só o texto do código sobe. O ambiente é injetável para os testes.
export type ScanFormat = 'qr_code' | 'data_matrix';
// Só estes dois formatos interessam: os identificadores do FluxID são QR Code e Data Matrix.
const WANTED_FORMATS: readonly ScanFormat[] = ['qr_code', 'data_matrix'];
const DEFAULT_INTERVAL_MS = 250;

interface Detector { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
interface DetectorConstructor {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
}

export interface BarcodeEnv {
  detector: DetectorConstructor | null | undefined;
  mediaDevices: Pick<MediaDevices, 'getUserMedia'> | undefined;
  isSecureContext: boolean;
  intervalMs?: number;
}

// `multiple`: mais de um código no mesmo quadro; nenhuma leitura é aceita naquele quadro.
export type BarcodeFrame = { kind: 'read'; value: string } | { kind: 'multiple' };

export interface BarcodeReader {
  // Formatos que este navegador lê, entre os desejados. Qualquer falha na consulta vale como "sem suporte".
  supportedFormats: () => Promise<readonly ScanFormat[]>;
  // Abre a câmera no vídeo e entrega cada quadro lido; continua lendo até chamarem a função devolvida (que desliga a câmera).
  start: (video: HTMLVideoElement, onFrame: (frame: BarcodeFrame) => void) => Promise<() => void>;
}

export function browserBarcodeEnv(): BarcodeEnv {
  const candidate = (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  return {
    detector: typeof candidate === 'function' ? candidate : null,
    mediaDevices: typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined,
    // Só `false` é inseguro: fora de navegador (testes) a propriedade nem existe.
    isSecureContext: globalThis.isSecureContext !== false,
  };
}

export function createBarcodeReader(env: BarcodeEnv = browserBarcodeEnv()): BarcodeReader {
  const usable = (): DetectorConstructor | null => {
    if (!env.isSecureContext || typeof env.detector !== 'function' || typeof env.mediaDevices?.getUserMedia !== 'function') return null;
    return env.detector;
  };

  const supportedFormats = async (): Promise<readonly ScanFormat[]> => {
    const Detector = usable();
    if (!Detector) return [];
    try {
      const supported = (await Detector.getSupportedFormats?.()) ?? [];
      return WANTED_FORMATS.filter((format) => supported.includes(format));
    } catch {
      return [];
    }
  };

  const start = async (video: HTMLVideoElement, onFrame: (frame: BarcodeFrame) => void): Promise<() => void> => {
    const Detector = usable();
    if (!Detector) throw new ReaderError('unavailable');
    const formats = await supportedFormats();
    if (formats.length === 0) throw new ReaderError('unavailable');
    let stream: MediaStream;
    try {
      stream = await env.mediaDevices!.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (cause) {
      throw new ReaderError(isPermissionError(cause) ? 'denied' : 'unavailable');
    }
    let active = true;
    const loop: { timer?: ReturnType<typeof setInterval> } = {};
    const stop = (): void => {
      if (!active) return;
      active = false;
      if (loop.timer) clearInterval(loop.timer);
      stream.getTracks().forEach((track) => track.stop());
    };
    try {
      video.srcObject = stream;
      await video.play();
    } catch {
      stop();
      throw new ReaderError('unavailable');
    }
    const detector = new Detector({ formats: [...formats] });
    let reading = false;
    loop.timer = setInterval(() => {
      if (!active || reading) return;
      reading = true;
      detector.detect(video)
        .then((codes) => {
          if (!active) return;
          const values = codes.map((code) => code.rawValue?.trim()).filter((value): value is string => Boolean(value));
          if (values.length > 1) onFrame({ kind: 'multiple' });
          else if (values.length === 1) onFrame({ kind: 'read', value: values[0]! });
        })
        .catch(() => undefined)
        .finally(() => { reading = false; });
    }, env.intervalMs ?? DEFAULT_INTERVAL_MS);
    return stop;
  };

  return { supportedFormats, start };
}

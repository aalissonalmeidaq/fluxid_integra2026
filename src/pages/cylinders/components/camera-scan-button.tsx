import React from 'react';
import { Alert, Button, Dialog } from '@/design-system';

interface Detector { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
interface DetectorConstructor {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
}

const INTERVAL_MS = 250;
// Só estes dois formatos interessam: os identificadores do FluxID são QR Code e Data Matrix.
const WANTED_FORMATS = ['qr_code', 'data_matrix'];

const detectorConstructor = (): DetectorConstructor | null => {
  const candidate = (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  return typeof candidate === 'function' ? candidate : null;
};

// Formatos que este navegador realmente lê, entre os desejados. Qualquer falha na consulta vale como "sem suporte".
async function readableFormats(): Promise<string[]> {
  const Detector = detectorConstructor();
  if (!Detector || typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') return [];
  try {
    const supported = (await Detector.getSupportedFormats?.()) ?? [];
    return WANTED_FORMATS.filter((format) => supported.includes(format));
  } catch {
    return [];
  }
}

export interface CameraScanButtonProps {
  // Recebe o texto lido do QR Code ou do Data Matrix. A câmera só lê; quem chama decide o que fazer com o valor.
  onRead: (value: string) => void;
}

// Leitura de QR Code e Data Matrix pela câmera do aparelho, no próprio navegador (nenhuma imagem sai do aparelho). Só aparece
// onde o navegador sabe ler código (BarcodeDetector, hoje o Chrome no Android); nos demais, a digitação e o leitor-teclado seguem.
export function CameraScanButton({ onRead }: CameraScanButtonProps): React.JSX.Element | null {
  const [trigger, setTrigger] = React.useState<HTMLElement | null>(null);
  const [open, setOpen] = React.useState(false);
  // `null` enquanto consulta: o botão só aparece quando há pelo menos um formato compatível.
  const [formats, setFormats] = React.useState<string[] | null>(null);
  React.useEffect(() => {
    let current = true;
    void readableFormats().then((found) => { if (current) setFormats(found); });
    return () => { current = false; };
  }, []);
  if (!formats || formats.length === 0) return null;
  const close = (): void => setOpen(false);
  return (
    <>
      <Button variant="secundario" className="self-start" aria-haspopup="dialog" onClick={(event) => { setTrigger(event.currentTarget); setOpen(true); }}>
        Ler com a câmera
      </Button>
      {open && (
        <Dialog title="Ler com a câmera" onClose={close} returnFocusTo={trigger} footer={<Button variant="secundario" onClick={close}>Cancelar</Button>}>
          <Scanner formats={formats} onRead={(value) => { close(); onRead(value); }} />
        </Dialog>
      )}
    </>
  );
}

function Scanner({ formats, onRead }: { formats: string[]; onRead: (value: string) => void }): React.JSX.Element {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const onReadRef = React.useRef(onRead);
  React.useEffect(() => { onReadRef.current = onRead; }, [onRead]);

  React.useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stream: MediaStream | undefined;
    const Detector = detectorConstructor();
    const stopAll = (): void => {
      active = false;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = undefined;
    };
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!active) return stopAll();
        const video = videoRef.current;
        if (!video || !Detector) return stopAll();
        video.srcObject = stream;
        await video.play();
        const detector = new Detector({ formats });
        let reading = false;
        timer = setInterval(() => {
          if (!active || reading) return;
          reading = true;
          detector.detect(video)
            .then((codes) => {
              const value = codes[0]?.rawValue?.trim();
              if (active && value) { stopAll(); onReadRef.current(value); }
            })
            .catch(() => undefined)
            .finally(() => { reading = false; });
        }, INTERVAL_MS);
      } catch (cause) {
        stopAll();
        const denied = cause instanceof Error && (cause.name === 'NotAllowedError' || cause.name === 'SecurityError');
        setError(denied ? 'Permita o uso da câmera no navegador para ler o código.' : 'Não foi possível abrir a câmera deste aparelho.');
      }
    })();
    return stopAll;
  }, [formats]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-corpo">Aponte a câmera para o QR Code ou o Data Matrix do cilindro. A leitura é automática.</p>
      {error ? <Alert variant="erro">{error}</Alert> : (
        <video ref={videoRef} aria-label="Imagem da câmera" playsInline muted className="w-full rounded-card border border-borda-suave bg-navy" />
      )}
    </div>
  );
}

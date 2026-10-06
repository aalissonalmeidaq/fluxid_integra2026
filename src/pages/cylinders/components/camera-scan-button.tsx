import React from 'react';
import { Alert, Button, Dialog } from '@/design-system';

interface Detector { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

const INTERVAL_MS = 250;

const detectorConstructor = (): DetectorConstructor | null => {
  const candidate = (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  return typeof candidate === 'function' ? candidate : null;
};

const cameraAvailable = (): boolean => detectorConstructor() !== null && typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';

export interface CameraScanButtonProps {
  // Recebe o texto lido do QR Code ou do Data Matrix. A câmera só lê; quem chama decide o que fazer com o valor.
  onRead: (value: string) => void;
}

// Leitura de QR Code e Data Matrix pela câmera do aparelho, no próprio navegador (nenhuma imagem sai do aparelho). Só aparece
// onde o navegador sabe ler código (BarcodeDetector, hoje o Chrome no Android); nos demais, a digitação e o leitor-teclado seguem.
export function CameraScanButton({ onRead }: CameraScanButtonProps): React.JSX.Element | null {
  const [trigger, setTrigger] = React.useState<HTMLElement | null>(null);
  const [open, setOpen] = React.useState(false);
  if (!cameraAvailable()) return null;
  const close = (): void => setOpen(false);
  return (
    <>
      <Button variant="secundario" className="self-start" aria-haspopup="dialog" onClick={(event) => { setTrigger(event.currentTarget); setOpen(true); }}>
        Ler com a câmera
      </Button>
      {open && (
        <Dialog title="Ler com a câmera" onClose={close} returnFocusTo={trigger} footer={<Button variant="secundario" onClick={close}>Cancelar</Button>}>
          <Scanner onRead={(value) => { close(); onRead(value); }} />
        </Dialog>
      )}
    </>
  );
}

function Scanner({ onRead }: { onRead: (value: string) => void }): React.JSX.Element {
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
    };
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!active) return stopAll();
        const video = videoRef.current;
        if (!video || !Detector) return;
        video.srcObject = stream;
        await video.play();
        const detector = new Detector({ formats: ['qr_code', 'data_matrix'] });
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
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-corpo">Aponte a câmera para o QR Code ou o Data Matrix do cilindro. A leitura é automática.</p>
      {error ? <Alert variant="erro">{error}</Alert> : (
        <video ref={videoRef} aria-label="Imagem da câmera" playsInline muted className="w-full rounded-card border border-borda-suave bg-navy" />
      )}
    </div>
  );
}

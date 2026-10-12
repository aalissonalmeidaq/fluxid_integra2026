import React from 'react';
import { Alert, Button, Dialog } from '@/design-system';
import { createBarcodeReader, type BarcodeReader } from '@/infrastructure/field/barcode-reader';
import { ReaderError } from '@/infrastructure/field/reader-error';

export interface CameraScanButtonProps {
  // Recebe o texto lido do QR Code ou do Data Matrix. A câmera só lê; quem chama decide o que fazer com o valor.
  onRead: (value: string) => void;
}

// Leitura de QR Code e Data Matrix pela câmera do aparelho, no próprio navegador (nenhuma imagem sai do aparelho). Só aparece
// onde o navegador sabe ler código (detector de código de barras, hoje o Chrome no Android); nos demais, a digitação e o
// leitor-teclado seguem. A leitura em si é do adaptador `infrastructure/field/barcode-reader.ts`, o mesmo do leitor contínuo da Spec 009.
export function CameraScanButton({ onRead }: CameraScanButtonProps): React.JSX.Element | null {
  const reader = React.useMemo(() => createBarcodeReader(), []);
  const [trigger, setTrigger] = React.useState<HTMLElement | null>(null);
  const [open, setOpen] = React.useState(false);
  // `null` enquanto consulta: o botão só aparece quando há pelo menos um formato compatível.
  const [supported, setSupported] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let current = true;
    void reader.supportedFormats().then((formats) => { if (current) setSupported(formats.length > 0); });
    return () => { current = false; };
  }, [reader]);
  if (!supported) return null;
  const close = (): void => setOpen(false);
  return (
    <>
      <Button variant="secundario" className="self-start" aria-haspopup="dialog" onClick={(event) => { setTrigger(event.currentTarget); setOpen(true); }}>
        Ler com a câmera
      </Button>
      {open && (
        <Dialog title="Ler com a câmera" onClose={close} returnFocusTo={trigger} footer={<Button variant="secundario" onClick={close}>Cancelar</Button>}>
          <Scanner reader={reader} onRead={(value) => { close(); onRead(value); }} />
        </Dialog>
      )}
    </>
  );
}

function Scanner({ reader, onRead }: { reader: BarcodeReader; onRead: (value: string) => void }): React.JSX.Element {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const onReadRef = React.useRef(onRead);
  React.useEffect(() => { onReadRef.current = onRead; }, [onRead]);

  React.useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    reader.start(videoRef.current as HTMLVideoElement, (frame) => {
      // Leitura única: o primeiro código desliga a câmera e é entregue; mais de um código no quadro não vale.
      if (frame.kind !== 'read' || cancelled) return;
      cancelled = true;
      stop?.();
      onReadRef.current(frame.value);
    }).then((handle) => {
      if (cancelled) handle();
      else stop = handle;
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof ReaderError && cause.kind === 'denied' ? 'Permita o uso da câmera no navegador para ler o código.' : 'Não foi possível abrir a câmera deste aparelho.');
    });
    return () => { cancelled = true; stop?.(); };
  }, [reader]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-corpo">Aponte a câmera para o QR Code ou o Data Matrix do cilindro. A leitura é automática.</p>
      {error ? <Alert variant="erro">{error}</Alert> : (
        <video ref={videoRef} aria-label="Imagem da câmera" playsInline muted className="w-full rounded-card border border-borda-suave bg-navy" />
      )}
    </div>
  );
}

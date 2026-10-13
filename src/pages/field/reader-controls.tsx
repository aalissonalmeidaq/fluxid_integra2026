import React, { useEffect, useMemo, useState } from 'react';
import { Button, Icon, TextField } from '@/design-system';
import type { IconName } from '@/design-system';
import { candidateFromScan } from '@/domain/field/identifier-candidates';
import { createBarcodeReader, type BarcodeReader } from '@/infrastructure/field/barcode-reader';
import { createNfcReader, type NfcReader } from '@/infrastructure/field/nfc-reader';
import type { ReadEvent, ReadFeedback } from './identifier-reader-dialog';
import { LazyIdentifierReaderDialog } from './lazy-identifier-reader';

// Controles de leitura de uma tela (Spec 009): o botão "Ler cilindro" (câmera e NFC, só onde há suporte) e o campo de código digitado,
// colado ou de leitor que age como teclado (RF-001, RF-008, RF-020). O campo existe sempre; a câmera e o NFC são opcionais. O que fazer
// com o cilindro lido é de quem usa (`onRead`): aqui só se lê, se mostra o resultado em texto e se respeita a falta de conexão.
export interface ReaderControlsProps {
  onRead: (event: ReadEvent) => Promise<ReadFeedback> | ReadFeedback;
  online: boolean;
  // Outra ação da tela em andamento.
  disabled?: boolean;
  // Andamento mostrado na região de status do leitor (por exemplo, "3 de 10 conferidos"); a tela de origem já mostra o seu contador.
  summary?: string;
  // Texto do botão que envia o código digitado ("Conferir código", "Marcar como entregue").
  submitLabel: string;
  barcodeReader?: BarcodeReader;
  nfcReader?: NfcReader;
}

const TONE_ICON: Record<ReadFeedback['tone'], IconName> = { success: 'verificado', warning: 'alerta', error: 'alerta', info: 'notificacoes' };
const TONE_CLASS: Record<ReadFeedback['tone'], string> = {
  success: 'text-verde-acessivel', warning: 'text-alerta-texto', error: 'text-erro', info: 'text-azul-profundo',
};
const UNSUPPORTED = 'Leitura por câmera ou NFC indisponível neste aparelho. Digite o código ou use um leitor.';
const OFFLINE = 'Sem conexão. Registrar exige conexão.';

export function ReaderControls({ onRead, online, disabled = false, summary, submitLabel, barcodeReader, nfcReader }: ReaderControlsProps): React.JSX.Element {
  const camera = useMemo(() => barcodeReader ?? createBarcodeReader(), [barcodeReader]);
  const nfc = useMemo(() => nfcReader ?? createNfcReader(), [nfcReader]);
  // `null` enquanto consulta: o aviso de "indisponível" só aparece depois que se sabe que não há suporte.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<ReadFeedback | null>(null);

  useEffect(() => {
    let current = true;
    const nfcSupported = nfc.isSupported();
    camera.supportedFormats().then((formats) => formats.length > 0).catch(() => false).then((cameraSupported) => { if (current) setSupported(cameraSupported || nfcSupported); });
    return () => { current = false; };
  }, [camera, nfc]);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (busy || !online || disabled) return;
    const candidates = candidateFromScan(code);
    if (candidates.length === 0) { setFeedback({ tone: 'error', message: 'Informe o código do cilindro.' }); return; }
    setBusy(true);
    let result: ReadFeedback;
    try {
      result = await onRead({ candidates, source: 'typed' });
    } catch {
      result = { tone: 'error', message: 'Não foi possível conferir agora. Tente de novo.' };
    }
    setFeedback(result);
    if (result.tone === 'success') setCode('');
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {supported && (
        <Button variant="secundario" className="self-start" aria-haspopup="dialog" disabled={disabled} onClick={(event) => { setTrigger(event.currentTarget); setOpen(true); }}>
          Ler cilindro
        </Button>
      )}
      {supported === false && <p className="m-0 text-corpo text-grafite">{UNSUPPORTED}</p>}
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-wrap items-end gap-2">
        <TextField
          label="Código do cilindro" help="Digite, cole ou use um leitor de código." name="reader-code" autoComplete="off" autoCapitalize="characters" spellCheck={false}
          value={code} onChange={(event) => setCode(event.target.value)} wrapperClassName="min-w-0 flex-1"
        />
        <Button type="submit" variant="secundario" disabled={!online || disabled} loading={busy} loadingLabel="Conferindo…">{submitLabel}</Button>
      </form>
      {!online && <p className="m-0 text-corpo text-grafite">{OFFLINE}</p>}
      {feedback && (
        <p data-tone={feedback.tone} className={`m-0 flex items-start gap-2 text-corpo font-semibold ${TONE_CLASS[feedback.tone]}`}>
          <Icon name={TONE_ICON[feedback.tone]} variant="monocromatica" />
          <span className="min-w-0 break-words">{feedback.message}</span>
        </p>
      )}
      {open && (
        <LazyIdentifierReaderDialog
          onClose={() => setOpen(false)} returnFocusTo={trigger} onRead={onRead} offline={!online} barcodeReader={camera} nfcReader={nfc}
          {...(summary ? { summary } : {})}
        />
      )}
    </div>
  );
}

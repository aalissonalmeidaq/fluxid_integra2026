import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, Icon } from '@/design-system';
import type { IconName } from '@/design-system';
import { candidateFromScan, candidatesFromNfc, type IdentifierCandidate } from '@/domain/field/identifier-candidates';
import type { ReadingSource } from '@/domain/field/reading-source';
import { createScanDebounce, READER_IDLE_MS } from '@/domain/field/scan-debounce';
import { createBarcodeReader, type BarcodeFrame, type BarcodeReader } from '@/infrastructure/field/barcode-reader';
import { createNfcReader, type NfcRead, type NfcReader } from '@/infrastructure/field/nfc-reader';
import { ReaderError } from '@/infrastructure/field/reader-error';

// Leitor contínuo de identificadores por câmera (QR Code e Data Matrix) e NFC (RF-001, RF-004, RF-008, RF-018, RF-020). Só mostra os
// modos que o aparelho suporta. A janela fica aberta para ler vários cilindros em sequência; cada leitura vai ao chamador, que decide o
// que fazer com o valor e devolve o texto do resultado. Nenhum valor lido é guardado aqui nem sai do aparelho por este componente.
export interface ReadEvent {
  candidates: IdentifierCandidate[];
  source: ReadingSource;
}

export interface ReadFeedback {
  tone: 'success' | 'warning' | 'error' | 'info';
  message: string;
}

export interface IdentifierReaderDialogProps {
  title?: string;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  onRead: (event: ReadEvent) => Promise<ReadFeedback> | ReadFeedback;
  // Texto de andamento mostrado na região de status (por exemplo, "3 de 10 conferidos").
  summary?: string;
  // Sem conexão a leitura abre, mas nada é processado: registrar exige conexão e nunca é enfileirado.
  offline?: boolean;
  // Texto do aviso sem conexão; o padrão fala de registrar, e uma consulta usa o seu próprio.
  offlineMessage?: string;
  barcodeReader?: BarcodeReader;
  nfcReader?: NfcReader;
  idleMs?: number;
  now?: () => number;
}

type Mode = 'camera' | 'nfc';
type Phase = 'checking' | 'opening' | 'reading' | 'paused' | 'denied' | 'error';

const MESSAGES = {
  multiple: 'Há mais de um código no quadro. Aponte para um só.',
  unreadable: 'Não foi possível ler a etiqueta. Digite o código ou tente outra.',
  failed: 'Não foi possível conferir agora. Tente de novo.',
  offline: 'Sem conexão. Registrar exige conexão.',
  paused: 'A leitura foi pausada por inatividade.',
  unsupported: 'Leitura por câmera ou NFC indisponível neste aparelho. Digite o código ou use um leitor.',
  cameraDenied: 'A permissão da câmera foi negada. Libere a câmera nas configurações do navegador ou digite o código.',
  cameraError: 'Não foi possível abrir a câmera deste aparelho. Feche outros aplicativos que usam a câmera ou digite o código.',
  nfcDenied: 'A permissão do NFC foi negada. Libere o NFC nas configurações do navegador ou digite o código.',
  nfcError: 'Não foi possível ligar o NFC deste aparelho. Ative o NFC ou digite o código.',
} as const;

const TONES: Record<ReadFeedback['tone'], { classes: string; icon: IconName }> = {
  success: { classes: 'border-verde-escuro bg-sucesso-fundo text-verde-acessivel', icon: 'verificado' },
  warning: { classes: 'border-alerta-faixa bg-alerta-fundo text-alerta-texto', icon: 'alerta' },
  error: { classes: 'border-erro bg-erro-fundo text-erro', icon: 'alerta' },
  info: { classes: 'border-azul-royal bg-info-fundo text-azul-profundo', icon: 'notificacoes' },
};

export function IdentifierReaderDialog({
  title = 'Ler cilindro', onClose, returnFocusTo, onRead, summary, offline = false, offlineMessage = MESSAGES.offline, barcodeReader, nfcReader, idleMs = READER_IDLE_MS, now,
}: IdentifierReaderDialogProps): React.JSX.Element {
  const camera = useMemo(() => barcodeReader ?? createBarcodeReader(), [barcodeReader]);
  const nfc = useMemo(() => nfcReader ?? createNfcReader(), [nfcReader]);
  const nfcSupported = useMemo(() => nfc.isSupported(), [nfc]);
  const [cameraSupported, setCameraSupported] = useState<boolean | null>(null);
  const [chosen, setChosen] = useState<Mode | null>(null);
  const [phase, setPhase] = useState<Phase>('checking');
  const [session, setSession] = useState(0);
  const [feedback, setFeedback] = useState<ReadFeedback | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | undefined>(undefined);
  const idleRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busyRef = useRef(false);
  const onReadRef = useRef(onRead);
  const offlineRef = useRef(offline);
  const acceptRef = useRef(createScanDebounce(now));
  useEffect(() => { onReadRef.current = onRead; offlineRef.current = offline; }, [onRead, offline]);

  const clearIdle = useCallback((): void => {
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = undefined;
  }, []);
  // Cada leitura (aceita, recusada ou ambígua) reinicia a contagem de inatividade.
  const armIdle = useCallback((): void => {
    clearIdle();
    idleRef.current = setTimeout(() => {
      stopRef.current?.();
      stopRef.current = undefined;
      setPhase('paused');
    }, idleMs);
  }, [clearIdle, idleMs]);

  // Quais modos o aparelho suporta: a consulta da câmera é assíncrona e qualquer falha vale como "sem suporte".
  useEffect(() => {
    let current = true;
    camera.supportedFormats().then((formats) => formats.length > 0).catch(() => false).then((supported) => { if (current) setCameraSupported(supported); });
    return () => { current = false; };
  }, [camera]);

  // Modo ativo: o escolhido pela pessoa ou o primeiro que o aparelho suporta (câmera antes de NFC). Sem nenhum, a leitura é indisponível.
  const mode: Mode | null = chosen ?? (cameraSupported === null ? null : cameraSupported ? 'camera' : nfcSupported ? 'nfc' : null);
  const unsupported = cameraSupported === false && !nfcSupported;

  const process = useCallback(async (candidates: IdentifierCandidate[], source: ReadingSource): Promise<void> => {
    armIdle();
    if (offlineRef.current || busyRef.current) return;
    if (!acceptRef.current(candidates[0]!.value)) return;
    busyRef.current = true;
    try {
      setFeedback(await onReadRef.current({ candidates, source }));
    } catch {
      setFeedback({ tone: 'error', message: MESSAGES.failed });
    } finally {
      busyRef.current = false;
    }
  }, [armIdle]);

  // Liga a câmera ou o NFC do modo escolhido; trocar de modo, tentar de novo ou continuar reinicia este efeito.
  useEffect(() => {
    if (!mode) return;
    let cancelled = false;
    const onFrame = (frame: BarcodeFrame): void => {
      if (frame.kind === 'multiple') { armIdle(); setFeedback({ tone: 'warning', message: MESSAGES.multiple }); return; }
      void process(candidateFromScan(frame.value), 'camera');
    };
    const onNfcRead = (read: NfcRead): void => {
      const candidates = candidatesFromNfc(read);
      if (candidates.length === 0) { armIdle(); setFeedback({ tone: 'warning', message: MESSAGES.unreadable }); return; }
      void process(candidates, 'nfc');
    };
    const onUnreadable = (): void => { armIdle(); setFeedback({ tone: 'warning', message: MESSAGES.unreadable }); };
    const starting = mode === 'camera'
      ? camera.start(videoRef.current as HTMLVideoElement, onFrame)
      : nfc.start(onNfcRead, onUnreadable);
    starting.then((stop) => {
      if (cancelled) { stop(); return; }
      stopRef.current = stop;
      setPhase('reading');
      armIdle();
    }).catch((cause: unknown) => {
      if (!cancelled) setPhase(cause instanceof ReaderError && cause.kind === 'denied' ? 'denied' : 'error');
    });
    return () => {
      cancelled = true;
      clearIdle();
      stopRef.current?.();
      stopRef.current = undefined;
    };
  }, [mode, session, camera, nfc, armIdle, clearIdle, process]);

  const restart = (): void => { setFeedback(null); setPhase('opening'); setSession((value) => value + 1); };
  const switchMode = (next: Mode): void => { setFeedback(null); setPhase('opening'); setChosen(next); };

  const showVideo = mode === 'camera' && (phase === 'checking' || phase === 'opening' || phase === 'reading');
  const failure = phase === 'denied' || phase === 'error'
    ? (mode === 'nfc' ? (phase === 'denied' ? MESSAGES.nfcDenied : MESSAGES.nfcError) : (phase === 'denied' ? MESSAGES.cameraDenied : MESSAGES.cameraError))
    : null;
  const message: ReadFeedback | null = offline ? { tone: 'warning', message: offlineMessage }
    : phase === 'paused' ? { tone: 'info', message: MESSAGES.paused } : feedback;
  const tone = message ? TONES[message.tone] : null;

  return (
    <Dialog title={title} onClose={onClose} returnFocusTo={returnFocusTo} size="padrao" footer={<Button variant="secundario" onClick={onClose}>Fechar</Button>}>
      <div className="flex flex-col gap-4">
        {cameraSupported && nfcSupported && (
          <div role="group" aria-label="Modo de leitura" className="flex gap-2">
            {(['camera', 'nfc'] as const).map((option) => (
              <Button key={option} variant="secundario" aria-pressed={mode === option} onClick={() => switchMode(option)}>
                {option === 'camera' ? 'Câmera' : 'NFC'}
              </Button>
            ))}
          </div>
        )}
        {unsupported && <p className="text-corpo">{MESSAGES.unsupported}</p>}
        {mode === 'camera' && !failure && phase !== 'paused' && (
          <p className="text-corpo">Aponte a câmera para o QR Code ou o Data Matrix do cilindro. A leitura é automática e continua para o próximo.</p>
        )}
        {mode === 'nfc' && !failure && phase !== 'paused' && (
          <p className="text-corpo">Aproxime a etiqueta NFC do aparelho. A leitura é automática e continua para a próxima.</p>
        )}
        {showVideo && <video ref={videoRef} aria-label="Imagem da câmera" playsInline muted className="w-full rounded-card border border-borda-suave bg-navy" />}
        {failure && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-corpo text-erro">{failure}</p>
            <Button variant="secundario" onClick={restart}>Tentar de novo</Button>
          </div>
        )}
        {phase === 'paused' && <Button variant="primario" className="self-start" onClick={restart}>Continuar lendo</Button>}
        <div
          role="status"
          aria-live="polite"
          className={message || summary ? `flex items-start gap-2 rounded-card border p-4 text-corpo ${tone ? tone.classes : 'border-borda-suave bg-branco text-grafite'}` : 'sr-only'}
        >
          {message && tone && <Icon name={tone.icon} variant="monocromatica" />}
          <div className="flex min-w-0 flex-col gap-1">
            {message && <p className="break-words">{message.message}</p>}
            {summary && <p className="break-words font-semibold">{summary}</p>}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

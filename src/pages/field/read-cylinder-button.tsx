import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/design-system';
import { describeUnresolved, type ResolutionLike } from '@/domain/field/reading-result';
import { createBarcodeReader, type BarcodeReader } from '@/infrastructure/field/barcode-reader';
import { createNfcReader, type NfcReader } from '@/infrastructure/field/nfc-reader';
import type { ReadEvent, ReadFeedback } from './identifier-reader-dialog';
import { LazyIdentifierReaderDialog } from './lazy-identifier-reader';

// "Ler cilindro" (Spec 009, US3, RF-002, RF-006, RN-005): lê o QR Code, o Data Matrix ou a etiqueta NFC e abre o detalhe do cilindro. É só a
// leitura; a consulta por texto já existe nas telas de cilindros. Só aparece onde o aparelho lê código e para quem pode ver cilindros (quem o
// usa decide pela permissão). Identificador desativado e código que não existe (inclusive o de outra organização) só dizem a frase em texto.
export interface ReadCylinderButtonProps {
  // Identifica o código lido: a resposta do servidor, sem decidir nada.
  resolve: (event: ReadEvent) => Promise<ResolutionLike>;
  // Abre o detalhe do cilindro.
  onOpen: (cylinderId: string) => void;
  online: boolean;
  barcodeReader?: BarcodeReader;
  nfcReader?: NfcReader;
}

const OFFLINE = 'Sem conexão. A consulta do cilindro exige conexão.';

export function ReadCylinderButton({ resolve, onOpen, online, barcodeReader, nfcReader }: ReadCylinderButtonProps): React.JSX.Element | null {
  const camera = useMemo(() => barcodeReader ?? createBarcodeReader(), [barcodeReader]);
  const nfc = useMemo(() => nfcReader ?? createNfcReader(), [nfcReader]);
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let current = true;
    const nfcSupported = nfc.isSupported();
    camera.supportedFormats().then((formats) => formats.length > 0).catch(() => false).then((cameraSupported) => { if (current) setSupported(cameraSupported || nfcSupported); });
    return () => { current = false; };
  }, [camera, nfc]);

  if (!supported) return null;

  const read = async (event: ReadEvent): Promise<ReadFeedback> => {
    const outcome = await resolve(event);
    if (outcome.kind !== 'found') return describeUnresolved(outcome, event.source);
    // Inativo também abre: o detalhe mostra a situação (Spec 006).
    setOpen(false);
    onOpen(outcome.value.cylinder.id);
    return { tone: 'success', message: `Abrindo o cilindro ${outcome.value.cylinder.serialNumber}.` };
  };

  return (
    <>
      <Button variant="secundario" aria-haspopup="dialog" onClick={(event) => { setTrigger(event.currentTarget); setOpen(true); }}>Ler cilindro</Button>
      {open && (
        <LazyIdentifierReaderDialog
          onClose={() => setOpen(false)} returnFocusTo={trigger} onRead={read} offline={!online} offlineMessage={OFFLINE} barcodeReader={camera} nfcReader={nfc}
        />
      )}
    </>
  );
}

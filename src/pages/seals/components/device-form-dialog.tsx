import React, { useId, useRef, useState } from 'react';
import { Alert, Button, Dialog, Select, TextField } from '@/design-system';

// Cadastro do dispositivo do lacre (Spec 012, RF-031, RF-012): nome e intervalo de envio. O sistema gera o código e a chave.
const INTERVALS = [[30, '30 segundos'], [60, '1 minuto (padrão)'], [120, '2 minutos'], [300, '5 minutos']] as const;

export function DeviceFormDialog({ busy, error, returnFocusTo, onCancel, onConfirm }: {
  busy: boolean; error: string | null; returnFocusTo: HTMLElement | null; onCancel: () => void; onConfirm: (label: string, intervalS: number) => void;
}): React.JSX.Element {
  const formId = useId();
  const labelRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('');
  const [interval, setInterval] = useState(60);
  const [labelError, setLabelError] = useState<string | undefined>();

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (busy) return;
    const text = label.replace(/\s+/g, ' ').trim();
    if (text.length < 2 || text.length > 60) {
      setLabelError('Dê um nome de 2 a 60 caracteres ao lacre.');
      labelRef.current?.focus();
      return;
    }
    setLabelError(undefined);
    onConfirm(text, interval);
  };

  return (
    <Dialog title="Cadastrar dispositivo" onClose={onCancel} initialFocusRef={labelRef} returnFocusTo={returnFocusTo}
      footer={(
        <>
          <Button variant="secundario" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" form={formId} loading={busy} loadingLabel="Cadastrando…">Cadastrar</Button>
        </>
      )}
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-corpo">O FluxID gera o código e a chave do lacre. A chave aparece uma única vez, para gravar no firmware.</p>
        {error && <Alert variant="erro">{error}</Alert>}
        <TextField ref={labelRef} label="Nome do lacre" value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} error={labelError} autoComplete="off" />
        <Select label="Intervalo de envio" value={interval} onChange={(event) => setInterval(Number(event.target.value))}>
          {INTERVALS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </Select>
      </form>
    </Dialog>
  );
}

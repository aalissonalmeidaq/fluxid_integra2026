import React, { useId, useState } from 'react';
import { Alert, Button, Dialog } from '@/design-system';

// A chave do dispositivo aparece UMA vez (Spec 012, RF-031): para gravar no firmware. Fica só na memória desta tela; nunca vai para o
// armazenamento do navegador nem para a fila offline. Fechar exige confirmar que ela foi guardada.
export function DeviceKeyReveal({ deviceCode, deviceKey, returnFocusTo, onDone }: {
  deviceCode: string; deviceKey: string; returnFocusTo: HTMLElement | null; onDone: () => void;
}): React.JSX.Element {
  const confirmId = useId();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'error'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(deviceKey);
      setCopied('ok');
    } catch {
      setCopied('error');
    }
  };

  return (
    <Dialog title="Chave do dispositivo" onClose={() => { if (saved) onDone(); }} returnFocusTo={returnFocusTo}
      footer={<Button disabled={!saved} onClick={onDone}>Concluir</Button>}
    >
      <div className="flex flex-col gap-4">
        <Alert variant="alerta" title="Guarde agora">
          <p>A chave não aparece de novo. Grave o código e a chave no firmware do lacre (arquivo secrets.h, fora do controle de versão).</p>
        </Alert>
        <dl className="m-0 grid gap-2">
          <dt className="text-legenda text-texto-secundario">Código do dispositivo</dt>
          <dd className="m-0 text-corpo text-navy"><code className="break-all font-semibold">{deviceCode}</code></dd>
          <dt className="text-legenda text-texto-secundario">Chave</dt>
          <dd className="m-0 text-corpo text-navy"><code className="break-all font-semibold">{deviceKey}</code></dd>
        </dl>
        <Button variant="secundario" className="self-start" onClick={() => void copy()}>Copiar a chave</Button>
        {copied === 'ok' && <p role="status" className="m-0 text-corpo text-verde-acessivel">Chave copiada.</p>}
        {copied === 'error' && <p role="status" className="m-0 text-corpo text-erro">Não foi possível copiar. Selecione a chave e copie manualmente.</p>}
        <label htmlFor={confirmId} className="flex min-h-alvo items-center gap-2 text-corpo text-grafite">
          <input id={confirmId} type="checkbox" className="size-6" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
          Já guardei a chave para gravar no lacre
        </label>
      </div>
    </Dialog>
  );
}

import React, { useEffect, useId, useMemo, useState } from 'react';
import { PushSubscriptions, type PushState } from '@/application/seals/push-subscription';
import { Alert, Button, Loading } from '@/design-system';
import { createBrowserPush } from '@/infrastructure/push/push-manager';
import { useSealService } from '@/pages/seals/use-seal-service';

// "Notificações deste aparelho" (Spec 012, RF-036b): ativar e desativar por aparelho, numa ação explícita (o navegador só pede a
// permissão depois do clique). Explica cada caso: permissão negada, iPhone fora da tela de início e navegador sem suporte.

export interface PushController {
  status(): Promise<PushState>;
  enable(): Promise<PushState>;
  disable(): Promise<PushState>;
}

const MESSAGES: Partial<Record<PushState['state'], string>> = {
  unsupported: 'Este navegador não recebe notificações do FluxID. Os alertas continuam na página de alertas.',
  install_required: 'No iPhone, as notificações só funcionam com o FluxID instalado: toque em Compartilhar e em "Adicionar à Tela de Início", abra o FluxID por lá e ative aqui.',
  denied: 'As notificações estão bloqueadas neste navegador. Libere as notificações nas configurações do site e tente de novo.',
  error: 'Não foi possível ativar agora. Tente de novo em instantes.',
};

export function PushSettings({ controller, online }: { controller: PushController | null; online: boolean }): React.JSX.Element {
  const titleId = useId();
  const reasonId = useId();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!controller) return undefined;
    void controller.status().then((value) => { if (active) setState(value); }).catch(() => { if (active) setState({ state: 'error' }); });
    return () => { active = false; };
  }, [controller]);

  const run = async (action: () => Promise<PushState>) => {
    setBusy(true);
    setState(await action().catch(() => ({ state: 'error' }) as PushState));
    setBusy(false);
  };

  // Sem controlador (navegador sem suporte ou sem a chave pública configurada), as notificações não existem neste aparelho.
  const current: PushState | null = controller ? state : { state: 'unsupported' };
  const message = current ? MESSAGES[current.state] : undefined;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <h3 id={titleId} className="m-0 text-h3 font-semibold text-navy">Notificações deste aparelho</h3>
      <p className="m-0 max-w-padrao text-corpo text-grafite">
        Avisos de possível extravio e alertas graves dos lacres chegam a este aparelho mesmo com o FluxID fechado. A notificação traz só o tipo,
        o cilindro e o horário, sem localização nem nome de cliente.
      </p>
      {current === null && <Loading label="Conferindo as notificações…" />}
      {current?.state === 'on' && <p className="m-0 text-corpo font-semibold text-verde-acessivel">Notificações ativas neste aparelho.</p>}
      {message && <Alert variant={current?.state === 'error' ? 'erro' : 'informacao'}>{message}</Alert>}
      {controller && (current?.state === 'off' || current?.state === 'error') && (
        <Button className="self-start" disabled={!online || busy} aria-describedby={!online ? reasonId : undefined} onClick={() => void run(() => controller.enable())}>
          Ativar notificações
        </Button>
      )}
      {controller && current?.state === 'on' && (
        <Button variant="secundario" className="self-start" disabled={!online || busy} aria-describedby={!online ? reasonId : undefined} onClick={() => void run(() => controller.disable())}>
          Desativar notificações
        </Button>
      )}
      {!online && <p id={reasonId} className="m-0 text-legenda text-texto-secundario">Sem conexão: ative ou desative quando a conexão voltar.</p>}
    </section>
  );
}

// Liga o controlador ao navegador e ao serviço do lacre. Sem a chave VAPID pública configurada, as notificações não existem.
export function DevicePushSettings(): React.JSX.Element {
  const { service, organizationId, online } = useSealService();
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  const controller = useMemo(() => (service && organizationId && vapid && typeof window !== 'undefined'
    ? new PushSubscriptions(createBrowserPush(window), service, organizationId, vapid) : null), [service, organizationId, vapid]);
  return <PushSettings controller={controller} online={online} />;
}

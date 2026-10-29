import React from 'react';
import type { DriverTrackingState } from '@/application/tracking/tracking-sync-service';
import { useOnlineStatus } from '@/app/use-online-status';
import { Button, Card, Icon } from '@/design-system';
import { formatDateTime } from '@/domain/cylinders/format';
import { positionAge } from '@/domain/seals/seal-age';
import type { Presentation } from '@/domain/seals/seal-vocabulary';
import { useDriverTracking } from './use-driver-tracking';

// Painel de coleta do motorista (Spec 015, T053; RF-007a a RF-007c, RF-007g, RF-016). Indicação contínua de que a localização da viagem
// está sendo registrada, o motivo de qualquer degradação com orientação, as posições pendentes (só o número, nunca coordenadas), o
// limite da coleta sem conexão e a diferença entre a leitura presencial na entrega e a proximidade contínua. Tudo em texto e ícone.
export interface DriverTrackingPanelViewProps {
  state: DriverTrackingState;
  now?: () => Date;
  // Pedir a permissão de localização de novo (ou reabrir a coleta) depois de uma recusa.
  onEnable: () => void;
  // Conexão do aparelho: muda como o limite da coleta sem conexão é dito (condição ou estado atual).
  online?: boolean;
}

// `action`: o rótulo do botão de recuperação, quando houver um.
interface Situation { badge: Presentation; text: string; action?: string }

// Situação em faixa larga, com ícone de 24 px e texto de corpo: precisa ser lida de relance, com uma mão e ao sol. Mesmas cores do selo.
const STATUS_TONE: Record<Presentation['tone'], string> = {
  ativo: 'bg-sucesso-fundo text-verde-acessivel',
  conectado: 'bg-info-fundo text-azul-profundo',
  pendente: 'bg-alerta-fundo text-alerta-texto',
  bloqueado: 'bg-cinza-gelo text-grafite',
  erro: 'bg-erro-fundo text-erro',
};

function situationOf(state: DriverTrackingState): Situation {
  if (state.phase === 'starting') return { badge: { label: 'Iniciando a coleta', icon: 'sincronizar', tone: 'conectado' }, text: 'Preparando o registro da localização desta viagem.' };
  if (state.phase === 'paused_auth') {
    return { badge: { label: 'Coleta pausada', icon: 'bloqueio', tone: 'erro' },
      text: 'O celular ficou mais de 8 horas sem conexão. Entre de novo com internet para retomar; as posições guardadas não se perdem.' };
  }
  if (state.phase === 'auth_required') {
    return { badge: { label: 'Entre de novo', icon: 'bloqueio', tone: 'erro' },
      text: 'Sua sessão expirou. Entre de novo para enviar as posições guardadas e continuar a coleta.' };
  }
  if (state.phase === 'error') {
    return state.lastError === 'OFFLINE'
      ? { badge: { label: 'Sem conexão', icon: 'sem-sinal', tone: 'pendente' }, text: 'A coleta da localização começa quando a conexão voltar.' }
      : { badge: { label: 'Coleta não iniciada', icon: 'alerta', tone: 'erro' }, text: 'Não foi possível iniciar a coleta. A viagem continua; tente de novo.', action: 'Tentar de novo' };
  }
  if (state.phase === 'stopped') return { badge: { label: 'Coleta encerrada', icon: 'verificado', tone: 'bloqueado' }, text: 'A coleta parou com o fim da viagem.' };
  if (state.capability === 'denied') {
    return { badge: { label: 'Localização negada', icon: 'sem-sinal', tone: 'erro' }, action: 'Permitir localização',
      text: 'A viagem continua, mas sem a sua localização o gestor não acompanha a carga. Permita a localização para o FluxID.' };
  }
  if (state.capability === 'unavailable') {
    return { badge: { label: 'Localização indisponível', icon: 'sem-sinal', tone: 'erro' }, action: 'Permitir localização',
      text: 'A viagem continua, mas o celular não está fornecendo a localização. Verifique se a localização está ligada.' };
  }
  if (state.degradation === 'notifications_denied') {
    return { badge: { label: 'Notificação desativada', icon: 'notificacoes', tone: 'pendente' },
      text: 'A coleta continua, mas você não vê o aviso de que ela está ativa. Ative as notificações do FluxID nas configurações do celular.' };
  }
  if (state.capability === 'foreground_only') {
    return { badge: { label: 'Só com esta tela aberta', icon: 'alerta', tone: 'pendente' },
      text: 'Neste navegador a localização só é enviada com esta tela aberta. Para a coleta contínua, use o aplicativo FluxID para Android.' };
  }
  return { badge: { label: 'Coleta ativa', icon: 'gps', tone: 'ativo' },
    text: 'O FluxID registra a localização desta viagem a cada minuto, mesmo com a tela apagada. A coleta para quando a viagem termina.' };
}

export function DriverTrackingPanelView({ state, now = () => new Date(), onEnable, online = true }: DriverTrackingPanelViewProps): React.JSX.Element {
  const situation = situationOf(state);
  const { tone } = situation.badge;
  return (
    <Card as="section" aria-labelledby="driver-tracking-title" className="flex flex-col gap-4">
      <h3 id="driver-tracking-title" className="m-0 text-h3 font-semibold text-navy">Localização da viagem</h3>
      <div data-tone={tone} className={`flex items-start gap-2 rounded-controle p-4 text-corpo ${STATUS_TONE[tone]}`}>
        <span className="shrink-0"><Icon name={situation.badge.icon} variant="monocromatica" /></span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="m-0 font-bold">{situation.badge.label}</p>
          <p className="m-0">{situation.text}</p>
        </div>
      </div>
      {situation.action && <div><Button onClick={onEnable}>{situation.action}</Button></div>}
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-corpo text-grafite">
        <li>{state.pending === 0 ? 'Nenhuma posição aguardando envio.' : `${state.pending} ${state.pending === 1 ? 'posição aguardando' : 'posições aguardando'} envio.`}</li>
        {state.lastSyncAt && <li>Último envio: {positionAge(state.lastSyncAt, now())}</li>}
        {state.collectUntil && state.phase === 'collecting' && (
          <li>{online ? 'Se a conexão cair, a coleta continua' : 'Sem conexão: a coleta continua'} neste aparelho até {formatDateTime(state.collectUntil)}.</li>
        )}
      </ul>
      <p className="m-0 border-t border-borda-suave pt-4 text-corpo text-texto-secundario">
        A leitura do cilindro na entrega confirma que o cilindro estava com você naquele momento; ela não comprova que ele esteve perto durante todo o trajeto.
      </p>
    </Card>
  );
}

// Painel ligado à coleta real: só aparece para a pessoa que é a motorista da viagem.
export function DriverTrackingPanel({ organizationId, tripId, tripStatus }: { organizationId: string; tripId: string; tripStatus: string }): React.JSX.Element | null {
  const { state, enable } = useDriverTracking(organizationId, tripId, tripStatus);
  const online = useOnlineStatus();
  if (!state || state.phase === 'idle') return null;
  return <DriverTrackingPanelView state={state} onEnable={enable} online={online} />;
}

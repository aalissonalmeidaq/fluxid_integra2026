import React from 'react';
import { ResolutionResult, EndpointKind } from '@/infrastructure/supabase/connection-state';
import { Button } from '@/design-system/components/button';
import { Icon } from '@/design-system/icons/icon';

export interface ConnectivityStatusProps {
  result: ResolutionResult;
  onReconnect?: () => void;
  // Versão discreta para a barra superior: quando conectado, só um ponto e o texto curto, sem caixa nem borda.
  compact?: boolean;
  // Falso quando outro aviso já anuncia a perda de rede (a faixa de offline): o estado fica visível, mas sem repetir o anúncio.
  announce?: boolean;
}

const ENDPOINT_LABELS: Record<EndpointKind, string> = {
  local: 'Dispositivo local',
  lan: 'Rede local (LAN)',
  cloud: 'Nuvem (Cloud)',
};

const BASE = 'inline-flex min-h-alvo min-w-alvo items-center gap-2 rounded-controle border px-4 text-legenda font-medium';

export function ConnectivityStatus({
  result,
  onReconnect,
  compact = false,
  announce = true,
}: ConnectivityStatusProps): React.JSX.Element {
  const { state, selectedEndpoint } = result;

  const endpointLabel = selectedEndpoint ? ENDPOINT_LABELS[selectedEndpoint] : '';

  if (state === 'probing') {
    return (
      <div role="status" aria-live="polite" className={`${BASE} border-alerta-faixa bg-alerta-fundo text-alerta-texto`}>
        <Icon name="sincronizar" size={16} variant="monocromatica" className="motion-safe:animate-spin" />
        <span>Verificando conectividade...</span>
      </div>
    );
  }

  if (state === 'connected' && compact) {
    return (
      <div role="status" className="inline-flex items-center gap-2 text-legenda text-verde-acessivel">
        <span data-testid="status-icon" aria-hidden="true">●</span>
        <span>Conectado: {endpointLabel}</span>
      </div>
    );
  }

  if (state === 'connected') {
    return (
      <div role="status" className={`${BASE} border-verde-escuro bg-sucesso-fundo text-verde-acessivel`}>
        <span data-testid="status-icon" aria-hidden="true">●</span>
        <span>Conectado: {endpointLabel}</span>
      </div>
    );
  }

  if (state === 'degraded') {
    return (
      <div role="status" className={`${BASE} flex-wrap gap-x-2 border-alerta-faixa bg-alerta-fundo text-alerta-texto`}>
        <span data-testid="status-icon" aria-hidden="true">⚠</span>
        <span>Modo degradado: {endpointLabel}</span>
        <span className="basis-full font-normal">Confirmação definitiva depende da nuvem.</span>
      </div>
    );
  }

  if (state === 'blocked') {
    return (
      <div role="alert" className={`${BASE} flex-wrap border-erro bg-erro-fundo text-erro`}>
        <span>Conexão bloqueada por erro de configuração ou autorização</span>
        {onReconnect && (
          <Button variant="secundario" onClick={onReconnect}>
            Tentar reconectar
          </Button>
        )}
      </div>
    );
  }

  // Barra superior sem rede: texto neutro e um ponto vazio, nunca o verde de "conectado". Com a rede do aparelho fora, a faixa de offline é
  // quem anuncia e o botão de reconectar não faz sentido; com a rede boa e o Supabase fora, o estado é anunciado e o botão fica.
  if (state === 'offline' && compact) {
    return (
      <div role={announce ? 'status' : undefined} className="inline-flex items-center gap-2 text-legenda text-texto-secundario">
        <span data-testid="status-icon-offline" aria-hidden="true">○</span>
        <span>Sem conexão</span>
        {announce && onReconnect && <Button variant="secundario" onClick={onReconnect}>Reconectar</Button>}
      </div>
    );
  }

  if (state === 'offline') {
    return (
      <div role={announce ? 'alert' : undefined} className={`${BASE} flex-wrap border-borda-controle bg-branco text-grafite`}>
        <span>Sem conexão (Offline)</span>
        {onReconnect && (
          <Button variant="secundario" onClick={onReconnect}>
            Reconectar
          </Button>
        )}
      </div>
    );
  }

  return (
    <div role="status" className="text-legenda text-texto-secundario">
      Inicializando...
    </div>
  );
}

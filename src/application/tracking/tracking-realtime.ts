// Tempo real do rastreamento (Spec 015, T026; RF-041). O banco manda pelo canal privado `tracking:<organização>` só um AVISO (tipo e
// viagem, sem coordenada); quem assina refaz a própria consulta. No detalhe, só os avisos da viagem aberta contam, para não repetir
// consultas e anúncios irrelevantes. Sem o canal, a consulta roda a cada 30 s. Nada é guardado no aparelho.

export interface TrackingSignal {
  kind: string;
  tripId: string | null;
}

export interface TrackingRealtimePort {
  // Assina o tópico; devolve a função que cancela a assinatura.
  subscribe(topic: string, onSignal: (signal: TrackingSignal) => void, onStatus: (status: 'connected' | 'disconnected') => void): () => void;
}

export interface TrackingWatch {
  stop(): void;
  state(): { mode: 'realtime' | 'polling'; lastUpdate: Date | null };
}

export const TRACKING_POLL_INTERVAL_MS = 30_000;

export function watchTracking(options: {
  port: TrackingRealtimePort;
  organizationId: string;
  // Presente no detalhe: avisos de outras viagens são ignorados.
  tripId?: string;
  // `null` quando é a consulta periódica de reserva (sem aviso).
  onChange: (signal: TrackingSignal | null) => void;
  now?: () => Date;
}): TrackingWatch {
  const now = options.now ?? (() => new Date());
  let mode: 'realtime' | 'polling' = 'polling';
  let lastUpdate: Date | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const changed = (signal: TrackingSignal | null) => {
    if (stopped) return;
    if (signal && options.tripId && signal.tripId !== options.tripId) return;
    lastUpdate = now();
    options.onChange(signal);
  };
  const startPolling = () => {
    mode = 'polling';
    if (timer === null) timer = setInterval(() => changed(null), TRACKING_POLL_INTERVAL_MS);
  };
  const stopPolling = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  startPolling();
  const unsubscribe = options.port.subscribe(`tracking:${options.organizationId}`, changed, (status) => {
    if (stopped) return;
    if (status === 'connected') {
      mode = 'realtime';
      stopPolling();
    } else startPolling();
  });

  return {
    stop() {
      stopped = true;
      stopPolling();
      unsubscribe();
    },
    state: () => ({ mode, lastUpdate }),
  };
}

// Tempo real do lacre (Spec 012, RNF-001; research.md item 7). O banco manda pelo canal privado `seals:<organização>` só um AVISO
// (tipo, dispositivo e cilindro, sem coordenada); quem assina refaz a própria consulta. Sem o canal, a consulta roda a cada 30 s e a
// tela mostra o horário da última atualização. Nada é guardado no aparelho.

export interface SealSignal {
  kind: string;
  deviceId: string | null;
  cylinderId: string | null;
}

export interface RealtimePort {
  // Assina o tópico; devolve a função que cancela a assinatura.
  subscribe(topic: string, onSignal: (signal: SealSignal) => void, onStatus: (status: 'connected' | 'disconnected') => void): () => void;
}

export interface SealWatch {
  stop(): void;
  state(): { mode: 'realtime' | 'polling'; lastUpdate: Date | null };
}

export const POLL_INTERVAL_MS = 30_000;

export function watchSeals(options: {
  port: RealtimePort;
  organizationId: string;
  // `null` quando é a consulta periódica de reserva (sem aviso).
  onChange: (signal: SealSignal | null) => void;
  now?: () => Date;
}): SealWatch {
  const now = options.now ?? (() => new Date());
  let mode: 'realtime' | 'polling' = 'polling';
  let lastUpdate: Date | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const changed = (signal: SealSignal | null) => {
    if (stopped) return;
    lastUpdate = now();
    options.onChange(signal);
  };
  const startPolling = () => {
    mode = 'polling';
    if (timer === null) timer = setInterval(() => changed(null), POLL_INTERVAL_MS);
  };
  const stopPolling = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };

  startPolling();
  const unsubscribe = options.port.subscribe(`seals:${options.organizationId}`, (signal) => changed(signal), (status) => {
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

// Coleta de posição no Android (Spec 015, T050; RF-007a a RF-007c) pelo plugin local `FluxidTracking` (android/app/src/main/java/br/com/
// fluxid/tracking). O serviço em primeiro plano coleta mesmo com a tela apagada e guarda as posições num buffer nativo pequeno; este
// adaptador as recolhe em ordem (o WebView pode ficar parado em segundo plano) e as entrega à coordenação, que as põe na fila do aparelho.
// Pede a localização e, no Android 13+, a notificação no contexto da viagem. Recusa de localização degrada sem bloquear; recusa da
// notificação vira "visibilidade reduzida". Nenhuma regra de proximidade aqui.
import { registerPlugin } from '@capacitor/core';
import type { CollectedPosition, LocationTrackingPort, LocationTrackingState } from '@/application/tracking/tracking-ports';

type PermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';

export interface FluxidTrackingPlugin {
  checkPermissions(): Promise<{ location: PermissionState; notifications: PermissionState }>;
  requestPermissions(options: { permissions: ('location' | 'notifications')[] }): Promise<{ location: PermissionState; notifications: PermissionState }>;
  start(options: { intervalSeconds: number }): Promise<{ running: boolean }>;
  stop(): Promise<void>;
  drain(): Promise<{ positions: unknown[] }>;
}

export const nativeTrackingPlugin = (): FluxidTrackingPlugin => registerPlugin<FluxidTrackingPlugin>('FluxidTracking');

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function toPosition(raw: unknown): CollectedPosition | null {
  if (!isObject(raw) || typeof raw.observedAt !== 'string' || Number.isNaN(Date.parse(raw.observedAt))) return null;
  const { latitude, longitude, accuracyM } = raw;
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { observedAt: new Date(raw.observedAt).toISOString(), latitude, longitude, accuracyM: typeof accuracyM === 'number' ? accuracyM : null };
}

export function createCapacitorLocationAdapter(plugin: FluxidTrackingPlugin, options: { androidSdk: number; drainEveryMs?: number }): LocationTrackingPort {
  const positionListeners = new Set<(position: CollectedPosition) => void>();
  const stateListeners = new Set<(state: LocationTrackingState) => void>();
  let state: LocationTrackingState = { platform: 'android_native', capability: 'full', collecting: false, degradation: null };
  let timer: ReturnType<typeof setInterval> | null = null;
  let draining: Promise<void> = Promise.resolve();

  const setState = (next: LocationTrackingState) => {
    state = next;
    for (const listener of stateListeners) listener(state);
  };

  const drain = () => {
    draining = draining.then(async () => {
      const { positions } = await plugin.drain();
      for (const raw of positions) {
        const position = toPosition(raw);
        if (position) for (const listener of positionListeners) listener(position);
      }
    }).catch(() => undefined);
    return draining;
  };

  return {
    state: () => state,
    async start({ intervalSeconds }) {
      const location = await plugin.requestPermissions({ permissions: ['location'] });
      if (location.location !== 'granted') {
        setState({ platform: 'android_native', capability: 'denied', collecting: false, degradation: 'denied' });
        return state;
      }
      // Android 13 (API 33) em diante: sem a notificação, o serviço roda, mas a pessoa não vê a indicação contínua (RF-007b).
      let notificationsDenied = false;
      if (options.androidSdk >= 33) {
        const notifications = await plugin.requestPermissions({ permissions: ['notifications'] });
        notificationsDenied = notifications.notifications !== 'granted';
      }
      const { running } = await plugin.start({ intervalSeconds });
      setState({
        platform: 'android_native', capability: running ? 'full' : 'unavailable', collecting: running,
        degradation: !running ? 'unavailable' : notificationsDenied ? 'notifications_denied' : null,
      });
      if (running && timer === null) timer = setInterval(() => void drain(), options.drainEveryMs ?? 15_000);
      return state;
    },
    async stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
      await plugin.stop();
      await drain();
      setState({ ...state, collecting: false });
    },
    onPosition(listener) {
      positionListeners.add(listener);
      return () => positionListeners.delete(listener);
    },
    onStateChange(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
  };
}

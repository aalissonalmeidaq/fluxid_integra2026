// Coleta de posição pelo navegador/PWA (Spec 015, T049; RF-007a, RF-007c). O navegador suspende a geolocalização de páginas ocultas, então
// a coleta só acontece com a página visível e a capacidade é sempre "só com o aplicativo aberto" — estado degradado honesto, nunca
// prometido como segundo plano. Localização negada ou indisponível degrada sem bloquear a viagem. Entrega no máximo uma posição por
// intervalo, com o horário do sensor. Nada é guardado aqui: a fila é de outra camada.
import type { CollectedPosition, LocationTrackingPort, LocationTrackingState } from '@/application/tracking/tracking-ports';

export interface WebLocationEnv {
  geolocation: Geolocation | undefined;
  isSecureContext: boolean;
  visibility: () => DocumentVisibilityState;
  onVisibilityChange: (listener: () => void) => () => void;
}

export function browserWebLocationEnv(): WebLocationEnv {
  return {
    geolocation: typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
    isSecureContext: globalThis.isSecureContext !== false,
    visibility: () => (typeof document === 'undefined' ? 'visible' : document.visibilityState),
    onVisibilityChange: (listener) => {
      if (typeof document === 'undefined') return () => undefined;
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    },
  };
}

// Folga para a plataforma que entrega um pouco antes do intervalo.
const EARLY_TOLERANCE_MS = 5_000;

export function createWebLocationAdapter(env: WebLocationEnv = browserWebLocationEnv()): LocationTrackingPort {
  const positionListeners = new Set<(position: CollectedPosition) => void>();
  const stateListeners = new Set<(state: LocationTrackingState) => void>();
  let state: LocationTrackingState = { platform: 'web_visible', capability: 'foreground_only', collecting: false, degradation: 'foreground_only' };
  let watchId: number | null = null;
  let intervalMs = 60_000;
  let lastEmitted = Number.NEGATIVE_INFINITY;
  let started = false;
  let stopVisibility: (() => void) | null = null;

  const setState = (next: LocationTrackingState) => {
    state = next;
    for (const listener of stateListeners) listener(state);
  };
  const supported = () => env.isSecureContext && typeof env.geolocation?.watchPosition === 'function';

  const clear = () => {
    if (watchId !== null) env.geolocation?.clearWatch(watchId);
    watchId = null;
  };

  const watch = () => {
    if (watchId !== null || !env.geolocation || state.capability === 'denied') return;
    watchId = env.geolocation.watchPosition((position) => {
      if (!started) return;
      if (position.timestamp - lastEmitted < intervalMs - EARLY_TOLERANCE_MS) return;
      lastEmitted = position.timestamp;
      const reading: CollectedPosition = {
        observedAt: new Date(position.timestamp).toISOString(), latitude: position.coords.latitude, longitude: position.coords.longitude,
        accuracyM: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy * 10) / 10 : null,
      };
      for (const listener of positionListeners) listener(reading);
    }, (error) => {
      if (error.code === error.PERMISSION_DENIED) {
        clear();
        setState({ platform: 'web_visible', capability: 'denied', collecting: false, degradation: 'denied' });
      }
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 60_000 });
    setState({ ...state, collecting: true });
  };

  const onVisibility = () => {
    if (!started) return;
    if (env.visibility() === 'hidden') {
      clear();
      setState({ ...state, collecting: false });
    } else watch();
  };

  return {
    state: () => state,
    async start({ intervalSeconds }) {
      intervalMs = intervalSeconds * 1000;
      if (!supported()) {
        setState({ platform: 'web_visible', capability: 'unavailable', collecting: false, degradation: 'unavailable' });
        return state;
      }
      started = true;
      stopVisibility ??= env.onVisibilityChange(onVisibility);
      if (env.visibility() === 'visible') watch();
      return state;
    },
    async stop() {
      started = false;
      clear();
      stopVisibility?.();
      stopVisibility = null;
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

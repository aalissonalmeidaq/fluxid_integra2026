import { isValidReading, POSITION_TIMEOUT_MS, type PositionReading } from '@/domain/field/position-quality';
import { ReaderError } from './reader-error';

// Leitura da posição do aparelho (RF-009, RF-012, RF-015, RN-004): UMA chamada por pedido, no momento do registro, nunca observação
// contínua, sem posição em cache e sem guardar nada no aparelho. O ambiente é injetável para os testes.
export interface GeolocationEnv {
  geolocation: Geolocation | undefined;
  isSecureContext: boolean;
  now: () => number;
}

export interface GeolocationReader {
  isSupported: () => boolean;
  read: () => Promise<PositionReading>;
}

// O limite da API não conta o tempo do pedido de permissão; este prazo extra garante que a tela nunca fique presa a um aviso ignorado.
const GRACE_MS = 5_000;

export function browserGeolocationEnv(): GeolocationEnv {
  return {
    geolocation: typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
    // Só `false` é inseguro: fora de navegador (testes) a propriedade nem existe.
    isSecureContext: globalThis.isSecureContext !== false,
    now: Date.now,
  };
}

export function createGeolocationReader(env: GeolocationEnv = browserGeolocationEnv()): GeolocationReader {
  const isSupported = (): boolean => env.isSecureContext && typeof env.geolocation?.getCurrentPosition === 'function';

  const read = (): Promise<PositionReading> => new Promise<PositionReading>((resolve, reject) => {
    if (!isSupported()) return reject(new ReaderError('unavailable'));
    let settled = false;
    const finish = (settle: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      settle();
    };
    const guard = setTimeout(() => finish(() => reject(new ReaderError('timeout'))), POSITION_TIMEOUT_MS + GRACE_MS);
    env.geolocation!.getCurrentPosition(
      (position) => finish(() => {
        const reading: PositionReading = {
          latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyM: position.coords.accuracy, readAt: env.now(),
        };
        if (isValidReading(reading)) resolve(reading);
        else reject(new ReaderError('unavailable'));
      }),
      (error) => finish(() => reject(new ReaderError(error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable'))),
      { enableHighAccuracy: true, timeout: POSITION_TIMEOUT_MS, maximumAge: 0 },
    );
  });

  return { isSupported, read };
}

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POSITION_TIMEOUT_MS } from '@/domain/field/position-quality';
import { createGeolocationReader, type GeolocationEnv } from './geolocation-reader';

// RF-009, RF-012, RF-015, RN-004: uma leitura por pedido, nunca observação contínua, sem cache e sem guardar nada no aparelho.
type Success = (position: GeolocationPosition) => void;
type Failure = (error: GeolocationPositionError) => void;

const position = (over: Partial<GeolocationCoordinates> = {}): GeolocationPosition => ({
  coords: { latitude: -3.7319, longitude: -38.5267, accuracy: 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}), ...over },
  timestamp: 0,
  toJSON: () => ({}),
}) as GeolocationPosition;
const failure = (code: number): GeolocationPositionError => ({ code, message: 'x', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) as GeolocationPositionError;

let calls: { options: PositionOptions | undefined }[] = [];
let respond: (success: Success, error: Failure) => void = () => undefined;
const watchPosition = vi.fn();

const env = (over: Partial<GeolocationEnv> = {}): GeolocationEnv => ({
  geolocation: {
    getCurrentPosition: (success: Success, error: Failure, options?: PositionOptions) => { calls.push({ options }); respond(success, error); },
    watchPosition,
  } as unknown as Geolocation,
  isSecureContext: true,
  now: () => 1_000_000,
  ...over,
});

beforeEach(() => { vi.useFakeTimers(); calls = []; respond = () => undefined; watchPosition.mockReset(); });
afterEach(() => vi.useRealTimers());

describe('isSupported', () => {
  it('só com a API do navegador e em contexto seguro', () => {
    expect(createGeolocationReader(env()).isSupported()).toBe(true);
    expect(createGeolocationReader(env({ geolocation: undefined })).isSupported()).toBe(false);
    expect(createGeolocationReader(env({ isSecureContext: false })).isSupported()).toBe(false);
  });
});

describe('read', () => {
  it('faz uma leitura de alta precisão, sem cache e com o tempo máximo da spec, e devolve a posição com o horário', async () => {
    respond = (success) => success(position());
    const result = await createGeolocationReader(env()).read();
    expect(result).toEqual({ latitude: -3.7319, longitude: -38.5267, accuracyM: 12, readAt: 1_000_000 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.options).toEqual({ enableHighAccuracy: true, timeout: POSITION_TIMEOUT_MS, maximumAge: 0 });
  });

  it('nunca observa a posição de forma contínua', async () => {
    respond = (success) => success(position());
    await createGeolocationReader(env()).read();
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it.each([[1, 'denied'], [2, 'unavailable'], [3, 'timeout']])('o erro %i do navegador vira "%s"', async (code, kind) => {
    respond = (_success, error) => error(failure(code));
    await expect(createGeolocationReader(env()).read()).rejects.toMatchObject({ kind });
  });

  it('se o navegador nunca responder (pedido de permissão ignorado), vira "timeout" sem travar a tela', async () => {
    const pending = createGeolocationReader(env()).read();
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(POSITION_TIMEOUT_MS + 5_000);
    await assertion;
  });

  it('posição fora dos intervalos vale como "unavailable"', async () => {
    respond = (success) => success(position({ latitude: 200 }));
    await expect(createGeolocationReader(env()).read()).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('sem suporte, nem chama o navegador', async () => {
    await expect(createGeolocationReader(env({ geolocation: undefined })).read()).rejects.toMatchObject({ kind: 'unavailable' });
    expect(calls).toHaveLength(0);
  });

  it('não guarda nada no aparelho', async () => {
    const storage = { set: vi.fn() };
    vi.stubGlobal('localStorage', { setItem: storage.set });
    vi.stubGlobal('sessionStorage', { setItem: storage.set });
    respond = (success) => success(position());
    await createGeolocationReader(env()).read();
    expect(storage.set).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

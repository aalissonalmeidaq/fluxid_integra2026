import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DriverTrackingCoordinator } from '@/application/tracking/tracking-sync-service';
import { forgetDriverCoordinators, sharedDriverCoordinator } from './driver-tracking-registry';

// Spec 015 (T133): uma só coordenação por destino, pessoa, empresa e viagem no aplicativo inteiro. O painel da viagem e o mantenedor do
// menu usam a mesma; sair e voltar à tela não cria uma segunda que disputaria o buffer nativo e a fila do aparelho.
afterEach(() => forgetDriverCoordinators());

describe('registro das coordenações do motorista', () => {
  it('a mesma chave devolve a mesma coordenação, criada uma vez', () => {
    const create = vi.fn(() => ({}) as DriverTrackingCoordinator);
    const first = sharedDriverCoordinator('local|u|org|t-1', create);
    expect(sharedDriverCoordinator('local|u|org|t-1', create)).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('outra viagem, pessoa ou destino tem a sua', () => {
    const create = vi.fn(() => ({}) as DriverTrackingCoordinator);
    const first = sharedDriverCoordinator('local|u|org|t-1', create);
    expect(sharedDriverCoordinator('local|u|org|t-2', create)).not.toBe(first);
    expect(sharedDriverCoordinator('cloud|u|org|t-1', create)).not.toBe(first);
    expect(create).toHaveBeenCalledTimes(3);
  });
});

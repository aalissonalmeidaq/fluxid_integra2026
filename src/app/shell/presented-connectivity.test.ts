import { describe, expect, it } from 'vitest';
import type { ConnectionState, ResolutionResult } from '@/infrastructure/supabase/connection-state';
import { presentedConnectivity } from './presented-connectivity';

const result = (state: ConnectionState): ResolutionResult => ({ state, selectedEndpoint: 'local', attempts: [] });

describe('presentedConnectivity: uma só fonte de verdade para o estado de conexão', () => {
  it.each<ConnectionState>(['connected', 'degraded', 'probing', 'idle'])('com o aparelho online, %s segue como está', (state) => {
    expect(presentedConnectivity(result(state), true)).toEqual(result(state));
  });

  it.each<ConnectionState>(['connected', 'degraded', 'probing', 'idle'])('com o aparelho offline, %s passa a offline e nunca "conectado"', (state) => {
    expect(presentedConnectivity(result(state), false).state).toBe('offline');
  });

  it('o erro de configuração ou de autorização continua visível mesmo sem rede (não vira offline)', () => {
    expect(presentedConnectivity(result('blocked'), false).state).toBe('blocked');
  });

  it('não muda a escolha do destino (nuvem, LAN, local) nem as tentativas: só a apresentação', () => {
    const original: ResolutionResult = { state: 'connected', selectedEndpoint: 'cloud', attempts: [{ endpoint: 'cloud', outcome: 'success' } as never] };
    const shown = presentedConnectivity(original, false);
    expect(shown.selectedEndpoint).toBe('cloud');
    expect(shown.attempts).toBe(original.attempts);
    expect(original.state).toBe('connected');
  });
});

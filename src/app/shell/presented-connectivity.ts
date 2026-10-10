import type { ResolutionResult } from '@/infrastructure/supabase/connection-state';

// Estado de conexão que a pessoa vê. A rede do aparelho e a escolha do Supabase (nuvem, LAN ou local) são duas fontes, e o aparelho sem
// rede não pode aparecer como "conectado" só porque o servidor local responde: sem rede o estado mostrado é "offline". Isto muda só a
// apresentação, e nunca a escolha do destino. O erro de configuração ou de autorização (`blocked`) continua visível.
export function presentedConnectivity(result: ResolutionResult, isOnline: boolean): ResolutionResult {
  if (isOnline || result.state === 'offline' || result.state === 'blocked') return result;
  return { ...result, state: 'offline' };
}

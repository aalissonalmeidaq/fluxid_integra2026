import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfig } from '@/config/environment';
import { ResolutionResult } from './connection-state';

/**
 * Cria uma única instância do cliente Supabase para o endpoint selecionado.
 * Aceita exclusivamente estados connected ou degraded.
 */
export function createSelectedClient(
  result: ResolutionResult,
  config: AppConfig
): SupabaseClient {
  if (result.state !== 'connected' && result.state !== 'degraded') {
    throw new Error(
      `Não é permitido instanciar o cliente Supabase no estado "${result.state}".`
    );
  }

  if (!result.selectedEndpoint) {
    throw new Error('Nenhum endpoint foi selecionado na resolução de conectividade.');
  }

  const endpoint = config.endpoints.find((e) => e.kind === result.selectedEndpoint);
  if (!endpoint) {
    throw new Error(
      `Configuração não encontrada para o endpoint selecionado: "${result.selectedEndpoint}".`
    );
  }

  return createClient(endpoint.url, endpoint.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

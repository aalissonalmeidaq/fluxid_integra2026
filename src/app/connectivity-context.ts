import { createContext, useContext } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { ResolutionResult } from '@/infrastructure/supabase/connection-state';
import { AppConfig } from '@/config/environment';

export interface ConnectivityContextValue {
  result: ResolutionResult;
  client: SupabaseClient | null;
  config: AppConfig | null;
  reconnect: () => Promise<void>;
  reportOperationalError: (statusCode?: number) => void;
}

export const initialResult: ResolutionResult = {
  state: 'idle',
  attempts: [],
};

export const ConnectivityContext = createContext<ConnectivityContextValue>({
  result: initialResult,
  client: null,
  config: null,
  reconnect: async () => {},
  reportOperationalError: () => {},
});

export function useConnectivity(): ConnectivityContextValue {
  return useContext(ConnectivityContext);
}

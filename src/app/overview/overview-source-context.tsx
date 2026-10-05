import React, { createContext, useContext } from 'react';
import type { OverviewSource } from '@/application/overview/overview-source';
import { sampleOverviewSource } from '@/infrastructure/overview/sample-overview-source';

const OverviewSourceContext = createContext<OverviewSource>(sampleOverviewSource);

export interface OverviewSourceProviderProps {
  source: OverviewSource;
  children: React.ReactNode;
}

// Injeta a fonte da Visão geral. Sem provedor, vale a fonte de exemplo; a spec dos cilindros troca a implementação aqui.
export function OverviewSourceProvider({ source, children }: OverviewSourceProviderProps): React.JSX.Element {
  return <OverviewSourceContext.Provider value={source}>{children}</OverviewSourceContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOverviewSource(): OverviewSource {
  return useContext(OverviewSourceContext);
}

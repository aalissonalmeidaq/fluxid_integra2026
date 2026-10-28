import type React from 'react';
import { useDriverTracking } from './use-driver-tracking';

// Mantém a coleta e o envio da viagem em andamento do motorista em qualquer tela (Spec 015, T133; RF-007a). Antes, só o painel da tela
// da viagem coordenava: fora dela o serviço nativo seguia coletando, mas nada era recolhido nem enviado até a pessoa voltar à tela. Não
// desenha nada; o painel da tela da viagem mostra o estado da mesma coordenação (driver-tracking-registry.ts).
function KeepTrip({ organizationId, tripId }: { organizationId: string; tripId: string }): null {
  useDriverTracking(organizationId, tripId, 'in_progress');
  return null;
}

export function DriverTrackingKeeper({ organizationId, tripIds }: { organizationId: string; tripIds: readonly string[] }): React.JSX.Element {
  return <>{tripIds.map((tripId) => <KeepTrip key={tripId} organizationId={organizationId} tripId={tripId} />)}</>;
}

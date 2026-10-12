import { useMemo } from 'react';
import { FieldService } from '@/application/field/field-service';
import { useConnectivity } from '@/app/connectivity-context';
import { createCylinderTransport } from '@/infrastructure/supabase/cylinder-adapter';

// Serviço de campo do destino ativo (Spec 009). Usa o mesmo transporte de `query-cylinders` dos cilindros. Sem conexão, o serviço
// devolve `offline` sem chamar o servidor; nada é enfileirado (a fila é da Spec 010).
export function useFieldService(): FieldService | null {
  const { client, config, result } = useConnectivity();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  return useMemo(
    () => (endpoint && client ? new FieldService(createCylinderTransport(endpoint, client), () => navigator.onLine !== false) : null),
    [client, endpoint],
  );
}

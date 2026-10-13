import { useEffect, useState } from 'react';
import type { IndicatorInput } from '@/domain/field/sync-status';
import { useOnlineStatus } from '../use-online-status';
import { useOfflineField } from './offline-field-context';

const REFRESH_MS = 2_000;

// Números da fila para o indicador e a tela Sincronização. Lê a base local a cada 2 segundos e quando a conexão muda (leitura barata); nulo quando
// a fila não está disponível. Não guarda nada além dos números.
export function useSyncCounts(refreshMs: number = REFRESH_MS): IndicatorInput | null {
  const field = useOfflineField();
  const online = useOnlineStatus();
  const [counts, setCounts] = useState<IndicatorInput | null>(null);
  useEffect(() => {
    if (!field) return undefined;
    let active = true;
    const read = (): void => {
      void field.queue.counts(online).then((next) => { if (active) setCounts(next); }).catch(() => undefined);
    };
    read();
    const timer = setInterval(read, refreshMs);
    return () => { active = false; clearInterval(timer); };
  }, [field, online, refreshMs]);
  return field ? counts : null;
}

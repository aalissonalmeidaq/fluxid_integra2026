import type { SupabaseClient } from '@supabase/supabase-js';
import type { RealtimePort, SealSignal } from '@/application/seals/seal-realtime';

// Canal privado do Supabase Realtime (Broadcast) para os avisos do lacre (Spec 012, research.md item 7). O acesso ao tópico é decidido
// pela política de `realtime.messages` no banco (seal.read na organização); o cliente só usa a sessão da pessoa.
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export function createSealRealtimePort(client: SupabaseClient): RealtimePort {
  return {
    subscribe(topic, onSignal, onStatus) {
      const channel = client
        .channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'seal' }, ({ payload }) => {
          const body = (payload ?? {}) as Record<string, unknown>;
          const signal: SealSignal = { kind: text(body.kind) ?? 'unknown', deviceId: text(body.device_id), cylinderId: text(body.cylinder_id) };
          onSignal(signal);
        })
        .subscribe((status) => onStatus(status === 'SUBSCRIBED' ? 'connected' : 'disconnected'));
      return () => { void client.removeChannel(channel); };
    },
  };
}

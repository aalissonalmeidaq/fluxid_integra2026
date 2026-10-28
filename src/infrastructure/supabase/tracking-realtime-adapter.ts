import type { SupabaseClient } from '@supabase/supabase-js';
import type { TrackingRealtimePort, TrackingSignal } from '@/application/tracking/tracking-realtime';

// Canal privado do Supabase Realtime (Broadcast) para os avisos do rastreamento (Spec 015). O acesso ao tópico é decidido pela
// política de `realtime.messages` no banco (`tracking.read` na organização); o cliente só usa a sessão da pessoa.
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export function createTrackingRealtimePort(client: SupabaseClient): TrackingRealtimePort {
  return {
    subscribe(topic, onSignal, onStatus) {
      const channel = client
        .channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'tracking' }, ({ payload }) => {
          const body = (payload ?? {}) as Record<string, unknown>;
          const signal: TrackingSignal = { kind: text(body.kind) ?? 'unknown', tripId: text(body.trip_id) };
          onSignal(signal);
        })
        .subscribe((status) => onStatus(status === 'SUBSCRIBED' ? 'connected' : 'disconnected'));
      return () => { void client.removeChannel(channel); };
    },
  };
}

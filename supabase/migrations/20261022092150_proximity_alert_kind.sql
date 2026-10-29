-- Spec 015 (T046; RF-014, RF-015): o afastamento confirmado vira alerta do lacre do tipo `proximity_separation`, com o tratamento já
-- existente (reconhecer e encerrar). Um alerta aberto por lacre e tipo, como os demais. O alerta não altera custódia nem trava.
alter table public.seal_alerts drop constraint seal_alerts_kind_check;
alter table public.seal_alerts add constraint seal_alerts_kind_check check (kind in (
  'possible_loss', 'no_comm', 'device_off', 'no_gps', 'low_battery', 'weak_signal', 'seal_open', 'seal_broken', 'geofence_violation',
  'comm_loss_lock', 'command_failed', 'command_expired', 'command_not_delivered', 'watch_suspended', 'rate_limited', 'wifi_change_failed',
  'proximity_separation'));

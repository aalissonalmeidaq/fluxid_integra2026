begin;
select plan(1);

-- Spec 012: limites numa fonte única (data-model.md, "Limites"), repetidos em src/domain/seals/seal-limits.ts e conferidos por
-- tests/contract/seals-limits.test.ts.

select is(private.seal_limits(), jsonb_build_object(
  'repeat_distance_m', 20,
  'report_interval_default_s', 60,
  'report_interval_min_s', 30,
  'report_interval_max_s', 900,
  'no_comm_grace_s', 30,
  'no_gps_intervals', 3,
  'geofence_tolerance_m', 50,
  'geofence_outside_streak', 2,
  'delivery_seal_position_max_age_s', 120,
  'command_confirm_timeout_s', 600,
  'command_not_delivered_s', 1800,
  'batch_max', 50,
  'auto_lock_after_s', 180,
  'wifi_list_max', 5,
  'low_battery_pct', 15,
  'weak_signal_dbm', -85,
  'device_requests_per_minute', 6,
  'auth_failures_max', 10,
  'auth_failures_window_s', 600,
  'auth_block_s', 900,
  'read_at_future_tolerance_s', 300,
  'justification_min', 5,
  'justification_max', 500,
  'protocols', jsonb_build_array(1)), 'limites do lacre iguais ao data-model');

select * from finish();
rollback;

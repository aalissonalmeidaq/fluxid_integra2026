begin;
select plan(5);

-- Spec 013, US2: o vigia expira pedidos pendentes sem chamada há 7 dias (RF-017) e não trata linha inativa como lacre calado
-- (data-model.md, "Ao inativar"). Hermético: rollback.

insert into public.seal_enrollments (id, device_code, key_hash, status, last_seen_at, decision_note) values
  ('a1380000-0000-0000-0000-000000000001', 'DSP-WDG13001', extensions.digest('w1', 'sha256'), 'pending', now() - interval '7 days 1 minute', null),
  ('a1380000-0000-0000-0000-000000000002', 'DSP-WDG13002', extensions.digest('w2', 'sha256'), 'pending', now() - interval '6 days', null),
  ('a1380000-0000-0000-0000-000000000003', 'DSP-WDG13003', extensions.digest('w3', 'sha256'), 'refused', now() - interval '30 days', 'Recusado antes');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, status, inactive_reason, last_seen_at, health) values
  ('a1380000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-WDG13004', 'Lacre devolvido', extensions.digest('w4', 'sha256'),
   '10000000-0000-0000-0000-000000000002', 'inactive', 'returned', now() - interval '2 days', 'ok');

select ok(private.run_seal_watchdog() ? 'expired_enrollments', 'o vigia informa quantos pedidos expirou');
select is((select status from public.seal_enrollments where id = 'a1380000-0000-0000-0000-000000000001'), 'expired', 'pendente sem chamada há mais de 7 dias expira');
select is((select status from public.seal_enrollments where id = 'a1380000-0000-0000-0000-000000000002'), 'pending', 'pendente com chamada recente continua');
select is((select status from public.seal_enrollments where id = 'a1380000-0000-0000-0000-000000000003'), 'refused', 'outras situações não mudam');
select is((select count(*)::int from public.seal_alerts where device_id = 'a1380000-0000-0000-0000-0000000000a1'), 0,
  'linha inativa não gera alerta de sem comunicação');

select * from finish();
rollback;

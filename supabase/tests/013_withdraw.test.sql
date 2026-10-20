begin;
select plan(18);

-- Spec 013, US2: retirada de operação pelo Master e os efeitos de inativar a linha (withdraw_device; RF-013, RF-014, RN-006;
-- data-model.md, "Ao inativar"; princípio IV). Dois tenants, o Master e o admin do A. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
select public.start_user_session('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000133001', 'aal2');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001330a2', 'aal1');

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a1360000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('a1360000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-00000000000a', 'a1360000-0000-0000-0000-00000000000a', 'WDR-A-001');
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('a1360000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('a1360000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-00000000000a', 'a1360000-0000-0000-0000-0000000000e1', 'Unidade A', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');

insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, lock_state, approved_at, approved_by) values
  ('a1360000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-00000000000a', 'DSP-WDR13001', 'Lacre A', extensions.digest('fxk_w1', 'sha256'),
   '10000000-0000-0000-0000-000000000001', 'locked', now(), '10000000-0000-0000-0000-000000000001');
insert into public.seal_enrollments (id, device_code, key_hash, status, organization_id, device_id, last_organization_id) values
  ('a1360000-0000-0000-0000-000000000001', 'DSP-WDR13001', extensions.digest('fxk_w1', 'sha256'), 'approved', '20000000-0000-0000-0000-00000000000a',
   'a1360000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-00000000000a');
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a1360000-0000-0000-0000-0000000000d1', 'a1360000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000002');
insert into public.seal_watches (organization_id, cylinder_id, device_id, site_id) values
  ('20000000-0000-0000-0000-00000000000a', 'a1360000-0000-0000-0000-0000000000c1', 'a1360000-0000-0000-0000-0000000000d1', 'a1360000-0000-0000-0000-0000000000f1');
insert into public.seal_alerts (organization_id, device_id, kind, severity, source) values
  ('20000000-0000-0000-0000-00000000000a', 'a1360000-0000-0000-0000-0000000000d1', 'no_comm', 'medium', 'system');
select public.wifi_add('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001330a2', '20000000-0000-0000-0000-00000000000a',
  'a1361000-0000-0000-0000-0000000000aa', 'a1360000-0000-0000-0000-0000000000d1', 'Rede-Do-Tenant-A', 'senha-ficticia-123', false, true);
create temp table secret as select wifi_secret_id as id from public.seal_commands where device_id = 'a1360000-0000-0000-0000-0000000000d1';

create function pg_temp.withdraw(p_req text, p_id uuid, p_forget text, p_note text default 'Lacre recolhido para manutenção') returns jsonb language sql as $$
  select public.withdraw_device('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000133001', p_req::uuid, p_id, p_forget, p_note,
    (select updated_at from public.seal_enrollments where id = p_id))
$$;

select is((select count(*)::int from public.seal_commands where device_id = 'a1360000-0000-0000-0000-0000000000d1' and status = 'pending'
  and wifi_secret_id is not null), 1, 'preparação: um comando de rede pendente com a senha no Vault');

select is(pg_temp.withdraw('a1361000-0000-0000-0000-000000000001', 'a1360000-0000-0000-0000-000000000001', null, 'abc')->>'code', 'JUSTIFICATION_REQUIRED',
  'retirar exige justificativa');
select is(public.withdraw_device('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000133001', 'a1361000-0000-0000-0000-000000000002',
  'a1360000-0000-0000-0000-000000000001', null, 'Lacre recolhido para manutenção', '2000-01-01 00:00:00+00')->>'code', 'STALE',
  'retirar com o pedido alterado: STALE');

-- Cilindro em viagem em andamento: não pode ser retirado.
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('a1360000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000a', 'WDR1A23', 'truck', 5);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('a1360000-0000-0000-0000-0000000000b2', '20000000-0000-0000-0000-00000000000a', 'Motorista', 'x', 'x', 'D', (now() at time zone 'America/Sao_Paulo')::date + 365);
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, created_by) values
  ('a1360000-0000-0000-0000-0000000000b3', '20000000-0000-0000-0000-00000000000a', 9813, (now() at time zone 'America/Sao_Paulo')::date,
   'a1360000-0000-0000-0000-0000000000b1', 'a1360000-0000-0000-0000-0000000000b2', 'in_progress', now(), '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position) values
  ('a1360000-0000-0000-0000-0000000000b4', '20000000-0000-0000-0000-00000000000a', 'a1360000-0000-0000-0000-0000000000b3', 'a1360000-0000-0000-0000-0000000000f1', 1);
insert into public.trip_items (organization_id, trip_id, stop_id, cylinder_id, item_status, lock_status, checked_at, created_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a1360000-0000-0000-0000-0000000000b3', 'a1360000-0000-0000-0000-0000000000b4', 'a1360000-0000-0000-0000-0000000000c1',
   'in_transit', 'locked', now(), '10000000-0000-0000-0000-000000000002');
select is(pg_temp.withdraw('a1361000-0000-0000-0000-000000000006', 'a1360000-0000-0000-0000-000000000001', null)->>'code', 'CYLINDER_IN_TRIP',
  'cilindro em viagem em andamento: não pode ser retirado');
update public.trips set status = 'completed', completed_at = now(), completed_by = '10000000-0000-0000-0000-000000000002' where id = 'a1360000-0000-0000-0000-0000000000b3';

select is(pg_temp.withdraw('a1361000-0000-0000-0000-000000000003', 'a1360000-0000-0000-0000-000000000001', null)->>'code', 'WITHDRAWN',
  'o Master retira o lacre de operação (sem viagem)');

select ok((select status = 'inactive' and inactive_reason = 'withdrawn' and lock_state = 'locked' from public.seal_devices
  where id = 'a1360000-0000-0000-0000-0000000000d1'), 'a linha fica inativa (withdrawn) e a trava continua a última confirmada');
select ok((select e.status = 'pending' and e.organization_id is null and e.device_id is null and e.forget_networks = 'extras'
  and e.forget_networks_requested_at is not null and e.last_organization_id = '20000000-0000-0000-0000-00000000000a' and e.decision_note = 'Lacre recolhido para manutenção'
  from public.seal_enrollments e where e.id = 'a1360000-0000-0000-0000-000000000001'),
  'o pedido volta a aguardar, com forget_networks extras e o último tenant mantido');
select ok((select unbound_at is not null and unbind_reason = 'device_inactivated' from public.seal_bindings
  where device_id = 'a1360000-0000-0000-0000-0000000000d1'), 'o vínculo com o cilindro é encerrado');
select is((select count(*)::int from public.seal_watches where device_id = 'a1360000-0000-0000-0000-0000000000d1' and ended_at is null), 0,
  'a vigilância é encerrada');
select ok((select status = 'closed' and closed_by = '10000000-0000-0000-0000-000000000001' and close_note is not null from public.seal_alerts
  where device_id = 'a1360000-0000-0000-0000-0000000000d1'), 'o alerta aberto é fechado, com quem retirou e uma nota');
select ok((select status = 'cancelled' and wifi_secret_id is null from public.seal_commands where device_id = 'a1360000-0000-0000-0000-0000000000d1'),
  'o comando pendente é cancelado e não guarda mais a referência da senha');
select is((select count(*)::int from vault.secrets s where s.id = (select id from secret)), 0,
  'a senha do comando de rede sai do Vault');
select is((select count(*)::int from public.seal_device_events where device_id = 'a1360000-0000-0000-0000-0000000000d1' and event_type = 'withdrawn'), 1,
  'o histórico do dispositivo registra a retirada');
select is((select count(*)::int from public.audit_logs where action = 'seal.device_withdraw' and target_id = 'a1360000-0000-0000-0000-000000000001'
  and justification = 'Lacre recolhido para manutenção' and (organization_id is null or organization_id = '20000000-0000-0000-0000-00000000000a')), 2,
  'retirada auditada na plataforma e no tenant, com a justificativa');
select is(public.list_seals('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001330a2', '20000000-0000-0000-0000-00000000000a',
  null, null, null, 0, 50, true)->>'total', '1', 'o tenant ainda tem a linha antiga, com o filtro de histórico');

select is(pg_temp.withdraw('a1361000-0000-0000-0000-000000000004', 'a1360000-0000-0000-0000-000000000001', null)->>'code', 'INVALID_STATE',
  'só lacre em operação pode ser retirado');

-- Retirada com "Esquecer todas as redes".
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a1360000-0000-0000-0000-0000000000d2', '20000000-0000-0000-0000-00000000000a', 'DSP-WDR13002', 'Lacre A2', extensions.digest('fxk_w2', 'sha256'),
   '10000000-0000-0000-0000-000000000001');
insert into public.seal_enrollments (id, device_code, key_hash, status, organization_id, device_id, last_organization_id) values
  ('a1360000-0000-0000-0000-000000000002', 'DSP-WDR13002', extensions.digest('fxk_w2', 'sha256'), 'approved', '20000000-0000-0000-0000-00000000000a',
   'a1360000-0000-0000-0000-0000000000d2', '20000000-0000-0000-0000-00000000000a');
select is(pg_temp.withdraw('a1361000-0000-0000-0000-000000000005', 'a1360000-0000-0000-0000-000000000002', 'all')->>'code', 'WITHDRAWN',
  'retirar escolhendo esquecer todas as redes');
select is((select forget_networks from public.seal_enrollments where id = 'a1360000-0000-0000-0000-000000000002'), 'all', 'forget_networks all');

select * from finish();
rollback;

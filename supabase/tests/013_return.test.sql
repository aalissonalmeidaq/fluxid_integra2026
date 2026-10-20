begin;
select plan(17);

-- Spec 013, US3: o administrador do tenant devolve o lacre à plataforma (return_device; RF-013a, RF-014, RN-006; data-model.md,
-- "Ao inativar"). Dois tenants: o A devolve o seu; o B não alcança o do A. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000009');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001370a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001370b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000009', '60000000-0000-0000-0000-000000137009', 'aal1');

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a13b0000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('a13b0000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-00000000000a', 'a13b0000-0000-0000-0000-00000000000a', 'RET-A-001');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, approved_at, approved_by) values
  ('a13b0000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-00000000000a', 'DSP-RET13001', 'Lacre A', extensions.digest('fxk_r1', 'sha256'),
   '10000000-0000-0000-0000-000000000001', now(), '10000000-0000-0000-0000-000000000001');
insert into public.seal_enrollments (id, device_code, key_hash, status, organization_id, device_id, last_organization_id) values
  ('a13b0000-0000-0000-0000-000000000001', 'DSP-RET13001', extensions.digest('fxk_r1', 'sha256'), 'approved', '20000000-0000-0000-0000-00000000000a',
   'a13b0000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-00000000000a');
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a13b0000-0000-0000-0000-0000000000d1', 'a13b0000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000002');
insert into public.seal_alerts (organization_id, device_id, kind, severity, source) values
  ('20000000-0000-0000-0000-00000000000a', 'a13b0000-0000-0000-0000-0000000000d1', 'no_comm', 'medium', 'system');

create function pg_temp.ret(p_actor text, p_session text, p_org text, p_req text, p_note text) returns jsonb language sql as $$
  select public.return_device(p_actor::uuid, p_session::uuid, p_org::uuid, p_req::uuid, 'a13b0000-0000-0000-0000-0000000000d1', p_note)
$$;
create function pg_temp.a(p_req text, p_note text default 'Lacre com defeito no sensor') returns jsonb language sql as $$
  select pg_temp.ret('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001370a2', '20000000-0000-0000-0000-00000000000a', p_req, p_note)
$$;

-- Quem pode e de onde.
select is(pg_temp.ret('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001370b3', '20000000-0000-0000-0000-00000000000b',
  'a13b1000-0000-0000-0000-000000000001', 'Tentativa de outro tenant')->>'code', 'NOT_FOUND', 'o B não alcança o lacre do A');
select is(pg_temp.ret('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001370b3', '20000000-0000-0000-0000-00000000000a',
  'a13b1000-0000-0000-0000-000000000002', 'Tentativa de outro tenant')->>'code', 'ACCESS_DENIED', 'o B pedindo pela organização do A: acesso negado');
select is(pg_temp.ret('10000000-0000-0000-0000-000000000009', '60000000-0000-0000-0000-000000137009', '20000000-0000-0000-0000-00000000000a',
  'a13b1000-0000-0000-0000-000000000003', 'Sem permissão de administrar')->>'code', 'ACCESS_DENIED', 'sem seal.admin não devolve');
select is(pg_temp.a('a13b1000-0000-0000-0000-000000000004', 'abc')->>'code', 'JUSTIFICATION_REQUIRED', 'devolver exige justificativa de 5 a 500');

-- Cilindro em viagem em andamento: não devolve.
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('a13b0000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000a', 'RET1A23', 'truck', 5);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('a13b0000-0000-0000-0000-0000000000b2', '20000000-0000-0000-0000-00000000000a', 'Motorista', 'x', 'x', 'D', (now() at time zone 'America/Sao_Paulo')::date + 365);
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('a13b0000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('a13b0000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-00000000000a', 'a13b0000-0000-0000-0000-0000000000e1', 'Unidade A', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, created_by) values
  ('a13b0000-0000-0000-0000-0000000000b3', '20000000-0000-0000-0000-00000000000a', 9814, (now() at time zone 'America/Sao_Paulo')::date,
   'a13b0000-0000-0000-0000-0000000000b1', 'a13b0000-0000-0000-0000-0000000000b2', 'in_progress', now(), '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position) values
  ('a13b0000-0000-0000-0000-0000000000b4', '20000000-0000-0000-0000-00000000000a', 'a13b0000-0000-0000-0000-0000000000b3', 'a13b0000-0000-0000-0000-0000000000f1', 1);
insert into public.trip_items (organization_id, trip_id, stop_id, cylinder_id, item_status, lock_status, checked_at, created_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a13b0000-0000-0000-0000-0000000000b3', 'a13b0000-0000-0000-0000-0000000000b4', 'a13b0000-0000-0000-0000-0000000000c1',
   'in_transit', 'locked', now(), '10000000-0000-0000-0000-000000000002');
select is(pg_temp.a('a13b1000-0000-0000-0000-000000000005')->>'code', 'CYLINDER_IN_TRIP', 'cilindro em viagem em andamento: não devolve');
update public.trips set status = 'completed', completed_at = now(), completed_by = '10000000-0000-0000-0000-000000000002' where id = 'a13b0000-0000-0000-0000-0000000000b3';

-- Devolução
select is(pg_temp.a('a13b1000-0000-0000-0000-000000000006')->>'code', 'RETURNED', 'o administrador do A devolve o lacre');
select ok((select status = 'inactive' and inactive_reason = 'returned' from public.seal_devices where id = 'a13b0000-0000-0000-0000-0000000000d1'),
  'a linha fica inativa (returned)');
select ok((select unbound_at is not null from public.seal_bindings where device_id = 'a13b0000-0000-0000-0000-0000000000d1'), 'o vínculo é encerrado');
select ok((select status = 'closed' and closed_by = '10000000-0000-0000-0000-000000000002' from public.seal_alerts
  where device_id = 'a13b0000-0000-0000-0000-0000000000d1'), 'o alerta aberto é fechado por quem devolveu');
select ok((select e.status = 'returned' and e.organization_id is null and e.device_id is null and e.decision_note = 'Lacre com defeito no sensor'
  and e.decided_by = '10000000-0000-0000-0000-000000000002' and e.decided_at is not null and e.forget_networks = 'all'
  and e.last_organization_id = '20000000-0000-0000-0000-00000000000a' from public.seal_enrollments e where e.id = 'a13b0000-0000-0000-0000-000000000001'),
  'o pedido volta à fila do Master como devolvido, com a justificativa e forget_networks all');
select is((select count(*)::int from public.audit_logs where action = 'seal.device_return' and target_id = 'a13b0000-0000-0000-0000-000000000001'
  and (organization_id is null or organization_id = '20000000-0000-0000-0000-00000000000a') and metadata->>'device_code' = 'DSP-RET13001'
  and not metadata ? 'key_hash'), 2, 'devolução auditada no tenant e na plataforma, só com o código');
select is(pg_temp.a('a13b1000-0000-0000-0000-000000000006')->>'replayed', 'true', 'o mesmo request_id não devolve de novo');
select is(pg_temp.a('a13b1000-0000-0000-0000-000000000007')->>'code', 'NOT_FOUND', 'lacre já devolvido não aparece mais para devolver');

delete from private.seal_enroll_rate_windows;
select is(public.seal_ingest('DSP-RET13001', extensions.digest('fxk_r1', 'sha256'), extensions.digest('ip', 'sha256'), jsonb_build_object('protocol', 1,
  'messages', jsonb_build_array(jsonb_build_object('message_id', 'r-1', 'type', 'event', 'read_at', now(), 'problem', null,
    'data', jsonb_build_object('code', 'boot', 'detail', null)))))->'body', '{"status": "pending_approval", "report_interval_s": 60, "forget_networks": "all"}'::jsonb,
  'depois disso, o lacre recebe 202 com forget_networks all');

-- Lacre ativo sem pedido (criado pelo cadastro manual depois da compatibilidade) também é devolvido.
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a13b0000-0000-0000-0000-0000000000d2', '20000000-0000-0000-0000-00000000000a', 'DSP-RET13002', 'Lacre manual', extensions.digest('fxk_r2', 'sha256'),
   '10000000-0000-0000-0000-000000000002');
select is(public.return_device('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001370a2', '20000000-0000-0000-0000-00000000000a',
  'a13b1000-0000-0000-0000-000000000008', 'a13b0000-0000-0000-0000-0000000000d2', 'Lacre manual devolvido')->>'code', 'RETURNED', 'lacre manual sem pedido é devolvido');
select is((select status || '/' || coalesce(last_organization_id::text, '-') from public.seal_enrollments where device_code = 'DSP-RET13002'),
  'returned/20000000-0000-0000-0000-00000000000a', 'e ganha um pedido devolvido na fila do Master');
select is((select count(*)::int from public.seal_device_events where device_id = 'a13b0000-0000-0000-0000-0000000000d1' and event_type = 'returned'), 1,
  'o histórico do dispositivo registra a devolução');

select * from finish();
rollback;

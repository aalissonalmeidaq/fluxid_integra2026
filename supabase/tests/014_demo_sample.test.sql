begin;
select plan(31);

-- Spec 014 (RF-018): os dados de exemplo da empresa da demonstração, sobre o estado do seed (que roda demo_restore com o manifesto
-- completo). Confere que existem, que nasceram pelas operações do domínio, que a segunda restauração não muda nada e que a
-- restauração devolve ao publicado o que um visitante mudou. Hermético: rollback.

create function pg_temp.restore() returns jsonb language sql as $$
  select public.demo_restore((select manifest from private.demo_tenant), 'state') $$;
create function pg_temp.rec(p_kind text, p_ref text) returns uuid language sql as $$
  select record_id from private.demo_records where kind = p_kind and ref = p_ref $$;
create function pg_temp.org() returns uuid language sql as $$ select '5478e9e3-155b-482f-b843-3513e0938dd6'::uuid $$;
create function pg_temp.admin() returns uuid language sql as $$ select '0d140000-0000-4000-8000-000000000001'::uuid $$;

create temporary table antes as select
  (select count(*) from public.customers where organization_id <> pg_temp.org()) as clientes,
  (select count(*) from public.trips where organization_id <> pg_temp.org()) as viagens,
  (select count(*) from public.seal_devices where organization_id <> pg_temp.org()) as lacres,
  (select string_agg(m.id::text || m.status, ',' order by m.id) from public.memberships m where m.organization_id <> pg_temp.org()) as vinculos;

-- O que o seed publicou.
select is((select metadata->'warnings' from public.audit_logs where action = 'demo.restore' and result = 'success' order by id desc limit 1), '[]'::jsonb,
  'a restauração do seed não deixou aviso');
select ok((select manifest ? 'sample' from private.demo_tenant), 'o manifesto completo fica guardado com a marca da empresa');
select is((select count(*)::int from public.customers where organization_id = pg_temp.org() and status = 'active' and legal_name like '%Exemplo%'), 3,
  '3 clientes de exemplo ativos');
select is((select count(*)::int from public.customer_sites where organization_id = pg_temp.org() and status = 'active'), 3, '3 unidades');
select is((select count(*)::int from public.geofences where organization_id = pg_temp.org() and status = 'active'), 3, '3 geocercas');
select is((select count(*)::int from public.vehicles where organization_id = pg_temp.org() and status = 'available'), 2, '2 veículos disponíveis');
select is((select count(*)::int from public.drivers where organization_id = pg_temp.org() and status = 'active'), 2, '2 motoristas');
select is((select linked_user_id from public.drivers where id = pg_temp.rec('driver', 'motorista-1')), '0d140000-0000-4000-8000-000000000005'::uuid,
  'o motorista publicado fica ligado ao perfil Motorista da demonstração');
select is((select count(*)::int from public.cylinders where organization_id = pg_temp.org()), 13, '12 cilindros de exemplo e o C262');
select ok((select hydro_next_due_on < (now() at time zone 'America/Sao_Paulo')::date from public.cylinders where id = pg_temp.rec('cylinder', 'C274')),
  'o C274 tem o teste hidrostático vencido');
select is((select string_agg(t.status, ',' order by r.ref) from private.demo_records r join public.trips t on t.id = r.record_id where r.kind = 'trip'),
  'completed,in_progress,planned', 'viagens concluída, em andamento e planejada');
select is((select count(*)::int from public.cylinders c where c.organization_id = pg_temp.org() and c.custody_status = 'at_customer'), 3,
  'os 3 cilindros da viagem concluída ficam com o cliente');
select is((select count(*)::int from public.seal_devices d join public.seal_bindings b on b.device_id = d.id and b.unbound_at is null
  where d.organization_id = pg_temp.org() and d.label like 'Lacre de exemplo%' and d.status = 'active' and d.last_position_id is not null), 4,
  '4 lacres simulados ativos, vinculados e com posição');
select is((select string_agg(a.kind, ',' order by a.kind) from public.seal_alerts a join public.seal_devices d on d.id = a.device_id
  where d.label like 'Lacre de exemplo%' and a.status <> 'closed' and a.kind in ('low_battery', 'weak_signal', 'seal_open', 'device_off')),
  'device_off,low_battery,seal_open,weak_signal', 'cada lacre simulado tem o alerta publicado aberto');

-- Tudo nasceu pelas operações do domínio, em nome do administrador de demonstração.
select is((select count(*)::int from public.audit_logs where action = 'customer.create' and organization_id = pg_temp.org() and actor_user_id = pg_temp.admin()), 3,
  'os clientes têm a auditoria do cadastro');
select ok((select bool_and(e.actor_user_id = pg_temp.admin()) and count(*) filter (where e.event_type = 'hydrostatic_test_registered') = 1
  from public.cylinder_events e where e.cylinder_id = pg_temp.rec('cylinder', 'C270')), 'o cilindro tem histórico de cadastro e teste pelo administrador');
select ok(exists (select 1 from public.seal_messages m where m.device_id = pg_temp.rec('seal', 'lacre-1')), 'as mensagens do lacre simulado passaram pelo seal_ingest');

-- Segunda restauração: nada a fazer.
create temporary table r1 as select pg_temp.restore() as r;
select is((select (r->'sample'->>'created') || '/' || (r->'sample'->>'restored') from r1), '0/0', 'a segunda restauração não cria nem restaura exemplos');

-- O que um visitante mudou volta ao publicado.
delete from public.user_sessions where user_id = pg_temp.admin();
select public.start_user_session(pg_temp.admin(), '61430000-0000-4000-8000-000000000001', 'aal1');
update public.customers set status = 'inactive', inactivated_at = now(), inactivated_by = pg_temp.admin() where id = pg_temp.rec('customer', 'clinica');
update public.vehicles set status = 'maintenance' where id = pg_temp.rec('vehicle', 'DEM1A14');
update public.cylinders set status = 'inactive', inactivation_reason = 'lost', stock_status = 'out_of_stock' where id = pg_temp.rec('cylinder', 'C274');
select public.close_alert(pg_temp.admin(), '61430000-0000-4000-8000-000000000001', pg_temp.org(), gen_random_uuid(),
  (select id from public.seal_alerts where device_id = pg_temp.rec('seal', 'lacre-3') and kind = 'seal_open' and status <> 'closed'), 'Visitante encerrou o alerta.');
create temporary table planejada_antiga as select pg_temp.rec('trip', 'planejada') as id;
select is(public.cancel_trip(pg_temp.admin(), '61430000-0000-4000-8000-000000000001', pg_temp.org(), gen_random_uuid(), (select id from planejada_antiga),
  (select version from public.trips where id = (select id from planejada_antiga)), 'Visitante cancelou a viagem')->>'code', 'CANCELLED', 'um visitante cancela a viagem planejada');

create temporary table r2 as select pg_temp.restore() as r;
select ok((select (r->'sample'->>'restored')::int >= 4 from r2), 'a restauração conta o que devolveu ao publicado');
select ok((select status = 'active' from public.customers where id = pg_temp.rec('customer', 'clinica')), 'o cliente volta a ativo');
select ok((select status = 'available' from public.vehicles where id = pg_temp.rec('vehicle', 'DEM1A14')), 'o veículo volta a disponível');
select ok((select status = 'active' from public.cylinders where id = pg_temp.rec('cylinder', 'C274')), 'o cilindro volta a ativo');
select ok(exists (select 1 from public.seal_alerts where device_id = pg_temp.rec('seal', 'lacre-3') and kind = 'seal_open' and status = 'open'),
  'o alerta fechado pelo visitante volta a abrir');
select ok(pg_temp.rec('trip', 'planejada') <> (select id from planejada_antiga), 'a viagem planejada cancelada ganha uma nova');
select is((select status from public.trips where id = pg_temp.rec('trip', 'planejada')), 'planned', 'e a nova está planejada');
select is((select status from public.trips where id = (select id from planejada_antiga)), 'cancelled', 'a cancelada fica no histórico');
select is((select count(*)::int from public.trips where organization_id = pg_temp.org() and status = 'in_progress'), 1, 'continua uma só viagem em andamento');

create temporary table r3 as select pg_temp.restore() as r;
select is((select (r->'sample'->>'created') || '/' || (r->'sample'->>'restored') from r3), '0/0', 'depois da restauração, a seguinte não muda nada');
select is((select count(*)::int from public.customers where organization_id = pg_temp.org()), 3, 'nenhum cliente duplicado');

select ok((select a.clientes = (select count(*) from public.customers where organization_id <> pg_temp.org())
  and a.viagens = (select count(*) from public.trips where organization_id <> pg_temp.org())
  and a.lacres = (select count(*) from public.seal_devices where organization_id <> pg_temp.org())
  and a.vinculos = (select string_agg(m.id::text || m.status, ',' order by m.id) from public.memberships m where m.organization_id <> pg_temp.org())
  from antes a), 'Master e outras empresas intactos');

select * from finish();
rollback;

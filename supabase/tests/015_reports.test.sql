begin;
select plan(43);

-- Spec 015 (T072; US5, RF-024 a RF-031, RF-036, RF-037, CS-003, CS-007, CS-015): relatórios e exportações. A leitura segue a matriz
-- trips→trip.read, telemetry_availability|proximity→tracking.read, alerts→seal.read, deliveries→trip.read, custody→cylinder.history;
-- `report.export` não amplia leitura. Resumo e linhas vêm da mesma fonte, com snapshot e cursor estáveis. O job revalida exportação e
-- leitura na solicitação, no processamento, no status e no download; só o solicitante vê o próprio arquivo; bucket privado. Dois
-- tenants. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
-- O usuário 5 ganha um papel próprio: só consulta o rastreamento e exporta.
insert into public.roles (id, organization_id, code, name, description, scope, system) values
  ('50000000-0000-0000-0000-0000000015f1', '20000000-0000-0000-0000-00000000000a', 'rastreio_015', 'Rastreio', 'Consulta e exporta', 'tenant', false);
insert into public.role_permissions (role_id, permission_id)
  select '50000000-0000-0000-0000-0000000015f1', p.id from public.permissions p where p.code in ('tracking.read', 'report.export');
delete from public.membership_roles where membership_id = '30000000-0000-0000-0000-000000000005';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  values ('30000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-0000000015f1', '10000000-0000-0000-0000-000000000001');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001570a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001570b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001570a4', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001570a5', 'aal1');

-- Fixtures do Tenant A: uma viagem em andamento com um cilindro lacrado e uma ocorrência; outra concluída; uma entrega; eventos de custódia.
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a1700000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, custody_status) values
  ('a1710000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a1700000-0000-0000-0000-00000000000a', 'REP-A-1', 'in_transit');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('a1720000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'REP1A11', 'truck', 5),
  ('a1720000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'REP1A22', 'truck', 5);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until, linked_user_id) values
  ('a1730000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'Motorista Quatro', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, '10000000-0000-0000-0000-000000000004'),
  ('a1730000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'Motorista Dois', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, null);
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('a1740000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('a1750000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a1740000-0000-0000-0000-0000000000a1', 'Unidade Centro', '01001000',
   'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, created_by, created_at) values
  ('a1760000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 9301, (now() at time zone 'America/Sao_Paulo')::date,
   'a1720000-0000-0000-0000-0000000000a1', 'a1730000-0000-0000-0000-0000000000a1', 'in_progress', now() - interval '2 hours',
   '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', now() - interval '3 hours');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, completed_at, completed_by, created_by, created_at) values
  ('a1760000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 9302, (now() at time zone 'America/Sao_Paulo')::date,
   'a1720000-0000-0000-0000-0000000000a2', 'a1730000-0000-0000-0000-0000000000a2', 'completed', now() - interval '5 hours',
   '10000000-0000-0000-0000-000000000002', now() - interval '4 hours', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002',
   now() - interval '6 hours');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position) values
  ('a1770000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a1760000-0000-0000-0000-0000000000a1', 'a1750000-0000-0000-0000-0000000000a1', 1);
insert into public.trip_items (id, organization_id, trip_id, stop_id, cylinder_id, item_status, lock_status, checked_at, created_by) values
  ('a1780000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'a1760000-0000-0000-0000-0000000000a1', 'a1770000-0000-0000-0000-0000000000a1',
   'a1710000-0000-0000-0000-0000000000a1', 'in_transit', 'locked', now(), '10000000-0000-0000-0000-000000000002');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, lock_state) values
  ('a1790000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-REP15001', 'Lacre R1', extensions.digest('k1', 'sha256'),
   '10000000-0000-0000-0000-000000000002', 'locked');
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by, bound_at) values
  ('20000000-0000-0000-0000-00000000000a', 'a1790000-0000-0000-0000-0000000000a1', 'a1710000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002', now() - interval '3 hours');
create temporary table s as select (public.start_tracking_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001570a4',
  '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'a1760000-0000-0000-0000-0000000000a1', 'a17b0000-0000-0000-0000-0000000000a1',
  'android_native', 'full', false)->'session'->>'id')::uuid as sid;
create function pg_temp.cycle(p_seq integer, p_seconds_ago integer) returns void language plpgsql as $$
begin
  insert into public.seal_positions (organization_id, device_id, cylinder_id, point, accuracy_m, quality, read_at, last_seen_at) values
    ('20000000-0000-0000-0000-00000000000a', 'a1790000-0000-0000-0000-0000000000a1', 'a1710000-0000-0000-0000-0000000000a1',
     extensions.st_setsrid(extensions.st_makepoint(-39.31, -7.227), 4326)::extensions.geography, 8, 'gps',
     now() - make_interval(secs => p_seconds_ago + 5), now() - make_interval(secs => p_seconds_ago + 5));
  perform public.ingest_driver_positions('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001570a4', '20000000-0000-0000-0000-00000000000a',
    gen_random_uuid(), (select sid from s), 'a17b0000-0000-0000-0000-0000000000a1',
    jsonb_build_array(jsonb_build_object('client_position_id', gen_random_uuid(), 'sequence_no', p_seq,
      'observed_at', now() - make_interval(secs => p_seconds_ago), 'latitude', -7.23, 'longitude', -39.31, 'accuracy_m', 10)));
end $$;
select pg_temp.cycle(1, 180); select pg_temp.cycle(2, 120); select pg_temp.cycle(3, 60);

create function pg_temp.f() returns jsonb language sql as $$
  select jsonb_build_object('from', to_char((now() - interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'to', to_char((now() + interval '1 hour') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
$$;
create function pg_temp.summary(p_user text, p_session text, p_org text, p_type text, p_filters jsonb default null, p_snapshot timestamptz default null) returns jsonb language sql as $$
  select public.query_report_summary(('10000000-0000-0000-0000-00000000000' || p_user)::uuid, ('60000000-0000-0000-0000-0000001570' || p_session)::uuid,
    ('20000000-0000-0000-0000-00000000000' || p_org)::uuid, p_type, coalesce(p_filters, pg_temp.f()), p_snapshot)
$$;
create function pg_temp.rows(p_user text, p_session text, p_org text, p_type text, p_limit integer default 200, p_cursor_at timestamptz default null,
  p_cursor_id uuid default null) returns jsonb language sql as $$
  select public.query_report_rows(('10000000-0000-0000-0000-00000000000' || p_user)::uuid, ('60000000-0000-0000-0000-0000001570' || p_session)::uuid,
    ('20000000-0000-0000-0000-00000000000' || p_org)::uuid, p_type, pg_temp.f(), null, p_cursor_at, p_cursor_id, p_limit)
$$;
create function pg_temp.total(p jsonb, p_key text) returns numeric language sql as $$
  select (t->>'value')::numeric from jsonb_array_elements(p->'totals') t where t->>'key' = p_key
$$;

-- 1. Fronteira e armazenamento.
select ok(not has_function_privilege('authenticated', 'public.query_report_summary(uuid, uuid, uuid, text, jsonb, timestamptz)', 'execute'),
  'authenticated não consulta relatório direto');
select ok((select not public from storage.buckets where id = 'report-exports'), 'bucket de exportações existe e é privado');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and (qual like '%report-exports%' or with_check like '%report-exports%')),
  0, 'nenhuma política abre o bucket ao cliente');

-- 2. Matriz de leitura: report.export não amplia a leitura.
select is(pg_temp.summary('5', 'a5', 'a', 'proximity')->>'code', 'FOUND', 'tracking.read lê proximidade');
select is(pg_temp.summary('5', 'a5', 'a', 'telemetry_availability')->>'code', 'FOUND', 'tracking.read lê telemetria');
select is(pg_temp.summary('5', 'a5', 'a', 'trips')->>'code', 'ACCESS_DENIED', 'sem trip.read não lê viagens, mesmo com report.export');
select is(pg_temp.summary('5', 'a5', 'a', 'alerts')->>'code', 'ACCESS_DENIED', 'sem seal.read não lê alertas');
select is(pg_temp.summary('5', 'a5', 'a', 'custody')->>'code', 'ACCESS_DENIED', 'sem cylinder.history não lê custódia');

-- 3. Validação.
select is(pg_temp.summary('2', 'a2', 'a', 'faturamento')->>'code', 'INVALID_FILTER', 'tipo desconhecido');
select is(pg_temp.summary('2', 'a2', 'a', 'trips', pg_temp.f() || '{"lat": 1}')->>'code', 'INVALID_FILTER', 'filtro desconhecido');
select is(pg_temp.summary('2', 'a2', 'a', 'trips', pg_temp.f() || '{"cylinder_id": "a1710000-0000-0000-0000-0000000000a1"}')->>'code', 'INVALID_FILTER',
  'filtro que o tipo não usa');
select is(pg_temp.summary('2', 'a2', 'a', 'trips', '{"from": "2026-10-22T18:00:00Z", "to": "2026-10-22T08:00:00Z"}')->>'code', 'INVALID_PERIOD', 'período invertido');
select is(pg_temp.summary('2', 'a2', 'a', 'trips', '{"from": "2025-01-01T00:00:00Z", "to": "2026-10-22T08:00:00Z"}')->>'code', 'INVALID_PERIOD', 'período acima de 366 dias');

-- 4. Resumo e linhas da mesma fonte, com contexto.
create temporary table sp as select pg_temp.summary('2', 'a2', 'a', 'proximity') as r;
select is((select r->'organization'->>'display_name' from sp), (select display_name from public.organizations where id = '20000000-0000-0000-0000-00000000000a'),
  'o relatório identifica a empresa');
select ok((select r->>'generated_at' is not null and r->>'snapshot_at' is not null and r->'criteria'->>'from' is not null from sp), 'geração, snapshot e critérios');
-- Validação humana (27/10/2026): os critérios saíam como texto técnico ("De 2026-01-01T00:00:00.000Z ..."; "status = in_progress").
select is(pg_temp.summary('2', 'a2', 'a', 'trips', '{"from": "2026-10-22T11:00:00Z", "to": "2026-10-22T20:30:00Z", "status": "in_progress"}')->>'criteria_text',
  'De 22/10/2026 08:00 até 22/10/2026 17:30 (horário de Brasília); situação: em andamento', 'critérios por extenso, no horário de Brasília');
select is((select pg_temp.total(r, 'occurrences') from sp), 1::numeric, 'uma ocorrência no período');
select is((select (r->>'row_count')::int from sp), 1, 'contagem igual às linhas');
create temporary table rp as select pg_temp.rows('2', 'a2', 'a', 'proximity') as r;
select is((select jsonb_array_length(r->'rows') from rp), 1, 'linhas iguais ao resumo');
select is((select r->'rows'->0->'values'->>'serial_number' from rp), 'REP-A-1', 'linha com o cilindro');
select ok((select bool_and(c ? 'label') from rp, jsonb_array_elements(r->'columns') c), 'colunas com rótulo');
select is((select count(*)::int from rp, jsonb_array_elements(r->'rows') x where x->'values' ? 'latitude'), 0, 'proximidade sem coordenada');

-- 5. Viagens: paginação estável e snapshot.
select is(pg_temp.total(pg_temp.summary('2', 'a2', 'a', 'trips'), 'trips'), 2::numeric, 'duas viagens no período');
create temporary table t1 as select pg_temp.rows('2', 'a2', 'a', 'trips', 1) as r;
select is((select r->'rows'->0->'values'->>'trip_number' from t1), '9302', 'primeira página: a mais antiga');
select is((select pg_temp.rows('2', 'a2', 'a', 'trips', 1, (select (r->'next_cursor'->>'at')::timestamptz from t1), (select (r->'next_cursor'->>'id')::uuid from t1))
  ->'rows'->0->'values'->>'trip_number'), '9301', 'segunda página continua');
select is(pg_temp.total(pg_temp.summary('2', 'a2', 'a', 'trips', null, now() - interval '4 hours'), 'trips'), 1::numeric,
  'snapshot anterior à criação de uma viagem não a inclui');

-- 6. Outros tipos.
select is(pg_temp.total(pg_temp.summary('2', 'a2', 'a', 'telemetry_availability'), 'positions'), 3::numeric, 'telemetria conta as posições do celular');
select is(pg_temp.total(pg_temp.summary('2', 'a2', 'a', 'alerts'), 'alerts'), 1::numeric, 'o alerta de afastamento no relatório de alertas');

-- 7. Dois tenants.
select is(pg_temp.summary('3', 'b3', 'a', 'proximity')->>'code', 'ACCESS_DENIED', 'admin B não lê relatório do A');
select is(pg_temp.total(pg_temp.summary('3', 'b3', 'b', 'proximity'), 'occurrences'), 0::numeric, 'o B não vê ocorrência do A');

-- 8. Exportação: solicitar, processar, concluir, consultar e baixar.
create function pg_temp.request(p_user text, p_session text, p_type text, p_request uuid) returns jsonb language sql as $$
  select public.request_report_export(('10000000-0000-0000-0000-00000000000' || p_user)::uuid, ('60000000-0000-0000-0000-0000001570' || p_session)::uuid,
    '20000000-0000-0000-0000-00000000000a', p_request, p_type, pg_temp.f(), null)
$$;
select is(pg_temp.request('5', 'a5', 'trips', gen_random_uuid())->>'code', 'ACCESS_DENIED', 'exportar exige também a leitura do tipo');
create temporary table e1 as select pg_temp.request('5', 'a5', 'proximity', 'a17c0000-0000-0000-0000-000000000001') as r;
select is((select r->'export'->>'status' from e1), 'queued', 'pedido na fila');
select is((select pg_temp.request('5', 'a5', 'proximity', 'a17c0000-0000-0000-0000-000000000001')->'export'->>'id' from e1), (select r->'export'->>'id' from e1),
  'repetir o pedido devolve o mesmo job');
create temporary table c1 as select public.claim_report_export('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001570a5',
  '20000000-0000-0000-0000-00000000000a', (select (r->'export'->>'id')::uuid from e1)) as r;
select is((select r->>'code' || ':' || jsonb_array_length(r->'rows') from c1), 'CLAIMED:1', 'processamento recebe as linhas do mesmo recorte');
select is((select public.complete_report_export('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001570a5', '20000000-0000-0000-0000-00000000000a',
  (select (r->'export'->>'id')::uuid from e1), 'org/user/arquivo.csv', 1)->>'code'), 'READY', 'arquivo completo publicado');
select is((select public.get_report_export('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001570a2', '20000000-0000-0000-0000-00000000000a',
  (select (r->'export'->>'id')::uuid from e1))->>'code'), 'NOT_FOUND', 'outra pessoa da empresa não vê o job');
select is((select public.authorize_report_download('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001570a5', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), (select (r->'export'->>'id')::uuid from e1))->>'storage_path'), 'org/user/arquivo.csv', 'o solicitante obtém o arquivo');
select ok((select count(*) = 3 and bool_and(metadata::text !~ '(latitude|longitude|storage_path|http)') from public.audit_logs
  where action in ('report.export_request', 'report.export_complete', 'report.export_download') and target_id = (select r->'export'->>'id' from e1)),
  'solicitação, conclusão e obtenção auditadas, sem caminho nem coordenada');

-- 9. Perder a permissão bloqueia status e download; expirar bloqueia o download.
delete from public.role_permissions rp using public.permissions p where rp.role_id = '50000000-0000-0000-0000-0000000015f1' and rp.permission_id = p.id and p.code = 'report.export';
select is((select public.authorize_report_download('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001570a5', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), (select (r->'export'->>'id')::uuid from e1))->>'code'), 'ACCESS_DENIED', 'sem report.export, nada de download');
insert into public.role_permissions (role_id, permission_id) select '50000000-0000-0000-0000-0000000015f1', p.id from public.permissions p where p.code = 'report.export';
update public.report_exports set expires_at = now() - interval '1 minute' where id = (select (r->'export'->>'id')::uuid from e1);
select is((select public.get_report_export('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001570a5', '20000000-0000-0000-0000-00000000000a',
  (select (r->'export'->>'id')::uuid from e1))->'export'->>'status'), 'expired', 'arquivo vencido aparece expirado');
select is((select public.authorize_report_download('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001570a5', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), (select (r->'export'->>'id')::uuid from e1))->>'code'), 'EXPORT_EXPIRED', 'vencido não é baixado');

-- 10. Processar sem a leitura do tipo falha sem arquivo.
create temporary table e2 as select pg_temp.request('5', 'a5', 'telemetry_availability', gen_random_uuid()) as r;
delete from public.role_permissions rp using public.permissions p where rp.role_id = '50000000-0000-0000-0000-0000000015f1' and rp.permission_id = p.id and p.code = 'tracking.read';
select is((select public.claim_report_export('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001570a5', '20000000-0000-0000-0000-00000000000a',
  (select (r->'export'->>'id')::uuid from e2))->>'code'), 'ACCESS_DENIED', 'processamento recusado sem a leitura');
select is((select status || ':' || failure_code || ':' || (storage_path is null) from public.report_exports where id = (select (r->'export'->>'id')::uuid from e2)),
  'failed:ACCESS_DENIED:true', 'job falha sem criar arquivo');

select * from finish();
rollback;

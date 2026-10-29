begin;
select plan(50);

-- Spec 015 (T087; US6, RF-032 a RF-036): avisos por e-mail. Categorias `proximity_confirmed|seal_high_critical|seal_recovered` começam
-- desligadas; o administrador libera (`notification_category.manage`, versão otimista, auditoria) e cada pessoa opta só pelo que foi
-- liberado e pelo que sua permissão alcança. Abrir e recuperar criam no máximo um item por ocorrência, transição e destinatário; alerta
-- médio, alerta de afastamento como alerta de lacre e quem não optou não recebem. O envio reclama com o segredo do Vault, revalida,
-- relata de forma idempotente, e nenhuma falha muda o alerta. Dois tenants. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
-- O usuário 5 vira gestor de logística no A: lê lacres e rastreamento, mas não administra as categorias. O 4 não tem nenhuma das duas.
delete from public.membership_roles where membership_id = '30000000-0000-0000-0000-000000000005';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-000000000005', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'logistics_manager';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001570a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001570b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001570a4', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001570a5', 'aal1');

create function pg_temp.call(p_fn text, p_user text, p_org text, variadic p_args text[] default '{}') returns jsonb language plpgsql as $$
declare
  v_result jsonb;
begin
  execute format('select public.%I(%L::uuid, %L::uuid, %L::uuid%s)', p_fn, '10000000-0000-0000-0000-00000000000' || p_user,
    '60000000-0000-0000-0000-0000001570' || p_org || p_user, '20000000-0000-0000-0000-00000000000' || p_org,
    coalesce((select string_agg(', ' || a, '') from unnest(p_args) a), '')) into v_result;
  return v_result;
end $$;
create function pg_temp.secret() returns text language sql as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'email_notifications_secret'
$$;
create function pg_temp.items(p_status text default null) returns integer language sql as $$
  -- Só as empresas do teste: a base local pode ter avisos da demonstração.
  select count(*)::int from public.email_notification_outbox
   where organization_id::text like '20000000-0000-0000-0000-00000000000_' and (p_status is null or status = p_status)
$$;

-- 1. Estado inicial e administração das categorias.
select is(pg_temp.call('get_notification_categories', '2', 'a')->'categories',
  '[{"category": "proximity_confirmed", "enabled": false}, {"category": "seal_high_critical", "enabled": false}, {"category": "seal_recovered", "enabled": false}]'::jsonb,
  'as três categorias começam desligadas');
select is((pg_temp.call('get_notification_categories', '2', 'a')->>'version')::int, 0, 'versão 0');
select is(pg_temp.call('get_notification_categories', '5', 'a')->>'code', 'ACCESS_DENIED', 'quem não administra não lê a configuração');
select is(pg_temp.call('set_notification_categories', '5', 'a', quote_literal(gen_random_uuid()), $$'{seal_high_critical}'::text[]$$, '0')->>'code',
  'ACCESS_DENIED', 'quem não administra não libera');
select is(pg_temp.call('set_notification_categories', '2', 'a', quote_literal(gen_random_uuid()), $$'{marketing}'::text[]$$, '0')->>'code',
  'VALIDATION_FAILED', 'categoria desconhecida recusada');
select is(pg_temp.call('set_notification_categories', '2', 'a', $$'f1670000-0000-0000-0000-000000000001'$$,
  $$'{seal_high_critical,proximity_confirmed}'::text[]$$, '0')->>'code', 'UPDATED', 'o administrador libera duas categorias');
select is(pg_temp.call('set_notification_categories', '2', 'a', $$'f1670000-0000-0000-0000-000000000001'$$,
  $$'{seal_high_critical,proximity_confirmed}'::text[]$$, '0')->>'version', '1', 'repetir o pedido devolve a mesma resposta');
select is(pg_temp.call('set_notification_categories', '2', 'a', quote_literal(gen_random_uuid()), $$'{seal_recovered}'::text[]$$, '0')->>'code',
  'VERSION_CONFLICT', 'versão antiga recusada');
select is((select count(*)::int from public.audit_logs where action = 'notification.categories_update' and organization_id = '20000000-0000-0000-0000-00000000000a'
  and result = 'success'), 1, 'liberação auditada uma vez');
select is(pg_temp.call('get_notification_categories', '3', 'b')->'categories'->1->>'enabled', 'false', 'o Tenant B continua com tudo desligado');
select is(public.get_notification_categories('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001570b3',
  '20000000-0000-0000-0000-00000000000a')->>'code', 'ACCESS_DENIED', 'o B não lê a configuração do A');

-- 2. Preferência pessoal: só o liberado e o que a permissão alcança.
create temporary table p5 as select pg_temp.call('get_my_email_preferences', '5', 'a') as r;
select is((select e->>'allowed' || ':' || (e->>'enabled') from p5, jsonb_array_elements(r->'categories') e where e->>'category' = 'seal_high_critical'),
  'true:false', 'liberada e permitida, mas desligada até optar');
select is((select e->>'reason' from p5, jsonb_array_elements(r->'categories') e where e->>'category' = 'seal_recovered'), 'not_released',
  'não liberada explica o motivo');
select is((select e->>'reason' from jsonb_array_elements(pg_temp.call('get_my_email_preferences', '4', 'a')->'categories') e
  where e->>'category' = 'seal_high_critical'), 'no_permission', 'sem seal.read explica o motivo');
select is(pg_temp.call('set_my_email_preferences', '5', 'a', quote_literal(gen_random_uuid()), $$'{seal_recovered}'::text[]$$)->>'code',
  'CATEGORY_NOT_ALLOWED', 'não opta pelo que não foi liberado');
select is(pg_temp.call('set_my_email_preferences', '4', 'a', quote_literal(gen_random_uuid()), $$'{seal_high_critical}'::text[]$$)->>'code',
  'CATEGORY_NOT_ALLOWED', 'não opta sem a permissão de leitura');
select is(pg_temp.call('set_my_email_preferences', '5', 'a', quote_literal(gen_random_uuid()), $$'{seal_high_critical,proximity_confirmed}'::text[]$$)->>'code',
  'UPDATED', 'o gestor opta pelas duas liberadas');

-- 3. Massa: um lacre fora de viagem para os alertas de lacre e uma viagem com dois lacres longe do celular para o afastamento.
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('f1600000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, custody_status) values
  ('f1610000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'f1600000-0000-0000-0000-00000000000a', 'EML-A-1', 'in_transit'),
  ('f1610000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-00000000000a', 'f1600000-0000-0000-0000-00000000000a', 'EML-A-3', 'in_organization');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('f1620000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'EML1A11', 'truck', 5);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until, linked_user_id) values
  ('f1630000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'Motorista Quatro', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, '10000000-0000-0000-0000-000000000004');
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('f1640000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('f1650000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'f1640000-0000-0000-0000-0000000000a1', 'Unidade', '01001000',
   'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, created_by) values
  ('f1660000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 9301, (now() at time zone 'America/Sao_Paulo')::date,
   'f1620000-0000-0000-0000-0000000000a1', 'f1630000-0000-0000-0000-0000000000a1', 'in_progress', now() - interval '2 hours',
   '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002');
insert into public.trip_stops (id, organization_id, trip_id, site_id, position) values
  ('f1680000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'f1660000-0000-0000-0000-0000000000a1', 'f1650000-0000-0000-0000-0000000000a1', 1);
insert into public.trip_items (id, organization_id, trip_id, stop_id, cylinder_id, item_status, lock_status, checked_at, created_by) values
  ('f1690000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'f1660000-0000-0000-0000-0000000000a1', 'f1680000-0000-0000-0000-0000000000a1',
   'f1610000-0000-0000-0000-0000000000a1', 'in_transit', 'locked', now(), '10000000-0000-0000-0000-000000000002');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, lock_state) values
  ('f16a0000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-EML15001', 'Lacre E1', extensions.digest('e1', 'sha256'),
   '10000000-0000-0000-0000-000000000002', 'locked'),
  ('f16a0000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-00000000000a', 'DSP-EML15003', 'Lacre E3', extensions.digest('e3', 'sha256'),
   '10000000-0000-0000-0000-000000000002', 'unlocked');
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by, bound_at) values
  ('20000000-0000-0000-0000-00000000000a', 'f16a0000-0000-0000-0000-0000000000a1', 'f1610000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002', now() - interval '3 hours'),
  ('20000000-0000-0000-0000-00000000000a', 'f16a0000-0000-0000-0000-0000000000a3', 'f1610000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-000000000002', now() - interval '3 hours');

-- 4. Alertas de lacre: médio não gera; alto gera um item por destinatário que optou; reabrir o mesmo alerta não duplica.
select private.open_seal_alert('f16a0000-0000-0000-0000-0000000000a3', 'low_battery', 'medium', 'device', '{}', false);
select is(pg_temp.items(), 0, 'alerta médio não gera aviso');
create temporary table high as select private.open_seal_alert('f16a0000-0000-0000-0000-0000000000a3', 'seal_open', 'high', 'device', '{}', false) as id;
select private.open_seal_alert('f16a0000-0000-0000-0000-0000000000a3', 'seal_open', 'high', 'device', '{"again": true}', false);
select is((select string_agg(category || ':' || transition || ':' || occurrence_type || ':' || recipient_user_id || ':' || status, ',')
  from public.email_notification_outbox where organization_id::text like '20000000-0000-0000-0000-00000000000_'), 'seal_high_critical:opened:seal_alert:10000000-0000-0000-0000-000000000005:pending',
  'um só aviso de abertura, só para quem optou (o administrador não optou)');

-- 5. Afastamento confirmado: aviso de proximidade; o alerta de lacre do afastamento não gera aviso de lacre.
create function pg_temp.cycle(p_seq integer, p_seconds_ago integer) returns void language plpgsql as $$
begin
  insert into public.seal_positions (organization_id, device_id, cylinder_id, point, accuracy_m, quality, read_at, last_seen_at)
  values ('20000000-0000-0000-0000-00000000000a', 'f16a0000-0000-0000-0000-0000000000a1', 'f1610000-0000-0000-0000-0000000000a1',
    extensions.st_setsrid(extensions.st_makepoint(-39.31, -7.227), 4326)::extensions.geography, 8, 'gps',
    now() - make_interval(secs => p_seconds_ago + 5), now() - make_interval(secs => p_seconds_ago + 5));
  perform public.ingest_driver_positions('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001570a4', '20000000-0000-0000-0000-00000000000a',
    gen_random_uuid(), (select sid from s), 'f16b0000-0000-0000-0000-0000000000a1',
    jsonb_build_array(jsonb_build_object('client_position_id', gen_random_uuid(), 'sequence_no', p_seq,
      'observed_at', now() - make_interval(secs => p_seconds_ago), 'latitude', -7.23, 'longitude', -39.31, 'accuracy_m', 10)));
end $$;
create temporary table s as select (public.start_tracking_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001570a4',
  '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'f1660000-0000-0000-0000-0000000000a1', 'f16b0000-0000-0000-0000-0000000000a1',
  'android_native', 'full', false)->'session'->>'id')::uuid as sid;
select pg_temp.cycle(1, 180); select pg_temp.cycle(2, 120); select pg_temp.cycle(3, 60);
create temporary table occ as select id, alert_id from public.proximity_occurrences where trip_id = 'f1660000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from occ), 1, 'uma ocorrência confirmada');
select is((select count(*)::int from public.email_notification_outbox o join occ on o.occurrence_id = occ.id
  where o.category = 'proximity_confirmed' and o.occurrence_type = 'proximity_occurrence' and o.transition = 'opened'), 1, 'um aviso de afastamento');
select is((select count(*)::int from public.email_notification_outbox o join occ on o.occurrence_id = occ.alert_id), 0,
  'o alerta do afastamento não vira aviso de lacre');
select is((select count(*)::int from public.email_notification_outbox where organization_id = '20000000-0000-0000-0000-00000000000b'
  or recipient_user_id = '10000000-0000-0000-0000-000000000003'), 0, 'nada vai para o Tenant B');

-- 6. Recuperação: só depois de liberada e escolhida; um aviso por recuperação.
select is(pg_temp.call('set_notification_categories', '2', 'a', quote_literal(gen_random_uuid()),
  $$'{seal_high_critical,proximity_confirmed,seal_recovered}'::text[]$$, '1')->>'version', '2', 'o administrador libera a recuperação');
select is(pg_temp.call('set_my_email_preferences', '5', 'a', quote_literal(gen_random_uuid()),
  $$'{seal_high_critical,proximity_confirmed,seal_recovered}'::text[]$$)->>'code', 'UPDATED', 'o gestor opta pela recuperação');
update public.seal_alerts set recovered_at = now() where id = (select id from high);
select is((select count(*)::int from public.email_notification_outbox where category = 'seal_recovered' and transition = 'recovered'
  and occurrence_id = (select id from high)), 1, 'um aviso de recuperação');

-- 7. Envio: segredo do Vault, lote revalidado, conteúdo mínimo, relato idempotente; nenhuma falha muda o alerta.
select ok(not has_function_privilege('authenticated', 'public.claim_email_notifications(text, integer)', 'execute'), 'authenticated não reclama o lote');
select is(public.claim_email_notifications('errado', 10)->>'code', 'ACCESS_DENIED', 'segredo errado recusado');
create temporary table c1 as select public.claim_email_notifications(pg_temp.secret(), 10) as r;
select is((select jsonb_array_length(r->'items') from c1), 3, 'três avisos no lote');
select is((select count(*)::int from c1, jsonb_array_elements(r->'items') i where i->>'to' = (select email from auth.users where id = '10000000-0000-0000-0000-000000000005')), 3,
  'cada item leva o endereço do destinatário só para o envio');
select ok((select r::text !~ '(latitude|longitude|point|token|Praça)' from c1), 'nenhuma coordenada, endereço ou token no lote');
select is((select string_agg(distinct i->>'organization', ',') from c1, jsonb_array_elements(r->'items') i), 'Tenant A', 'o lote identifica a empresa');
select is(pg_temp.items('processing'), 3, 'reclamados');
select is(jsonb_array_length(public.claim_email_notifications(pg_temp.secret(), 10)->'items'), 0, 'reclamar de novo não devolve os mesmos');

create temporary table snapshot as select status, updated_at, context from public.seal_alerts where id = (select id from high);
create temporary table ids as select (i->>'id')::uuid as id, i->>'category' as category from c1, jsonb_array_elements(r->'items') i;
select public.report_email_delivery(pg_temp.secret(), jsonb_build_array(
  jsonb_build_object('id', (select id from ids where category = 'seal_high_critical'), 'outcome', 'sent', 'provider_ref', 'fake-1'),
  jsonb_build_object('id', (select id from ids where category = 'seal_recovered'), 'outcome', 'failed', 'error_code', 'DELIVERY_REJECTED'),
  jsonb_build_object('id', (select id from ids where category = 'proximity_confirmed'), 'outcome', 'retry', 'error_code', 'PROVIDER_UNAVAILABLE')));
select public.report_email_delivery(pg_temp.secret(), jsonb_build_array(
  jsonb_build_object('id', (select id from ids where category = 'seal_high_critical'), 'outcome', 'failed', 'error_code', 'DELIVERY_REJECTED')));
select is((select status || ':' || provider_message_ref from public.email_notification_outbox where id = (select id from ids where category = 'seal_high_critical')),
  'sent:fake-1', 'enviado; relato repetido não muda o enviado');
select is((select status || ':' || last_error_code from public.email_notification_outbox where id = (select id from ids where category = 'seal_recovered')),
  'failed:DELIVERY_REJECTED', 'erro permanente vira falha com código sanitizado');
select ok((select status = 'retry' and attempt_count = 1 and next_attempt_at > now() from public.email_notification_outbox
  where id = (select id from ids where category = 'proximity_confirmed')), 'erro transitório agenda nova tentativa');
select ok((select a.status = s.status and a.updated_at = s.updated_at and a.context = s.context from public.seal_alerts a, snapshot s
  where a.id = (select id from high)), 'a falha não muda o alerta');
select is((select count(*)::int from public.seal_alerts where device_id = 'f16a0000-0000-0000-0000-0000000000a3' and kind = 'seal_open'), 1, 'nem o duplica');

-- 8. Perder a permissão ou retirar a categoria cancela o que ainda não saiu.
update public.email_notification_outbox set next_attempt_at = now() - interval '1 second' where id = (select id from ids where category = 'proximity_confirmed');
delete from public.membership_roles where membership_id = '30000000-0000-0000-0000-000000000005';
select is(jsonb_array_length(public.claim_email_notifications(pg_temp.secret(), 10)->'items'), 0, 'quem perdeu a permissão não recebe');
select is((select status || ':' || last_error_code from public.email_notification_outbox where id = (select id from ids where category = 'proximity_confirmed')),
  'cancelled:PERMISSION_LOST', 'o pendente é cancelado com o motivo');
-- Validação humana (27/10/2026): retirar a categoria também desliga a escolha de quem optou. A tela já mostrava "desmarcada", mas o
-- banco guardava ligada, e liberar de novo voltava a enviar sem a pessoa escolher outra vez.
select is(pg_temp.call('set_notification_categories', '2', 'a', quote_literal(gen_random_uuid()),
  $$'{seal_high_critical,proximity_confirmed}'::text[]$$, '2')->>'version', '3', 'o administrador retira a recuperação');
select is((select string_agg(category, ',' order by category) from public.email_notification_preferences
  where user_id = '10000000-0000-0000-0000-000000000005' and enabled), 'proximity_confirmed,seal_high_critical', 'a escolha da recuperação foi desligada; as outras ficam');
select is((select metadata->>'preferences_turned_off' from public.audit_logs where action = 'notification.categories_update'
  and organization_id = '20000000-0000-0000-0000-00000000000a' order by occurred_at desc, id desc limit 1), '1', 'a auditoria conta as escolhas desligadas');
select pg_temp.call('set_notification_categories', '2', 'a', quote_literal(gen_random_uuid()),
  $$'{seal_high_critical,proximity_confirmed,seal_recovered}'::text[]$$, '3');
select ok(not (select enabled from public.email_notification_preferences where user_id = '10000000-0000-0000-0000-000000000005'
  and category = 'seal_recovered'), 'liberar de novo não religa a escolha: a pessoa escolhe outra vez');

-- 9. Estado do envio no detalhe do alerta: sem destinatário; só para quem lê o alerta; nada de outra empresa.
create temporary table d as select pg_temp.call('get_email_deliveries', '2', 'a', quote_literal((select id from high))) as r;
select is((select r->>'code' from d), 'FOUND', 'o administrador vê o estado dos avisos do alerta');
select is((select string_agg(e->>'transition' || ':' || (e->>'status'), ',' order by e->>'transition') from d, jsonb_array_elements(r->'items') e),
  'opened:sent,recovered:failed', 'abertura enviada e recuperação com falha');
select ok((select r::text !~ '(recipient|@|user_id)' from d), 'sem destinatário nem endereço');
select is(pg_temp.call('get_email_deliveries', '4', 'a', quote_literal((select id from high)))->>'code', 'ACCESS_DENIED', 'sem seal.read não vê');
select is(public.get_email_deliveries('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001570b3', '20000000-0000-0000-0000-00000000000b',
  (select id from high))->>'code', 'NOT_FOUND', 'alerta do A pelo B: inexistente');

select * from finish();
rollback;

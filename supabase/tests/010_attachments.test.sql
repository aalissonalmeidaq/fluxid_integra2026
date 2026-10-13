begin;
select plan(57);

-- Spec 010, US3 e US4 (T048, T063): fotos e assinatura da entrega. `attach_trip_evidence` grava em duas fases e de forma idempotente, com limite de 3 fotos e
-- 1 assinatura por entrega, janela de 7 dias depois da conclusão e o tipo conferido; a tabela é imutável; a foto é lida com `trip.read` e a assinatura só com
-- `trip.recipient`; o bucket é privado e sem escrita de cliente; evento e auditoria dizem só contagens. Dois tenants. Hermético: desfeito pelo rollback.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001003a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001003b3', 'aal1');

-- Um auditor (só vê) e um operador de estoque (opera e vê fotos, sem trip.recipient) no Tenant A.
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000001003d1', 'authenticated', 'authenticated', 'anx-auditor@example.invalid'),
  ('10000000-0000-0000-0000-0000001003c1', 'authenticated', 'authenticated', 'anx-operador@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000001003d1', 'Auditor Anexos'), ('10000000-0000-0000-0000-0000001003c1', 'Operador Anexos');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000001003d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000001003d1', 'active', now()),
  ('30000000-0000-0000-0000-0000001003c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000001003c1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000001003d1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'tenant_auditor';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000001003c1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'stock_operator';
select public.start_user_session('10000000-0000-0000-0000-0000001003d1', '60000000-0000-0000-0000-0000001003d1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000001003c1', '60000000-0000-0000-0000-0000001003c1', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state)
  select ('92000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade ' || n, '01001000', 'Praça da Sé', n::text, 'São Paulo', 'SP' from generate_series(1, 4) n;
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('95000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'ANX1001', 'truck', 20),
  ('95000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', 'ANX1002', 'truck', 20);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until)
  select ('96000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', 'Motorista ' || n, 'x' || n, 'y' || n, 'D', (now() at time zone 'America/Sao_Paulo')::date + 365 from generate_series(1, 2) n;
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'ANX-' || lpad(n::text, 3, '0'), 'in_stock', 'approved', (now() at time zone 'America/Sao_Paulo')::date + 200
    from generate_series(1, 4) n;

create function pg_temp.cy(n integer) returns uuid language sql as $$ select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.ver(p_trip uuid) returns bigint language sql as $$ select version from public.trips where id = p_trip $$;
-- Viagem em andamento com uma parada (um cilindro), a chegada e a entrega registradas. Devolve a viagem e a entrega.
create function pg_temp.sail(p_vehicle integer, p_cyl integer) returns uuid[] language plpgsql as $$
declare
  u constant uuid := '10000000-0000-0000-0000-000000000002'; s constant uuid := '60000000-0000-0000-0000-0000001003a2'; o constant uuid := '20000000-0000-0000-0000-00000000000a';
  t uuid; stop uuid; d uuid;
begin
  t := (public.create_trip(u, s, o, gen_random_uuid(), (now() at time zone 'America/Sao_Paulo')::date, ('95000000-0000-0000-0000-' || lpad(p_vehicle::text, 12, '0'))::uuid,
    ('96000000-0000-0000-0000-' || lpad(p_vehicle::text, 12, '0'))::uuid, null,
    jsonb_build_array(jsonb_build_object('site_id', ('92000000-0000-0000-0000-' || lpad(p_vehicle::text, 12, '0'))::uuid, 'cylinder_ids', jsonb_build_array(pg_temp.cy(p_cyl))))) ->> 'trip_id')::uuid;
  perform public.start_loading(u, s, o, gen_random_uuid(), t, pg_temp.ver(t));
  perform public.check_item(u, s, o, gen_random_uuid(), t, (select id from public.trip_items where trip_id = t and cylinder_id = pg_temp.cy(p_cyl)));
  perform public.start_trip(u, s, o, gen_random_uuid(), t, pg_temp.ver(t));
  stop := (select id from public.trip_stops where trip_id = t);
  perform public.arrive_stop(u, s, o, gen_random_uuid(), t, stop, now() - interval '5 minutes', null, null, null, null, null, null);
  d := (public.register_delivery(u, s, o, gen_random_uuid(), t, stop, now() - interval '2 minutes', 'Recebedor Fictício', null, null, null, false,
    jsonb_build_array(jsonb_build_object('item_id', (select id from public.trip_items where trip_id = t), 'delivered', true)), null, null, null, null, null, null) ->> 'delivery_id')::uuid;
  return array[t, d];
end $$;

create temp table sa as select pg_temp.sail(1, 1) as ids;
create temp table t as select ids[1] as trip, ids[2] as delivery from sa;
-- Segunda viagem (outro veículo e cilindro), usada para a janela depois da conclusão.
create temp table sb as select pg_temp.sail(2, 2) as ids;
create temp table t2 as select ids[1] as trip, ids[2] as delivery from sb;

-- Anexo: valida (fase 1) ou grava (fase 2), como administrador do A, salvo quando outro ator é informado.
create function pg_temp.att(p_delivery uuid, p_id uuid, p_kind text, p_position integer, p_sha text, p_confirm boolean default true,
  p_size integer default 1000, p_type text default null, p_later boolean default false,
  p_user uuid default '10000000-0000-0000-0000-000000000002', p_session uuid default '60000000-0000-0000-0000-0000001003a2', p_org uuid default '20000000-0000-0000-0000-00000000000a')
returns jsonb language sql as $$
  select public.attach_trip_evidence(p_user, p_session, p_org, p_delivery, p_id, p_kind, p_position, coalesce(p_type, case when p_kind = 'photo' then 'image/jpeg' else 'image/png' end),
    p_size, p_sha, now() - interval '1 minute', p_later, p_confirm)
$$;
create function pg_temp.id(n integer) returns uuid language sql as $$ select ('a0000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.sha(c text) returns text language sql as $$ select repeat(c, 64) $$;

-- Fase 1 (validar) não grava nada e devolve o caminho canônico.
select is(pg_temp.att((select delivery from t), pg_temp.id(1), 'photo', 1, pg_temp.sha('a'), false) ->> 'code', 'READY', 'fase de validação: pronto');
select is(pg_temp.att((select delivery from t), pg_temp.id(1), 'photo', 1, pg_temp.sha('a'), false) ->> 'storage_path',
  '20000000-0000-0000-0000-00000000000a/' || (select trip from t) || '/' || (select delivery from t) || '/' || pg_temp.id(1) || '.jpg', 'caminho canônico organização/viagem/entrega/anexo.jpg');
select is((select count(*)::int from public.trip_delivery_attachments), 0, 'a fase de validação não grava linha');

-- Fase 2 grava, de forma idempotente.
select is(pg_temp.att((select delivery from t), pg_temp.id(1), 'photo', 1, pg_temp.sha('a')) ->> 'code', 'ATTACHED', 'grava a foto 1');
select is(pg_temp.att((select delivery from t), pg_temp.id(1), 'photo', 1, pg_temp.sha('a')) ->> 'code', 'REPLAYED', 'mesmo anexo e mesmo resumo: repetição, sem duplicar');
select is((select count(*)::int from public.trip_delivery_attachments), 1, 'uma só linha depois da repetição');
select is((select count(*)::int from public.trip_events where trip_id = (select trip from t) and event_type = 'evidence_attached'), 1, 'um só evento depois da repetição');
select is(pg_temp.att((select delivery from t), pg_temp.id(1), 'photo', 1, pg_temp.sha('b')) ->> 'code', 'ATTACHMENT_CONFLICT', 'mesmo id com outro resumo: conflito');
select is(pg_temp.att((select delivery from t), pg_temp.id(2), 'photo', 1, pg_temp.sha('c')) ->> 'code', 'ATTACHMENT_LIMIT', 'a posição da foto já está ocupada');
select is(pg_temp.att((select delivery from t), pg_temp.id(2), 'photo', 2, pg_temp.sha('c'), true, 1000, null, true) ->> 'code', 'ATTACHED', 'foto 2 (acrescentada depois)');
select is((select added_later from public.trip_delivery_attachments where id = pg_temp.id(2)), true, 'marca o anexo acrescentado depois');
select is(pg_temp.att((select delivery from t), pg_temp.id(3), 'photo', 3, pg_temp.sha('d')) ->> 'code', 'ATTACHED', 'foto 3');
select is(pg_temp.att((select delivery from t), pg_temp.id(4), 'photo', 3, pg_temp.sha('e')) ->> 'code', 'ATTACHMENT_LIMIT', 'a quarta foto é recusada');
select is(pg_temp.att((select delivery from t), pg_temp.id(4), 'photo', 4, pg_temp.sha('e')) ->> 'code', 'VALIDATION_FAILED', 'posição 4 não existe');
select is(pg_temp.att((select delivery from t), pg_temp.id(5), 'signature', 0, pg_temp.sha('f')) ->> 'code', 'ATTACHED', 'grava a assinatura (posição 0)');
select is(pg_temp.att((select delivery from t), pg_temp.id(6), 'signature', 0, pg_temp.sha('0')) ->> 'code', 'ATTACHMENT_LIMIT', 'só uma assinatura por entrega');

-- Validações do tipo, do tamanho e do resumo.
select is(pg_temp.att((select delivery from t), pg_temp.id(7), 'photo', 1, pg_temp.sha('1'), true, 1000, 'image/png') ->> 'code', 'VALIDATION_FAILED', 'foto só JPEG');
select is(pg_temp.att((select delivery from t), pg_temp.id(7), 'signature', 0, pg_temp.sha('1'), true, 1000, 'image/jpeg') ->> 'code', 'VALIDATION_FAILED', 'assinatura só PNG');
select is(pg_temp.att((select delivery from t), pg_temp.id(7), 'photo', 1, pg_temp.sha('1'), true, 1572865) ->> 'code', 'VALIDATION_FAILED', 'foto acima de 1,5 MB');
select is(pg_temp.att((select delivery from t), pg_temp.id(7), 'signature', 0, pg_temp.sha('1'), true, 204801) ->> 'code', 'VALIDATION_FAILED', 'assinatura acima de 200 KB');
select is(pg_temp.att((select delivery from t), pg_temp.id(7), 'photo', 1, 'xyz') ->> 'code', 'VALIDATION_FAILED', 'resumo inválido');

-- Permissão e isolamento.
select is(pg_temp.att((select delivery from t), pg_temp.id(8), 'photo', 1, pg_temp.sha('2'), true, 1000, null, false, '10000000-0000-0000-0000-0000001003d1', '60000000-0000-0000-0000-0000001003d1') ->> 'code', 'ACCESS_DENIED', 'quem só vê não anexa');
select is(pg_temp.att((select delivery from t), pg_temp.id(8), 'photo', 1, pg_temp.sha('2'), true, 1000, null, false, '10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001003b3', '20000000-0000-0000-0000-00000000000b') ->> 'code', 'DELIVERY_NOT_FOUND', 'Tenant B não anexa à entrega do Tenant A');
select is(pg_temp.att(gen_random_uuid(), pg_temp.id(8), 'photo', 1, pg_temp.sha('2')) ->> 'code', 'DELIVERY_NOT_FOUND', 'entrega inexistente');

-- Janela: concluída há 8 dias fecha; em andamento e concluída há pouco abrem.
select is(pg_temp.att((select delivery from t2), pg_temp.id(20), 'photo', 1, pg_temp.sha('3')) ->> 'code', 'ATTACHED', 'viagem em andamento aceita');
select is(public.complete_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001003a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), (select trip from t2), pg_temp.ver((select trip from t2))) ->> 'code', 'COMPLETED', 'conclui a segunda viagem');
select is(pg_temp.att((select delivery from t2), pg_temp.id(21), 'photo', 2, pg_temp.sha('4')) ->> 'code', 'ATTACHED', 'concluída há pouco aceita');
alter table public.trips disable trigger user;
update public.trips set completed_at = now() - interval '8 days' where id = (select trip from t2);
alter table public.trips enable trigger user;
select is(pg_temp.att((select delivery from t2), pg_temp.id(22), 'photo', 3, pg_temp.sha('5')) ->> 'code', 'ATTACHMENT_WINDOW_CLOSED', 'concluída há mais de 7 dias fecha a janela');

-- Imutabilidade.
select throws_ok($$ update public.trip_delivery_attachments set position = 2 where id = 'a0000000-0000-0000-0000-000000000001' $$, null, null, 'anexo não se altera');
select throws_ok($$ delete from public.trip_delivery_attachments where id = 'a0000000-0000-0000-0000-000000000001' $$, null, null, 'anexo não se exclui');

-- Evento e auditoria: só contagens.
select is((select data from public.trip_events where trip_id = (select trip from t) and event_type = 'evidence_attached' order by sequence desc limit 1)::jsonb ->> 'photo_count', '3', 'o evento diz quantas fotos');
select is(((select data from public.trip_events where trip_id = (select trip from t) and event_type = 'evidence_attached' order by sequence desc limit 1)::jsonb ->> 'has_signature')::boolean, true, 'o evento diz se há assinatura');
select is((select count(*)::int from public.trip_events where trip_id = (select trip from t) and event_type = 'evidence_attached' and (data::text ~* 'storage|path|jpg|png|sha|a0000000')), 0, 'o evento não leva caminho, nome de arquivo nem identificador do anexo');
select is((select count(*)::int from public.audit_logs where action = 'trip.evidence_attach' and (metadata::text ~* 'storage|path|jpg|png|sha|recebedor')), 0, 'a auditoria não leva caminho nem nome');
select ok((select count(*)::int from public.audit_logs where action = 'trip.evidence_attach' and organization_id = '20000000-0000-0000-0000-00000000000a') >= 5, 'cada anexo gravado é auditado');

-- Bucket privado, 2 MB, só JPEG e PNG.
select is((select public from storage.buckets where id = 'trip-evidence'), false, 'bucket privado');
select is((select file_size_limit from storage.buckets where id = 'trip-evidence'), 2097152::bigint, 'bucket com limite de 2 MB');
select is((select allowed_mime_types from storage.buckets where id = 'trip-evidence'), array['image/jpeg', 'image/png'], 'bucket só JPEG e PNG');

-- Leitura (RLS): foto com trip.read, assinatura só com trip.recipient; Tenant B não lê nada do A; o cliente não escreve.
insert into storage.objects (bucket_id, name, owner_id, metadata)
  select 'trip-evidence', a.storage_path, null, '{"mimetype":"image/jpeg","size":1000}' from public.trip_delivery_attachments a;

create function public.tap_act_as(uid uuid, sid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'session_id', sid, 'aal', 'aal1')::text, true);
end;
$$;
grant execute on function public.tap_act_as(uuid, uuid) to authenticated, anon;

set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-0000001003c1', '60000000-0000-0000-0000-0000001003c1');
select is((select count(*)::int from public.trip_delivery_attachments where kind = 'photo'), 5, 'operador (trip.read) lê as fotos');
select is((select count(*)::int from public.trip_delivery_attachments where kind = 'signature'), 0, 'operador sem trip.recipient não lê a assinatura');
select is((select count(*)::int from storage.objects where bucket_id = 'trip-evidence' and name like '%.png'), 0, 'operador não lê o objeto da assinatura');
select is((select count(*)::int from storage.objects where bucket_id = 'trip-evidence' and name like '%.jpg'), 5, 'operador lê os objetos das fotos');
select public.tap_act_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001003a2');
select is((select count(*)::int from public.trip_delivery_attachments where kind = 'signature'), 1, 'administrador (trip.recipient) lê a assinatura');
select throws_ok($$ insert into public.trip_delivery_attachments (id, organization_id, delivery_id, trip_id, stop_id, kind, position, storage_path, content_type, size_bytes, sha256, captured_at, created_by)
  select gen_random_uuid(), organization_id, delivery_id, trip_id, stop_id, 'photo', 1, storage_path, content_type, 1, sha256, captured_at, created_by from public.trip_delivery_attachments limit 1 $$, '42501', null, 'o cliente não grava anexo');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('trip-evidence', 'x/y.jpg') $$, '42501', null, 'o cliente não grava no bucket');
select public.tap_act_as('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001003b3');
select is((select count(*)::int from public.trip_delivery_attachments), 0, 'Tenant B não lê nenhum anexo do Tenant A');
select is((select count(*)::int from storage.objects where bucket_id = 'trip-evidence'), 0, 'Tenant B não lê nenhum objeto do Tenant A');
reset role;

-- Consultas servidor: leitura do caminho e lista por viagem.
select is(public.query_attachment_target('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001003a2', '20000000-0000-0000-0000-00000000000a', pg_temp.id(5)) ->> 'code', 'OK', 'administrador obtém o alvo da assinatura');
select is(public.query_attachment_target('10000000-0000-0000-0000-0000001003c1', '60000000-0000-0000-0000-0000001003c1', '20000000-0000-0000-0000-00000000000a', pg_temp.id(5)) ->> 'code', 'NOT_FOUND', 'sem trip.recipient a assinatura é "não encontrada"');
select is(public.query_attachment_target('10000000-0000-0000-0000-0000001003c1', '60000000-0000-0000-0000-0000001003c1', '20000000-0000-0000-0000-00000000000a', pg_temp.id(1)) ->> 'code', 'OK', 'trip.read obtém o alvo da foto');
select is(public.query_attachment_target('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001003b3', '20000000-0000-0000-0000-00000000000b', pg_temp.id(1)) ->> 'code', 'NOT_FOUND', 'Tenant B recebe "não encontrado", igual ao inexistente');
select is(public.query_attachment_target('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001003a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid()) ->> 'code', 'NOT_FOUND', 'anexo inexistente');
select is((public.query_trip_attachments('10000000-0000-0000-0000-0000001003c1', '60000000-0000-0000-0000-0000001003c1', '20000000-0000-0000-0000-00000000000a', (select trip from t)) -> 'deliveries' -> 0 ->> 'photo_count')::int, 3, 'a lista traz a contagem de fotos');
select is(jsonb_array_length(public.query_trip_attachments('10000000-0000-0000-0000-0000001003c1', '60000000-0000-0000-0000-0000001003c1', '20000000-0000-0000-0000-00000000000a', (select trip from t)) -> 'deliveries' -> 0 -> 'attachments'), 3, 'quem não vê a assinatura recebe só as 3 fotos na lista');
select is(public.query_trip_attachments('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001003b3', '20000000-0000-0000-0000-00000000000b', (select trip from t)) ->> 'code', 'NOT_FOUND', 'Tenant B não lista anexos do Tenant A');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('attach_trip_evidence', 'query_attachment_target', 'query_trip_attachments')), 3, 'uma só assinatura de cada função');
select is(has_function_privilege('service_role', 'public.attach_trip_evidence(uuid, uuid, uuid, uuid, uuid, text, integer, text, integer, text, timestamptz, boolean, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.attach_trip_evidence(uuid, uuid, uuid, uuid, uuid, text, integer, text, integer, text, timestamptz, boolean, boolean)', 'execute'), true, 'só a service_role executa');

select * from finish();
rollback;

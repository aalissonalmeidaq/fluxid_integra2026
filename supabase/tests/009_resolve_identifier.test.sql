begin;
select plan(31);

-- Spec 009, Fundação: consulta `resolve` (RF-002, RF-003, RF-007, RN-005, CA-001). Hermético: desfeito pelo rollback.
-- O Tenant B prova o isolamento; o operador técnico (cylinder.read sem trip.read) prova que a viagem só aparece a quem pode vê-la.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000900a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000900b3', 'aal1');

insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000009c1', 'authenticated', 'authenticated', 'field-driver@example.invalid'),
  ('10000000-0000-0000-0000-0000000009e1', 'authenticated', 'authenticated', 'field-technician@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000009c1', 'Motorista Campo'), ('10000000-0000-0000-0000-0000000009e1', 'Técnico Campo');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000009c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000009c1', 'active', now()),
  ('30000000-0000-0000-0000-0000000009e1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000009e1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000009c1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'driver';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000009e1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'technical_operator';
select public.start_user_session('10000000-0000-0000-0000-0000000009c1', '60000000-0000-0000-0000-0000000900c1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000009e1', '60000000-0000-0000-0000-0000000900e1', 'aal1');

-- Dados: cilindros do Tenant A (1 a 6) e um do Tenant B, com identificadores de cada tipo.
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('91000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('92000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '91000000-0000-0000-0000-00000000000a', 'Unidade 1', '01001000', 'Praça da Sé', '1', 'São Paulo', 'SP');
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('95000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'FLD1001', 'truck', 20);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('96000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'Motorista 1', 'x1', 'y1', 'D', current_date + 365);
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('97000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('97000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on)
  select ('98000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000a', '97000000-0000-0000-0000-00000000000a', 'FLD-' || lpad(n::text, 3, '0'), 'in_stock', 'approved', current_date + 200
    from generate_series(1, 6) n;
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status, hydro_last_result, hydro_next_due_on) values
  ('98000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', '97000000-0000-0000-0000-00000000000b', 'FLD-B01', 'in_stock', 'approved', current_date + 200);
update public.cylinders set status = 'inactive', stock_status = 'out_of_stock', inactivation_reason = 'written_off' where id = '98000000-0000-0000-0000-000000000005';
insert into public.cylinder_identifiers (id, organization_id, cylinder_id, kind, value) values
  ('99000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000001', 'qr_code', 'QR-009-0001'),
  ('99000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000002', 'nfc_tag', '04A23B1C'),
  ('99000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000003', 'nfc_tag', '04:A2:3B:1D'),
  ('99000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000005', 'qr_code', 'QR-009-0005'),
  ('99000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000006', 'qr_code', 'QR-SHARED'),
  ('99000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', '98000000-0000-0000-0000-0000000000b1', 'qr_code', 'QR-SHARED'),
  ('99000000-0000-0000-0000-0000000000b2', '20000000-0000-0000-0000-00000000000b', '98000000-0000-0000-0000-0000000000b1', 'qr_code', 'QR-B-0001');
insert into public.cylinder_identifiers (id, organization_id, cylinder_id, kind, value, status, deactivated_at, deactivated_by, deactivation_justification) values
  ('99000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-00000000000a', '98000000-0000-0000-0000-000000000004', 'qr_code', 'QR-009-OLD', 'deactivated', now(), '10000000-0000-0000-0000-000000000002', 'etiqueta trocada');

-- Viagem planejada com o cilindro 1 (reserva aberta), criada pelo administrador do A.
select public.create_trip('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000900a2', '20000000-0000-0000-0000-00000000000a', gen_random_uuid(), current_date,
  '95000000-0000-0000-0000-000000000001', '96000000-0000-0000-0000-000000000001', null,
  jsonb_build_array(jsonb_build_object('site_id', '92000000-0000-0000-0000-000000000001', 'cylinder_ids', jsonb_build_array('98000000-0000-0000-0000-000000000001'))));

create function pg_temp.resolve(p_user uuid, p_session uuid, p_org uuid, p_candidates text[], p_kind text default null) returns jsonb language sql as $$
  select public.query_identifier_resolve(p_user, p_session, p_org, p_candidates, p_kind)
$$;
create function pg_temp.adm(p_candidates text[], p_kind text default null) returns jsonb language sql as $$
  select pg_temp.resolve('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000900a2', '20000000-0000-0000-0000-00000000000a', p_candidates, p_kind)
$$;
create function pg_temp.adm_b(p_candidates text[]) returns jsonb language sql as $$
  select pg_temp.resolve('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000900b3', '20000000-0000-0000-0000-00000000000b', p_candidates)
$$;
create function pg_temp.tec(p_candidates text[]) returns jsonb language sql as $$
  select pg_temp.resolve('10000000-0000-0000-0000-0000000009e1', '60000000-0000-0000-0000-0000000900e1', '20000000-0000-0000-0000-00000000000a', p_candidates)
$$;

-- Resolução feliz.
select is(pg_temp.adm(array['QR-009-0001']) ->> 'code', 'FOUND', 'identificador ativo da organização é encontrado');
select is(pg_temp.adm(array['QR-009-0001']) -> 'cylinder' ->> 'id', '98000000-0000-0000-0000-000000000001', 'devolve o cilindro certo');
select is(pg_temp.adm(array['QR-009-0001']) -> 'identifier' ->> 'kind', 'qr_code', 'e o tipo do identificador');
select is((pg_temp.adm(array['QR-009-0001']) ->> 'matched')::int, 0, 'o primeiro candidato que casa é o índice 0');
select is((pg_temp.adm(array['NAO-EXISTE', '04A23B1C']) ->> 'matched')::int, 1, 'o segundo candidato casa e o índice é 1');
select is(pg_temp.adm(array['04A23B1D', '04:A2:3B:1D']) -> 'cylinder' ->> 'id', '98000000-0000-0000-0000-000000000003', 'NFC cadastrado com dois-pontos casa pelo segundo candidato');
select is(pg_temp.adm(array['qr-009-0001']) ->> 'code', 'FOUND', 'a busca ignora maiúsculas e minúsculas');
select is(pg_temp.adm(array['QR-009-0001'], 'nfc_tag') ->> 'code', 'NOT_FOUND', 'o tipo esperado restringe a busca');
select is(pg_temp.adm(array['04A23B1C'], 'nfc_tag') ->> 'code', 'FOUND', 'e com o tipo certo casa');

-- RN-005, CA-001: código inexistente e código de outra organização recebem a mesma resposta.
select is(pg_temp.adm(array['NAO-EXISTE']), '{"code":"NOT_FOUND"}'::jsonb, 'código inexistente: só NOT_FOUND');
select is(pg_temp.adm(array['QR-B-0001']), '{"code":"NOT_FOUND"}'::jsonb, 'código do Tenant B visto pelo A: a mesma resposta, sem nenhum dado');
select is(pg_temp.adm_b(array['QR-B-0001']) ->> 'code', 'FOUND', 'o Tenant B encontra o seu código');
select isnt(pg_temp.adm(array['QR-SHARED']) -> 'cylinder' ->> 'id', pg_temp.adm_b(array['QR-SHARED']) -> 'cylinder' ->> 'id', 'o mesmo valor em duas organizações resolve cada um para o seu cilindro');
select is(pg_temp.adm_b(array['QR-009-0001']), '{"code":"NOT_FOUND"}'::jsonb, 'e o Tenant B não encontra o código do A');

-- Identificador desativado e cilindro inativo.
select is(pg_temp.adm(array['QR-009-OLD']) ->> 'code', 'NOT_FOUND', 'identificador desativado não identifica o cilindro');
select is((pg_temp.adm(array['QR-009-OLD']) ->> 'deactivated')::boolean, true, 'mas avisa que foi desativado');
select is((select array_agg(k order by k) from jsonb_object_keys(pg_temp.adm(array['QR-009-OLD']) -> 'cylinder') k), array['id', 'serial_number'], 'e mostra só o mínimo do cilindro a que valia');
select is(pg_temp.adm(array['QR-009-0005']) -> 'cylinder' ->> 'status', 'inactive', 'cilindro inativo é encontrado e informa a situação');

-- A viagem só aparece a quem tem trip.read.
select is(pg_temp.adm(array['QR-009-0001']) -> 'trip' ->> 'status', 'planned', 'com trip.read, traz a viagem que reserva o cilindro');
select isnt(pg_temp.adm(array['QR-009-0001']) -> 'trip' ->> 'number', null, 'com o número da viagem');
select is(pg_temp.tec(array['QR-009-0001']) ->> 'code', 'FOUND', 'o operador técnico (cylinder.read) encontra o cilindro');
select ok(not (pg_temp.tec(array['QR-009-0001']) ? 'trip'), 'mas sem trip.read não vê a viagem');
select ok(not (pg_temp.adm(array['04A23B1C']) ? 'trip'), 'cilindro fora de viagem aberta não traz viagem');

-- Validação.
select is(pg_temp.adm(array[]::text[]) ->> 'code', 'VALIDATION_FAILED', 'lista vazia é recusada');
select is(pg_temp.adm(array['a', 'b', 'c', 'd']) ->> 'code', 'VALIDATION_FAILED', 'mais de 3 candidatos é recusado');
select is(pg_temp.adm(array[repeat('x', 201)]) ->> 'code', 'VALIDATION_FAILED', 'candidato com mais de 200 caracteres é recusado');
select is(pg_temp.adm(array[E'a\nb']) ->> 'code', 'VALIDATION_FAILED', 'candidato com quebra de linha é recusado');

-- Permissão, sessão e auditoria.
select is(pg_temp.resolve('10000000-0000-0000-0000-0000000009c1', '60000000-0000-0000-0000-0000000900c1', '20000000-0000-0000-0000-00000000000a', array['QR-009-0001']) ->> 'code', 'ACCESS_DENIED', 'sem cylinder.read (motorista) é negado');
select is(pg_temp.resolve('10000000-0000-0000-0000-000000000002', gen_random_uuid(), '20000000-0000-0000-0000-00000000000a', array['QR-009-0001']) ->> 'code', 'AUTH_REQUIRED', 'sessão que não é do ator é recusada');
select is((select count(*)::int from public.audit_logs where metadata::text ~* 'QR-009|04A23B|04:A2:3B'), 0, 'nenhuma auditoria guarda o valor lido');
select is(has_function_privilege('authenticated', 'public.query_identifier_resolve(uuid, uuid, uuid, text[], text)', 'execute') or has_function_privilege('anon', 'public.query_identifier_resolve(uuid, uuid, uuid, text[], text)', 'execute'), false, 'ninguém além do servidor executa a consulta');

select * from finish();
rollback;

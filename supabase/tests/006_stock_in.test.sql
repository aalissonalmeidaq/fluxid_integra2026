begin;
select plan(52);

-- Spec 006, US3: query_cylinder_lookup e stock_in_cylinder, idempotente por chave de operação (RF-013 a RF-017, CA-002, MS-003). Hermético.
delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');

insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';

insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000006a1', 'authenticated', 'authenticated', 's-stock@example.invalid'),
  ('10000000-0000-0000-0000-0000000006a2', 'authenticated', 'authenticated', 's-tech@example.invalid');
insert into public.profiles (user_id, display_name) values
  ('10000000-0000-0000-0000-0000000006a1', 'Estoquista'), ('10000000-0000-0000-0000-0000000006a2', 'Técnico');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000006a1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000006a1', 'active', now()),
  ('30000000-0000-0000-0000-0000000006a2', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000006a2', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000006a1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r
   where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'stock_operator';
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000006a2', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r
   where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'technical_operator';

select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000600b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000006a1', '60000000-0000-0000-0000-0000000600a1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000006a2', '60000000-0000-0000-0000-0000000600a4', 'aal1');

-- Massa. A: X1 em dia, X2 vencido, X3 reprovado, X4 inativo, X5 já em estoque, X6 com identificador desativado. B: Y1 com o mesmo valor de X1.
insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('71000000-0000-0000-0000-0000000006a1', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('71000000-0000-0000-0000-0000000006b1', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, hydro_last_result, hydro_next_due_on) values
  ('72000000-0000-0000-0000-0000000006f1', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'X1', 'approved', current_date + 200),
  ('72000000-0000-0000-0000-0000000006f2', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'X2', 'approved', current_date - 2),
  ('72000000-0000-0000-0000-0000000006f3', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'X3', 'rejected', null),
  ('72000000-0000-0000-0000-0000000006f6', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'X6', null, null);
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, status, inactivation_reason) values
  ('72000000-0000-0000-0000-0000000006f4', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'X4', 'inactive', 'lost');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status) values
  ('72000000-0000-0000-0000-0000000006f5', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'X5', 'in_stock');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('72000000-0000-0000-0000-0000000006e1', '20000000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-0000000006b1', 'Y1');
insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value) values
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f1', 'qr_code', 'QR-X1'),
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f2', 'qr_code', 'QR-X2'),
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f3', 'qr_code', 'QR-X3'),
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f4', 'qr_code', 'QR-X4'),
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f5', 'qr_code', 'QR-X5'),
  ('20000000-0000-0000-0000-00000000000b', '72000000-0000-0000-0000-0000000006e1', 'qr_code', 'QR-X1');
insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value, status, deactivated_at, deactivated_by, deactivation_justification) values
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f6', 'nfc_tag', 'NFC-ANTIGA', 'deactivated', now(), '10000000-0000-0000-0000-000000000002', 'Etiqueta perdida');

create temp table ids as select
  '10000000-0000-0000-0000-000000000002'::uuid as a, '60000000-0000-0000-0000-0000000600a2'::uuid as sa,
  '10000000-0000-0000-0000-000000000003'::uuid as b, '60000000-0000-0000-0000-0000000600b3'::uuid as sb,
  '10000000-0000-0000-0000-0000000006a1'::uuid as e, '60000000-0000-0000-0000-0000000600a1'::uuid as se,
  '10000000-0000-0000-0000-0000000006a2'::uuid as t, '60000000-0000-0000-0000-0000000600a4'::uuid as st,
  '20000000-0000-0000-0000-00000000000a'::uuid as oa, '20000000-0000-0000-0000-00000000000b'::uuid as ob;

-- 1-9. Busca por identificador.
select is((select public.query_cylinder_lookup(a, sa, oa, '  qr-x1 ')->>'code' from ids), 'FOUND', 'lookup encontra pelo identificador (caixa e espaços ignorados)');
select is((select public.query_cylinder_lookup(a, sa, oa, 'QR-X1')->'cylinder'->>'serial_number' from ids), 'X1', 'e devolve o cilindro dono');
select is((select public.query_cylinder_lookup(a, sa, oa, 'QR-X2')->'cylinder'->>'hydro_status' from ids), 'vencido', 'com a situação do teste');
select is((select public.query_cylinder_lookup(b, sb, ob, 'QR-X1')->'cylinder'->>'serial_number' from ids), 'Y1', 'o mesmo valor em B devolve o cilindro de B');
select is((select public.query_cylinder_lookup(a, sa, oa, 'QR-NAO-EXISTE')::text from ids), '{"code": "NOT_FOUND"}', 'identificador desconhecido: NOT_FOUND');
select is((select public.query_cylinder_lookup(a, sa, oa, 'NFC-ANTIGA')->>'deactivated' from ids), 'true', 'identificador desativado: informa que foi desativado');
select is((select public.query_cylinder_lookup(a, sa, oa, 'NFC-ANTIGA')->'cylinder'->>'serial_number' from ids), 'X6', 'e a quem pertencia');
select is((select public.query_cylinder_lookup(a, sa, oa, '   ')->>'code' from ids), 'VALIDATION_FAILED', 'valor vazio: VALIDATION_FAILED');
select is((select public.query_cylinder_lookup('10000000-0000-0000-0000-0000000006a2', '60000000-0000-0000-0000-0000000600a4', oa, 'QR-X1')->>'code' from ids), 'FOUND', 'técnico (cylinder.read) também consulta');

-- 10-18. Entrada com sucesso.
create temp table first_in as
  select public.stock_in_cylinder(a, sa, oa, 'qr-x1', '9b2f6d52-6f5a-4a58-8d31-0f8d9f0b4c11') as r from ids;
select is((select r->>'code' from first_in), 'STOCKED', 'entrada registrada');
select is((select r->>'replayed' from first_in), 'false', 'primeira vez: não é repetição');
select is((select stock_status || '/' || version from public.cylinders where id = '72000000-0000-0000-0000-0000000006f1'), 'in_stock/2', 'a situação passa para em estoque e a versão sobe');
select is((select r->'cylinder'->>'serial_number' from first_in), 'X1', 'a resposta traz o cilindro');
select is((select r->>'hydro_status' from first_in), 'em_dia', 'e a situação do teste');
select is((select r->'warning' from first_in), 'null'::jsonb, 'sem aviso quando o teste está em dia');
select is((select count(*)::int from public.cylinder_events where cylinder_id = '72000000-0000-0000-0000-0000000006f1' and event_type = 'stock_in'), 1, 'um evento stock_in');
select is((select e.data->>'hydro_status' from public.cylinder_events e where e.cylinder_id = '72000000-0000-0000-0000-0000000006f1' and e.event_type = 'stock_in'), 'em_dia', 'o evento guarda a situação do teste no momento (RF-017)');
select is((select count(*)::int from public.audit_logs where action = 'cylinder.stock_in' and result = 'success' and target_id = '72000000-0000-0000-0000-0000000006f1'), 1, 'uma auditoria cylinder.stock_in');

-- 19-24. Idempotência: 10 repetições com a mesma chave = 1 evento e a mesma resposta (CA-002).
create temp table reps as
  select n, public.stock_in_cylinder(a, sa, oa, 'QR-X1', '9b2f6d52-6f5a-4a58-8d31-0f8d9f0b4c11') as r from ids, generate_series(1, 10) n;
select is((select count(*)::int from reps where r->>'replayed' = 'true'), 10, 'as 10 repetições são reconhecidas como repetição');
select is((select count(distinct (r - 'replayed')::text)::int from reps), 1, 'todas devolvem a mesma resposta');
select is((select (r - 'replayed') from reps limit 1), (select r - 'replayed' from first_in), 'e ela é igual à da primeira vez');
select is((select count(*)::int from public.cylinder_events where cylinder_id = '72000000-0000-0000-0000-0000000006f1' and event_type = 'stock_in'), 1, 'continua um único evento');
select is((select version from public.cylinders where id = '72000000-0000-0000-0000-0000000006f1'), 2::bigint, 'a versão não sobe nas repetições');
select is((select count(*)::int from public.audit_logs where action = 'cylinder.stock_in' and target_id = '72000000-0000-0000-0000-0000000006f1'), 1, 'e uma única auditoria');

-- 25-29. Mesma chave com pedido diferente; outra chave sobre cilindro já em estoque.
select is((select public.stock_in_cylinder(a, sa, oa, 'QR-X2', '9b2f6d52-6f5a-4a58-8d31-0f8d9f0b4c11')->>'code' from ids), 'IDEMPOTENCY_PAYLOAD_CONFLICT', 'mesma chave com outro identificador: conflito');
select is((select stock_status from public.cylinders where id = '72000000-0000-0000-0000-0000000006f2'), 'out_of_stock', 'e o outro cilindro não foi tocado');
select is((select public.stock_in_cylinder(a, sa, oa, 'QR-X1', '11111111-1111-4111-8111-111111111111')->>'code' from ids), 'ALREADY_IN_STOCK', 'outra chave com o cilindro já em estoque: recusada');
select is((select count(*)::int from public.cylinder_events where cylinder_id = '72000000-0000-0000-0000-0000000006f1' and event_type = 'stock_in'), 1, 'sem novo evento');
select is((select public.stock_in_cylinder(a, sa, oa, 'QR-X5', '22222222-2222-4222-8222-222222222222')->>'code' from ids), 'ALREADY_IN_STOCK', 'cilindro que já estava em estoque: recusado');

-- 30-33. Recusas.
select is((select public.stock_in_cylinder(a, sa, oa, 'QR-X4', '33333333-3333-4333-8333-333333333333')->>'code' from ids), 'CYLINDER_INACTIVE', 'cilindro inativo: recusado');
select is((select public.stock_in_cylinder(a, sa, oa, 'QR-NAO-EXISTE', '44444444-4444-4444-8444-444444444444')->>'code' from ids), 'NOT_FOUND', 'identificador desconhecido: NOT_FOUND');
select is((select public.stock_in_cylinder(a, sa, oa, 'NFC-ANTIGA', '55555555-5555-4555-8555-555555555555') ->> 'deactivated' from ids), 'true', 'identificador desativado: NOT_FOUND com a informação');
select is((select public.stock_in_cylinder(a, sa, oa, '', '66666666-6666-4666-8666-666666666666')->>'code' from ids), 'VALIDATION_FAILED', 'valor vazio: VALIDATION_FAILED');

-- 34-39. Teste vencido ou reprovado não impede a entrada (RF-017).
select is((select public.stock_in_cylinder(a, sa, oa, 'QR-X2', '77777777-7777-4777-8777-777777777777')->>'code' from ids), 'STOCKED', 'teste vencido: entrada permitida');
select is((select public.stock_in_cylinder(a, sa, oa, 'QR-X2', '77777777-7777-4777-8777-777777777777')->>'warning' from ids), 'hydro_expired', 'com aviso de teste vencido (na repetição também)');
select is((select e.data->>'hydro_status' from public.cylinder_events e where e.cylinder_id = '72000000-0000-0000-0000-0000000006f2' and e.event_type = 'stock_in'), 'vencido', 'o evento guarda "vencido"');
select is((select public.stock_in_cylinder(a, sa, oa, 'QR-X3', '88888888-8888-4888-8888-888888888888')->>'warning' from ids), 'hydro_rejected', 'teste reprovado: entrada permitida com aviso');
select is((select e.data->>'hydro_status' from public.cylinder_events e where e.cylinder_id = '72000000-0000-0000-0000-0000000006f3' and e.event_type = 'stock_in'), 'reprovado', 'o evento guarda "reprovado"');
select is((select count(*)::int from private.idempotency_ledger where organization_id = '20000000-0000-0000-0000-00000000000a' and operation = 'cylinder.stock_in'), 3, 'o livro de idempotência guarda só as entradas concluídas (3)');

-- 40-47. Isolamento e autorização.
select is((select public.stock_in_cylinder(b, sb, ob, 'QR-X1', '9b2f6d52-6f5a-4a58-8d31-0f8d9f0b4c11')->'cylinder'->>'serial_number' from ids), 'Y1', 'B dá entrada no próprio cilindro de mesmo valor, com a mesma chave de A');
select is((select stock_status from public.cylinders where id = '72000000-0000-0000-0000-0000000006e1'), 'in_stock', 'o cilindro de B entrou em estoque');
select is((select count(*)::int from public.cylinders where organization_id = '20000000-0000-0000-0000-00000000000a' and serial_number = 'X1' and stock_status = 'in_stock'), 1, 'e o de A não foi tocado por B');
select is((select public.stock_in_cylinder(b, sb, ob, 'QR-X2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'code' from ids), 'NOT_FOUND', 'B não dá entrada com identificador de A: NOT_FOUND');
select is((select public.stock_in_cylinder(b, sb, oa, 'QR-X2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')->>'code' from ids), 'ACCESS_DENIED', 'B pedindo o contexto de A: ACCESS_DENIED');
select is((select public.stock_in_cylinder(t, st, oa, 'QR-X5', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')->>'code' from ids), 'ACCESS_DENIED', 'técnico sem cylinder.stock_in: ACCESS_DENIED');
select is((select public.stock_in_cylinder(e, '60000000-0000-0000-0000-0000deadbeef', oa, 'QR-X5', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')->>'code' from ids), 'AUTH_REQUIRED', 'sessão desconhecida: AUTH_REQUIRED');
select is((select public.stock_in_cylinder(e, se, oa, 'QR-X4', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')->>'code' from ids), 'CYLINDER_INACTIVE', 'estoquista tem cylinder.stock_in');

-- 48-52. Chave igual em organizações diferentes é independente; autoria; tenant suspenso.
select is((select count(*)::int from private.idempotency_ledger where idempotency_key = '9b2f6d52-6f5a-4a58-8d31-0f8d9f0b4c11'), 2, 'a mesma chave em outra organização é independente (uma linha por organização)');
select is((select e.actor_user_id::text || '/' || e.actor_session_id::text from public.cylinder_events e where e.cylinder_id = '72000000-0000-0000-0000-0000000006f1' and e.event_type = 'stock_in'),
  '10000000-0000-0000-0000-000000000002/60000000-0000-0000-0000-0000000600a2', 'o evento guarda o autor e a sessão');
select is((select count(*)::int from public.audit_logs where action = 'cylinder.stock_in' and result <> 'success'), 0, 'a RPC não audita recusas (isso é do manipulador)');
update public.organizations set status = 'suspended' where id = '20000000-0000-0000-0000-00000000000a';
select is((select public.stock_in_cylinder(a, sa, oa, 'QR-X5', 'ffffffff-ffff-4fff-8fff-ffffffffffff')->>'code' from ids), 'ACCESS_DENIED', 'tenant suspenso: negado');
select is((select public.query_cylinder_lookup(a, sa, oa, 'QR-X1')->>'code' from ids), 'ACCESS_DENIED', 'e a leitura também');

select * from finish(); rollback;

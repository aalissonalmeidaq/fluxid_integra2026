begin;
select plan(40);

-- Spec 006, US6: inactivate_cylinder e reactivate_cylinder (RF-006, RF-016, RF-040). Nada é excluído. Hermético.
delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000006a1', 'authenticated', 'authenticated', 'v-stock@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000006a1', 'Estoquista');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000006a1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000006a1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000006a1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r
   where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'stock_operator';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000600b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000006a1', '60000000-0000-0000-0000-0000000600a1', 'aal1');

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('71000000-0000-0000-0000-0000000006a1', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('71000000-0000-0000-0000-0000000006b1', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status) values
  ('72000000-0000-0000-0000-0000000006f1', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'V1', 'in_stock'),
  ('72000000-0000-0000-0000-0000000006f2', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'V2', 'out_of_stock'),
  ('72000000-0000-0000-0000-0000000006f3', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'V3', 'out_of_stock');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('72000000-0000-0000-0000-0000000006e1', '20000000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-0000000006b1', 'W1');
insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value) values
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f1', 'qr_code', 'QR-V1'),
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f1', 'nfc_tag', 'NFC-V1'),
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f2', 'qr_code', 'QR-V2');

create temp table ids as select
  '10000000-0000-0000-0000-000000000002'::uuid as a, '60000000-0000-0000-0000-0000000600a2'::uuid as sa,
  '10000000-0000-0000-0000-000000000003'::uuid as b, '60000000-0000-0000-0000-0000000600b3'::uuid as sb,
  '10000000-0000-0000-0000-0000000006a1'::uuid as e, '60000000-0000-0000-0000-0000000600a1'::uuid as se,
  '20000000-0000-0000-0000-00000000000a'::uuid as oa, '20000000-0000-0000-0000-00000000000b'::uuid as ob,
  '72000000-0000-0000-0000-0000000006f1'::uuid as v1, '72000000-0000-0000-0000-0000000006f2'::uuid as v2,
  '72000000-0000-0000-0000-0000000006f3'::uuid as v3, '72000000-0000-0000-0000-0000000006e1'::uuid as w1;

-- 1-4. Recusas antes de inativar.
select is((select public.inactivate_cylinder(a, sa, oa, v1, 'lost', 'abc')->>'code' from ids), 'JUSTIFICATION_REQUIRED', 'justificativa com menos de 5 caracteres é recusada');
select is((select public.inactivate_cylinder(a, sa, oa, v1, 'vendido', 'cilindro vendido')->'fields'->0->>'field' from ids), 'reason', 'motivo fora da lista: erro no campo');
select is((select status from public.cylinders where id = (select v1 from ids)), 'active', 'nada mudou');
select is((select public.inactivate_cylinder(e, se, oa, v1, 'lost', 'perdido na viagem')->>'code' from ids), 'ACCESS_DENIED', 'estoquista sem cylinder.deactivate: ACCESS_DENIED');

-- 5-16. Inativar cilindro em estoque.
create temp table in1 as select public.inactivate_cylinder(a, sa, oa, v1, 'condemned', '  Condenado no teste hidrostático  ') as r from ids;
select is((select r->>'code' from in1), 'OK', 'inativação com motivo e justificativa');
select is((select status || '/' || inactivation_reason || '/' || stock_status || '/' || version from public.cylinders where id = (select v1 from ids)), 'inactive/condemned/out_of_stock/2', 'fica inativo, com o motivo, fora do estoque e com a versão incrementada');
select is((select (r->>'version')::bigint from in1), 2::bigint, 'a resposta traz a nova versão');
select is((select array_agg(event_type order by sequence) from public.cylinder_events where cylinder_id = (select v1 from ids)), array['cylinder_inactivated', 'stock_out_inactivation'], 'eventos: inativação e saída do estoque');
select is((select justification from public.cylinder_events where cylinder_id = (select v1 from ids) and event_type = 'cylinder_inactivated'), 'Condenado no teste hidrostático', 'o evento guarda a justificativa aparada');
select is((select count(*)::int from public.audit_logs where action = 'cylinder.inactivate' and result = 'success' and target_id = (select v1::text from ids)), 1, 'uma auditoria cylinder.inactivate');
select is((select count(*)::int from public.cylinder_identifiers where cylinder_id = (select v1 from ids) and status = 'active'), 2, 'os identificadores continuam ativos e reservados ao cilindro inativo');
select is((select public.query_cylinder_lookup(a, sa, oa, 'QR-V1')->'cylinder'->>'status' from ids), 'inactive', 'a leitura informa que o cilindro está inativo');
select is((select public.stock_in_cylinder(a, sa, oa, 'NFC-V1', 'b2f6d522-6f5a-4a58-8d31-0f8d9f0b4c22')->>'code' from ids), 'CYLINDER_INACTIVE', 'a entrada no estoque é recusada');
select is((select public.add_cylinder_identifier(a, sa, oa, (select v1 from ids), 'qr_code', 'QR-NOVO')->>'code' from ids), 'CYLINDER_INACTIVE', 'identificador novo não entra em cilindro inativo');
select is((select public.add_cylinder_identifier(a, sa, oa, (select v2 from ids), 'qr_code', 'QR-V1')->>'code' from ids), 'IDENTIFIER_CONFLICT', 'o valor reservado não é aproveitado por outro cilindro');
select is((select public.inactivate_cylinder(a, sa, oa, v1, 'lost', 'segunda inativação')->>'code' from ids), 'ALREADY_INACTIVE', 'inativar de novo: ALREADY_INACTIVE (inativação simultânea)');

-- 17-20. Inativar cilindro fora do estoque: só um evento.
select is((select public.inactivate_cylinder(a, sa, oa, v2, 'lost', 'perdido em campo')->>'code' from ids), 'OK', 'inativa cilindro fora do estoque');
select is((select array_agg(event_type order by sequence) from public.cylinder_events where cylinder_id = (select v2 from ids)), array['cylinder_inactivated'], 'sem evento de saída, porque não estava em estoque');
select is((select (data->>'was_in_stock') from public.cylinder_events where cylinder_id = (select v2 from ids) and event_type = 'cylinder_inactivated'), 'false', 'o evento registra que não estava em estoque');
select is((select (data->>'was_in_stock') from public.cylinder_events where cylinder_id = (select v1 from ids) and event_type = 'cylinder_inactivated'), 'true', 'e o outro registra que estava');

-- 21-24. Isolamento.
select is((select public.inactivate_cylinder(b, sb, ob, v3, 'lost', 'tentando em outro tenant')->>'code' from ids), 'NOT_FOUND', 'B não inativa cilindro de A: NOT_FOUND');
select is((select public.inactivate_cylinder(b, sb, oa, v3, 'lost', 'contexto de A pedido por B')->>'code' from ids), 'ACCESS_DENIED', 'B pedindo o contexto de A: ACCESS_DENIED');
select is((select public.inactivate_cylinder(a, '60000000-0000-0000-0000-0000deadbeef', oa, v3, 'lost', 'sessão inválida')->>'code' from ids), 'AUTH_REQUIRED', 'sessão desconhecida: AUTH_REQUIRED');
select is((select status from public.cylinders where id = (select v3 from ids)), 'active', 'o cilindro V3 segue ativo');

-- 25-36. Reativar.
select is((select public.reactivate_cylinder(a, sa, oa, v1, 'x')->>'code' from ids), 'JUSTIFICATION_REQUIRED', 'reativar exige justificativa');
select is((select public.reactivate_cylinder(e, se, oa, v1, 'sem permissão para isso')->>'code' from ids), 'ACCESS_DENIED', 'estoquista não reativa');
select is((select public.reactivate_cylinder(a, sa, oa, v3, 'já estava ativo, engano')->>'code' from ids), 'VALIDATION_FAILED', 'reativar cilindro ativo: recusado');
select is((select public.reactivate_cylinder(b, sb, ob, v1, 'outro tenant tentando')->>'code' from ids), 'NOT_FOUND', 'B não reativa cilindro de A');
select is((select public.reactivate_cylinder(a, sa, oa, v1, 'Inativação foi engano')->>'code' from ids), 'OK', 'reativação com justificativa');
select is((select status || '/' || coalesce(inactivation_reason, 'nulo') || '/' || stock_status || '/' || version from public.cylinders where id = (select v1 from ids)), 'active/nulo/out_of_stock/3', 'volta ativo, sem motivo, FORA do estoque, com a versão incrementada');
select is((select event_type || ':' || justification from public.cylinder_events where cylinder_id = (select v1 from ids) order by sequence desc limit 1), 'cylinder_reactivated:Inativação foi engano', 'evento cylinder_reactivated com a justificativa');
select is((select count(*)::int from public.audit_logs where action = 'cylinder.reactivate' and result = 'success'), 1, 'uma auditoria cylinder.reactivate');
select is((select public.stock_in_cylinder(a, sa, oa, 'QR-V1', 'c2f6d522-6f5a-4a58-8d31-0f8d9f0b4c33')->>'code' from ids), 'STOCKED', 'depois de reativar, a entrada nova precisa ser registrada e funciona');
select is((select public.update_cylinder(a, sa, oa, (select v1 from ids), 4, '71000000-0000-0000-0000-0000000006a1', 'V1', 'Fábrica Z', null, null, null)->>'code' from ids), 'UPDATED', 'cilindro reativado volta a ser editável (versão 4 depois da entrada)');
select is((select count(*)::int from public.cylinders where organization_id = (select oa from ids)), 3, 'nenhum cilindro foi excluído');
select is((select count(*)::int from public.cylinder_events where cylinder_id = (select v1 from ids)), 5, 'o histórico do cilindro só cresceu (inativação, saída, reativação, entrada e edição)');

-- 37-40. Cilindro inativado e tenant suspenso.
update public.organizations set status = 'suspended' where id = '20000000-0000-0000-0000-00000000000a';
select is((select public.inactivate_cylinder(a, sa, oa, v3, 'lost', 'tenant suspenso')->>'code' from ids), 'ACCESS_DENIED', 'tenant suspenso: negado');
select is((select public.reactivate_cylinder(a, sa, oa, v2, 'tenant suspenso, tentando')->>'code' from ids), 'ACCESS_DENIED', 'tenant suspenso: reativação negada');
select is((select count(*)::int from public.audit_logs where action like 'cylinder.%activate' and result <> 'success'), 0, 'a RPC não audita recusas (isso é do manipulador)');
select is((select count(*)::int from public.cylinders where status = 'inactive' and organization_id = (select oa from ids)), 1, 'só V2 continua inativo');

select * from finish(); rollback;

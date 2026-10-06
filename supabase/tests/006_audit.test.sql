begin;
select plan(41);

-- Spec 006, CA-005 e RF-040: toda ação sensível gera, na MESMA transação, o evento de histórico e o registro de auditoria.
-- Se a auditoria falha, o evento e a mudança de estado são desfeitos. Hermético.
delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', 'aal1');

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('71000000-0000-0000-0000-0000000006a1', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, stock_status) values
  ('72000000-0000-0000-0000-0000000006f1', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'AU1', 'out_of_stock'),
  ('72000000-0000-0000-0000-0000000006f2', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'AU2', 'in_stock'),
  ('72000000-0000-0000-0000-0000000006f4', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'AU4', 'out_of_stock');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, status, inactivation_reason) values
  ('72000000-0000-0000-0000-0000000006f3', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'AU3', 'inactive', 'lost');
insert into public.cylinder_identifiers (id, organization_id, cylinder_id, kind, value) values
  ('73000000-0000-0000-0000-0000000006f1', '20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f1', 'qr_code', 'QR-AU1'),
  ('73000000-0000-0000-0000-0000000006f4', '20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f4', 'qr_code', 'QR-AU4');
insert into public.cylinder_identifiers (id, organization_id, cylinder_id, kind, value, status, deactivated_at, deactivated_by, deactivation_justification) values
  ('73000000-0000-0000-0000-0000000006f9', '20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f2', 'nfc_tag', 'NFC-AU', 'deactivated', now(), '10000000-0000-0000-0000-000000000002', 'Etiqueta perdida');
insert into public.cylinder_tests (id, organization_id, cylinder_id, performed_on, result, executor, next_due_on) values
  ('74000000-0000-0000-0000-0000000006f1', '20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f4', current_date - 20, 'approved', 'Lab', current_date + 300);
update public.cylinders set hydro_last_result = 'approved', hydro_next_due_on = current_date + 300 where id = '72000000-0000-0000-0000-0000000006f4';

create temp table ids as select
  '10000000-0000-0000-0000-000000000002'::uuid as a, '60000000-0000-0000-0000-0000000600a2'::uuid as sa, '20000000-0000-0000-0000-00000000000a'::uuid as oa,
  '71000000-0000-0000-0000-0000000006a1'::uuid as ty, '72000000-0000-0000-0000-0000000006f1'::uuid as c1, '72000000-0000-0000-0000-0000000006f2'::uuid as c2,
  '72000000-0000-0000-0000-0000000006f3'::uuid as c3, '72000000-0000-0000-0000-0000000006f4'::uuid as c4;

-- Foto do estado de cilindros, identificadores, testes, eventos e idempotência.
create function pg_temp.snapshot() returns text language sql as $$
  select md5(
    coalesce((select string_agg(c.id || ':' || c.version || ':' || c.status || ':' || c.stock_status || ':' || coalesce(c.hydro_next_due_on::text, ''), ',' order by c.id) from public.cylinders c), '') ||
    coalesce((select string_agg(i.id || ':' || i.status || ':' || coalesce(i.transferred_to_identifier_id::text, ''), ',' order by i.id) from public.cylinder_identifiers i), '') ||
    (select count(*)::text from public.cylinder_tests) || (select count(*)::text from public.cylinder_types) ||
    (select count(*)::text from public.cylinder_events) || (select count(*)::text from private.idempotency_ledger))
$$;
create temp table before_snap as select pg_temp.snapshot() as s;

-- Auditoria que sempre falha para ações de cilindros: simula a indisponibilidade do registro de auditoria.
create function pg_temp.block_audit() returns trigger language plpgsql as $$
begin
  if new.action like 'cylinder.%' then raise exception using errcode = 'P0001', message = 'audit_blocked'; end if;
  return new;
end $$;
create trigger block_cylinder_audit before insert on public.audit_logs for each row execute function pg_temp.block_audit();

-- 1-11. Cada ação falha por inteiro quando a auditoria falha.
select throws_ok($$ select public.create_cylinder((select a from ids), (select sa from ids), (select oa from ids), (select ty from ids), 'AU-NOVO', null, null, null, null, 'qr_code', 'QR-NOVO') $$, 'P0001', 'audit_blocked', 'cadastro: sem auditoria, nada acontece');
select throws_ok($$ select public.update_cylinder((select a from ids), (select sa from ids), (select oa from ids), (select c1 from ids), 1, (select ty from ids), 'AU1', 'Fábrica', null, null, null) $$, 'P0001', 'audit_blocked', 'edição: sem auditoria, nada acontece');
select throws_ok($$ select public.save_cylinder_type((select a from ids), (select sa from ids), (select oa from ids), null, 'Nitrogênio', 40, 'l', 'industrial', null) $$, 'P0001', 'audit_blocked', 'tipo: sem auditoria, nada acontece');
select throws_ok($$ select public.inactivate_cylinder((select a from ids), (select sa from ids), (select oa from ids), (select c2 from ids), 'lost', 'Perdido em campo') $$, 'P0001', 'audit_blocked', 'inativação: sem auditoria, nada acontece');
select throws_ok($$ select public.reactivate_cylinder((select a from ids), (select sa from ids), (select oa from ids), (select c3 from ids), 'Foi engano') $$, 'P0001', 'audit_blocked', 'reativação: sem auditoria, nada acontece');
select throws_ok($$ select public.add_cylinder_identifier((select a from ids), (select sa from ids), (select oa from ids), (select c1 from ids), 'nfc_tag', 'NFC-NOVA') $$, 'P0001', 'audit_blocked', 'novo identificador: sem auditoria, nada acontece');
select throws_ok($$ select public.deactivate_cylinder_identifier((select a from ids), (select sa from ids), (select oa from ids), '73000000-0000-0000-0000-0000000006f1', 'Etiqueta danificada') $$, 'P0001', 'audit_blocked', 'desativação de identificador: sem auditoria, nada acontece');
select throws_ok($$ select public.transfer_cylinder_identifier((select a from ids), (select sa from ids), (select oa from ids), 'NFC-AU', (select c1 from ids), 'Reaproveitada', true) $$, 'P0001', 'audit_blocked', 'transferência: sem auditoria, nada acontece');
select throws_ok($$ select public.stock_in_cylinder((select a from ids), (select sa from ids), (select oa from ids), 'QR-AU4', '5c1f6d52-6f5a-4a58-8d31-0f8d9f0b4c55') $$, 'P0001', 'audit_blocked', 'entrada no estoque: sem auditoria, nada acontece');
select throws_ok($$ select public.register_hydrostatic_test((select a from ids), (select sa from ids), (select oa from ids), (select c1 from ids), current_date - 1, 'approved', null, 'Lab', current_date + 100, null) $$, 'P0001', 'audit_blocked', 'registro de teste: sem auditoria, nada acontece');
select throws_ok($$ select public.rectify_hydrostatic_test((select a from ids), (select sa from ids), (select oa from ids), '74000000-0000-0000-0000-0000000006f1', current_date - 20, 'approved', null, 'Lab', current_date + 400, null, 'Data corrigida') $$, 'P0001', 'audit_blocked', 'retificação de teste: sem auditoria, nada acontece');

-- 12. O estado é exatamente o de antes: nenhum evento, nenhuma mudança, nenhum registro de idempotência.
select is((select pg_temp.snapshot() from ids limit 1), (select s from before_snap), 'depois das 11 falhas o estado é idêntico ao inicial');

drop trigger block_cylinder_audit on public.audit_logs;

-- 13-23. Com a auditoria funcionando, cada ação grava o par evento + auditoria.
create temp table marks as select (select count(*) from public.cylinder_events) as ev, (select count(*) from public.audit_logs) as au;
select is((select public.create_cylinder(a, sa, oa, ty, 'AU-NOVO', null, null, null, null, 'qr_code', 'QR-NOVO')->>'code' from ids), 'CREATED', 'cadastro');
select is((select count(*)::int from public.audit_logs where action = 'cylinder.create'), 1, 'cadastro: uma auditoria');
select is((select public.update_cylinder(a, sa, oa, c1, 1, ty, 'AU1', 'Fábrica', null, null, null)->>'code' from ids), 'UPDATED', 'edição');
select is((select public.save_cylinder_type(a, sa, oa, null, 'Nitrogênio', 40, 'l', 'industrial', null)->>'code' from ids), 'TYPE_SAVED', 'tipo');
select is((select public.inactivate_cylinder(a, sa, oa, c2, 'lost', 'Perdido em campo')->>'code' from ids), 'OK', 'inativação');
select is((select public.reactivate_cylinder(a, sa, oa, c3, 'Foi engano')->>'code' from ids), 'OK', 'reativação');
select is((select public.add_cylinder_identifier(a, sa, oa, c1, 'nfc_tag', 'NFC-NOVA')->>'code' from ids), 'OK', 'novo identificador');
select is((select public.deactivate_cylinder_identifier(a, sa, oa, '73000000-0000-0000-0000-0000000006f1', 'Etiqueta danificada')->>'code' from ids), 'OK', 'desativação de identificador');
select is((select public.transfer_cylinder_identifier(a, sa, oa, 'NFC-AU', c1, 'Reaproveitada', true)->>'code' from ids), 'OK', 'transferência');
select is((select public.stock_in_cylinder(a, sa, oa, 'QR-AU4', '5c1f6d52-6f5a-4a58-8d31-0f8d9f0b4c55')->>'code' from ids), 'STOCKED', 'entrada no estoque');
select is((select public.register_hydrostatic_test(a, sa, oa, c1, current_date - 1, 'approved', null, 'Lab', current_date + 100, null)->>'code' from ids), 'OK', 'registro de teste');
select is((select public.rectify_hydrostatic_test(a, sa, oa, '74000000-0000-0000-0000-0000000006f1', current_date - 20, 'approved', null, 'Lab', current_date + 400, null, 'Data corrigida')->>'code' from ids), 'OK', 'retificação de teste');

-- 24-34. Uma auditoria por ação, todas com autor, organização e instante.
select is((select array_agg(distinct action order by action) from public.audit_logs where action like 'cylinder.%'),
  array['cylinder.create', 'cylinder.identifier_add', 'cylinder.identifier_deactivate', 'cylinder.identifier_transfer', 'cylinder.inactivate',
        'cylinder.reactivate', 'cylinder.stock_in', 'cylinder.test_rectify', 'cylinder.test_register', 'cylinder.type_save', 'cylinder.update'],
  'as 11 ações sensíveis foram auditadas');
select is((select count(*)::int from public.audit_logs where action like 'cylinder.%'), 11, 'exatamente uma auditoria por ação');
select is((select count(*)::int from public.audit_logs where action like 'cylinder.%' and result = 'success' and organization_id = (select oa from ids)
  and actor_user_id = (select a from ids) and actor_session_id = (select sa from ids) and occurred_at is not null), 11, 'todas com autor, sessão, organização e instante');
select is((select count(*)::int from public.audit_logs where action in ('cylinder.inactivate', 'cylinder.reactivate', 'cylinder.identifier_deactivate', 'cylinder.identifier_transfer', 'cylinder.test_rectify') and justification is not null), 5, 'as 5 ações com justificativa obrigatória gravam a justificativa na auditoria');
select is((select count(*)::int from public.audit_logs where action like 'cylinder.%' and (metadata::text ~* 'QR-|NFC-|HULL-')), 0, 'a auditoria não guarda valores de identificadores');
select is((select count(*)::int from public.audit_logs where action like 'cylinder.%' and metadata ?| array['password', 'token', 'secret', 'refresh_token']), 0, 'nem segredos');
select is((select count(*)::int from public.cylinder_events) - (select ev::int from marks), 13, 'os eventos de histórico foram gravados (13 no total: a transferência e a inativação em estoque geram dois cada)');
select is((select count(*)::int from public.cylinder_events where event_type = 'identifier_transferred_out') + (select count(*)::int from public.cylinder_events where event_type = 'identifier_transferred_in'), 2, 'a transferência gera um evento em cada cilindro');
select is((select count(*)::int from public.cylinder_events where event_type = 'stock_out_inactivation'), 1, 'a inativação de cilindro em estoque gera o evento de saída');
select is((select count(distinct actor_user_id)::int from public.cylinder_events), 1, 'todos os eventos têm autor');
select is((select count(*)::int from public.cylinder_events where actor_session_id is null), 0, 'e sessão');

-- 35-40. A auditoria é imutável e as ações negadas não deixam rastro de sucesso.
select throws_ok($$ update public.audit_logs set action = 'x' where action = 'cylinder.create' $$, null, null, 'a auditoria não é alterada');
select throws_ok($$ delete from public.audit_logs where action = 'cylinder.create' $$, null, null, 'nem apagada');
select is((select public.create_cylinder('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000deadbeef', (select oa from ids), (select ty from ids), 'AU-X', null, null, null, null, 'qr_code', 'QR-X')->>'code'), 'AUTH_REQUIRED', 'sessão inválida não grava nada');
select is((select count(*)::int from public.audit_logs where action like 'cylinder.%'), 11, 'e não cria auditoria');
select is((select count(*)::int from public.cylinders), 5, 'cinco cilindros (4 de partida + 1 cadastrado)');
select is((select count(*)::int from public.cylinders where serial_number = 'AU-NOVO'), 1, 'e o cadastrado existe uma única vez');

select * from finish(); rollback;

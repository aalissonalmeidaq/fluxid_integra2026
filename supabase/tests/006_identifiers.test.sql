begin;
select plan(54);

-- Spec 006, US5: add_cylinder_identifier, deactivate_cylinder_identifier e transfer_cylinder_identifier (RF-007 a RF-012, RF-040). Hermético.
delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000006a1', 'authenticated', 'authenticated', 'i-stock@example.invalid'),
  ('10000000-0000-0000-0000-0000000006a2', 'authenticated', 'authenticated', 'i-tech@example.invalid');
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

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('71000000-0000-0000-0000-0000000006a1', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal'),
  ('71000000-0000-0000-0000-0000000006b1', '20000000-0000-0000-0000-00000000000b', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('72000000-0000-0000-0000-0000000006f1', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'I1'),
  ('72000000-0000-0000-0000-0000000006f2', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'I2'),
  ('72000000-0000-0000-0000-0000000006e1', '20000000-0000-0000-0000-00000000000b', '71000000-0000-0000-0000-0000000006b1', 'J1');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number, status, inactivation_reason) values
  ('72000000-0000-0000-0000-0000000006f3', '20000000-0000-0000-0000-00000000000a', '71000000-0000-0000-0000-0000000006a1', 'I3', 'inactive', 'lost');
insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value) values
  ('20000000-0000-0000-0000-00000000000a', '72000000-0000-0000-0000-0000000006f3', 'qr_code', 'QR-I3');

create temp table ids as select
  '10000000-0000-0000-0000-000000000002'::uuid as a, '60000000-0000-0000-0000-0000000600a2'::uuid as sa,
  '10000000-0000-0000-0000-000000000003'::uuid as b, '60000000-0000-0000-0000-0000000600b3'::uuid as sb,
  '10000000-0000-0000-0000-0000000006a2'::uuid as t, '60000000-0000-0000-0000-0000000600a4'::uuid as st,
  '10000000-0000-0000-0000-0000000006a1'::uuid as e, '60000000-0000-0000-0000-0000000600a1'::uuid as se,
  '20000000-0000-0000-0000-00000000000a'::uuid as oa, '20000000-0000-0000-0000-00000000000b'::uuid as ob,
  '72000000-0000-0000-0000-0000000006f1'::uuid as c1, '72000000-0000-0000-0000-0000000006f2'::uuid as c2,
  '72000000-0000-0000-0000-0000000006f3'::uuid as c3, '72000000-0000-0000-0000-0000000006e1'::uuid as d1;

-- 1-12. Acrescentar identificador.
create temp table add1 as select public.add_cylinder_identifier(t, st, oa, c1, 'nfc_tag', '  nfc-0001 ') as r from ids;
select is((select r->>'code' from add1), 'OK', 'técnico (cylinder.identifier) acrescenta um identificador');
select is((select i.status || '/' || i.kind || '/' || i.value from public.cylinder_identifiers i where i.id = (select (r->>'identifier_id')::uuid from add1)), 'active/nfc_tag/nfc-0001', 'fica ativo, do tipo certo e com o valor aparado');
select is((select event_type from public.cylinder_events where cylinder_id = (select c1 from ids) order by sequence desc limit 1), 'identifier_added', 'evento identifier_added');
select is((select count(*)::int from public.audit_logs where action = 'cylinder.identifier_add' and result = 'success' and target_id = (select c1::text from ids)), 1, 'uma auditoria cylinder.identifier_add');
select is((select public.add_cylinder_identifier(t, st, oa, c1, 'qr_code', 'QR-0001')->>'code' from ids), 'OK', 'o mesmo cilindro aceita vários identificadores de tipos diferentes');
select is((select public.add_cylinder_identifier(t, st, oa, c1, 'hull_number', 'HULL-1')->>'code' from ids), 'OK', 'incluindo o número do casco');
select is((select public.add_cylinder_identifier(t, st, oa, c1, 'data_matrix', 'DM-1')->>'code' from ids), 'OK', 'e o Data Matrix');
select is((select count(*)::int from public.cylinder_identifiers where cylinder_id = (select c1 from ids) and status = 'active'), 4, 'quatro identificadores ativos');
select is((select public.add_cylinder_identifier(t, st, oa, c2, 'qr_code', 'qr-0001')->>'code' from ids), 'IDENTIFIER_CONFLICT', 'valor ativo de outro cilindro (caixa diferente): conflito');
select is((select public.add_cylinder_identifier(t, st, oa, c2, 'qr_code', 'QR-0001')->>'cylinder_id' from ids), (select c1::text from ids), 'o conflito indica o cilindro que usa o valor');
select is((select public.add_cylinder_identifier(t, st, oa, c1, 'data_matrix', 'QR-0001')->>'code' from ids), 'IDENTIFIER_CONFLICT', 'repetir o valor no mesmo cilindro também é conflito');
select is((select count(*)::int from public.cylinder_identifiers where organization_id = (select oa from ids) and value_normalized = 'QR-0001'), 1, 'nada foi criado pela metade');

-- 13-20. Outro tenant, validações, cilindro inativo, autorização.
select is((select public.add_cylinder_identifier(b, sb, ob, d1, 'qr_code', 'QR-0001')->>'code' from ids), 'OK', 'o mesmo valor em outra organização é aceito');
select is((select public.add_cylinder_identifier(b, sb, ob, c1, 'qr_code', 'QR-9')->>'code' from ids), 'NOT_FOUND', 'B não acrescenta em cilindro de A: NOT_FOUND');
select is((select public.add_cylinder_identifier(t, st, oa, c3, 'qr_code', 'QR-NOVO')->>'code' from ids), 'CYLINDER_INACTIVE', 'cilindro inativo não recebe identificador novo');
select is((select public.add_cylinder_identifier(t, st, oa, c1, 'barcode', 'X')->'fields'->0->>'field' from ids), 'kind', 'tipo desconhecido: erro no campo');
select is((select public.add_cylinder_identifier(t, st, oa, c1, 'qr_code', '   ')->'fields'->0->>'field' from ids), 'value', 'valor vazio: erro no campo');
select is((select public.add_cylinder_identifier(e, se, oa, c1, 'qr_code', 'QR-ESTOQUE')->>'code' from ids), 'ACCESS_DENIED', 'estoquista sem cylinder.identifier: ACCESS_DENIED');
select is((select public.add_cylinder_identifier(t, '60000000-0000-0000-0000-0000deadbeef', oa, c1, 'qr_code', 'QR-X')->>'code' from ids), 'AUTH_REQUIRED', 'sessão desconhecida: AUTH_REQUIRED');
select is((select public.add_cylinder_identifier(b, sb, oa, c1, 'qr_code', 'QR-X')->>'code' from ids), 'ACCESS_DENIED', 'B pedindo o contexto de A: ACCESS_DENIED');

-- 21-32. Desativar identificador.
select is((select public.deactivate_cylinder_identifier(t, st, oa, (select (r->>'identifier_id')::uuid from add1), 'abc')->>'code' from ids), 'JUSTIFICATION_REQUIRED', 'justificativa com menos de 5 caracteres é recusada');
select is((select status from public.cylinder_identifiers where id = (select (r->>'identifier_id')::uuid from add1)), 'active', 'e nada muda');
select is((select public.deactivate_cylinder_identifier(t, st, oa, (select (r->>'identifier_id')::uuid from add1), 'Etiqueta danificada')->>'code' from ids), 'OK', 'desativação com justificativa');
select is((select status || '/' || deactivation_justification || '/' || (deactivated_by = (select t from ids)) from public.cylinder_identifiers where id = (select (r->>'identifier_id')::uuid from add1)), 'deactivated/Etiqueta danificada/true', 'guarda quem, quando (deactivated_at) e por quê');
select is((select deactivated_at is not null from public.cylinder_identifiers where id = (select (r->>'identifier_id')::uuid from add1)), true, 'e o instante');
select is((select event_type || ':' || justification from public.cylinder_events where cylinder_id = (select c1 from ids) order by sequence desc limit 1), 'identifier_deactivated:Etiqueta danificada', 'evento identifier_deactivated com a justificativa');
select is((select count(*)::int from public.audit_logs where action = 'cylinder.identifier_deactivate' and result = 'success'), 1, 'uma auditoria cylinder.identifier_deactivate');
select is((select public.deactivate_cylinder_identifier(t, st, oa, (select (r->>'identifier_id')::uuid from add1), 'de novo, sem sentido')->>'code' from ids), 'VALIDATION_FAILED', 'desativar de novo é recusado');
select is((select public.add_cylinder_identifier(t, st, oa, c2, 'nfc_tag', 'NFC-0001')->>'code' from ids), 'IDENTIFIER_UNAVAILABLE', 'valor desativado não pode ser vinculado a outro cilindro por engano');
select is((select public.add_cylinder_identifier(t, st, oa, c1, 'nfc_tag', 'NFC-0001')->>'code' from ids), 'IDENTIFIER_UNAVAILABLE', 'nem ser vinculado de novo ao mesmo cilindro sem transferência');
select is((select public.deactivate_cylinder_identifier(t, st, oa, (select id from public.cylinder_identifiers where value = 'QR-I3'), 'cilindro inativo, etiqueta liberada')->>'code' from ids), 'OK', 'identificador de cilindro INATIVO pode ser desativado');
select is((select public.deactivate_cylinder_identifier(b, sb, ob, (select id from public.cylinder_identifiers where value = 'QR-0001' and organization_id = (select oa from ids)), 'tentando em outro tenant')->>'code' from ids), 'NOT_FOUND', 'B não desativa identificador de A: NOT_FOUND');

-- 33-46. Transferir identificador.
select is((select public.transfer_cylinder_identifier(t, st, oa, 'NFC-0001', c2, 'reaproveitar a etiqueta', false)->>'code' from ids), 'VALIDATION_FAILED', 'sem confirmação explícita: recusado');
select is((select public.transfer_cylinder_identifier(t, st, oa, 'NFC-0001', c2, 'abc', true)->>'code' from ids), 'JUSTIFICATION_REQUIRED', 'sem justificativa: recusado');
select is((select public.transfer_cylinder_identifier(t, st, oa, 'QR-0001', c2, 'valor ainda ativo', true)->>'code' from ids), 'IDENTIFIER_CONFLICT', 'valor ainda ativo: é preciso desativar antes');
select is((select public.transfer_cylinder_identifier(t, st, oa, 'NAO-EXISTE', c2, 'não existe', true)->>'code' from ids), 'NOT_FOUND', 'valor que nunca existiu: NOT_FOUND');
select is((select public.transfer_cylinder_identifier(t, st, oa, 'NFC-0001', c3, 'destino inativo', true)->>'code' from ids), 'CYLINDER_INACTIVE', 'cilindro de destino inativo: recusado');
select is((select public.transfer_cylinder_identifier(t, st, oa, 'NFC-0001', '72000000-0000-0000-0000-00000000ffff', 'destino inexistente', true)->>'code' from ids), 'NOT_FOUND', 'cilindro de destino inexistente: NOT_FOUND');
select is((select count(*)::int from public.cylinder_identifiers where value_normalized = 'NFC-0001' and status = 'active'), 0, 'as recusas não criaram identificador algum (atomicidade)');
create temp table tr1 as select public.transfer_cylinder_identifier(t, st, oa, ' nfc-0001 ', c2, 'Etiqueta reaproveitada no cilindro I2', true) as r from ids;
select is((select r->>'code' from tr1), 'OK', 'transferência explícita, confirmada e justificada');
select is((select cylinder_id::text || '/' || status from public.cylinder_identifiers where id = (select (r->>'identifier_id')::uuid from tr1)), (select c2::text from ids) || '/active', 'o valor fica ativo no cilindro de destino');
select is((select transferred_to_identifier_id from public.cylinder_identifiers where id = (select (r->>'identifier_id')::uuid from add1)), (select (r->>'identifier_id')::uuid from tr1), 'a linha antiga continua desativada e aponta para a nova');
select is((select array_agg(event_type order by sequence) filter (where event_type like 'identifier_transferred%') from public.cylinder_events where cylinder_id = (select c1 from ids)), array['identifier_transferred_out'], 'histórico da origem: saída');
select is((select array_agg(event_type order by sequence) filter (where event_type like 'identifier_transferred%') from public.cylinder_events where cylinder_id = (select c2 from ids)), array['identifier_transferred_in'], 'histórico do destino: entrada');
select is((select count(*)::int from public.audit_logs where action = 'cylinder.identifier_transfer' and result = 'success'), 1, 'uma auditoria cylinder.identifier_transfer');
select is((select public.add_cylinder_identifier(t, st, oa, c1, 'nfc_tag', 'NFC-0001')->>'code' from ids), 'IDENTIFIER_CONFLICT', 'depois da transferência o valor pertence ao destino');

-- 47-54. Reaproveitar no mesmo cilindro, outro tenant, autorização.
select is((select public.deactivate_cylinder_identifier(t, st, oa, (select (r->>'identifier_id')::uuid from tr1), 'perdida de novo')->>'code' from ids), 'OK', 'desativa a etiqueta no destino');
select is((select public.transfer_cylinder_identifier(t, st, oa, 'NFC-0001', c2, 'reaproveitar no mesmo cilindro', true)->>'code' from ids), 'OK', 'a transferência para o próprio cilindro de origem é permitida');
select is((select count(*)::int from public.cylinder_identifiers where value_normalized = 'NFC-0001'), 3, 'o histórico do valor tem 3 linhas (duas desativadas e uma ativa)');
select is((select count(*)::int from public.cylinder_identifiers where value_normalized = 'NFC-0001' and status = 'active'), 1, 'e só uma ativa');
select is((select public.transfer_cylinder_identifier(e, se, oa, 'NFC-0001', c1, 'sem permissão', true)->>'code' from ids), 'ACCESS_DENIED', 'estoquista não transfere');
select is((select public.transfer_cylinder_identifier(b, sb, ob, 'NFC-0001', d1, 'valor de A em B', true)->>'code' from ids), 'NOT_FOUND', 'B não transfere valor de A: NOT_FOUND');
select is((select public.transfer_cylinder_identifier(b, sb, oa, 'NFC-0001', c1, 'contexto de A', true)->>'code' from ids), 'ACCESS_DENIED', 'B pedindo o contexto de A: ACCESS_DENIED');
select is((select count(*)::int from public.audit_logs where action like 'cylinder.identifier%' and result <> 'success'), 0, 'a RPC não audita recusas (isso é do manipulador)');

select * from finish(); rollback;

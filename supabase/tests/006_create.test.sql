begin;
select plan(48);

-- Spec 006, US1: create_cylinder, update_cylinder e save_cylinder_type (RF-001 a RF-004, RF-008, RF-040, RNF-005). Hermético.
delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');

insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';

-- Estoquista (cylinder.write) e técnico (sem cylinder.write) no Tenant A.
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000006a1', 'authenticated', 'authenticated', 'cyl-stock@example.invalid'),
  ('10000000-0000-0000-0000-0000000006a2', 'authenticated', 'authenticated', 'cyl-tech@example.invalid');
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

-- Atalhos: A = administrador do Tenant A; B = administrador do Tenant B.
create function pg_temp.tipo(p_org uuid, p_actor uuid, p_session uuid, p_gas text) returns uuid language plpgsql as $$
declare r jsonb;
begin
  r := public.save_cylinder_type(p_actor, p_session, p_org, null, p_gas, 10, 'l', 'industrial', null);
  return (r->>'type_id')::uuid;
end $$;

create temp table ctx as select
  pg_temp.tipo('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', 'Oxigênio') as type_a,
  pg_temp.tipo('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000600b3', 'Oxigênio') as type_b;

-- 1-2. Catálogo de tipos.
select is((select count(*)::int from public.cylinder_types where organization_id = '20000000-0000-0000-0000-00000000000a'), 1, 'save_cylinder_type cria o tipo no Tenant A');
select is(public.save_cylinder_type('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a', null, 'oxigênio', 10, 'l', 'industrial', null)->>'code',
  'VALIDATION_FAILED', 'tipo repetido (caixa diferente) na organização é recusado com motivo');

-- 3-8. Cadastro com sucesso: cilindro, identificador, dois eventos e uma auditoria na mesma transação.
select is((select public.create_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select type_a from ctx), ' CIL-001 ', 'Fábrica X', 2020, 200, 'primeiro', 'qr_code', ' QR-001 ')->>'code'), 'CREATED', 'cadastro bem-sucedido');
select is((select status || '/' || stock_status || '/' || version || '/' || serial_number from public.cylinders where serial_normalized = 'CIL-001'),
  'active/out_of_stock/1/CIL-001', 'o cilindro nasce ativo, fora do estoque, versão 1, com o número de série aparado');
select is((select count(*)::int from public.cylinder_identifiers i join public.cylinders c on c.id = i.cylinder_id where c.serial_normalized = 'CIL-001' and i.status = 'active' and i.value = 'QR-001'),
  1, 'o primeiro identificador fica ativo e aparado');
select is((select array_agg(e.event_type || ':' || e.sequence order by e.sequence) from public.cylinder_events e join public.cylinders c on c.id = e.cylinder_id where c.serial_normalized = 'CIL-001'),
  array['cylinder_created:1', 'identifier_added:2'], 'eventos cylinder_created e identifier_added em sequência');
select is((select count(*)::int from public.audit_logs where action = 'cylinder.create' and result = 'success'
  and organization_id = '20000000-0000-0000-0000-00000000000a' and actor_user_id = '10000000-0000-0000-0000-000000000002'
  and target_id = (select id::text from public.cylinders where serial_normalized = 'CIL-001')), 1, 'uma auditoria cylinder.create');
select is((select e.actor_user_id::text || '/' || coalesce(e.actor_session_id::text, '') from public.cylinder_events e join public.cylinders c on c.id = e.cylinder_id
  where c.serial_normalized = 'CIL-001' and e.sequence = 1), '10000000-0000-0000-0000-000000000002/60000000-0000-0000-0000-0000000600a2', 'o evento guarda autor e sessão');

-- 9-12. Conflitos não criam nada pela metade.
select is((select public.create_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select type_a from ctx), 'cil-001', null, null, null, null, 'qr_code', 'QR-OUTRO')->>'code'), 'SERIAL_CONFLICT', 'número de série repetido (caixa diferente) é recusado');
select is((select public.create_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select type_a from ctx), 'CIL-001', null, null, null, null, 'qr_code', 'QR-OUTRO')->>'cylinder_id'),
  (select id::text from public.cylinders where serial_normalized = 'CIL-001'), 'o conflito de série indica o cilindro que o usa');
select is((select public.create_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select type_a from ctx), 'CIL-002', null, null, null, null, 'data_matrix', 'qr-001')->>'code'), 'IDENTIFIER_CONFLICT', 'identificador ativo de outro cilindro (outro tipo, outra caixa) é recusado');
select is((select count(*)::int from public.cylinders where serial_normalized = 'CIL-002'), 0, 'o conflito de identificador não deixa cilindro pela metade');

-- 13-16. Mesmos valores em outra organização são aceitos (unicidade por organização).
select is((select public.create_cylinder('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000600b3', '20000000-0000-0000-0000-00000000000b',
  (select type_b from ctx), 'CIL-001', null, null, null, null, 'qr_code', 'QR-001')->>'code'), 'CREATED', 'o mesmo número de série e o mesmo identificador no Tenant B são aceitos');
select is((select count(*)::int from public.cylinders where serial_normalized = 'CIL-001'), 2, 'há um CIL-001 em cada tenant');
select is((select public.create_cylinder('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000600b3', '20000000-0000-0000-0000-00000000000a',
  (select type_a from ctx), 'CIL-003', null, null, null, null, 'qr_code', 'QR-003')->>'code'), 'ACCESS_DENIED', 'administrador de B não cadastra no Tenant A');
select is((select count(*)::int from public.cylinders where serial_normalized = 'CIL-003'), 0, 'e nada é criado');

-- 17-20. Autorização por permissão e por sessão.
select is((select public.create_cylinder('10000000-0000-0000-0000-0000000006a2', '60000000-0000-0000-0000-0000000600a4', '20000000-0000-0000-0000-00000000000a',
  (select type_a from ctx), 'CIL-004', null, null, null, null, 'qr_code', 'QR-004')->>'code'), 'ACCESS_DENIED', 'técnico (sem cylinder.write) é negado');
select is((select public.create_cylinder('10000000-0000-0000-0000-0000000006a1', '60000000-0000-0000-0000-0000000600a1', '20000000-0000-0000-0000-00000000000a',
  (select type_a from ctx), 'CIL-005', null, null, null, null, 'qr_code', 'QR-005')->>'code'), 'CREATED', 'estoquista (cylinder.write) cadastra');
select is((select public.create_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000deadbeef', '20000000-0000-0000-0000-00000000000a',
  (select type_a from ctx), 'CIL-006', null, null, null, null, 'qr_code', 'QR-006')->>'code'), 'AUTH_REQUIRED', 'sessão desconhecida: AUTH_REQUIRED');
select is((select public.save_cylinder_type('10000000-0000-0000-0000-0000000006a2', '60000000-0000-0000-0000-0000000600a4', '20000000-0000-0000-0000-00000000000a', null, 'Argônio', 10, 'l', 'industrial', null)->>'code'),
  'ACCESS_DENIED', 'técnico não mantém o catálogo de tipos');

-- 21-27. Validações com campos.
select is((select public.create_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select type_a from ctx), '   ', null, null, null, null, 'qr_code', 'QR-007')->'fields'->0->>'field'), 'serial_number', 'série vazia: erro no campo serial_number');
select is((select public.create_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select type_a from ctx), 'CIL-008', null, 1899, null, null, 'qr_code', 'QR-008')->>'code'), 'VALIDATION_FAILED', 'ano antes de 1900 é recusado');
select is((select public.create_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select type_a from ctx), 'CIL-008', null, extract(year from now())::int + 1, null, null, 'qr_code', 'QR-008')->>'code'), 'VALIDATION_FAILED', 'ano futuro é recusado');
select is((select public.create_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select type_a from ctx), 'CIL-008', null, null, 0, null, 'qr_code', 'QR-008')->>'code'), 'VALIDATION_FAILED', 'pressão zero é recusada');
select is((select public.create_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select type_b from ctx), 'CIL-008', null, null, null, null, 'qr_code', 'QR-008')->'fields'->0->>'field'), 'cylinder_type_id', 'tipo de outro tenant: erro no campo do tipo');
select is((select public.create_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select type_a from ctx), 'CIL-008', null, null, null, null, 'qr_code', '')->'fields'->0->>'field'), 'identifier.value', 'identificador vazio: erro no campo');
select is((select public.create_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select type_a from ctx), 'CIL-008', null, null, null, null, 'barcode', 'QR-008')->'fields'->0->>'field'), 'identifier.kind', 'tipo de identificador desconhecido: erro no campo');

-- 28-37. Edição com concorrência otimista.
create temp table cil as select id, version from public.cylinders where serial_normalized = 'CIL-001' and organization_id = '20000000-0000-0000-0000-00000000000a';
select is((select public.update_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select id from cil), 1, (select type_a from ctx), 'CIL-001', 'Fábrica Y', 2021, 200, 'editado')->>'code'), 'UPDATED', 'edição com a versão esperada');
select is((select version from public.cylinders where id = (select id from cil)), 2::bigint, 'a versão sobe a cada edição');
select is((select data->'changes'->'manufacturer'->>'from' || '>' || (data->'changes'->'manufacturer'->>'to') from public.cylinder_events
  where cylinder_id = (select id from cil) and event_type = 'cylinder_updated'), 'Fábrica X>Fábrica Y', 'o evento guarda os valores anteriores e novos');
select is((select count(*)::int from public.audit_logs where action = 'cylinder.update' and target_id = (select id::text from cil)), 1, 'auditoria cylinder.update');
select is((select public.update_cylinder('10000000-0000-0000-0000-0000000006a1', '60000000-0000-0000-0000-0000000600a1', '20000000-0000-0000-0000-00000000000a',
  (select id from cil), 1, (select type_a from ctx), 'CIL-001', 'Fábrica Z', 2021, 200, null)->>'code'), 'VERSION_CONFLICT', 'a segunda gravação baseada em versão antiga é recusada');
select is((select manufacturer from public.cylinders where id = (select id from cil)), 'Fábrica Y', 'e não altera nada');
select is((select count(*)::int from public.cylinder_events where cylinder_id = (select id from cil) and event_type = 'cylinder_updated'), 1, 'e não gera evento');
select is((select public.update_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select id from cil), 2, (select type_a from ctx), 'CIL-005', 'Fábrica Y', 2021, 200, 'editado')->>'code'), 'SERIAL_CONFLICT', 'trocar a série por uma já usada é recusado');
select is((select public.update_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select id from cil), 2, (select type_a from ctx), 'CIL-001', 'Fábrica Y', 2021, 200, 'editado')->>'code'), 'UPDATED', 'sem mudança de dados: aceito');
select is((select version from public.cylinders where id = (select id from cil)), 2::bigint, 'sem mudança de dados a versão não sobe e nenhum evento novo nasce');

-- 38-42. Isolamento da edição, cilindro inexistente e inativo, e identificadores intactos.
select is((select public.update_cylinder('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000600b3', '20000000-0000-0000-0000-00000000000b',
  (select id from cil), 2, (select type_b from ctx), 'X', null, null, null, null)->>'code'), 'NOT_FOUND', 'B não edita cilindro de A (mesma resposta de inexistente)');
select is((select public.update_cylinder('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000600b3', '20000000-0000-0000-0000-00000000000b',
  '72000000-0000-0000-0000-00000000ffff', 2, (select type_b from ctx), 'X', null, null, null, null)->>'code'), 'NOT_FOUND', 'cilindro inexistente: NOT_FOUND');
select is((select public.update_cylinder('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000600b3', '20000000-0000-0000-0000-00000000000a',
  (select id from cil), 2, (select type_a from ctx), 'X', null, null, null, null)->>'code'), 'ACCESS_DENIED', 'B pedindo o contexto de A: negado');
update public.cylinders set status = 'inactive', inactivation_reason = 'lost' where serial_normalized = 'CIL-005' and organization_id = '20000000-0000-0000-0000-00000000000a';
select is((select public.update_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select id from public.cylinders where serial_normalized = 'CIL-005' and organization_id = '20000000-0000-0000-0000-00000000000a'), 1, (select type_a from ctx), 'CIL-005', 'x', null, null, null)->>'code'),
  'CYLINDER_INACTIVE', 'cilindro inativo não é editado');
select is((select count(*)::int from public.audit_logs where action like 'cylinder.%' and result <> 'success'), 0, 'as RPCs não auditam negações (isso é do manipulador)');

-- 43-48. Catálogo: editar e desativar tipo.
select is((select public.save_cylinder_type('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select type_a from ctx), 'Oxigênio', 10, 'l', 'industrial', false)->>'code'), 'TYPE_SAVED', 'desativa o tipo');
select is((select active from public.cylinder_types where id = (select type_a from ctx)), false, 'o tipo fica inativo, nunca excluído');
select is((select public.create_cylinder('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000600a2', '20000000-0000-0000-0000-00000000000a',
  (select type_a from ctx), 'CIL-009', null, null, null, null, 'qr_code', 'QR-009')->'fields'->0->>'field'), 'cylinder_type_id', 'tipo inativo não aceita cilindro novo');
select is((select public.save_cylinder_type('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000600b3', '20000000-0000-0000-0000-00000000000b',
  (select type_a from ctx), 'Oxigênio', 10, 'l', 'industrial', false)->>'code'), 'NOT_FOUND', 'B não altera o tipo de A');
select is((select count(*)::int from public.audit_logs where action = 'cylinder.type_save' and result = 'success'), 3, 'cada gravação de tipo gera auditoria');
select is((select count(*)::int from public.audit_logs where action = 'cylinder.create' and result = 'success'), 3, 'três cadastros auditados (A, B e estoquista)');

select * from finish(); rollback;

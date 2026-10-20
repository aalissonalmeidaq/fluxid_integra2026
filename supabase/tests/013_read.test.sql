begin;
select plan(11);

-- Spec 013, US3: o tenant vê só os lacres destinados a ele, "prontos para vincular" quando ativos e sem cilindro, com a data da
-- aprovação; as linhas de destinações anteriores só aparecem com o filtro de histórico (RF-015; contracts/operacoes-plataforma.md).
-- Dois tenants. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin'
  on conflict do nothing;
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001380a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001380b3', 'aal1');

insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification) values
  ('a13c0000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', 'Oxigênio', 10, 'l', 'medicinal');
insert into public.cylinders (id, organization_id, cylinder_type_id, serial_number) values
  ('a13c0000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-00000000000a', 'a13c0000-0000-0000-0000-00000000000a', 'READ13-A-001');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, approved_at, approved_by) values
  ('a13c0000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-00000000000a', 'DSP-RD130001', 'Pronto', extensions.digest('k1', 'sha256'),
   '10000000-0000-0000-0000-000000000001', '2026-10-19 10:00:00+00', '10000000-0000-0000-0000-000000000001'),
  ('a13c0000-0000-0000-0000-0000000000d2', '20000000-0000-0000-0000-00000000000a', 'DSP-RD130002', 'Vinculado', extensions.digest('k2', 'sha256'),
   '10000000-0000-0000-0000-000000000001', now(), '10000000-0000-0000-0000-000000000001');
insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, status, inactive_reason) values
  ('a13c0000-0000-0000-0000-0000000000d3', '20000000-0000-0000-0000-00000000000a', 'DSP-RD130003', 'Devolvido', extensions.digest('k3', 'sha256'),
   '10000000-0000-0000-0000-000000000001', 'inactive', 'returned');
insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by) values
  ('20000000-0000-0000-0000-00000000000a', 'a13c0000-0000-0000-0000-0000000000d2', 'a13c0000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000002');
insert into public.seal_enrollments (device_code, key_hash) values ('DSP-RD130009', extensions.digest('k9', 'sha256'));

create function pg_temp.list(p_history boolean default false) returns jsonb language sql as $$
  select public.list_seals('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001380a2', '20000000-0000-0000-0000-00000000000a',
    null, null, null, 0, 200, p_history)
$$;
create function pg_temp.find(p_code text, p_history boolean default false) returns jsonb language sql as $$
  select x from jsonb_array_elements(pg_temp.list(p_history)->'items') x where x->>'device_code' = p_code
$$;

select is(pg_temp.find('DSP-RD130001')->>'ready_to_bind', 'true', 'ativo e sem cilindro: pronto para vincular');
select is(pg_temp.find('DSP-RD130001')->>'approved_at', '2026-10-19T10:00:00+00:00', 'traz a data da aprovação');
select is(pg_temp.find('DSP-RD130002')->>'ready_to_bind', 'false', 'com cilindro: não está pronto para vincular');
select is(pg_temp.find('DSP-RD130003'), null, 'a linha inativa não aparece por padrão');
select is(pg_temp.find('DSP-RD130003', true)->>'inactive_reason', 'returned', 'com o filtro de histórico, aparece com o motivo');
select is(pg_temp.find('DSP-RD130009', true), null, 'pedido pendente nunca aparece em tenant algum');
select is((public.get_seal('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001380a2', '20000000-0000-0000-0000-00000000000a',
  'a13c0000-0000-0000-0000-0000000000d1')->'seal'->>'origin'), 'enrollment', 'o detalhe diz a origem: aprovado pelo Master');
update public.seal_devices set approved_by = null where id = 'a13c0000-0000-0000-0000-0000000000d2';
select is((public.get_seal('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001380a2', '20000000-0000-0000-0000-00000000000a',
  'a13c0000-0000-0000-0000-0000000000d2')->'seal'->>'origin'), 'manual', 'sem Master na aprovação: cadastro manual (Spec 012)');
select ok(exists (select 1 from jsonb_array_elements(public.list_unbound_active_seals('10000000-0000-0000-0000-000000000002',
  '60000000-0000-0000-0000-0000001380a2', '20000000-0000-0000-0000-00000000000a')->'items') x where x->>'device_id' = 'a13c0000-0000-0000-0000-0000000000d1'),
  'o lacre pronto está na lista do "Vincular lacre"');
select ok(not exists (select 1 from jsonb_array_elements(public.list_unbound_active_seals('10000000-0000-0000-0000-000000000002',
  '60000000-0000-0000-0000-0000001380a2', '20000000-0000-0000-0000-00000000000a')->'items') x where x->>'device_id' = 'a13c0000-0000-0000-0000-0000000000d3'),
  'o devolvido não está');
select is(public.get_seal('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001380b3', '20000000-0000-0000-0000-00000000000b',
  'a13c0000-0000-0000-0000-0000000000d1')->>'code', 'NOT_FOUND', 'o B não encontra o lacre do A pelo id');

select * from finish();
rollback;

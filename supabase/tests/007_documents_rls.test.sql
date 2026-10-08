begin;
select plan(10);

-- Spec 007: os documentos pessoais (CPF e CNH) ficam em tabelas que ninguém lê pelo acesso direto: RLS ligada, nenhuma
-- política e nenhum privilégio para anon e authenticated. Só as funções do servidor (security definer) tocam nelas
-- (RF-029 a RF-031, CA-005; research.md, decisão 4). Hermético: desfeito pelo rollback.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('81000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', 'individual', '***.***.***-25', 'Pessoa Física Teste', 'hospital');
insert into public.customer_documents (customer_id, organization_id, kind, document_key) values
  ('81000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', 'cpf', '52998224725');
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values
  ('86000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'Motorista Teste', '***.***.***-25', '********900', 'D', current_date + 365);
insert into public.driver_documents (driver_id, organization_id, cpf, cnh_number) values
  ('86000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '52998224725', '12345678900');

create function public.tap_act_as(uid uuid, sid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'session_id', sid, 'aal', 'aal1')::text, true);
end;
$$;
grant execute on function public.tap_act_as(uuid, uuid) to authenticated, anon;

select ok((select bool_and(relrowsecurity) from pg_class
            where oid in (to_regclass('public.customer_documents'), to_regclass('public.driver_documents'))),
  'RLS ligada nas duas tabelas de documentos');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('customer_documents', 'driver_documents')), 0,
  'nenhuma política: ninguém lê pela RLS');
select ok(not has_table_privilege('authenticated', 'public.customer_documents', 'select'), 'authenticated sem select em customer_documents');
select ok(not has_table_privilege('authenticated', 'public.driver_documents', 'select'), 'authenticated sem select em driver_documents');
select ok(not has_table_privilege('anon', 'public.customer_documents', 'select'), 'anon sem select em customer_documents');
select ok(not has_table_privilege('anon', 'public.driver_documents', 'select'), 'anon sem select em driver_documents');

-- Nem o administrador do tenant lê pelo acesso direto, nem o do outro tenant.
set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2');
select throws_ok($$select * from public.customer_documents$$, '42501', null, 'administrador do Tenant A não lê customer_documents');
select throws_ok($$select * from public.driver_documents$$, '42501', null, 'administrador do Tenant A não lê driver_documents');
select public.tap_act_as('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3');
select throws_ok($$select * from public.customer_documents$$, '42501', null, 'administrador do Tenant B não lê customer_documents');
select throws_ok($$select * from public.driver_documents$$, '42501', null, 'administrador do Tenant B não lê driver_documents');
reset role;

select * from finish();
rollback;

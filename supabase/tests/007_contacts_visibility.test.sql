begin;
select plan(7);

-- Spec 007, US2: telefone e e-mail dos contatos só para quem tem `customer.write` (RF-003). Hermético: desfeito pelo rollback.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');

insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000007d1', 'authenticated', 'authenticated', 'v-auditor@example.invalid'),
  ('10000000-0000-0000-0000-0000000007d2', 'authenticated', 'authenticated', 'v-estoque@example.invalid'),
  ('10000000-0000-0000-0000-0000000007d3', 'authenticated', 'authenticated', 'v-tecnico@example.invalid');
insert into public.profiles (user_id, display_name) values
  ('10000000-0000-0000-0000-0000000007d1', 'Auditor'), ('10000000-0000-0000-0000-0000000007d2', 'Estoquista'), ('10000000-0000-0000-0000-0000000007d3', 'Técnico');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000007d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007d1', 'active', now()),
  ('30000000-0000-0000-0000-0000000007d2', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007d2', 'active', now()),
  ('30000000-0000-0000-0000-0000000007d3', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007d3', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select m.id, r.id, '10000000-0000-0000-0000-000000000001'
    from (values ('30000000-0000-0000-0000-0000000007d1'::uuid, 'tenant_auditor'), ('30000000-0000-0000-0000-0000000007d2', 'stock_operator'),
                 ('30000000-0000-0000-0000-0000000007d3', 'technical_operator')) m(id, code)
    join public.roles r on r.code = m.code and r.organization_id = '20000000-0000-0000-0000-00000000000a';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007d2', '60000000-0000-0000-0000-0000000700d2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007d3', '60000000-0000-0000-0000-0000000700d3', 'aal1');

insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('81000000-0000-0000-0000-0000000007a1', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital');
insert into public.customer_contacts (id, organization_id, customer_id, name, role, phone, email, is_primary, position) values
  ('83000000-0000-0000-0000-0000000007a1', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-0000000007a1', 'Maria Souza', 'Compras', '11912345678', 'maria@exemplo.invalid', true, 0);

create function pg_temp.get_as(p_user uuid, p_session uuid) returns jsonb language sql as $$
  select public.get_customer(p_user, p_session, '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-0000000007a1')
$$;

select is((select pg_temp.get_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2')->'contacts'->0->>'email'), 'maria@exemplo.invalid',
  'o administrador (customer.write) recebe o e-mail do contato');
select is((select pg_temp.get_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2')->'contacts'->0->>'phone'), '11912345678',
  'o administrador recebe o telefone do contato');
select is((select pg_temp.get_as('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1')->'contacts'->0->>'name'), 'Maria Souza',
  'o auditor vê o nome do contato');
select ok((select not (pg_temp.get_as('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1')->'contacts'->0 ? 'email')
                 and not (pg_temp.get_as('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1')->'contacts'->0 ? 'phone')),
  'o auditor não recebe telefone nem e-mail');
select ok((select not (pg_temp.get_as('10000000-0000-0000-0000-0000000007d2', '60000000-0000-0000-0000-0000000700d2')->'contacts'->0 ? 'email')
                 and pg_temp.get_as('10000000-0000-0000-0000-0000000007d2', '60000000-0000-0000-0000-0000000700d2')->'contacts'->0->>'role' = 'Compras'),
  'o estoquista recebe só nome e função');
select ok((select not (pg_temp.get_as('10000000-0000-0000-0000-0000000007d3', '60000000-0000-0000-0000-0000000700d3')->'contacts'->0 ? 'phone')),
  'o operador técnico não recebe o telefone');
select ok((select pg_temp.get_as('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1')::text !~ '(maria@exemplo|11912345678)'),
  'a resposta do auditor não contém o telefone nem o e-mail em lugar nenhum');

select * from finish();
rollback;

-- Massa exclusivamente sintética e determinística para testes locais.
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  confirmation_token,recovery_token,email_change_token_new,email_change,phone,phone_change,
  phone_change_token,email_change_token_current,reauthentication_token,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000001','authenticated','authenticated','master@example.invalid',crypt('Local-only-001!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000002','authenticated','authenticated','admin-a@example.invalid',crypt('Local-only-002!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000003','authenticated','authenticated','admin-b@example.invalid',crypt('Local-only-003!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now())
on conflict (id) do nothing;

insert into public.organizations(id,kind,legal_name,display_name,status) values
('20000000-0000-0000-0000-000000000001','owner','FluxID Ambiente Sintético','FluxID','active'),
('20000000-0000-0000-0000-00000000000a','tenant','Tenant A Sintético','Tenant A','active'),
('20000000-0000-0000-0000-00000000000b','tenant','Tenant B Sintético','Tenant B','active')
on conflict (id) do nothing;

insert into public.profiles(user_id,display_name) values
('10000000-0000-0000-0000-000000000001','Master Sintético'),
('10000000-0000-0000-0000-000000000002','Administrador A'),
('10000000-0000-0000-0000-000000000003','Administrador B') on conflict do nothing;

insert into public.memberships(id,organization_id,user_id,status,activated_at) values
('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','active',now()),
('30000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000002','active',now()),
('30000000-0000-0000-0000-00000000000b','20000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000003','active',now()) on conflict do nothing;

-- Catálogo de permissões e papéis globais vêm das migrations. Aqui ficam apenas os papéis do Tenant A com
-- identificadores fixos usados pelas suítes; os demais papéis e as permissões do tenant_admin vêm do bootstrap.
insert into public.roles(id,organization_id,code,name,description,scope,system) values
('50000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-00000000000a','tenant_admin','Administrador do tenant','Administração do tenant','tenant',true),
('50000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-00000000000a','technical_operator','Operador técnico','Perfil sem operação nesta Spec','tenant',true),
('50000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-00000000000a','stock_operator','Operador de estoque','Perfil sem operação nesta Spec','tenant',true),
('50000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-00000000000a','driver','Motorista','Perfil sem operação nesta Spec','tenant',true) on conflict do nothing;

select private.bootstrap_tenant_roles(id) from public.organizations where kind='tenant';
insert into public.membership_roles(membership_id,role_id,assigned_by) values
('30000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
('30000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001') on conflict do nothing;

-- Usuários sintéticos das suítes de autenticação e sessão (US1). Somente para ambiente local.
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  confirmation_token,recovery_token,email_change_token_new,email_change,phone,phone_change,
  phone_change_token,email_change_token_current,reauthentication_token,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000004','authenticated','authenticated','sess-limit@example.invalid',crypt('Local-only-004!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000005','authenticated','authenticated','sess-life@example.invalid',crypt('Local-only-005!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000006','authenticated','authenticated','mfa-global@example.invalid',crypt('Local-only-006!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000007','authenticated','authenticated','unavailable@example.invalid',crypt('Local-only-007!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now())
on conflict (id) do nothing;

insert into public.profiles(user_id,display_name) values
('10000000-0000-0000-0000-000000000004','Sessões Limite'),
('10000000-0000-0000-0000-000000000005','Sessões Ciclo'),
('10000000-0000-0000-0000-000000000006','MFA Global'),
('10000000-0000-0000-0000-000000000007','Sem Vínculo') on conflict do nothing;

insert into public.memberships(id,organization_id,user_id,status,activated_at) values
('30000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000004','active',now()),
('30000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000005','active',now()),
('30000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000006','active',now()) on conflict do nothing;

insert into public.membership_roles(membership_id,role_id,assigned_by) values
('30000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001'),
('30000000-0000-0000-0000-000000000005','50000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001'),
('30000000-0000-0000-0000-000000000006','50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001') on conflict do nothing;

-- Usuários adicionais para isolar as suítes ao vivo que rodam em paralelo.
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  confirmation_token,recovery_token,email_change_token_new,email_change,phone,phone_change,
  phone_change_token,email_change_token_current,reauthentication_token,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000008','authenticated','authenticated','contract@example.invalid',crypt('Local-only-008!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000009','authenticated','authenticated','other@example.invalid',crypt('Local-only-009!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now())
on conflict (id) do nothing;

insert into public.profiles(user_id,display_name) values
('10000000-0000-0000-0000-000000000008','Contrato de Sessão'),
('10000000-0000-0000-0000-000000000009','Outro Usuário') on conflict do nothing;

insert into public.memberships(id,organization_id,user_id,status,activated_at) values
('30000000-0000-0000-0000-000000000008','20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000008','active',now()),
('30000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000009','active',now()) on conflict do nothing;

insert into public.membership_roles(membership_id,role_id,assigned_by) values
('30000000-0000-0000-0000-000000000008','50000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001'),
('30000000-0000-0000-0000-000000000009','50000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001') on conflict do nothing;
-- Usuários dedicados à suíte ao vivo de perfil e avatar (mesmo tenant, sem profile.read).
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  confirmation_token,recovery_token,email_change_token_new,email_change,phone,phone_change,
  phone_change_token,email_change_token_current,reauthentication_token,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000010','authenticated','authenticated','avatar-a@example.invalid',crypt('Local-only-010!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000011','authenticated','authenticated','avatar-b@example.invalid',crypt('Local-only-011!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now())
on conflict (id) do nothing;

insert into public.profiles(user_id,display_name) values
('10000000-0000-0000-0000-000000000010','Avatar A'),
('10000000-0000-0000-0000-000000000011','Avatar B') on conflict do nothing;

insert into public.memberships(id,organization_id,user_id,status,activated_at) values
('30000000-0000-0000-0000-000000000010','20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000010','active',now()),
('30000000-0000-0000-0000-000000000011','20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000011','active',now()) on conflict do nothing;

insert into public.membership_roles(membership_id,role_id,assigned_by) values
('30000000-0000-0000-0000-000000000010','50000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001'),
('30000000-0000-0000-0000-000000000011','50000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001') on conflict do nothing;
-- Ator de outro tenant dedicado à suíte ao vivo de auditoria (Tenant B, sem papéis).
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  confirmation_token,recovery_token,email_change_token_new,email_change,phone,phone_change,
  phone_change_token,email_change_token_current,reauthentication_token,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000012','authenticated','authenticated','audit-b@example.invalid',crypt('Local-only-012!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now())
on conflict (id) do nothing;

insert into public.profiles(user_id,display_name) values
('10000000-0000-0000-0000-000000000012','Auditoria B') on conflict do nothing;

insert into public.memberships(id,organization_id,user_id,status,activated_at) values
('30000000-0000-0000-0000-000000000012','20000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000012','active',now()) on conflict do nothing;

-- Identidade dedicada à medição de desempenho ao vivo (RNF-003/RNF-004): vínculo ativo no Tenant B e sem papéis, para não alterar
-- contagens de membros nem colidir com sessões de outras suítes.
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  confirmation_token,recovery_token,email_change_token_new,email_change,phone,phone_change,
  phone_change_token,email_change_token_current,reauthentication_token,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000013','authenticated','authenticated','perf@example.invalid',crypt('Local-only-013!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now())
on conflict (id) do nothing;

insert into public.profiles(user_id,display_name) values
('10000000-0000-0000-0000-000000000013','Desempenho') on conflict do nothing;

insert into public.memberships(id,organization_id,user_id,status,activated_at) values
('30000000-0000-0000-0000-000000000013','20000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000013','active',now()) on conflict do nothing;

-- Spec 004 (navegação por permissão): massa dedicada à suíte ao vivo, isolada em dois tenants próprios (C e D) para não alterar
-- contagens das demais suítes. `nav-admin` administra o Tenant C e é operador técnico no Tenant D; `nav-operator` é operador técnico
-- no C; `nav-fluxid` tem o papel global Administrador FluxID na organização proprietária.
insert into public.organizations(id,kind,legal_name,display_name,status) values
('20000000-0000-0000-0000-00000000000c','tenant','Tenant C Sintético','Tenant C','active'),
('20000000-0000-0000-0000-00000000000d','tenant','Tenant D Sintético','Tenant D','active')
on conflict (id) do nothing;
select private.bootstrap_tenant_roles('20000000-0000-0000-0000-00000000000c');
select private.bootstrap_tenant_roles('20000000-0000-0000-0000-00000000000d');

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  confirmation_token,recovery_token,email_change_token_new,email_change,phone,phone_change,
  phone_change_token,email_change_token_current,reauthentication_token,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000014','authenticated','authenticated','nav-admin@example.invalid',crypt('Local-only-014!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000015','authenticated','authenticated','nav-operator@example.invalid',crypt('Local-only-015!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000016','authenticated','authenticated','nav-fluxid@example.invalid',crypt('Local-only-016!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now())
on conflict (id) do nothing;

insert into public.profiles(user_id,display_name) values
('10000000-0000-0000-0000-000000000014','Navegação Administrador'),
('10000000-0000-0000-0000-000000000015','Navegação Operador'),
('10000000-0000-0000-0000-000000000016','Navegação FluxID') on conflict do nothing;

insert into public.memberships(id,organization_id,user_id,status,activated_at) values
('30000000-0000-0000-0000-000000000014','20000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000014','active',now()),
('30000000-0000-0000-0000-000000000114','20000000-0000-0000-0000-00000000000d','10000000-0000-0000-0000-000000000014','active',now()),
('30000000-0000-0000-0000-000000000015','20000000-0000-0000-0000-00000000000c','10000000-0000-0000-0000-000000000015','active',now()),
('30000000-0000-0000-0000-000000000016','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000016','active',now()) on conflict do nothing;

insert into public.membership_roles(membership_id,role_id,assigned_by)
select '30000000-0000-0000-0000-000000000014', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r
  where r.organization_id='20000000-0000-0000-0000-00000000000c' and r.code='tenant_admin'
union all
select '30000000-0000-0000-0000-000000000114'::uuid, r.id, '10000000-0000-0000-0000-000000000001'::uuid from public.roles r
  where r.organization_id='20000000-0000-0000-0000-00000000000d' and r.code='technical_operator'
union all
select '30000000-0000-0000-0000-000000000015', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r
  where r.organization_id='20000000-0000-0000-0000-00000000000c' and r.code='technical_operator'
union all
select '30000000-0000-0000-0000-000000000016'::uuid, '50000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000001'::uuid
on conflict do nothing;

-- Spec 006 (cilindros): massa dedicada às suítes ao vivo, isolada em dois tenants próprios (E e F) para não alterar as contagens das
-- demais suítes. `cyl-e-admin` administra o Tenant E; `cyl-e-stock` é operador de estoque no E; `cyl-f-admin` administra o Tenant F.
insert into public.organizations(id,kind,legal_name,display_name,status) values
('20000000-0000-0000-0000-00000000000e','tenant','Tenant E Sintético','Tenant E','active'),
('20000000-0000-0000-0000-00000000000f','tenant','Tenant F Sintético','Tenant F','active')
on conflict (id) do nothing;
select private.bootstrap_tenant_roles('20000000-0000-0000-0000-00000000000e');
select private.bootstrap_tenant_roles('20000000-0000-0000-0000-00000000000f');

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  confirmation_token,recovery_token,email_change_token_new,email_change,phone,phone_change,
  phone_change_token,email_change_token_current,reauthentication_token,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000017','authenticated','authenticated','cyl-e-admin@example.invalid',crypt('Local-only-017!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000018','authenticated','authenticated','cyl-f-admin@example.invalid',crypt('Local-only-018!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000019','authenticated','authenticated','cyl-e-stock@example.invalid',crypt('Local-only-019!',gen_salt('bf')),now(),'', '', '', '', null, '', '', '', '', '{"provider":"email","providers":["email"]}','{}',now(),now())
on conflict (id) do nothing;

insert into public.profiles(user_id,display_name) values
('10000000-0000-0000-0000-000000000017','Cilindros Administrador E'),
('10000000-0000-0000-0000-000000000018','Cilindros Administrador F'),
('10000000-0000-0000-0000-000000000019','Cilindros Estoquista E') on conflict do nothing;

insert into public.memberships(id,organization_id,user_id,status,activated_at) values
('30000000-0000-0000-0000-000000000017','20000000-0000-0000-0000-00000000000e','10000000-0000-0000-0000-000000000017','active',now()),
('30000000-0000-0000-0000-000000000018','20000000-0000-0000-0000-00000000000f','10000000-0000-0000-0000-000000000018','active',now()),
('30000000-0000-0000-0000-000000000019','20000000-0000-0000-0000-00000000000e','10000000-0000-0000-0000-000000000019','active',now()) on conflict do nothing;

insert into public.membership_roles(membership_id,role_id,assigned_by)
select '30000000-0000-0000-0000-000000000017'::uuid, r.id, '10000000-0000-0000-0000-000000000001'::uuid from public.roles r
  where r.organization_id='20000000-0000-0000-0000-00000000000e' and r.code='tenant_admin'
union all
select '30000000-0000-0000-0000-000000000018'::uuid, r.id, '10000000-0000-0000-0000-000000000001'::uuid from public.roles r
  where r.organization_id='20000000-0000-0000-0000-00000000000f' and r.code='tenant_admin'
union all
select '30000000-0000-0000-0000-000000000019'::uuid, r.id, '10000000-0000-0000-0000-000000000001'::uuid from public.roles r
  where r.organization_id='20000000-0000-0000-0000-00000000000e' and r.code='stock_operator'
on conflict do nothing;

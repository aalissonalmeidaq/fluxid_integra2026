begin;
select plan(8);

-- Ator global sintético: Master do seed com sessão AAL2 vigente.
select public.start_user_session('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-0000000000c1', 'aal2');

-- Tenant criado pela fronteira global nasce inativo, mesmo que o chamador peça outro estado.
create temp table created_org on commit drop as
  select public.create_managed_organization(
    '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-0000000000c1',
    'Empresa Ativação Ltda.', 'Empresa Ativação', 'active', 'Contrato aprovado pela área responsável') as result;

select is((select result->>'status' from created_org), 'inactive', 'tenant nasce inactive');

-- Sem administrador ativo a ativação é recusada com resultado estável.
select is(
  public.change_managed_organization_status(
    '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-0000000000c1',
    (select (result->>'id')::uuid from created_org), 'active', 1, 'Tentativa de ativação sem administrador')->>'kind',
  'admin_required', 'ativação sem administrador ativo é recusada');
select is(
  (select status from public.organizations where id = (select (result->>'id')::uuid from created_org)),
  'inactive', 'o tenant permanece inactive após a recusa');

-- A regra vale também para atualização direta, sem depender da função.
select throws_ok(
  format($$ update public.organizations set status = 'active' where id = %L $$, (select result->>'id' from created_org)),
  '23514', 'tenant_admin_required', 'atualização direta sem administrador ativo é bloqueada no banco');

-- Só vínculo ativo com o papel Administrador do tenant conta: administrador bloqueado não habilita a ativação.
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'ativacao-admin@example.invalid');
insert into public.memberships (id, organization_id, user_id, status, activated_at)
  select '30000000-0000-0000-0000-0000000000c2', (result->>'id')::uuid, '10000000-0000-0000-0000-0000000000c2', 'active', now() from created_org;
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000000c2', r.id, '10000000-0000-0000-0000-000000000001'
  from public.roles r where r.organization_id = (select (result->>'id')::uuid from created_org) and r.code = 'tenant_admin';
update public.memberships set status = 'blocked' where id = '30000000-0000-0000-0000-0000000000c2';
select throws_ok(
  format($$ update public.organizations set status = 'active' where id = %L $$, (select result->>'id' from created_org)),
  '23514', 'tenant_admin_required', 'administrador bloqueado não habilita a ativação');

-- Com administrador ativo a ativação ocorre e é auditada.
update public.memberships set status = 'active', activated_at = now() where id = '30000000-0000-0000-0000-0000000000c2';
select is(
  public.change_managed_organization_status(
    '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-0000000000c1',
    (select (result->>'id')::uuid from created_org), 'active', 1, 'Primeiro administrador confirmado')->>'status',
  'active', 'com administrador ativo o tenant pode ser ativado');
select ok(
  exists(select 1 from public.audit_logs where action = 'organization.status.change'
    and target_id = (select result->>'id' from created_org)),
  'a ativação gera evento de auditoria');

-- Suspensão e reativação não reabrem a regra para tenants que já tinham administrador.
select is(
  public.change_managed_organization_status(
    '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-0000000000c1',
    (select (result->>'id')::uuid from created_org), 'suspended', 2, 'Suspensão administrativa')->>'status',
  'suspended', 'tenant com administrador pode ser suspenso');

select * from finish();
rollback;

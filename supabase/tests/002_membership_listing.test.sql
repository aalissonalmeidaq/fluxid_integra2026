begin;
select plan(8);

-- Sessões sintéticas: Administrador do Tenant A e Administrador do Tenant B do seed.
insert into public.user_sessions(session_id,user_id,status,aal,expires_at) values
  ('60000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000002','active','aal2',now()+interval '1 hour'),
  ('60000000-0000-0000-0000-0000000000d2','10000000-0000-0000-0000-000000000003','active','aal2',now()+interval '1 hour');

-- Um segundo membro no Tenant A e um estranho no Tenant B.
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000000d3', 'authenticated', 'authenticated', 'operador-a@example.invalid'),
  ('10000000-0000-0000-0000-0000000000d4', 'authenticated', 'authenticated', 'operador-b@example.invalid');
insert into public.profiles(user_id, display_name) values
  ('10000000-0000-0000-0000-0000000000d3', 'Operador A'),
  ('10000000-0000-0000-0000-0000000000d4', 'Operador B');
insert into public.memberships(id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000000d3', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000d3', 'active', now()),
  ('30000000-0000-0000-0000-0000000000d4', '20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-0000000000d4', 'active', now());

create temp table listed_a on commit drop as
  select public.list_tenant_members('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000d1','20000000-0000-0000-0000-00000000000a') as result;

select is((select result->>'kind' from listed_a), 'listed', 'administrador do Tenant A lista o próprio tenant');
select ok((select result->'members' @> '[{"id":"30000000-0000-0000-0000-0000000000d3","status":"active"}]'::jsonb from listed_a), 'lista o vínculo do Tenant A com estado e versão');
select ok(not (select (result->'members')::text like '%0000000000d4%' from listed_a), 'não revela vínculos do Tenant B');
select ok(not (select result::text ~* 'token|password|encrypted|refresh' from listed_a), 'resposta sanitizada');
select ok((select jsonb_array_length(result->'roles') >= 1 from listed_a), 'devolve os papéis atribuíveis do tenant');

-- Requisição direta com organization_id do Tenant B feita pelo administrador do Tenant A.
select is(
  public.list_tenant_members('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000d1','20000000-0000-0000-0000-00000000000b')->>'kind',
  'access_denied', 'administrador A não lista o Tenant B');
-- Sessão de outro ator não autoriza a leitura.
select is(
  public.list_tenant_members('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000d2','20000000-0000-0000-0000-00000000000a')->>'kind',
  'access_denied', 'sessão de outro usuário não autoriza a listagem');
select ok(
  not has_function_privilege('authenticated', 'public.list_tenant_members(uuid,uuid,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.list_tenant_members(uuid,uuid,uuid)', 'execute'),
  'RPC exclusiva do service_role');

select * from finish();
rollback;

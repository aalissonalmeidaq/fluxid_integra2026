begin;
select plan(28);

-- Hermético: sessões e massa desta suíte são desfeitas pelo rollback.
delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');

insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'avatar-leitor-a@example.invalid'),
  ('10000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'avatar-membro-a@example.invalid'),
  ('10000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'avatar-leitor-b@example.invalid');
insert into public.profiles (user_id, display_name) values
  ('10000000-0000-0000-0000-0000000000a1', 'Leitor A'),
  ('10000000-0000-0000-0000-0000000000a2', 'Membro A'),
  ('10000000-0000-0000-0000-0000000000a3', 'Leitor B');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a1', 'active', now()),
  ('30000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000a2', 'active', now()),
  ('30000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-0000000000a3', 'active', now());

-- Papéis personalizados com profile.read em cada tenant (a permissão é delegável).
insert into public.roles (id, organization_id, code, name, scope, system) values
  ('50000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-00000000000a', 'leitor_a', 'Leitor A', 'tenant', false),
  ('50000000-0000-0000-0000-0000000000c2', '20000000-0000-0000-0000-00000000000b', 'leitor_b', 'Leitor B', 'tenant', false);
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id from public.roles r cross join public.permissions p
   where r.id in ('50000000-0000-0000-0000-0000000000c1', '50000000-0000-0000-0000-0000000000c2') and p.code = 'profile.read';
insert into public.membership_roles (membership_id, role_id, assigned_by) values
  ('30000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-0000000000a3', '50000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-000000000003');

-- Avatares privados: administradores A e B e o membro A.
insert into storage.objects (bucket_id, name, owner_id, metadata) values
  ('avatars', '10000000-0000-0000-0000-000000000002/90000000-0000-0000-0000-0000000000a2.png', '10000000-0000-0000-0000-000000000002', '{"mimetype":"image/png","size":100}'),
  ('avatars', '10000000-0000-0000-0000-0000000000a2/90000000-0000-0000-0000-0000000000a3.png', '10000000-0000-0000-0000-0000000000a2', '{"mimetype":"image/png","size":100}'),
  ('avatars', '10000000-0000-0000-0000-000000000003/90000000-0000-0000-0000-0000000000a4.png', '10000000-0000-0000-0000-000000000003', '{"mimetype":"image/png","size":100}');

select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000fa0a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000fa0a3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000fa0a4', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000000a3', '60000000-0000-0000-0000-0000000fa0a5', 'aal1');

-- 1-4. Bucket privado, com limite de 2 MB e lista de tipos permitidos.
select ok(exists(select 1 from storage.buckets where id = 'avatars'), 'bucket avatars existe');
select is((select public from storage.buckets where id = 'avatars'), false, 'bucket é privado');
select is((select file_size_limit from storage.buckets where id = 'avatars'), 2097152::bigint, 'limite de 2 MB no bucket');
select is((select allowed_mime_types from storage.buckets where id = 'avatars'), array['image/jpeg','image/png','image/webp'], 'somente JPEG, PNG e WebP no bucket');

create function public.tap_act_as(uid uuid, sid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'session_id', sid, 'aal', 'aal1')::text, true);
end;
$$;
grant execute on function public.tap_act_as(uuid, uuid) to authenticated, anon;

-- Executa um comando com os privilégios do papel atual e devolve quantas linhas ele afetou.
create function public.tap_rows(command text) returns integer language plpgsql as $$
declare affected integer;
begin
  execute command;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
grant execute on function public.tap_rows(text) to authenticated, anon;

-- 5. Sem autenticação nada é visível.
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 0, 'anon não lê avatares');

-- 6-11. Administrador A (sem profile.read): somente o próprio avatar; nenhuma escrita.
set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000fa0a2');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars' and name like '10000000-0000-0000-0000-000000000002/%'), 1, 'o titular lê o próprio avatar');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars' and name like '10000000-0000-0000-0000-0000000000a2/%'), 0, 'sem profile.read não lê avatar de colega do tenant');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars' and name like '10000000-0000-0000-0000-000000000003/%'), 0, 'não lê avatar de outro tenant');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('avatars', '10000000-0000-0000-0000-000000000002/90000000-0000-0000-0000-0000000000ff.png') $$, '42501', null, 'o cliente não grava avatar direto no bucket');
select is(public.tap_rows($q$update storage.objects set name = name where bucket_id = 'avatars'$q$), 0, 'o cliente não altera objetos do bucket');
select throws_ok($q$delete from storage.objects where bucket_id = 'avatars'$q$, 'Direct deletion from storage tables is not allowed. Use the Storage API instead.', 'o cliente não exclui objetos do bucket pelo banco');

-- 12-14. Leitor A (profile.read no Tenant A): lê avatares do tenant, nunca de outro.
select public.tap_act_as('10000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000fa0a4');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars' and name like '10000000-0000-0000-0000-0000000000a2/%'), 1, 'profile.read lê avatar de colega do mesmo tenant');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars' and name like '10000000-0000-0000-0000-000000000002/%'), 1, 'profile.read lê avatar do administrador do mesmo tenant');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars' and name like '10000000-0000-0000-0000-000000000003/%'), 0, 'profile.read do Tenant A não lê avatar do Tenant B');

-- 15-16. Leitor B: o mesmo isolamento no sentido inverso.
select public.tap_act_as('10000000-0000-0000-0000-0000000000a3', '60000000-0000-0000-0000-0000000fa0a5');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars' and name like '10000000-0000-0000-0000-000000000003/%'), 1, 'profile.read lê avatar do próprio tenant B');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars' and name like '10000000-0000-0000-0000-0000000000a2/%'), 0, 'profile.read do Tenant B não lê avatar do Tenant A');

-- 17. Perfis: o mesmo escopo de leitura.
select is((select count(*)::int from public.profiles where user_id = '10000000-0000-0000-0000-0000000000a2'), 0, 'leitor do Tenant B não lê o perfil de membro do Tenant A');
select public.tap_act_as('10000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000fa0a4');
select is((select display_name from public.profiles where user_id = '10000000-0000-0000-0000-0000000000a2'), 'Membro A', 'profile.read lê o perfil de colega do mesmo tenant');
select is((select count(*)::int from public.profiles where user_id = '10000000-0000-0000-0000-000000000003'), 0, 'profile.read do Tenant A não lê perfil do Tenant B');
select public.tap_act_as('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000fa0a2');
select is((select count(*)::int from public.profiles where user_id = '10000000-0000-0000-0000-0000000000a2'), 0, 'sem profile.read não lê perfil de colega');

-- 21-23. O titular edita nome e locale; nunca o caminho do avatar nem o perfil de outra pessoa.
select throws_ok($$ update public.profiles set avatar_path = '10000000-0000-0000-0000-000000000002/90000000-0000-0000-0000-0000000000ee.png' $$, '42501', null, 'o titular não define avatar_path diretamente');
update public.profiles set display_name = 'Admin A Editado' where user_id = '10000000-0000-0000-0000-000000000002';
select is((select display_name from public.profiles where user_id = '10000000-0000-0000-0000-000000000002'), 'Admin A Editado', 'o titular altera o próprio nome');
select is(public.tap_rows($q$update public.profiles set display_name = 'Invasão' where user_id = '10000000-0000-0000-0000-0000000000a2'$q$), 0, 'ninguém altera o perfil de outra pessoa');

-- 24-26. Caminho canônico imposto no banco (mesmo por escrita privilegiada).
reset role;
select throws_ok($$ update public.profiles set avatar_path = '10000000-0000-0000-0000-000000000003/90000000-0000-0000-0000-0000000000ee.png' where user_id = '10000000-0000-0000-0000-000000000002' $$, '23514', null, 'o caminho de outro usuário viola a constraint');
select throws_ok($$ update public.profiles set avatar_path = '10000000-0000-0000-0000-000000000002/arquivo.svg' where user_id = '10000000-0000-0000-0000-000000000002' $$, '23514', null, 'caminho fora do padrão canônico viola a constraint');
select lives_ok($$ update public.profiles set avatar_path = '10000000-0000-0000-0000-000000000002/90000000-0000-0000-0000-0000000000a2.png' where user_id = '10000000-0000-0000-0000-000000000002' $$, 'o caminho canônico do próprio usuário é aceito');

-- 27-28. Sessão revogada perde a leitura imediatamente.
select public.end_user_session('10000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000fa0a4', 'user_revoked');
set local role authenticated;
select public.tap_act_as('10000000-0000-0000-0000-0000000000a1', '60000000-0000-0000-0000-0000000fa0a4');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 0, 'sessão revogada não lê avatares');
select is((select count(*)::int from public.profiles), 0, 'sessão revogada não lê perfis');

reset role;
select * from finish();
rollback;

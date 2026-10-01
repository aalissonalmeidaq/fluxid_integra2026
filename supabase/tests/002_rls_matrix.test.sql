begin;
select plan(6);
select ok(coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.organizations')), false), 'RLS organizations');
select ok(coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.profiles')), false), 'RLS profiles');
select ok(coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.memberships')), false), 'RLS memberships');
select ok(coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.roles')), false), 'RLS roles');
select is((select count(*) from information_schema.role_table_grants where table_schema='public' and grantee='anon' and table_name in ('organizations','profiles','memberships','permissions','roles','role_permissions','membership_roles','invitations','user_sessions','audit_logs')), 0::bigint, 'anon sem grants');
select has_function('private', 'has_permission', array['uuid','text']);
select * from finish(); rollback;

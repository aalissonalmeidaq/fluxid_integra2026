begin;
select plan(3);

-- Duas políticas permissivas de SELECT para o mesmo papel são avaliadas em toda consulta (advisor 0006).
-- A leitura do próprio perfil e a leitura entre pessoas do mesmo tenant ficam em uma política única.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT' and permissive = 'PERMISSIVE' and 'authenticated' = any(roles)),
  1,
  'profiles tem uma única política permissiva de SELECT para authenticated'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_read'),
  1,
  'a política unificada chama-se profiles_read'
);

-- Mantém a regra: a política exige sessão ativa e cobre o próprio perfil e a leitura autorizada entre pessoas.
select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_read') ~ 'has_active_session'
  and (select qual from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_read') ~ 'can_read_profile_of',
  'profiles_read exige sessão ativa e delega a leitura entre pessoas a can_read_profile_of'
);

select * from finish();
rollback;

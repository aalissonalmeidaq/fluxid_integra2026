-- Unifica as duas políticas permissivas de SELECT em public.profiles (advisor 0006, multiple_permissive_policies).
-- O acesso não muda: continua exigindo sessão ativa e vale para o próprio perfil ou para quem tem `profile.read`
-- em um tenant ativo compartilhado com a pessoa (private.can_read_profile_of).
drop policy profiles_self_select on public.profiles;
drop policy profiles_shared_read on public.profiles;

create policy profiles_read on public.profiles for select to authenticated
  using (
    (select private.has_active_session())
    and (
      (select auth.uid()) = user_id
      or private.can_read_profile_of(user_id)
    )
  );

-- Perfil e avatar: bucket privado, leitura por titular ou por quem tem `profile.read` no mesmo tenant ativo
-- e nenhuma escrita direta do cliente. Os objetos são gravados apenas pela função servidor `profile-avatar`,
-- que valida os bytes reais do arquivo e o caminho canônico `<user_id>/<object_id>.<ext>` (RF-029, RF-030, RS-011, ISO-007).

-- 1. Bucket privado com limite de 2 MB e lista de tipos (defesa em profundidade; a validação real é servidor).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- 2. O titular passa a editar somente nome e locale; o caminho do avatar é definido exclusivamente pelo servidor
--    e obrigatoriamente na forma canônica do próprio usuário.
revoke update (avatar_path) on public.profiles from authenticated;

alter table public.profiles
  add constraint profiles_avatar_path_check
  check (avatar_path is null
         or avatar_path ~ ('^' || user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'));

-- 3. Leitura entre pessoas: mesma regra para perfis e avatares. O ator precisa de `profile.read` em um tenant ativo
--    compartilhado com a pessoa alvo (has_permission já exige sessão ativa, vínculo ativo e tenant ativo).
create function private.can_read_profile_of(target_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.has_active_session())
     and exists (
       select 1
         from public.memberships target
         join public.memberships actor on actor.organization_id = target.organization_id
        where target.user_id = target_user
          and target.status = 'active'
          and actor.user_id = (select auth.uid())
          and actor.status = 'active'
          and private.has_permission(actor.organization_id, 'profile.read'));
$$;

revoke all on function private.can_read_profile_of(uuid) from public, anon;
grant execute on function private.can_read_profile_of(uuid) to authenticated;

create policy profiles_shared_read on public.profiles for select to authenticated
  using (private.can_read_profile_of(user_id));

-- 4. Storage: somente leitura. Sem política de INSERT, UPDATE ou DELETE para `authenticated`, toda escrita
--    de cliente é negada (RLS nega por padrão); o service_role da função servidor ignora a RLS.
create policy avatars_read on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (select private.has_active_session())
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.can_read_profile_of(nullif((storage.foldername(name))[1], '')::uuid)
    )
  );

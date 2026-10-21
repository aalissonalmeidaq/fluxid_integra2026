-- Spec 014 (RN-004; research.md, item 3; data-model.md): o servidor reconhece o tenant e as contas de demonstração por duas tabelas
-- privadas, sem acesso do cliente. Quem grava é só `public.demo_restore` (fase `markers`), chamada pela chave de serviço.

-- 1. Um só tenant de demonstração, sempre uma organização do tipo tenant.
create table private.demo_tenant (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  singleton boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint demo_tenant_singleton_check check (singleton),
  constraint demo_tenant_singleton_key unique (singleton)
);

create function private.demo_tenant_kind_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.organizations o where o.id = new.organization_id and o.kind = 'tenant') then
    raise exception using errcode = '23514', message = 'demo_tenant_not_tenant';
  end if;
  return new;
end $$;
create trigger demo_tenant_kind_guard before insert or update on private.demo_tenant
  for each row execute function private.demo_tenant_kind_guard();

-- 2. Contas de demonstração. Sem chave estrangeira para auth.users: a fase `markers` grava antes de o usuário existir no Auth.
-- `published_password` é a senha pública (RN-001), usada só pelo gatilho que recusa outra senha (research.md, item 5).
create table private.demo_accounts (
  user_id uuid primary key,
  email text not null,
  published_password text not null,
  role_code text not null,
  updated_at timestamptz not null default now(),
  constraint demo_accounts_email_key unique (email),
  constraint demo_accounts_email_check check (email = lower(btrim(email)) and email ~ '^[a-z_]+@demo\.fluxid\.invalid$'),
  constraint demo_accounts_password_check check (char_length(published_password) between 12 and 72),
  constraint demo_accounts_role_check check (role_code in ('tenant_admin', 'stock_operator', 'technical_operator', 'tenant_auditor', 'driver'))
);

alter table private.demo_tenant enable row level security;
alter table private.demo_accounts enable row level security;
revoke all on table private.demo_tenant, private.demo_accounts from public, anon, authenticated;

-- 3. As perguntas que as regras fazem ao banco.
create function private.is_demo_tenant(p_organization uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.demo_tenant t where t.organization_id = p_organization)
$$;

create function private.is_demo_account(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.demo_accounts a where a.user_id = p_user)
$$;

create function private.is_demo_email(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.demo_accounts a where a.email = lower(btrim(coalesce(p_email, ''))))
$$;

-- A função `password-recovery` só alcança o esquema public: esta é a mesma pergunta, só para a chave de serviço.
create function public.is_demo_email(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_demo_email(p_email)
$$;

revoke all on function private.demo_tenant_kind_guard(), private.is_demo_tenant(uuid), private.is_demo_account(uuid),
  private.is_demo_email(text), public.is_demo_email(text) from public, anon, authenticated;
grant execute on function public.is_demo_email(text) to service_role;

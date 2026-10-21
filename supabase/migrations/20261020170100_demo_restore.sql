-- Spec 014 (RF-005, RF-013, RF-014; research.md, item 7; contracts/restauracao-da-demonstracao.md): `public.demo_restore` cria ou
-- restaura a demonstração. Só a chave de serviço chama (script `npm run operacao:demonstracao` e seed local). Duas fases, cada uma numa
-- transação: `markers` grava as marcas e as senhas publicadas antes de o script mexer no Auth; `state` devolve o estado publicado.
-- O C262 e o lacre passam pelas operações do domínio, com uma sessão de serviço do administrador de demonstração.

-- 1. Sessão de serviço: não conta para o limite de 3 sessões (Spec 002) nem aparece na lista de sessões ativas do visitante.
alter table public.user_sessions add column kind text not null default 'interactive',
  add constraint user_sessions_kind_check check (kind in ('interactive', 'service'));

create or replace function public.start_user_session(p_user_id uuid, p_session_id uuid, p_aal text default 'aal1')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing public.user_sessions%rowtype;
  stale record;
  active_count integer;
begin
  if p_aal not in ('aal1', 'aal2') then
    raise exception using errcode = '22023', message = 'invalid_session';
  end if;

  -- Serializa a criação por usuário para que o limite valha sob concorrência.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  for stale in
    select session_id, case when expires_at <= now() then 'timebox' else 'inactivity' end as reason
      from public.user_sessions
     where user_id = p_user_id and status = 'active'
       and (expires_at <= now() or last_seen_at <= now() - interval '30 minutes')
  loop
    perform private.expire_user_session(stale.session_id, stale.reason);
  end loop;

  select * into existing from public.user_sessions where session_id = p_session_id;
  if found then
    if existing.user_id <> p_user_id or existing.kind <> 'interactive' then
      raise exception using errcode = '42501', message = 'session_owner_mismatch';
    end if;
    if existing.status <> 'active' then
      return jsonb_build_object('status', 'ended');
    end if;
    if p_aal = 'aal2' and existing.aal = 'aal1' then
      update public.user_sessions set aal = 'aal2' where session_id = p_session_id;
    end if;
    return jsonb_build_object('status', 'started', 'expires_at', existing.expires_at);
  end if;

  -- Spec 014: só as sessões de pessoas (interactive) contam e aparecem na escolha da sessão a encerrar.
  select count(*) into active_count
    from public.user_sessions where user_id = p_user_id and status = 'active' and kind = 'interactive';

  if active_count >= 3 then
    return jsonb_build_object(
      'status', 'limit_reached',
      'sessions', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'session_id', s.session_id, 'started_at', s.started_at,
          'last_seen_at', s.last_seen_at, 'aal', s.aal) order by s.started_at), '[]'::jsonb)
          from public.user_sessions s where s.user_id = p_user_id and s.status = 'active' and s.kind = 'interactive'));
  end if;

  insert into public.user_sessions (session_id, user_id, aal, started_at, last_seen_at, expires_at)
  values (p_session_id, p_user_id, p_aal, now(), now(), now() + interval '8 hours');

  return jsonb_build_object('status', 'started', 'expires_at', now() + interval '8 hours');
end;
$$;

-- 2. O id do C262 fica guardado: um visitante pode trocar o número de série, e a restauração continua achando o cilindro.
alter table private.demo_tenant add column cylinder_id uuid references public.cylinders(id) on delete set null;

-- 3. Validação do manifesto (a mesma regra de `src/domain/demo/demo-access.ts`, repetida no servidor). Devolve os problemas.
create function private.demo_manifest_problems(p_manifest jsonb) returns text[]
language plpgsql immutable set search_path = '' as $$
declare
  problems text[] := '{}';
  v_uuid text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_account jsonb;
begin
  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object' then return array['manifest']; end if;
  if coalesce(p_manifest #>> '{tenant,id}', '') !~ v_uuid then problems := array_append(problems, 'tenant.id'); end if;
  if char_length(btrim(coalesce(p_manifest #>> '{tenant,display_name}', ''))) not between 2 and 100 then problems := array_append(problems, 'tenant.display_name'); end if;
  if char_length(btrim(coalesce(p_manifest #>> '{tenant,legal_name}', ''))) not between 2 and 160 then problems := array_append(problems, 'tenant.legal_name'); end if;
  if char_length(btrim(coalesce(p_manifest #>> '{cylinder,serial_number}', ''))) not between 1 and 60 then problems := array_append(problems, 'cylinder.serial_number'); end if;
  if coalesce(p_manifest #>> '{cylinder,identifier,kind}', '') not in ('qr_code', 'data_matrix', 'nfc_tag', 'hull_number')
     or char_length(btrim(coalesce(p_manifest #>> '{cylinder,identifier,value}', ''))) not between 1 and 200 then
    problems := array_append(problems, 'cylinder.identifier');
  end if;
  if char_length(btrim(coalesce(p_manifest #>> '{cylinder,type,gas}', ''))) not between 2 and 80
     or jsonb_typeof(p_manifest #> '{cylinder,type,capacity_value}') is distinct from 'number'
     or coalesce(p_manifest #>> '{cylinder,type,capacity_unit}', '') not in ('l', 'm3', 'kg')
     or coalesce(p_manifest #>> '{cylinder,type,classification}', '') not in ('medicinal', 'industrial') then
    problems := array_append(problems, 'cylinder.type');
  end if;
  if coalesce(p_manifest #>> '{seal,device_code}', '') !~ '^DSP-[0-9A-Z]{8}$' then problems := array_append(problems, 'seal.device_code'); end if;

  if jsonb_typeof(p_manifest -> 'accounts') is distinct from 'array' or jsonb_array_length(p_manifest -> 'accounts') <> 5 then
    return array_append(problems, 'accounts');
  end if;
  for v_account in select a from jsonb_array_elements(p_manifest -> 'accounts') a loop
    if coalesce(v_account ->> 'user_id', '') !~ v_uuid or coalesce(v_account ->> 'membership_id', '') !~ v_uuid then problems := array_append(problems, 'accounts.id'); end if;
    if char_length(btrim(coalesce(v_account ->> 'display_name', ''))) not between 2 and 100 then problems := array_append(problems, 'accounts.display_name'); end if;
    if coalesce(v_account ->> 'email', '') !~ '^[a-z_]+@demo\.fluxid\.invalid$' then problems := array_append(problems, 'accounts.email'); end if;
    if coalesce(v_account ->> 'role_code', '') not in ('tenant_admin', 'stock_operator', 'technical_operator', 'tenant_auditor', 'driver') then
      problems := array_append(problems, 'accounts.role_code');
    end if;
    if char_length(coalesce(v_account ->> 'password', '')) not between 12 and 72 or (v_account ->> 'password') !~ '[a-z]'
       or (v_account ->> 'password') !~ '[A-Z]' or (v_account ->> 'password') !~ '[0-9]' or (v_account ->> 'password') !~ '[^A-Za-z0-9]' then
      problems := array_append(problems, 'accounts.password');
    end if;
  end loop;
  if (select count(distinct a ->> 'role_code') from jsonb_array_elements(p_manifest -> 'accounts') a) <> 5 then problems := array_append(problems, 'accounts.role_code'); end if;
  if (select count(distinct a ->> 'email') from jsonb_array_elements(p_manifest -> 'accounts') a) <> 5 then problems := array_append(problems, 'accounts.email'); end if;
  if (select count(distinct x) from jsonb_array_elements(p_manifest -> 'accounts') a, lateral (values (a ->> 'user_id'), (a ->> 'membership_id')) v(x)) <> 10 then
    problems := array_append(problems, 'accounts.id');
  end if;
  if not (select bool_and(a ->> 'role_code' <> 'tenant_admin') = false from jsonb_array_elements(p_manifest -> 'accounts') a) then
    problems := array_append(problems, 'accounts.tenant_admin');
  end if;
  return problems;
end $$;

-- Vínculos do tenant que não são das contas do manifesto: com eles, a restauração para sem alterar nada (nunca expor uma pessoa real).
create function private.demo_has_foreign_members(p_organization uuid, p_manifest jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
     where m.organization_id = p_organization
       and m.user_id::text not in (select a ->> 'user_id' from jsonb_array_elements(p_manifest -> 'accounts') a))
$$;

-- 4. A restauração.
create function public.demo_restore(p_manifest jsonb, p_phase text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  problems text[];
  v_org uuid;
  v_org_row public.organizations;
  v_tenant text := 'unchanged';
  v_cylinder text := 'unchanged';
  v_seal text := 'unchanged';
  v_warnings jsonb := '[]'::jsonb;
  v_restored integer := 0;
  v_unchanged integer := 0;
  v_account jsonb;
  v_user uuid;
  v_membership uuid;
  v_role uuid;
  v_changed boolean;
  v_admin uuid;
  v_session uuid;
  v_cyl public.cylinders;
  v_cyl_id uuid;
  v_type uuid;
  v_type_active boolean;
  v_result jsonb;
  v_device public.seal_devices;
  v_summary jsonb;
  v_serial text := btrim(p_manifest #>> '{cylinder,serial_number}');
  v_ident_kind text := p_manifest #>> '{cylinder,identifier,kind}';
  v_ident_value text := btrim(p_manifest #>> '{cylinder,identifier,value}');
  v_notes text := nullif(btrim(coalesce(p_manifest #>> '{cylinder,notes}', '')), '');
  v_gas text := btrim(p_manifest #>> '{cylinder,type,gas}');
  v_capacity numeric;
  v_unit text := p_manifest #>> '{cylinder,type,capacity_unit}';
  v_class text := p_manifest #>> '{cylinder,type,classification}';
  v_code text := p_manifest #>> '{seal,device_code}';
  v_reason constant text := 'Restauração da demonstração (Spec 014)';
begin
  if p_phase is null or p_phase not in ('markers', 'state') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', jsonb_build_array('phase'));
  end if;
  problems := private.demo_manifest_problems(p_manifest);
  if cardinality(problems) > 0 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', to_jsonb(problems));
  end if;
  v_org := (p_manifest #>> '{tenant,id}')::uuid;
  v_capacity := (p_manifest #>> '{cylinder,type,capacity_value}')::numeric;

  -- Uma restauração por vez.
  perform pg_advisory_xact_lock(hashtextextended('demo_restore', 0));

  if private.demo_has_foreign_members(v_org, p_manifest) then
    perform private.write_audit_event(null, null, null, 'demo.restore', 'organization', v_org::text, 'denied', 'demo_foreign_members', null,
      jsonb_build_object('phase', p_phase));
    return jsonb_build_object('code', 'DEMO_FOREIGN_MEMBERS');
  end if;

  ---------------------------------------------------------------------------------------------------------------------------------
  if p_phase = 'markers' then
    -- Contas que saíram do manifesto deixam de ser de demonstração.
    delete from private.demo_accounts d
     where d.user_id::text not in (select a ->> 'user_id' from jsonb_array_elements(p_manifest -> 'accounts') a);
    insert into private.demo_accounts (user_id, email, published_password, role_code, updated_at)
    select (a ->> 'user_id')::uuid, a ->> 'email', a ->> 'password', a ->> 'role_code', now()
      from jsonb_array_elements(p_manifest -> 'accounts') a
    on conflict (user_id) do update set email = excluded.email, published_password = excluded.published_password,
      role_code = excluded.role_code, updated_at = now()
     where (private.demo_accounts.email, private.demo_accounts.published_password, private.demo_accounts.role_code)
       is distinct from (excluded.email, excluded.published_password, excluded.role_code);
    -- O tenant só é marcado quando já existe; na criação do zero, a fase state cria e marca.
    if exists (select 1 from public.organizations o where o.id = v_org) then
      delete from private.demo_tenant where organization_id <> v_org;
      insert into private.demo_tenant (organization_id) values (v_org) on conflict (organization_id) do nothing;
    end if;
    return jsonb_build_object('code', 'DEMO_MARKED', 'accounts', jsonb_array_length(p_manifest -> 'accounts'));
  end if;

  ---------------------------------------------------------------------------------------------------------------------------------
  -- Fase state. As marcas e os usuários do Auth precisam existir (o script roda markers e acerta o Auth antes).
  if (select count(*) from jsonb_array_elements(p_manifest -> 'accounts') a
        join private.demo_accounts d on d.user_id = (a ->> 'user_id')::uuid and d.email = a ->> 'email'
        join auth.users u on u.id = d.user_id and lower(u.email) = d.email) <> 5 then
    return jsonb_build_object('code', 'DEMO_ACCOUNTS_MISSING');
  end if;

  -- Tenant: cria inativo (como qualquer tenant novo) ou acerta os nomes; ativa depois do administrador.
  select * into v_org_row from public.organizations where id = v_org for update;
  if v_org_row.id is null then
    insert into public.organizations (id, kind, legal_name, display_name, status)
    values (v_org, 'tenant', btrim(p_manifest #>> '{tenant,legal_name}'), btrim(p_manifest #>> '{tenant,display_name}'), 'inactive')
    returning * into v_org_row;
    v_tenant := 'created';
  elsif v_org_row.kind <> 'tenant' then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', jsonb_build_array('tenant.id'));
  elsif v_org_row.display_name <> btrim(p_manifest #>> '{tenant,display_name}') or v_org_row.legal_name <> btrim(p_manifest #>> '{tenant,legal_name}') then
    update public.organizations set display_name = btrim(p_manifest #>> '{tenant,display_name}'), legal_name = btrim(p_manifest #>> '{tenant,legal_name}'),
      version = version + 1, updated_at = now() where id = v_org;
    v_tenant := 'reactivated';
  end if;
  perform private.bootstrap_tenant_roles(v_org);
  delete from private.demo_tenant where organization_id <> v_org;
  insert into private.demo_tenant (organization_id) values (v_org) on conflict (organization_id) do nothing;

  select (a ->> 'user_id')::uuid into v_admin from jsonb_array_elements(p_manifest -> 'accounts') a where a ->> 'role_code' = 'tenant_admin';

  -- Perfis, vínculos e um papel por vínculo. O administrador vem primeiro: tirar o papel de administrador de outro perfil exige que ele exista.
  for v_account in
    select a from jsonb_array_elements(p_manifest -> 'accounts') a order by (a ->> 'role_code') <> 'tenant_admin'
  loop
    v_changed := false;
    v_user := (v_account ->> 'user_id')::uuid;
    v_membership := (v_account ->> 'membership_id')::uuid;

    insert into public.profiles (user_id, display_name) values (v_user, btrim(v_account ->> 'display_name'))
    on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now()
     where public.profiles.display_name is distinct from excluded.display_name;
    if found then v_changed := true; end if;

    if not exists (select 1 from public.memberships m where m.organization_id = v_org and m.user_id = v_user) then
      insert into public.memberships (id, organization_id, user_id, status, activated_at) values (v_membership, v_org, v_user, 'active', now());
      v_changed := true;
    else
      select m.id into v_membership from public.memberships m where m.organization_id = v_org and m.user_id = v_user;
      update public.memberships set status = 'active', activated_at = coalesce(activated_at, now()), blocked_at = null, inactivated_at = null,
        version = version + 1, updated_at = now()
       where id = v_membership and status <> 'active';
      if found then v_changed := true; end if;
    end if;

    select r.id into v_role from public.roles r where r.organization_id = v_org and r.code = v_account ->> 'role_code' and r.system;
    insert into public.membership_roles (membership_id, role_id, assigned_by) values (v_membership, v_role, v_admin) on conflict do nothing;
    if found then v_changed := true; end if;
    delete from public.membership_roles where membership_id = v_membership and role_id <> v_role;
    if found then v_changed := true; end if;

    if v_changed then v_restored := v_restored + 1; else v_unchanged := v_unchanged + 1; end if;
  end loop;

  if v_org_row.status <> 'active' then
    update public.organizations set status = 'active', version = version + 1, updated_at = now() where id = v_org;
    if v_tenant = 'unchanged' then v_tenant := 'reactivated'; end if;
  end if;

  -- Sessão de serviço do administrador de demonstração: as operações do domínio exigem ator e sessão vigentes.
  v_session := gen_random_uuid();
  insert into public.user_sessions (session_id, user_id, kind, aal, started_at, last_seen_at, expires_at)
  values (v_session, v_admin, 'service', 'aal1', now(), now(), now() + interval '10 minutes');

  -- Cilindro C262: ativo, em estoque e com o tipo publicado. O histórico nunca é apagado.
  select t.cylinder_id into v_cyl_id from private.demo_tenant t where t.organization_id = v_org;
  select c.* into v_cyl from public.cylinders c where c.id = v_cyl_id and c.organization_id = v_org;
  if v_cyl.id is null then
    select c.* into v_cyl from public.cylinders c where c.organization_id = v_org and c.serial_normalized = upper(v_serial);
  end if;

  if v_cyl.id is not null and exists (select 1 from public.trip_items i where i.cylinder_id = v_cyl.id and i.is_open) then
    v_cylinder := 'skipped_in_trip';
    v_warnings := v_warnings || '"cylinder_in_trip"'::jsonb;
  else
    select t.id, t.active into v_type, v_type_active from public.cylinder_types t
     where t.organization_id = v_org and lower(btrim(t.gas)) = lower(v_gas) and t.capacity_value = v_capacity
       and t.capacity_unit = v_unit and t.classification = v_class;
    if v_type is null or not v_type_active then
      v_result := public.save_cylinder_type(v_admin, v_session, v_org, v_type, v_gas, v_capacity, v_unit, v_class, true);
      if v_result ->> 'code' <> 'TYPE_SAVED' then raise exception 'demo_restore_type_failed: %', v_result ->> 'code'; end if;
      v_type := (v_result ->> 'type_id')::uuid;
    end if;

    if v_cyl.id is null then
      v_result := public.create_cylinder(v_admin, v_session, v_org, v_type, v_serial, null, null, null, v_notes, v_ident_kind, v_ident_value);
      if v_result ->> 'code' <> 'CREATED' then raise exception 'demo_restore_cylinder_failed: %', v_result ->> 'code'; end if;
      select c.* into v_cyl from public.cylinders c where c.id = (v_result ->> 'cylinder_id')::uuid;
      v_cylinder := 'created';
    else
      if v_cyl.status <> 'active' then
        v_result := public.reactivate_cylinder(v_admin, v_session, v_org, v_cyl.id, v_reason);
        if v_result ->> 'code' <> 'OK' then raise exception 'demo_restore_reactivate_failed: %', v_result ->> 'code'; end if;
        v_cylinder := 'restored';
        select c.* into v_cyl from public.cylinders c where c.id = v_cyl.id;
      end if;
      if v_cyl.cylinder_type_id <> v_type or v_cyl.serial_number <> v_serial or v_cyl.notes is distinct from v_notes then
        v_result := public.update_cylinder(v_admin, v_session, v_org, v_cyl.id, v_cyl.version, v_type, v_serial,
          v_cyl.manufacturer, v_cyl.manufacture_year, v_cyl.working_pressure_bar, v_notes);
        if v_result ->> 'code' = 'UPDATED' then v_cylinder := 'restored';
        else v_warnings := v_warnings || to_jsonb('cylinder_update_' || lower(coalesce(v_result ->> 'code', 'failed'))); end if;
        select c.* into v_cyl from public.cylinders c where c.id = v_cyl.id;
      end if;
    end if;

    if v_cyl.stock_status <> 'in_stock' then
      if v_cyl.custody_status = 'at_customer' then
        v_warnings := v_warnings || '"cylinder_at_customer"'::jsonb;
      else
        v_result := public.stock_in_cylinder(v_admin, v_session, v_org, v_ident_value, gen_random_uuid());
        if v_result ->> 'code' = 'STOCKED' then
          if v_cylinder = 'unchanged' then v_cylinder := 'restored'; end if;
        else
          v_warnings := v_warnings || to_jsonb('cylinder_stock_in_' || lower(coalesce(v_result ->> 'code', 'failed')));
        end if;
      end if;
    end if;
    update private.demo_tenant set cylinder_id = v_cyl.id, updated_at = now() where organization_id = v_org and cylinder_id is distinct from v_cyl.id;
  end if;

  -- Lacre de bancada: vinculado ao C262 quando destinado ao tenant e livre. Destinar é só do Master (Spec 013): aqui, só aviso.
  select d.* into v_device from public.seal_devices d where d.organization_id = v_org and d.device_code = v_code and d.status = 'active';
  if v_device.id is null then
    if exists (select 1 from public.seal_enrollments e where e.device_code = v_code)
       or exists (select 1 from public.seal_devices d where d.device_code = v_code) then
      v_seal := 'not_assigned';
      v_warnings := v_warnings || '"seal_not_assigned"'::jsonb;
    else
      v_seal := 'absent';
    end if;
  elsif v_cyl.id is not null and exists (select 1 from public.seal_bindings b where b.device_id = v_device.id and b.cylinder_id = v_cyl.id and b.unbound_at is null) then
    v_seal := 'unchanged';
  elsif exists (select 1 from public.seal_bindings b where b.device_id = v_device.id and b.unbound_at is null) then
    v_warnings := v_warnings || '"seal_bound_elsewhere"'::jsonb;
  elsif v_cyl.id is null or v_cyl.status <> 'active' then
    v_warnings := v_warnings || '"seal_cylinder_unavailable"'::jsonb;
  elsif exists (select 1 from public.seal_bindings b where b.cylinder_id = v_cyl.id and b.unbound_at is null) then
    v_warnings := v_warnings || '"cylinder_bound_elsewhere"'::jsonb;
  else
    v_result := public.bind_seal(v_admin, v_session, v_org, gen_random_uuid(), v_device.id, v_cyl.id);
    if v_result ->> 'code' = 'BOUND' then v_seal := 'bound';
    else v_warnings := v_warnings || to_jsonb('seal_bind_' || lower(coalesce(v_result ->> 'code', 'failed'))); end if;
  end if;

  update public.user_sessions set status = 'revoked', ended_at = now(), end_reason = 'demo_restore' where session_id = v_session;

  v_summary := jsonb_build_object('code', 'DEMO_RESTORED', 'tenant', v_tenant,
    'accounts', jsonb_build_object('restored', v_restored, 'unchanged', v_unchanged),
    'cylinder', v_cylinder, 'seal', v_seal, 'warnings', v_warnings);
  perform private.write_audit_event(null, null, null, 'demo.restore', 'organization', v_org::text, 'success', null, null, v_summary - 'code');
  return v_summary;
end $$;

revoke all on function private.demo_manifest_problems(jsonb), private.demo_has_foreign_members(uuid, jsonb),
  public.demo_restore(jsonb, text) from public, anon, authenticated;
grant execute on function public.demo_restore(jsonb, text) to service_role;

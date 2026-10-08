-- Spec 007, US5: motoristas com CPF e CNH protegidos, vínculo com usuário e revelação auditada (RF-024 a RF-032, CA-004, CA-005).
-- CPF e CNH completos vivem só em driver_documents (e CPF de cliente pessoa física em customer_documents), sem política de leitura; a
-- única saída do valor completo é reveal_document, auditada sem o valor. Nada pessoal vai para evento, auditoria ou mensagem de erro.

create function private.mask_cnh(p_cnh text) returns text language sql immutable set search_path = '' as $$
  select case when p_cnh ~ '^[0-9]{11}$' then '********' || right(p_cnh, 3) else '***********' end
$$;

create function private.validate_driver_fields(p_name text, p_phone text, p_category text, p_valid_until date) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  errors jsonb := '[]'::jsonb;
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 160 then
    errors := errors || private.field_error('full_name', 'Informe o nome com 2 a 160 caracteres.');
  end if;
  if p_phone is not null and p_phone !~ '^[0-9]{10,11}$' then
    errors := errors || private.field_error('phone', 'Informe o telefone com DDD, 10 ou 11 dígitos.');
  end if;
  if p_category is null or p_category not in ('A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE') then
    errors := errors || private.field_error('cnh_category', 'Escolha a categoria da CNH.');
  end if;
  if p_valid_until is null then
    errors := errors || private.field_error('cnh_valid_until', 'Informe a validade da CNH.');
  end if;
  return errors;
end $$;

create function private.driver_json(d public.drivers) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', d.id, 'full_name', d.full_name, 'cpf_display', d.cpf_display, 'cnh_display', d.cnh_display, 'cnh_category', d.cnh_category,
    'cnh_valid_until', d.cnh_valid_until, 'cnh_status', private.validity_status(d.cnh_valid_until), 'status', d.status, 'version', d.version,
    'linked', d.linked_user_id is not null, 'anonymized_at', d.anonymized_at)
$$;

create function public.create_driver(
  p_actor uuid, p_session uuid, p_organization uuid, p_full_name text, p_cpf text, p_cnh_number text, p_cnh_category text, p_cnh_valid_until date, p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  errors jsonb;
  v_name text := btrim(coalesce(p_full_name, ''));
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
  v_cnh text := regexp_replace(coalesce(p_cnh_number, ''), '[^0-9]', '', 'g');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_owner public.drivers;
  v_id uuid;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'driver.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  errors := private.validate_driver_fields(v_name, v_phone, p_cnh_category, p_cnh_valid_until);
  if not private.validate_cpf(v_cpf) then errors := errors || private.field_error('cpf', 'Informe um CPF válido.'); end if;
  if not private.validate_cnh(v_cnh) then errors := errors || private.field_error('cnh_number', 'Informe um número de CNH válido, com 11 dígitos.'); end if;
  if jsonb_array_length(errors) > 0 then return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors); end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':driver-cpf:' || v_cpf, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':driver-cnh:' || v_cnh, 0));
  select d.* into v_owner from public.driver_documents dd join public.drivers d on d.id = dd.driver_id where dd.organization_id = p_organization and dd.cpf = v_cpf;
  if found then return jsonb_build_object('code', 'DOCUMENT_CONFLICT', 'field', 'cpf', 'entity_id', v_owner.id, 'owner_name', v_owner.full_name); end if;
  select d.* into v_owner from public.driver_documents dd join public.drivers d on d.id = dd.driver_id where dd.organization_id = p_organization and dd.cnh_number = v_cnh;
  if found then return jsonb_build_object('code', 'DOCUMENT_CONFLICT', 'field', 'cnh_number', 'entity_id', v_owner.id, 'owner_name', v_owner.full_name); end if;

  insert into public.drivers (organization_id, full_name, phone, cpf_display, cnh_display, cnh_category, cnh_valid_until, created_by)
  values (p_organization, v_name, v_phone, private.mask_cpf(v_cpf), private.mask_cnh(v_cnh), p_cnh_category, p_cnh_valid_until, p_actor)
  returning id into v_id;
  insert into public.driver_documents (driver_id, organization_id, cpf, cnh_number) values (v_id, p_organization, v_cpf, v_cnh);
  perform private.append_registry_event('driver', v_id, p_organization, 'driver_created', p_actor, p_session, null, jsonb_build_object('cnh_category', p_cnh_category));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'driver.create', 'driver', v_id::text, 'success', null, null, jsonb_build_object('driver_id', v_id));
  return jsonb_build_object('code', 'CREATED', 'driver_id', v_id, 'version', 1);
end $$;

-- CPF e CNH só mudam se vierem valores novos, com justificativa; o evento diz que o documento mudou, nunca o valor (RF-031).
create function public.update_driver(
  p_actor uuid, p_session uuid, p_organization uuid, p_driver uuid, p_expected_version bigint, p_full_name text, p_cnh_category text, p_cnh_valid_until date,
  p_phone text, p_cpf text, p_cnh_number text, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  errors jsonb;
  v_old public.drivers;
  v_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_cpf text := nullif(regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g'), '');
  v_cnh text := nullif(regexp_replace(coalesce(p_cnh_number, ''), '[^0-9]', '', 'g'), '');
  v_justification text := nullif(btrim(coalesce(p_justification, '')), '');
  v_owner public.drivers;
  v_changes jsonb := '[]'::jsonb;
  v_sensitive jsonb := '[]'::jsonb;
  v_new_version bigint;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'driver.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select d.* into v_old from public.drivers d where d.id = p_driver and d.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_old.anonymized_at is not null then return jsonb_build_object('code', 'ANONYMIZED_RECORD'); end if;
  if v_old.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;
  if v_old.status <> 'active' then return jsonb_build_object('code', 'INACTIVE_RECORD'); end if;

  errors := private.validate_driver_fields(v_name, v_phone, p_cnh_category, p_cnh_valid_until);
  if p_cpf is not null and not private.validate_cpf(v_cpf) then errors := errors || private.field_error('cpf', 'Informe um CPF válido.'); end if;
  if p_cnh_number is not null and not private.validate_cnh(v_cnh) then errors := errors || private.field_error('cnh_number', 'Informe um número de CNH válido, com 11 dígitos.'); end if;
  if jsonb_array_length(errors) > 0 then return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors); end if;
  if (v_cpf is not null or v_cnh is not null) and (v_justification is null or char_length(v_justification) not between 5 and 500) then
    return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED');
  end if;
  if v_cpf is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':driver-cpf:' || v_cpf, 0));
    select d.* into v_owner from public.driver_documents dd join public.drivers d on d.id = dd.driver_id where dd.organization_id = p_organization and dd.cpf = v_cpf and dd.driver_id <> p_driver;
    if found then return jsonb_build_object('code', 'DOCUMENT_CONFLICT', 'field', 'cpf', 'entity_id', v_owner.id, 'owner_name', v_owner.full_name); end if;
  end if;
  if v_cnh is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':driver-cnh:' || v_cnh, 0));
    select d.* into v_owner from public.driver_documents dd join public.drivers d on d.id = dd.driver_id where dd.organization_id = p_organization and dd.cnh_number = v_cnh and dd.driver_id <> p_driver;
    if found then return jsonb_build_object('code', 'DOCUMENT_CONFLICT', 'field', 'cnh_number', 'entity_id', v_owner.id, 'owner_name', v_owner.full_name); end if;
  end if;

  -- Nome e telefone são dados pessoais: o evento diz só que mudaram.
  if v_name is distinct from v_old.full_name then v_sensitive := v_sensitive || to_jsonb('full_name'::text); end if;
  if v_phone is distinct from v_old.phone then v_sensitive := v_sensitive || to_jsonb('phone'::text); end if;
  if p_cnh_category is distinct from v_old.cnh_category then v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'cnh_category', 'old', v_old.cnh_category, 'new', p_cnh_category)); end if;
  if p_cnh_valid_until is distinct from v_old.cnh_valid_until then v_changes := v_changes || jsonb_build_array(jsonb_build_object('field', 'cnh_valid_until', 'old', v_old.cnh_valid_until, 'new', p_cnh_valid_until)); end if;

  update public.drivers set full_name = v_name, phone = v_phone, cnh_category = p_cnh_category, cnh_valid_until = p_cnh_valid_until, version = version + 1, updated_at = now()
   where id = p_driver returning version into v_new_version;
  if v_cpf is not null then
    update public.driver_documents set cpf = v_cpf where driver_id = p_driver;
    update public.drivers set cpf_display = private.mask_cpf(v_cpf) where id = p_driver;
    perform private.append_registry_event('driver', p_driver, p_organization, 'document_changed', p_actor, p_session, v_justification, jsonb_build_object('kind', 'cpf'));
  end if;
  if v_cnh is not null then
    update public.driver_documents set cnh_number = v_cnh where driver_id = p_driver;
    update public.drivers set cnh_display = private.mask_cnh(v_cnh) where id = p_driver;
    perform private.append_registry_event('driver', p_driver, p_organization, 'document_changed', p_actor, p_session, v_justification, jsonb_build_object('kind', 'cnh'));
  end if;
  if jsonb_array_length(v_changes) > 0 or jsonb_array_length(v_sensitive) > 0 then
    perform private.append_registry_event('driver', p_driver, p_organization, 'driver_updated', p_actor, p_session, null,
      jsonb_build_object('changes', v_changes, 'changed_sensitive', v_sensitive));
  end if;
  perform private.write_audit_event(p_organization, p_actor, p_session, 'driver.update', 'driver', p_driver::text, 'success', null, null, jsonb_build_object('driver_id', p_driver));
  return jsonb_build_object('code', 'UPDATED', 'version', v_new_version);
end $$;

create function private.driver_filter(p_organization uuid, p_status text, p_cnh_status text, p_linked boolean, p_search text)
returns setof public.drivers language sql stable security definer set search_path = '' as $$
  select d.* from public.drivers d
   where d.organization_id = p_organization
     and (p_status = 'all' or d.status = p_status)
     and (p_cnh_status is null or private.validity_status(d.cnh_valid_until) = p_cnh_status)
     and (p_linked is null or p_linked = (d.linked_user_id is not null))
     and (p_search is null or (d.anonymized_at is null and (
           lower(d.full_name) like private.like_pattern(p_search)
           or exists (select 1 from public.driver_documents dd where dd.driver_id = d.id
                        and (dd.cpf = regexp_replace(p_search, '[^0-9]', '', 'g') or dd.cnh_number = regexp_replace(p_search, '[^0-9]', '', 'g'))
                        and regexp_replace(p_search, '[^0-9]', '', 'g') ~ '^[0-9]{11}$'))))
$$;

create function public.list_drivers(
  p_actor uuid, p_session uuid, p_organization uuid, p_search text, p_status text, p_cnh_status text, p_linked boolean, p_sort text, p_cursor text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_status text := coalesce(p_status, 'active');
  v_sort text := coalesce(p_sort, 'name');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_cursor record;
  v_total bigint;
  v_rows jsonb;
  v_count integer;
  v_items jsonb;
  v_next text := null;
  v_last jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'driver.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if v_status not in ('active', 'inactive', 'all') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('status', 'Situação cadastral desconhecida.'));
  end if;
  if p_cnh_status is not null and p_cnh_status not in ('em_dia', 'a_vencer', 'vencido', 'sem_data') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cnh_status', 'Situação da CNH desconhecida.'));
  end if;
  if v_sort not in ('name', 'name_desc') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('sort', 'Ordenação desconhecida.'));
  end if;
  select * into v_cursor from private.cursor_decode(p_cursor);
  if not v_cursor.valid then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cursor', 'Página inválida.'));
  end if;

  select count(*) into v_total from private.driver_filter(p_organization, v_status, p_cnh_status, p_linked, v_search);
  if v_sort = 'name' then
    select jsonb_agg(jsonb_build_object('k', lower(f.full_name), 'i', f.id, 'item', private.driver_json(f)) order by lower(f.full_name), f.id) into v_rows
      from (select * from private.driver_filter(p_organization, v_status, p_cnh_status, p_linked, v_search) x
             where p_cursor is null or (lower(x.full_name), x.id) > (v_cursor.sort_key, v_cursor.row_id) order by lower(x.full_name), x.id limit v_limit + 1) f;
  else
    select jsonb_agg(jsonb_build_object('k', lower(f.full_name), 'i', f.id, 'item', private.driver_json(f)) order by lower(f.full_name) desc, f.id desc) into v_rows
      from (select * from private.driver_filter(p_organization, v_status, p_cnh_status, p_linked, v_search) x
             where p_cursor is null or (lower(x.full_name), x.id) < (v_cursor.sort_key, v_cursor.row_id) order by lower(x.full_name) desc, x.id desc limit v_limit + 1) f;
  end if;
  v_rows := coalesce(v_rows, '[]'::jsonb);
  v_count := jsonb_array_length(v_rows);
  select coalesce(jsonb_agg(e.value -> 'item' order by e.ord), '[]'::jsonb) into v_items
    from jsonb_array_elements(v_rows) with ordinality as e(value, ord) where e.ord <= v_limit;
  if v_count > v_limit then
    v_last := v_rows -> (v_limit - 1);
    v_next := private.cursor_encode(v_last ->> 'k', (v_last ->> 'i')::uuid);
  end if;
  return jsonb_build_object('code', 'LISTED', 'items', v_items, 'total', v_total, 'next', v_next);
end $$;

create function public.get_driver(p_actor uuid, p_session uuid, p_organization uuid, p_driver uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_drv public.drivers;
  v_user jsonb := null;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'driver.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select d.* into v_drv from public.drivers d where d.id = p_driver and d.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_drv.linked_user_id is not null then
    select jsonb_build_object('id', v_drv.linked_user_id, 'display_name', coalesce(p.display_name, 'Usuário'),
             'active', exists (select 1 from public.memberships m where m.organization_id = p_organization and m.user_id = v_drv.linked_user_id and m.status = 'active'))
      into v_user from (select 1) x left join public.profiles p on p.user_id = v_drv.linked_user_id;
  end if;
  return jsonb_build_object('code', 'FOUND', 'driver', private.driver_json(v_drv) || jsonb_build_object('phone', v_drv.phone, 'created_at', v_drv.created_at),
    'cnh_status', private.validity_status(v_drv.cnh_valid_until), 'linked_user', v_user);
end $$;

-- Usuários vinculáveis (RF-027): membros ativos da organização com o papel `driver` e ainda sem motorista. Sem e-mail.
create function public.list_linkable_users(p_actor uuid, p_session uuid, p_organization uuid, p_search text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'driver.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  return jsonb_build_object('code', 'LISTED', 'users', coalesce((
    select jsonb_agg(jsonb_build_object('id', u.user_id, 'display_name', u.display_name) order by lower(u.display_name), u.user_id)
      from (select m.user_id, coalesce(p.display_name, 'Usuário') as display_name
              from public.memberships m
              join public.membership_roles mr on mr.membership_id = m.id
              join public.roles r on r.id = mr.role_id and r.code = 'driver' and r.organization_id = p_organization
              left join public.profiles p on p.user_id = m.user_id
             where m.organization_id = p_organization and m.status = 'active'
               and not exists (select 1 from public.drivers d where d.organization_id = p_organization and d.linked_user_id = m.user_id)
               and (v_search is null or lower(coalesce(p.display_name, '')) like private.like_pattern(v_search))
             order by lower(coalesce(p.display_name, '')), m.user_id limit least(greatest(coalesce(p_limit, 25), 1), 100)) u), '[]'::jsonb));
end $$;

create function public.link_driver_user(p_actor uuid, p_session uuid, p_organization uuid, p_driver uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_drv public.drivers;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'driver.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select d.* into v_drv from public.drivers d where d.id = p_driver and d.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_drv.anonymized_at is not null then return jsonb_build_object('code', 'ANONYMIZED_RECORD'); end if;
  if v_drv.status <> 'active' then return jsonb_build_object('code', 'INACTIVE_RECORD'); end if;
  -- Não revela se o usuário existe em outra organização: a resposta é a mesma para todos os casos de inelegibilidade.
  if v_drv.linked_user_id is not null
     or not exists (
       select 1 from public.memberships m join public.membership_roles mr on mr.membership_id = m.id
         join public.roles r on r.id = mr.role_id and r.code = 'driver' and r.organization_id = p_organization
        where m.organization_id = p_organization and m.user_id = p_user and m.status = 'active')
     or exists (select 1 from public.drivers d where d.organization_id = p_organization and d.linked_user_id = p_user) then
    return jsonb_build_object('code', 'USER_NOT_ELIGIBLE');
  end if;
  update public.drivers set linked_user_id = p_user, updated_at = now() where id = p_driver;
  perform private.append_registry_event('driver', p_driver, p_organization, 'driver_user_linked', p_actor, p_session, null, jsonb_build_object('user_id', p_user));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'driver.user_link', 'driver', p_driver::text, 'success', null, null,
    jsonb_build_object('driver_id', p_driver, 'user_id', p_user));
  return jsonb_build_object('code', 'LINKED', 'version', v_drv.version);
end $$;

create function public.unlink_driver_user(p_actor uuid, p_session uuid, p_organization uuid, p_driver uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_drv public.drivers;
  v_justification text := nullif(btrim(coalesce(p_justification, '')), '');
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'driver.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select d.* into v_drv from public.drivers d where d.id = p_driver and d.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_justification is null or char_length(v_justification) not between 5 and 500 then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  if v_drv.linked_user_id is null then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('driver_id', 'Este motorista não tem usuário vinculado.'));
  end if;
  update public.drivers set linked_user_id = null, updated_at = now() where id = p_driver;
  perform private.append_registry_event('driver', p_driver, p_organization, 'driver_user_unlinked', p_actor, p_session, v_justification, jsonb_build_object('user_id', v_drv.linked_user_id));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'driver.user_unlink', 'driver', p_driver::text, 'success', null, null,
    jsonb_build_object('driver_id', p_driver));
  return jsonb_build_object('code', 'UNLINKED', 'version', v_drv.version);
end $$;

-- Revelação (RF-030): única saída do valor completo. Exige a permissão de documento da área; o evento e a auditoria registram
-- quem revelou e qual documento, nunca o valor. Não sobe a versão.
create function public.reveal_document(p_actor uuid, p_session uuid, p_organization uuid, p_entity_type text, p_entity uuid, p_document text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_value text;
  v_area text;
begin
  if p_entity_type not in ('customer', 'driver') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('entity_type', 'Tipo de cadastro desconhecido.'));
  end if;
  if p_document is null or p_document not in ('cpf', 'cnh') or (p_entity_type = 'customer' and p_document <> 'cpf') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('document', 'Documento desconhecido para este cadastro.'));
  end if;
  v_area := p_entity_type;
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, v_area || '.document');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  if p_entity_type = 'driver' then
    select case p_document when 'cpf' then dd.cpf else dd.cnh_number end into v_value
      from public.driver_documents dd join public.drivers d on d.id = dd.driver_id where dd.driver_id = p_entity and d.organization_id = p_organization;
  else
    select dk.document_key into v_value
      from public.customer_documents dk join public.customers c on c.id = dk.customer_id
     where dk.customer_id = p_entity and c.organization_id = p_organization and dk.kind = 'cpf';
  end if;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_value is null then return jsonb_build_object('code', 'ANONYMIZED_RECORD'); end if;

  perform private.append_registry_event(p_entity_type, p_entity, p_organization, 'document_revealed', p_actor, p_session, null, jsonb_build_object('document', p_document));
  perform private.write_audit_event(p_organization, p_actor, p_session, v_area || '.document_reveal', p_entity_type, p_entity::text, 'success', null, null,
    jsonb_build_object('entity_id', p_entity, 'document', p_document));
  return jsonb_build_object('code', 'REVEALED', 'value', v_value);
end $$;

revoke all on function private.mask_cnh(text), private.validate_driver_fields(text, text, text, date), private.driver_json(public.drivers),
  private.driver_filter(uuid, text, text, boolean, text) from public, anon, authenticated;
revoke all on function
  public.create_driver(uuid, uuid, uuid, text, text, text, text, date, text),
  public.update_driver(uuid, uuid, uuid, uuid, bigint, text, text, date, text, text, text, text),
  public.list_drivers(uuid, uuid, uuid, text, text, text, boolean, text, text, integer),
  public.get_driver(uuid, uuid, uuid, uuid),
  public.list_linkable_users(uuid, uuid, uuid, text, integer),
  public.link_driver_user(uuid, uuid, uuid, uuid, uuid),
  public.unlink_driver_user(uuid, uuid, uuid, uuid, text),
  public.reveal_document(uuid, uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function
  public.create_driver(uuid, uuid, uuid, text, text, text, text, date, text),
  public.update_driver(uuid, uuid, uuid, uuid, bigint, text, text, date, text, text, text, text),
  public.list_drivers(uuid, uuid, uuid, text, text, text, boolean, text, text, integer),
  public.get_driver(uuid, uuid, uuid, uuid),
  public.list_linkable_users(uuid, uuid, uuid, text, integer),
  public.link_driver_user(uuid, uuid, uuid, uuid, uuid),
  public.unlink_driver_user(uuid, uuid, uuid, uuid, text),
  public.reveal_document(uuid, uuid, uuid, text, uuid, text) to service_role;

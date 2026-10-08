-- Spec 007, US8: anonimização irreversível de dados pessoais, sem apagar nenhuma linha (RF-054 a RF-063, CA-015 a CA-017).
-- Três operações (motorista, cliente pessoa física e contato) exigem permissão própria, sessão com segundo fator (aal2), registro inativo
-- (exceto o contato), versão, motivo, justificativa e confirmação. Os campos pessoais são SOBRESCRITOS no próprio registro, os documentos
-- completos viram nulos e liberam a unicidade; o evento e a auditoria guardam só motivo, justificativa e a lista de campos, nunca valores.
-- Gatilhos recusam qualquer alteração posterior de registro anonimizado (`anonymized_record`), contornados só por estas funções.

create function private.session_has_aal2(p_actor uuid, p_session uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_sessions s where s.user_id = p_actor and s.session_id = p_session and s.status = 'active' and s.aal = 'aal2')
$$;

-- Recusa a alteração de registro já anonimizado, a não ser dentro das funções de anonimização.
create function private.guard_anonymized_row() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.anonymized_at is not null and coalesce(current_setting('app.registry_anonymizing', true), 'off') <> 'on' then
    raise exception using errcode = 'P0001', message = 'anonymized_record';
  end if;
  return new;
end $$;

-- A unidade de cliente pessoa física anonimizado também é imutável (a marca está no cliente pai).
create function private.guard_anonymized_site() returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('app.registry_anonymizing', true), 'off') <> 'on'
     and exists (select 1 from public.customers c where c.id = old.customer_id and c.anonymized_at is not null) then
    raise exception using errcode = 'P0001', message = 'anonymized_record';
  end if;
  return new;
end $$;

create trigger customers_guard_anonymized before update on public.customers for each row execute function private.guard_anonymized_row();
create trigger customer_contacts_guard_anonymized before update on public.customer_contacts for each row execute function private.guard_anonymized_row();
create trigger drivers_guard_anonymized before update on public.drivers for each row execute function private.guard_anonymized_row();
create trigger customer_documents_guard_anonymized before update on public.customer_documents for each row execute function private.guard_anonymized_row();
create trigger driver_documents_guard_anonymized before update on public.driver_documents for each row execute function private.guard_anonymized_row();
create trigger customer_sites_guard_anonymized before update on public.customer_sites for each row execute function private.guard_anonymized_site();

-- Validação comum: MFA, confirmação, motivo e justificativa. Devolve o código de recusa ou nulo.
create function private.anonymization_precheck(p_actor uuid, p_session uuid, p_confirmed boolean, p_reason text, p_justification text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not private.session_has_aal2(p_actor, p_session) then 'MFA_REQUIRED'
    when p_confirmed is distinct from true then 'CONFIRMATION_REQUIRED'
    when p_reason is null or p_reason not in ('data_subject_request', 'retention_expired', 'other') then 'VALIDATION_FAILED'
    when private.check_justification(p_justification) is null then 'JUSTIFICATION_REQUIRED'
  end
$$;

create function public.anonymize_driver(
  p_actor uuid, p_session uuid, p_organization uuid, p_driver uuid, p_expected_version bigint, p_reason text, p_justification text, p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  refused text;
  v_drv public.drivers;
  v_justification text := private.check_justification(p_justification);
  v_fields jsonb := '["full_name", "cpf", "cnh_number", "phone"]'::jsonb;
  v_when timestamptz := now();
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'driver.anonymize');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  refused := private.anonymization_precheck(p_actor, p_session, p_confirmed, p_reason, p_justification);
  if refused is not null then
    return case when refused = 'VALIDATION_FAILED' then jsonb_build_object('code', refused, 'fields', private.field_error('reason', 'Motivo desconhecido.')) else jsonb_build_object('code', refused) end;
  end if;
  select d.* into v_drv from public.drivers d where d.id = p_driver and d.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_drv.anonymized_at is not null then return jsonb_build_object('code', 'ALREADY_ANONYMIZED'); end if;
  if v_drv.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;
  if v_drv.status <> 'inactive' then return jsonb_build_object('code', 'ACTIVE_RECORD'); end if;

  perform set_config('app.registry_anonymizing', 'on', true);
  update public.driver_documents set cpf = null, cnh_number = null, anonymized_at = v_when where driver_id = p_driver;
  update public.drivers
     set full_name = 'Motorista anonimizado', phone = null, linked_user_id = null, cpf_display = 'anonimizado', cnh_display = 'anonimizado',
         anonymized_at = v_when, anonymized_by = p_actor, version = version + 1, updated_at = now()
   where id = p_driver;
  perform set_config('app.registry_anonymizing', 'off', true);

  if v_drv.linked_user_id is not null then
    v_fields := v_fields || '["linked_user"]'::jsonb;
    perform private.append_registry_event('driver', p_driver, p_organization, 'driver_user_unlinked', p_actor, p_session, v_justification, jsonb_build_object('by_anonymization', true));
  end if;
  perform private.append_registry_event('driver', p_driver, p_organization, 'person_anonymized', p_actor, p_session, v_justification, jsonb_build_object('fields', v_fields, 'reason', p_reason));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'driver.anonymize', 'driver', p_driver::text, 'success', p_reason, v_justification,
    jsonb_build_object('driver_id', p_driver, 'fields', v_fields, 'reason', p_reason));
  return jsonb_build_object('code', 'ANONYMIZED', 'anonymized_at', v_when, 'version', v_drv.version + 1);
end $$;

create function public.anonymize_customer(
  p_actor uuid, p_session uuid, p_organization uuid, p_customer uuid, p_expected_version bigint, p_reason text, p_justification text, p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  refused text;
  v_cust public.customers;
  v_justification text := private.check_justification(p_justification);
  v_fields jsonb := '["legal_name", "trade_name", "notes", "document", "contacts", "sites"]'::jsonb;
  v_contacts integer;
  v_sites integer;
  v_when timestamptz := now();
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.anonymize');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  refused := private.anonymization_precheck(p_actor, p_session, p_confirmed, p_reason, p_justification);
  if refused is not null then
    return case when refused = 'VALIDATION_FAILED' then jsonb_build_object('code', refused, 'fields', private.field_error('reason', 'Motivo desconhecido.')) else jsonb_build_object('code', refused) end;
  end if;
  select c.* into v_cust from public.customers c where c.id = p_customer and c.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_cust.anonymized_at is not null then return jsonb_build_object('code', 'ALREADY_ANONYMIZED'); end if;
  if v_cust.person_type <> 'individual' then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('customer_id', 'Só cliente pessoa física é anonimizado; para pessoa jurídica, anonimize os contatos.'));
  end if;
  if v_cust.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;
  if v_cust.status <> 'inactive' then return jsonb_build_object('code', 'ACTIVE_RECORD'); end if;

  perform set_config('app.registry_anonymizing', 'on', true);
  update public.customer_contacts
     set name = 'Contato anonimizado', role = null, phone = null, email = null, is_primary = false, anonymized_at = v_when, anonymized_by = p_actor, updated_at = now()
   where customer_id = p_customer and anonymized_at is null;
  get diagnostics v_contacts = row_count;
  update public.customer_sites
     set name = 'Unidade anonimizada ' || left(id::text, 8), number = 'S/N', complement = null, receiving_contact_name = null, receiving_contact_phone = null,
         receiving_days = null, receiving_from = null, receiving_to = null, access_instructions = null, latitude = null, longitude = null,
         version = version + 1, updated_at = now()
   where customer_id = p_customer;
  get diagnostics v_sites = row_count;
  update public.customer_documents set document_key = null, anonymized_at = v_when where customer_id = p_customer;
  update public.customers
     set legal_name = 'Cliente anonimizado', trade_name = null, notes = null, document_display = 'anonimizado', anonymized_at = v_when, anonymized_by = p_actor,
         version = version + 1, updated_at = now()
   where id = p_customer;
  perform set_config('app.registry_anonymizing', 'off', true);

  perform private.append_registry_event('customer', p_customer, p_organization, 'person_anonymized', p_actor, p_session, v_justification, jsonb_build_object('fields', v_fields, 'reason', p_reason));
  if v_contacts > 0 then
    perform private.append_registry_event('customer', p_customer, p_organization, 'contact_anonymized', p_actor, p_session, v_justification,
      jsonb_build_object('fields', '["name", "role", "phone", "email"]'::jsonb, 'reason', p_reason, 'contacts', v_contacts));
  end if;
  perform private.write_audit_event(p_organization, p_actor, p_session, 'customer.anonymize', 'customer', p_customer::text, 'success', p_reason, v_justification,
    jsonb_build_object('customer_id', p_customer, 'fields', v_fields, 'reason', p_reason, 'contacts', v_contacts, 'sites', v_sites));
  return jsonb_build_object('code', 'ANONYMIZED', 'anonymized_at', v_when, 'version', v_cust.version + 1, 'affected', jsonb_build_object('contacts', v_contacts, 'sites', v_sites));
end $$;

create function public.anonymize_contact(
  p_actor uuid, p_session uuid, p_organization uuid, p_contact uuid, p_reason text, p_justification text, p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  refused text;
  v_contact public.customer_contacts;
  v_justification text := private.check_justification(p_justification);
  v_fields jsonb := '["name", "role", "phone", "email"]'::jsonb;
  v_when timestamptz := now();
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.anonymize');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  refused := private.anonymization_precheck(p_actor, p_session, p_confirmed, p_reason, p_justification);
  if refused is not null then
    return case when refused = 'VALIDATION_FAILED' then jsonb_build_object('code', refused, 'fields', private.field_error('reason', 'Motivo desconhecido.')) else jsonb_build_object('code', refused) end;
  end if;
  select k.* into v_contact from public.customer_contacts k where k.id = p_contact and k.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_contact.anonymized_at is not null then return jsonb_build_object('code', 'ALREADY_ANONYMIZED'); end if;

  perform set_config('app.registry_anonymizing', 'on', true);
  update public.customer_contacts
     set name = 'Contato anonimizado', role = null, phone = null, email = null, is_primary = false, anonymized_at = v_when, anonymized_by = p_actor, updated_at = now()
   where id = p_contact;
  perform set_config('app.registry_anonymizing', 'off', true);

  perform private.append_registry_event('customer', v_contact.customer_id, p_organization, 'contact_anonymized', p_actor, p_session, v_justification,
    jsonb_build_object('fields', v_fields, 'reason', p_reason, 'contact_id', p_contact));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'customer.contact_anonymize', 'customer', v_contact.customer_id::text, 'success', p_reason, v_justification,
    jsonb_build_object('customer_id', v_contact.customer_id, 'contact_id', p_contact, 'fields', v_fields, 'reason', p_reason));
  return jsonb_build_object('code', 'ANONYMIZED', 'anonymized_at', v_when);
end $$;

revoke all on function private.session_has_aal2(uuid, uuid), private.guard_anonymized_row(), private.guard_anonymized_site(),
  private.anonymization_precheck(uuid, uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function
  public.anonymize_driver(uuid, uuid, uuid, uuid, bigint, text, text, boolean),
  public.anonymize_customer(uuid, uuid, uuid, uuid, bigint, text, text, boolean),
  public.anonymize_contact(uuid, uuid, uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function
  public.anonymize_driver(uuid, uuid, uuid, uuid, bigint, text, text, boolean),
  public.anonymize_customer(uuid, uuid, uuid, uuid, bigint, text, text, boolean),
  public.anonymize_contact(uuid, uuid, uuid, uuid, text, text, boolean) to service_role;

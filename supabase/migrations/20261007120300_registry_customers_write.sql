-- Spec 007, US1: cadastro e edição de clientes, contatos e unidades (RF-001 a RF-007, RF-031, RF-032, RF-038).
-- Toda RPC recebe ator e sessão do servidor (nunca do cliente), confere a permissão no banco a cada chamada e devolve um jsonb
-- com `code`. O evento de histórico e a auditoria entram na mesma transação do comando. Nenhum documento, nome, telefone ou
-- e-mail de pessoa física vai para evento ou auditoria: só o nome do campo (research.md, decisões 4 e 15).

-- Documento do cliente normalizado (CNPJ: maiúsculas e sem pontuação; CPF: só dígitos), ou nulo quando inválido para o tipo.
create function private.normalize_customer_document(p_person_type text, p_document text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text;
begin
  if p_person_type = 'legal' then
    v := upper(regexp_replace(coalesce(p_document, ''), '[./-]', '', 'g'));
    return case when private.validate_cnpj(v) then v end;
  elsif p_person_type = 'individual' then
    v := regexp_replace(coalesce(p_document, ''), '[^0-9]', '', 'g');
    return case when private.validate_cpf(v) then v end;
  end if;
  return null;
end $$;

create function private.mask_cpf(p_cpf text) returns text language sql immutable set search_path = '' as $$
  select case when p_cpf ~ '^[0-9]{11}$' then '***.***.***-' || right(p_cpf, 2) else '***.***.***-**' end
$$;

-- Contatos (RF-003): lista de objetos {name, role, phone, email, is_primary}. Telefone e e-mail são normalizados aqui
-- (só dígitos; minúsculas) e validados; devolve os erros por campo (`contacts.<índice>.<campo>`) e, quando válida, a lista normalizada.
create function private.validate_contacts(p_contacts jsonb, out errors jsonb, out normalized jsonb)
language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  idx integer := 0;
  v_name text;
  v_role text;
  v_phone text;
  v_email text;
  v_primary boolean;
  primaries integer := 0;
  result jsonb := '[]'::jsonb;
begin
  errors := '[]'::jsonb;
  if p_contacts is null then
    normalized := '[]'::jsonb;
    return;
  end if;
  if jsonb_typeof(p_contacts) <> 'array' then
    errors := private.field_error('contacts', 'Informe os contatos como uma lista.');
    return;
  end if;
  if jsonb_array_length(p_contacts) > 10 then
    errors := errors || private.field_error('contacts', 'Use no máximo 10 contatos.');
  end if;
  for item in select * from jsonb_array_elements(p_contacts) loop
    v_name := btrim(coalesce(item->>'name', ''));
    v_role := nullif(btrim(coalesce(item->>'role', '')), '');
    v_phone := nullif(regexp_replace(coalesce(item->>'phone', ''), '[^0-9]', '', 'g'), '');
    v_email := nullif(lower(btrim(coalesce(item->>'email', ''))), '');
    v_primary := coalesce((item->>'is_primary')::boolean, false);
    if char_length(v_name) not between 2 and 120 then
      errors := errors || private.field_error('contacts.' || idx || '.name', 'Informe o nome do contato com 2 a 120 caracteres.');
    end if;
    if v_role is not null and char_length(v_role) > 80 then
      errors := errors || private.field_error('contacts.' || idx || '.role', 'Use até 80 caracteres na função.');
    end if;
    if v_phone is not null and v_phone !~ '^[0-9]{10,11}$' then
      errors := errors || private.field_error('contacts.' || idx || '.phone', 'Informe o telefone com DDD, 10 ou 11 dígitos.');
    end if;
    if v_email is not null and (char_length(v_email) > 160 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
      errors := errors || private.field_error('contacts.' || idx || '.email', 'Informe um e-mail válido.');
    end if;
    if v_primary then primaries := primaries + 1; end if;
    result := result || jsonb_build_array(jsonb_build_object('name', v_name, 'role', v_role, 'phone', v_phone, 'email', v_email, 'is_primary', v_primary, 'position', idx));
    idx := idx + 1;
  end loop;
  if primaries > 1 then
    errors := errors || private.field_error('contacts', 'Marque só um contato como principal.');
  end if;
  normalized := result;
end $$;

-- Campos cadastrais do cliente (RF-001), repetidos no servidor. Devolve a lista de erros por campo (vazia quando válido).
create function private.validate_customer_fields(p_person_type text, p_legal_name text, p_trade_name text, p_segment text, p_segment_detail text, p_notes text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  errors jsonb := '[]'::jsonb;
begin
  if char_length(btrim(coalesce(p_legal_name, ''))) not between 2 and 160 then
    errors := errors || private.field_error('legal_name', 'Informe o nome com 2 a 160 caracteres.');
  end if;
  if p_trade_name is not null and char_length(p_trade_name) > 160 then
    errors := errors || private.field_error('trade_name', 'Use até 160 caracteres no nome fantasia.');
  end if;
  if p_segment is null or p_segment not in ('hospital', 'clinic', 'laboratory', 'industry', 'distributor', 'other') then
    errors := errors || private.field_error('segment', 'Escolha o segmento.');
  elsif p_segment = 'other' and (p_segment_detail is null or char_length(btrim(p_segment_detail)) not between 1 and 60) then
    errors := errors || private.field_error('segment_detail', 'Descreva o segmento em até 60 caracteres.');
  end if;
  if p_notes is not null and char_length(p_notes) > 500 then
    errors := errors || private.field_error('notes', 'Use até 500 caracteres nas observações.');
  end if;
  return errors;
end $$;

create function public.create_customer(
  p_actor uuid, p_session uuid, p_organization uuid, p_person_type text, p_document text, p_legal_name text, p_trade_name text,
  p_segment text, p_segment_detail text, p_notes text, p_contacts jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  errors jsonb;
  contacts_errors jsonb;
  v_contacts jsonb;
  v_key text;
  v_name text := btrim(coalesce(p_legal_name, ''));
  v_trade text := nullif(btrim(coalesce(p_trade_name, '')), '');
  v_detail text := case when p_segment = 'other' then nullif(btrim(coalesce(p_segment_detail, '')), '') end;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_owner public.customers;
  v_customer uuid;
  contact jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  errors := private.validate_customer_fields(p_person_type, v_name, v_trade, p_segment, v_detail, v_notes);
  if p_person_type is null or p_person_type not in ('legal', 'individual') then
    errors := errors || private.field_error('person_type', 'Escolha pessoa jurídica ou pessoa física.');
  else
    v_key := private.normalize_customer_document(p_person_type, p_document);
    if v_key is null then
      errors := errors || private.field_error('document', case p_person_type when 'legal' then 'Informe um CNPJ válido.' else 'Informe um CPF válido.' end);
    end if;
  end if;
  select c.errors, c.normalized into contacts_errors, v_contacts from private.validate_contacts(p_contacts) c;
  errors := errors || contacts_errors;
  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors);
  end if;

  -- Unicidade do documento por organização, sob bloqueio consultivo (sem criar nada pela metade).
  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':customer-document:' || v_key, 0));
  select c.* into v_owner from public.customer_documents d join public.customers c on c.id = d.customer_id
   where d.organization_id = p_organization and d.document_key = v_key;
  if found then
    return jsonb_build_object('code', 'DOCUMENT_CONFLICT', 'entity_id', v_owner.id, 'owner_name', v_owner.legal_name);
  end if;

  insert into public.customers (organization_id, person_type, document_display, legal_name, trade_name, segment, segment_detail, notes, created_by)
  values (p_organization, p_person_type, case p_person_type when 'legal' then v_key else private.mask_cpf(v_key) end,
          v_name, v_trade, p_segment, v_detail, v_notes, p_actor)
  returning id into v_customer;
  insert into public.customer_documents (customer_id, organization_id, kind, document_key)
  values (v_customer, p_organization, case p_person_type when 'legal' then 'cnpj' else 'cpf' end, v_key);
  for contact in select * from jsonb_array_elements(v_contacts) loop
    insert into public.customer_contacts (organization_id, customer_id, name, role, phone, email, is_primary, position)
    values (p_organization, v_customer, contact->>'name', contact->>'role', contact->>'phone', contact->>'email',
            (contact->>'is_primary')::boolean, (contact->>'position')::smallint);
  end loop;

  perform private.append_registry_event('customer', v_customer, p_organization, 'customer_created', p_actor, p_session, null,
    jsonb_build_object('person_type', p_person_type, 'segment', p_segment, 'contacts', jsonb_array_length(v_contacts)));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'customer.create', 'customer', v_customer::text, 'success', null, null,
    jsonb_build_object('customer_id', v_customer, 'person_type', p_person_type));
  return jsonb_build_object('code', 'CREATED', 'customer_id', v_customer, 'version', 1);
end $$;

create function public.update_customer(
  p_actor uuid, p_session uuid, p_organization uuid, p_customer uuid, p_expected_version bigint, p_legal_name text, p_trade_name text,
  p_segment text, p_segment_detail text, p_notes text, p_contacts jsonb, p_document text, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  errors jsonb;
  contacts_errors jsonb;
  v_contacts jsonb;
  v_cust public.customers;
  v_name text := btrim(coalesce(p_legal_name, ''));
  v_trade text := nullif(btrim(coalesce(p_trade_name, '')), '');
  v_detail text := case when p_segment = 'other' then nullif(btrim(coalesce(p_segment_detail, '')), '') end;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_justification text := nullif(btrim(coalesce(p_justification, '')), '');
  v_key text;
  v_old_key text;
  v_owner public.customers;
  v_personal boolean;
  changes jsonb := '[]'::jsonb;
  sensitive jsonb := '[]'::jsonb;
  contact jsonb;
  v_new_version bigint;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  select c.* into v_cust from public.customers c where c.id = p_customer and c.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_cust.anonymized_at is not null then return jsonb_build_object('code', 'ANONYMIZED_RECORD'); end if;
  if v_cust.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;
  if v_cust.status <> 'active' then return jsonb_build_object('code', 'INACTIVE_RECORD'); end if;

  errors := private.validate_customer_fields(v_cust.person_type, v_name, v_trade, p_segment, v_detail, v_notes);
  if p_contacts is not null then
    select c.errors, c.normalized into contacts_errors, v_contacts from private.validate_contacts(p_contacts) c;
    errors := errors || contacts_errors;
  end if;
  if p_document is not null then
    v_key := private.normalize_customer_document(v_cust.person_type, p_document);
    if v_key is null then
      errors := errors || private.field_error('document', case v_cust.person_type when 'legal' then 'Informe um CNPJ válido.' else 'Informe um CPF válido.' end);
    end if;
  end if;
  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors);
  end if;
  if p_document is not null and (v_justification is null or char_length(v_justification) not between 5 and 500) then
    return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED');
  end if;

  if v_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':customer-document:' || v_key, 0));
    select c.* into v_owner from public.customer_documents d join public.customers c on c.id = d.customer_id
     where d.organization_id = p_organization and d.document_key = v_key and d.customer_id <> p_customer;
    if found then
      return jsonb_build_object('code', 'DOCUMENT_CONFLICT', 'entity_id', v_owner.id, 'owner_name', v_owner.legal_name);
    end if;
  end if;

  -- Campos pessoais (nome, nome fantasia e observações de cliente pessoa física) só aparecem no evento pelo nome do campo.
  v_personal := v_cust.person_type = 'individual';
  if v_name is distinct from v_cust.legal_name then
    if v_personal then sensitive := sensitive || to_jsonb('legal_name'::text);
    else changes := changes || jsonb_build_array(jsonb_build_object('field', 'legal_name', 'old', v_cust.legal_name, 'new', v_name)); end if;
  end if;
  if v_trade is distinct from v_cust.trade_name then
    if v_personal then sensitive := sensitive || to_jsonb('trade_name'::text);
    else changes := changes || jsonb_build_array(jsonb_build_object('field', 'trade_name', 'old', v_cust.trade_name, 'new', v_trade)); end if;
  end if;
  if v_notes is distinct from v_cust.notes then
    if v_personal then sensitive := sensitive || to_jsonb('notes'::text);
    else changes := changes || jsonb_build_array(jsonb_build_object('field', 'notes', 'old', v_cust.notes, 'new', v_notes)); end if;
  end if;
  if p_segment is distinct from v_cust.segment then
    changes := changes || jsonb_build_array(jsonb_build_object('field', 'segment', 'old', v_cust.segment, 'new', p_segment));
  end if;
  if v_detail is distinct from v_cust.segment_detail then
    changes := changes || jsonb_build_array(jsonb_build_object('field', 'segment_detail', 'old', v_cust.segment_detail, 'new', v_detail));
  end if;

  update public.customers
     set legal_name = v_name, trade_name = v_trade, segment = p_segment, segment_detail = v_detail, notes = v_notes,
         version = version + 1, updated_at = now()
   where id = p_customer
   returning version into v_new_version;

  if v_key is not null then
    select d.document_key into v_old_key from public.customer_documents d where d.customer_id = p_customer;
    if v_old_key is distinct from v_key then
      update public.customer_documents set document_key = v_key where customer_id = p_customer;
      update public.customers set document_display = case v_cust.person_type when 'legal' then v_key else private.mask_cpf(v_key) end where id = p_customer;
      perform private.append_registry_event('customer', p_customer, p_organization, 'document_changed', p_actor, p_session, v_justification,
        case v_cust.person_type when 'legal' then jsonb_build_object('kind', 'cnpj', 'old', v_old_key, 'new', v_key) else jsonb_build_object('kind', 'cpf') end);
    end if;
  end if;

  if p_contacts is not null then
    -- A substituição é a única exceção à regra de não excluir: o gatilho só aceita o delete com esta variável de sessão ligada
    -- e nunca para contato anonimizado, que permanece.
    perform set_config('app.registry_contacts_replace', 'on', true);
    delete from public.customer_contacts where customer_id = p_customer and anonymized_at is null;
    perform set_config('app.registry_contacts_replace', 'off', true);
    for contact in select * from jsonb_array_elements(v_contacts) loop
      insert into public.customer_contacts (organization_id, customer_id, name, role, phone, email, is_primary, position)
      values (p_organization, p_customer, contact->>'name', contact->>'role', contact->>'phone', contact->>'email',
              (contact->>'is_primary')::boolean, (contact->>'position')::smallint);
    end loop;
    perform private.append_registry_event('customer', p_customer, p_organization, 'contacts_changed', p_actor, p_session, null,
      jsonb_build_object('count', jsonb_array_length(v_contacts)));
  end if;

  if jsonb_array_length(changes) > 0 or jsonb_array_length(sensitive) > 0 then
    perform private.append_registry_event('customer', p_customer, p_organization, 'customer_updated', p_actor, p_session, null,
      jsonb_build_object('changes', changes, 'changed_sensitive', sensitive));
  end if;
  perform private.write_audit_event(p_organization, p_actor, p_session, 'customer.update', 'customer', p_customer::text, 'success', null, null,
    jsonb_build_object('customer_id', p_customer));
  return jsonb_build_object('code', 'UPDATED', 'version', v_new_version);
end $$;

-- Unidade (RF-005 a RF-007). A unidade não depende do serviço de CEP: todos os campos de endereço são aceitos digitados.
create function private.validate_site_fields(
  p_name text, p_postal_code text, p_street text, p_number text, p_complement text, p_district text, p_city text, p_state text, p_ibge text,
  p_latitude numeric, p_longitude numeric, p_contact_name text, p_contact_phone text, p_days smallint[], p_from time, p_to time, p_access text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  errors jsonb := '[]'::jsonb;
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 120 then
    errors := errors || private.field_error('name', 'Informe o nome da unidade com 2 a 120 caracteres.');
  end if;
  if p_postal_code is null or p_postal_code !~ '^[0-9]{8}$' then
    errors := errors || private.field_error('postal_code', 'Informe o CEP com 8 dígitos.');
  end if;
  if char_length(btrim(coalesce(p_street, ''))) not between 1 and 120 then
    errors := errors || private.field_error('street', 'Informe o logradouro com até 120 caracteres.');
  end if;
  if char_length(btrim(coalesce(p_number, ''))) not between 1 and 20 then
    errors := errors || private.field_error('number', 'Informe o número (ou S/N) com até 20 caracteres.');
  end if;
  if p_complement is not null and char_length(p_complement) > 80 then
    errors := errors || private.field_error('complement', 'Use até 80 caracteres no complemento.');
  end if;
  if p_district is not null and char_length(p_district) > 80 then
    errors := errors || private.field_error('district', 'Use até 80 caracteres no bairro.');
  end if;
  if char_length(btrim(coalesce(p_city, ''))) not between 1 and 80 then
    errors := errors || private.field_error('city', 'Informe a cidade com até 80 caracteres.');
  end if;
  if p_state is null or not (p_state = any (array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])) then
    errors := errors || private.field_error('state', 'Escolha uma UF válida.');
  end if;
  if p_ibge is not null and p_ibge !~ '^[0-9]{7}$' then
    errors := errors || private.field_error('ibge_code', 'O código do município tem 7 dígitos.');
  end if;
  if (p_latitude is null) <> (p_longitude is null) then
    errors := errors || private.field_error(case when p_latitude is null then 'latitude' else 'longitude' end, 'Informe latitude e longitude juntas.');
  elsif p_latitude is not null then
    if p_latitude not between -90 and 90 then errors := errors || private.field_error('latitude', 'A latitude vai de -90 a 90.'); end if;
    if p_longitude not between -180 and 180 then errors := errors || private.field_error('longitude', 'A longitude vai de -180 a 180.'); end if;
  end if;
  if p_contact_name is not null and char_length(p_contact_name) > 120 then
    errors := errors || private.field_error('receiving_contact_name', 'Use até 120 caracteres no nome do responsável.');
  end if;
  if p_contact_phone is not null and p_contact_phone !~ '^[0-9]{10,11}$' then
    errors := errors || private.field_error('receiving_contact_phone', 'Informe o telefone com DDD, 10 ou 11 dígitos.');
  end if;
  if p_days is not null and not private.week_days_valid(p_days) then
    errors := errors || private.field_error('receiving_days', 'Marque dias da semana sem repetir.');
  end if;
  if (p_from is null) <> (p_to is null) then
    errors := errors || private.field_error(case when p_from is null then 'receiving_from' else 'receiving_to' end, 'Informe os dois horários.');
  elsif p_from is not null then
    if p_to <= p_from then errors := errors || private.field_error('receiving_to', 'O horário final deve ser depois do inicial.'); end if;
    if p_days is null then errors := errors || private.field_error('receiving_days', 'Marque ao menos um dia de recebimento.'); end if;
  end if;
  if p_access is not null and char_length(p_access) > 500 then
    errors := errors || private.field_error('access_instructions', 'Use até 500 caracteres nas instruções de acesso.');
  end if;
  return errors;
end $$;

create function public.create_site(
  p_actor uuid, p_session uuid, p_organization uuid, p_customer uuid, p_name text, p_postal_code text, p_street text, p_number text,
  p_complement text, p_district text, p_city text, p_state text, p_ibge_code text, p_latitude numeric, p_longitude numeric,
  p_receiving_contact_name text, p_receiving_contact_phone text, p_receiving_days smallint[], p_receiving_from time, p_receiving_to time,
  p_access_instructions text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  errors jsonb;
  v_cust public.customers;
  v_name text := btrim(coalesce(p_name, ''));
  v_site uuid;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  -- Trava o cliente em modo compartilhado: uma inativação em cascata concorrente espera esta criação (e conta a unidade nova) ou é esperada
  -- por ela (e então a unidade é recusada), de modo que nunca sobra unidade ativa sob cliente inativo.
  select c.* into v_cust from public.customers c where c.id = p_customer and c.organization_id = p_organization for share;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_cust.anonymized_at is not null then return jsonb_build_object('code', 'ANONYMIZED_RECORD'); end if;
  if v_cust.status <> 'active' then return jsonb_build_object('code', 'PARENT_INACTIVE'); end if;

  errors := private.validate_site_fields(v_name, p_postal_code, btrim(coalesce(p_street, '')), btrim(coalesce(p_number, '')),
    nullif(btrim(coalesce(p_complement, '')), ''), nullif(btrim(coalesce(p_district, '')), ''), btrim(coalesce(p_city, '')), p_state, p_ibge_code,
    p_latitude, p_longitude, nullif(btrim(coalesce(p_receiving_contact_name, '')), ''), p_receiving_contact_phone, p_receiving_days,
    p_receiving_from, p_receiving_to, nullif(btrim(coalesce(p_access_instructions, '')), ''));
  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_customer::text || ':site-name:' || lower(v_name), 0));
  if exists (select 1 from public.customer_sites s where s.customer_id = p_customer and lower(btrim(s.name)) = lower(v_name)) then
    return jsonb_build_object('code', 'NAME_CONFLICT');
  end if;

  insert into public.customer_sites (organization_id, customer_id, name, postal_code, street, number, complement, district, city, state, ibge_code,
    latitude, longitude, receiving_contact_name, receiving_contact_phone, receiving_days, receiving_from, receiving_to, access_instructions, created_by)
  values (p_organization, p_customer, v_name, p_postal_code, btrim(p_street), btrim(p_number), nullif(btrim(coalesce(p_complement, '')), ''),
    nullif(btrim(coalesce(p_district, '')), ''), btrim(p_city), p_state, p_ibge_code, p_latitude, p_longitude,
    nullif(btrim(coalesce(p_receiving_contact_name, '')), ''), p_receiving_contact_phone, p_receiving_days, p_receiving_from, p_receiving_to,
    nullif(btrim(coalesce(p_access_instructions, '')), ''), p_actor)
  returning id into v_site;

  -- O nome da unidade de pessoa física é dado pessoal e não entra no evento; o de pessoa jurídica também fica só no cadastro.
  perform private.append_registry_event('site', v_site, p_organization, 'site_created', p_actor, p_session, null,
    jsonb_build_object('customer_id', p_customer, 'state', p_state));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'site.create', 'site', v_site::text, 'success', null, null,
    jsonb_build_object('site_id', v_site, 'customer_id', p_customer));
  return jsonb_build_object('code', 'CREATED', 'site_id', v_site, 'version', 1);
end $$;

create function public.update_site(
  p_actor uuid, p_session uuid, p_organization uuid, p_site uuid, p_expected_version bigint, p_name text, p_postal_code text, p_street text,
  p_number text, p_complement text, p_district text, p_city text, p_state text, p_ibge_code text, p_latitude numeric, p_longitude numeric,
  p_receiving_contact_name text, p_receiving_contact_phone text, p_receiving_days smallint[], p_receiving_from time, p_receiving_to time,
  p_access_instructions text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  errors jsonb;
  v_site public.customer_sites;
  v_person text;
  v_name text := btrim(coalesce(p_name, ''));
  v_street text := btrim(coalesce(p_street, ''));
  v_number text := btrim(coalesce(p_number, ''));
  v_complement text := nullif(btrim(coalesce(p_complement, '')), '');
  v_district text := nullif(btrim(coalesce(p_district, '')), '');
  v_city text := btrim(coalesce(p_city, ''));
  v_contact_name text := nullif(btrim(coalesce(p_receiving_contact_name, '')), '');
  v_access text := nullif(btrim(coalesce(p_access_instructions, '')), '');
  changes jsonb := '[]'::jsonb;
  sensitive jsonb := '[]'::jsonb;
  v_new_version bigint;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.write');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select s.* into v_site from public.customer_sites s where s.id = p_site and s.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if exists (select 1 from public.customers c where c.id = v_site.customer_id and c.anonymized_at is not null) then return jsonb_build_object('code', 'ANONYMIZED_RECORD'); end if;
  if v_site.version <> p_expected_version then return jsonb_build_object('code', 'VERSION_CONFLICT'); end if;
  if v_site.status <> 'active' then return jsonb_build_object('code', 'INACTIVE_RECORD'); end if;

  errors := private.validate_site_fields(v_name, p_postal_code, v_street, v_number, v_complement, v_district, v_city, p_state, p_ibge_code,
    p_latitude, p_longitude, v_contact_name, p_receiving_contact_phone, p_receiving_days, p_receiving_from, p_receiving_to, v_access);
  if jsonb_array_length(errors) > 0 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_site.customer_id::text || ':site-name:' || lower(v_name), 0));
  if exists (select 1 from public.customer_sites s where s.customer_id = v_site.customer_id and s.id <> p_site and lower(btrim(s.name)) = lower(v_name)) then
    return jsonb_build_object('code', 'NAME_CONFLICT');
  end if;

  -- Em unidade de cliente pessoa física todo campo é pessoal (o evento só cita o nome do campo); em cliente jurídico, só o
  -- responsável pelo recebimento e seu telefone são pessoais.
  select c.person_type into v_person from public.customers c where c.id = v_site.customer_id;
  declare
    pair record;
    personal boolean;
  begin
    for pair in
      select * from (values
        ('name', v_site.name, v_name, false), ('postal_code', v_site.postal_code, p_postal_code, false), ('street', v_site.street, v_street, false),
        ('number', v_site.number, v_number, false), ('complement', v_site.complement, v_complement, false), ('district', v_site.district, v_district, false),
        ('city', v_site.city, v_city, false), ('state', v_site.state, p_state, false), ('ibge_code', v_site.ibge_code, p_ibge_code, false),
        ('latitude', v_site.latitude::text, p_latitude::text, false), ('longitude', v_site.longitude::text, p_longitude::text, false),
        ('receiving_contact_name', v_site.receiving_contact_name, v_contact_name, true),
        ('receiving_contact_phone', v_site.receiving_contact_phone, p_receiving_contact_phone, true),
        ('receiving_days', v_site.receiving_days::text, p_receiving_days::text, false),
        ('receiving_from', v_site.receiving_from::text, p_receiving_from::text, false), ('receiving_to', v_site.receiving_to::text, p_receiving_to::text, false),
        ('access_instructions', v_site.access_instructions, v_access, false)
      ) as t(field, old_value, new_value, always_personal)
      where t.old_value is distinct from t.new_value
    loop
      personal := pair.always_personal or v_person = 'individual';
      if personal then sensitive := sensitive || to_jsonb(pair.field::text);
      else changes := changes || jsonb_build_array(jsonb_build_object('field', pair.field, 'old', pair.old_value, 'new', pair.new_value)); end if;
    end loop;
  end;

  update public.customer_sites
     set name = v_name, postal_code = p_postal_code, street = v_street, number = v_number, complement = v_complement, district = v_district,
         city = v_city, state = p_state, ibge_code = p_ibge_code, latitude = p_latitude, longitude = p_longitude,
         receiving_contact_name = v_contact_name, receiving_contact_phone = p_receiving_contact_phone, receiving_days = p_receiving_days,
         receiving_from = p_receiving_from, receiving_to = p_receiving_to, access_instructions = v_access, version = version + 1, updated_at = now()
   where id = p_site
   returning version into v_new_version;

  perform private.append_registry_event('site', p_site, p_organization, 'site_updated', p_actor, p_session, null,
    jsonb_build_object('changes', changes, 'changed_sensitive', sensitive));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'site.update', 'site', p_site::text, 'success', null, null,
    jsonb_build_object('site_id', p_site, 'customer_id', v_site.customer_id));
  return jsonb_build_object('code', 'UPDATED', 'version', v_new_version);
end $$;

revoke all on function private.normalize_customer_document(text, text), private.mask_cpf(text), private.validate_contacts(jsonb),
  private.validate_customer_fields(text, text, text, text, text, text),
  private.validate_site_fields(text, text, text, text, text, text, text, text, text, numeric, numeric, text, text, smallint[], time, time, text)
  from public, anon, authenticated;

revoke all on function public.create_customer(uuid, uuid, uuid, text, text, text, text, text, text, text, jsonb),
  public.update_customer(uuid, uuid, uuid, uuid, bigint, text, text, text, text, text, jsonb, text, text),
  public.create_site(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, numeric, numeric, text, text, smallint[], time, time, text),
  public.update_site(uuid, uuid, uuid, uuid, bigint, text, text, text, text, text, text, text, text, text, numeric, numeric, text, text, smallint[], time, time, text)
  from public, anon, authenticated;
grant execute on function public.create_customer(uuid, uuid, uuid, text, text, text, text, text, text, text, jsonb),
  public.update_customer(uuid, uuid, uuid, uuid, bigint, text, text, text, text, text, jsonb, text, text),
  public.create_site(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, numeric, numeric, text, text, smallint[], time, time, text),
  public.update_site(uuid, uuid, uuid, uuid, bigint, text, text, text, text, text, text, text, text, text, numeric, numeric, text, text, smallint[], time, time, text)
  to service_role;

-- Conferência de permissão para a função de CEP, que não tem RPC de domínio: devolve OK, AUTH_REQUIRED (sessão inválida) ou
-- ACCESS_DENIED (sem vínculo, papel ou permissão), com o mesmo critério das RPCs de escrita.
create function public.check_registry_permission(p_actor uuid, p_session uuid, p_organization uuid, p_permission text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, p_permission);
  return jsonb_build_object('code', coalesce(denied, 'OK'));
end $$;

revoke all on function public.check_registry_permission(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.check_registry_permission(uuid, uuid, uuid, text) to service_role;

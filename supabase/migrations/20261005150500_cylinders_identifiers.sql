-- Spec 006, US5: acrescentar, desativar e transferir identificadores (RF-007 a RF-012, RF-040).
-- Um valor ativo pertence a um só cilindro por organização. Um valor que já existiu (desativado) só volta por transferência
-- explícita, confirmada, justificada, atômica e auditada, com evento nos cilindros de origem e de destino (RF-011).

create function public.add_cylinder_identifier(
  p_actor uuid, p_session uuid, p_organization uuid, p_cylinder uuid, p_kind text, p_value text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  errors jsonb := '[]'::jsonb;
  v_value text := btrim(coalesce(p_value, ''));
  v_cyl public.cylinders;
  v_owner uuid;
  v_id uuid;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.identifier');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  select c.* into v_cyl from public.cylinders c where c.id = p_cylinder and c.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_cyl.status <> 'active' then return jsonb_build_object('code', 'CYLINDER_INACTIVE'); end if;

  if p_kind is null or p_kind not in ('qr_code', 'data_matrix', 'nfc_tag', 'hull_number') then
    errors := errors || private.field_error('kind', 'Escolha o tipo do identificador.');
  end if;
  if char_length(v_value) not between 1 and 200 or v_value ~ '[\r\n]' then
    errors := errors || private.field_error('value', 'Informe o valor do identificador com até 200 caracteres.');
  end if;
  if jsonb_array_length(errors) > 0 then return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors); end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':ident:' || upper(v_value), 0));
  select i.cylinder_id into v_owner from public.cylinder_identifiers i
   where i.organization_id = p_organization and i.value_normalized = upper(v_value) and i.status = 'active';
  if found then return jsonb_build_object('code', 'IDENTIFIER_CONFLICT', 'cylinder_id', v_owner); end if;
  if exists (select 1 from public.cylinder_identifiers i where i.organization_id = p_organization and i.value_normalized = upper(v_value)) then
    return jsonb_build_object('code', 'IDENTIFIER_UNAVAILABLE');
  end if;

  insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value, created_by)
  values (p_organization, p_cylinder, p_kind, v_value, p_actor) returning id into v_id;
  perform private.append_cylinder_event(p_cylinder, p_organization, 'identifier_added', p_actor, p_session, null,
    jsonb_build_object('identifier_id', v_id, 'kind', p_kind));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'cylinder.identifier_add', 'cylinder', p_cylinder::text, 'success', null, null,
    jsonb_build_object('cylinder_id', p_cylinder, 'identifier_id', v_id));
  return jsonb_build_object('code', 'OK', 'identifier_id', v_id);
end $$;

create function public.deactivate_cylinder_identifier(
  p_actor uuid, p_session uuid, p_organization uuid, p_identifier uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_ident public.cylinder_identifiers;
  v_justification text := btrim(coalesce(p_justification, ''));
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.identifier');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  select i.* into v_ident from public.cylinder_identifiers i where i.id = p_identifier and i.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  -- Bloqueia o cilindro (também o inativo: desativar é o caminho para liberar a etiqueta) para ordenar os eventos.
  perform 1 from public.cylinders c where c.id = v_ident.cylinder_id and c.organization_id = p_organization for update;
  if char_length(v_justification) not between 5 and 500 then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  select i.* into v_ident from public.cylinder_identifiers i where i.id = p_identifier;
  if v_ident.status <> 'active' then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('identifier_id', 'Este identificador já está desativado.'));
  end if;

  update public.cylinder_identifiers
     set status = 'deactivated', deactivated_at = now(), deactivated_by = p_actor, deactivation_justification = v_justification
   where id = p_identifier;
  perform private.append_cylinder_event(v_ident.cylinder_id, p_organization, 'identifier_deactivated', p_actor, p_session, v_justification,
    jsonb_build_object('identifier_id', p_identifier, 'kind', v_ident.kind));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'cylinder.identifier_deactivate', 'cylinder', v_ident.cylinder_id::text, 'success', null, v_justification,
    jsonb_build_object('cylinder_id', v_ident.cylinder_id, 'identifier_id', p_identifier));
  return jsonb_build_object('code', 'OK');
end $$;

create function public.transfer_cylinder_identifier(
  p_actor uuid, p_session uuid, p_organization uuid, p_value text, p_target uuid, p_justification text, p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_value text := upper(btrim(coalesce(p_value, '')));
  v_justification text := btrim(coalesce(p_justification, ''));
  v_source public.cylinder_identifiers;
  v_owner uuid;
  v_target public.cylinders;
  v_new uuid;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.identifier');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if p_confirmed is distinct from true then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('confirmed', 'Confirme a transferência.'));
  end if;
  if char_length(v_justification) not between 5 and 500 then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  if char_length(v_value) not between 1 and 200 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('value', 'Informe o valor do identificador.'));
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':ident:' || v_value, 0));
  select i.cylinder_id into v_owner from public.cylinder_identifiers i
   where i.organization_id = p_organization and i.value_normalized = v_value and i.status = 'active';
  if found then return jsonb_build_object('code', 'IDENTIFIER_CONFLICT', 'cylinder_id', v_owner); end if;
  select i.* into v_source from public.cylinder_identifiers i
   where i.organization_id = p_organization and i.value_normalized = v_value and i.status = 'deactivated' and i.transferred_to_identifier_id is null
   order by i.deactivated_at desc, i.id limit 1;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;

  select c.* into v_target from public.cylinders c where c.id = p_target and c.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_target.status <> 'active' then return jsonb_build_object('code', 'CYLINDER_INACTIVE'); end if;

  -- Bloqueia origem e destino sempre na mesma ordem para não haver impasse entre transferências simultâneas.
  perform 1 from public.cylinders c where c.id in (v_source.cylinder_id, p_target) and c.organization_id = p_organization order by c.id for update;

  insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value, created_by)
  values (p_organization, p_target, v_source.kind, v_source.value, p_actor) returning id into v_new;
  update public.cylinder_identifiers set transferred_to_identifier_id = v_new where id = v_source.id;

  perform private.append_cylinder_event(v_source.cylinder_id, p_organization, 'identifier_transferred_out', p_actor, p_session, v_justification,
    jsonb_build_object('identifier_id', v_source.id, 'new_identifier_id', v_new, 'to_cylinder_id', p_target, 'kind', v_source.kind));
  perform private.append_cylinder_event(p_target, p_organization, 'identifier_transferred_in', p_actor, p_session, v_justification,
    jsonb_build_object('identifier_id', v_new, 'previous_identifier_id', v_source.id, 'from_cylinder_id', v_source.cylinder_id, 'kind', v_source.kind));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'cylinder.identifier_transfer', 'cylinder', p_target::text, 'success', null, v_justification,
    jsonb_build_object('from_cylinder_id', v_source.cylinder_id, 'to_cylinder_id', p_target, 'identifier_id', v_new));
  return jsonb_build_object('code', 'OK', 'identifier_id', v_new);
end $$;

revoke all on function public.add_cylinder_identifier(uuid, uuid, uuid, uuid, text, text),
  public.deactivate_cylinder_identifier(uuid, uuid, uuid, uuid, text),
  public.transfer_cylinder_identifier(uuid, uuid, uuid, text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.add_cylinder_identifier(uuid, uuid, uuid, uuid, text, text),
  public.deactivate_cylinder_identifier(uuid, uuid, uuid, uuid, text),
  public.transfer_cylinder_identifier(uuid, uuid, uuid, text, uuid, text, boolean) to service_role;

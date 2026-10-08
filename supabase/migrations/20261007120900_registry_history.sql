-- Spec 007, US7: histórico imutável, ordenado e paginado das cinco áreas (RF-036, RF-037). O histórico é só leitura; cada área exige a
-- própria permissão `*.history`. O conteúdo dos eventos já foi gravado sem dado pessoal (apenas os nomes dos campos sensíveis).

create function public.query_registry_history(
  p_actor uuid, p_session uuid, p_organization uuid, p_entity_type text, p_entity uuid,
  p_event_type text, p_from date, p_to date, p_order text, p_cursor text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_order text := coalesce(p_order, 'desc');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_cursor integer;
  v_permission text;
  v_rows jsonb;
  v_items jsonb;
  v_next text := null;
  v_count integer;
  v_exists boolean;
begin
  if p_entity_type is null or p_entity_type not in ('customer', 'site', 'geofence', 'vehicle', 'driver') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('entity_type', 'Tipo de cadastro desconhecido.'));
  end if;
  v_permission := case p_entity_type when 'site' then 'customer' else p_entity_type end || '.history';
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, v_permission);
  if denied is not null then return jsonb_build_object('code', denied); end if;

  -- O cadastro precisa existir na organização: de outra organização ou inexistente, a resposta é a mesma.
  select case p_entity_type
           when 'customer' then exists (select 1 from public.customers x where x.id = p_entity and x.organization_id = p_organization)
           when 'site' then exists (select 1 from public.customer_sites x where x.id = p_entity and x.organization_id = p_organization)
           when 'geofence' then exists (select 1 from public.geofences x where x.id = p_entity and x.organization_id = p_organization)
           when 'vehicle' then exists (select 1 from public.vehicles x where x.id = p_entity and x.organization_id = p_organization)
           else exists (select 1 from public.drivers x where x.id = p_entity and x.organization_id = p_organization) end
    into v_exists;
  if not v_exists then
    return jsonb_build_object('code', 'NOT_FOUND');
  end if;

  if v_order not in ('asc', 'desc') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('order', 'Ordem desconhecida.'));
  end if;
  if p_event_type is not null and p_event_type not in (
    'customer_created', 'customer_updated', 'customer_inactivated', 'customer_reactivated', 'contacts_changed', 'document_changed',
    'site_created', 'site_updated', 'site_inactivated', 'site_reactivated', 'geofence_created', 'geofence_updated', 'geofence_inactivated', 'geofence_reactivated',
    'vehicle_created', 'vehicle_updated', 'vehicle_status_changed', 'driver_created', 'driver_updated', 'driver_inactivated', 'driver_reactivated',
    'driver_user_linked', 'driver_user_unlinked', 'document_revealed', 'person_anonymized', 'contact_anonymized') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('event_type', 'Tipo de evento desconhecido.'));
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('from', 'O início do período é depois do fim.'));
  end if;
  if p_cursor is not null then
    if p_cursor !~ '^[0-9]{1,9}$' then
      return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cursor', 'Página inválida.'));
    end if;
    v_cursor := p_cursor::integer;
  end if;

  select jsonb_agg(jsonb_build_object(
           'id', f.id, 'sequence', f.sequence, 'event_type', f.event_type, 'actor_name', f.display_name, 'occurred_at', f.occurred_at,
           'justification', f.justification, 'data', f.data) order by case when v_order = 'asc' then f.sequence end asc, case when v_order = 'desc' then f.sequence end desc)
    into v_rows
    from (select e.*, p.display_name
            from public.registry_events e left join public.profiles p on p.user_id = e.actor_user_id
           where e.entity_type = p_entity_type and e.entity_id = p_entity and e.organization_id = p_organization
             and (p_event_type is null or e.event_type = p_event_type)
             and (p_from is null or (e.occurred_at at time zone 'America/Sao_Paulo')::date >= p_from)
             and (p_to is null or (e.occurred_at at time zone 'America/Sao_Paulo')::date <= p_to)
             and (v_cursor is null or (v_order = 'desc' and e.sequence < v_cursor) or (v_order = 'asc' and e.sequence > v_cursor))
           order by case when v_order = 'asc' then e.sequence end asc, case when v_order = 'desc' then e.sequence end desc limit v_limit + 1) f;

  v_rows := coalesce(v_rows, '[]'::jsonb);
  v_count := jsonb_array_length(v_rows);
  select coalesce(jsonb_agg(e.value order by e.ord), '[]'::jsonb) into v_items from jsonb_array_elements(v_rows) with ordinality as e(value, ord) where e.ord <= v_limit;
  if v_count > v_limit then v_next := (v_rows -> (v_limit - 1)) ->> 'sequence'; end if;
  return jsonb_build_object('code', 'LISTED', 'events', v_items, 'next', v_next);
end $$;

revoke all on function public.query_registry_history(uuid, uuid, uuid, text, uuid, text, date, date, text, text, integer) from public, anon, authenticated;
grant execute on function public.query_registry_history(uuid, uuid, uuid, text, uuid, text, date, date, text, text, integer) to service_role;

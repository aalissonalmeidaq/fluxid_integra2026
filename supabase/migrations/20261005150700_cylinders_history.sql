-- Spec 006, US7: consulta do histórico de custódia de um cilindro (RF-024 a RF-026, RF-042). Somente leitura, sem auditoria
-- de sucesso. A ordem é sempre por `sequence` (determinística, também para eventos no mesmo instante). O cursor é a sequência do
-- último evento devolvido, então a página não depende de carregar o histórico inteiro.

create function public.query_cylinder_history(
  p_actor uuid, p_session uuid, p_organization uuid, p_cylinder uuid,
  p_event_type text default null, p_from date default null, p_to date default null, p_order text default null,
  p_cursor text default null, p_limit integer default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.history');
  v_order text := coalesce(p_order, 'desc');
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_cursor integer;
  v_rows jsonb;
  v_items jsonb;
  v_next text := null;
  v_count integer;
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  perform 1 from public.cylinders c where c.id = p_cylinder and c.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;

  if v_order not in ('asc', 'desc') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('order', 'Ordem desconhecida.'));
  end if;
  if p_event_type is not null and p_event_type not in (
      'cylinder_created', 'cylinder_updated', 'cylinder_inactivated', 'cylinder_reactivated', 'identifier_added', 'identifier_deactivated',
      'identifier_transferred_out', 'identifier_transferred_in', 'stock_in', 'stock_out_inactivation', 'hydrostatic_test_registered',
      'hydrostatic_test_rectified') then
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

  if v_order = 'desc' then
    select jsonb_agg(jsonb_build_object(
             'id', f.id, 'sequence', f.sequence, 'event_type', f.event_type, 'actor_name', f.display_name, 'occurred_at', f.occurred_at,
             'justification', f.justification, 'data', f.data, 'references_event_id', f.references_event_id) order by f.sequence desc)
      into v_rows
      from (select e.*, p.display_name
              from public.cylinder_events e left join public.profiles p on p.user_id = e.actor_user_id
             where e.cylinder_id = p_cylinder and e.organization_id = p_organization
               and (p_event_type is null or e.event_type = p_event_type)
               and (p_from is null or (e.occurred_at at time zone 'America/Sao_Paulo')::date >= p_from)
               and (p_to is null or (e.occurred_at at time zone 'America/Sao_Paulo')::date <= p_to)
               and (v_cursor is null or e.sequence < v_cursor)
             order by e.sequence desc limit v_limit + 1) f;
  else
    select jsonb_agg(jsonb_build_object(
             'id', f.id, 'sequence', f.sequence, 'event_type', f.event_type, 'actor_name', f.display_name, 'occurred_at', f.occurred_at,
             'justification', f.justification, 'data', f.data, 'references_event_id', f.references_event_id) order by f.sequence asc)
      into v_rows
      from (select e.*, p.display_name
              from public.cylinder_events e left join public.profiles p on p.user_id = e.actor_user_id
             where e.cylinder_id = p_cylinder and e.organization_id = p_organization
               and (p_event_type is null or e.event_type = p_event_type)
               and (p_from is null or (e.occurred_at at time zone 'America/Sao_Paulo')::date >= p_from)
               and (p_to is null or (e.occurred_at at time zone 'America/Sao_Paulo')::date <= p_to)
               and (v_cursor is null or e.sequence > v_cursor)
             order by e.sequence asc limit v_limit + 1) f;
  end if;

  v_rows := coalesce(v_rows, '[]'::jsonb);
  v_count := jsonb_array_length(v_rows);
  select coalesce(jsonb_agg(t.value order by t.ord), '[]'::jsonb) into v_items
    from jsonb_array_elements(v_rows) with ordinality as t(value, ord) where t.ord <= v_limit;
  if v_count > v_limit then v_next := (v_rows -> (v_limit - 1)) ->> 'sequence'; end if;
  return jsonb_build_object('code', 'LISTED', 'events', v_items, 'next', v_next);
end $$;

revoke all on function public.query_cylinder_history(uuid, uuid, uuid, uuid, text, date, date, text, text, integer) from public, anon, authenticated;
grant execute on function public.query_cylinder_history(uuid, uuid, uuid, uuid, text, date, date, text, text, integer) to service_role;

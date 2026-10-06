-- Spec 006: grava um evento de histórico com sequência contínua por cilindro (RF-023 a RF-025).
-- O bloqueio da linha do cilindro serializa os eventos concorrentes do mesmo cilindro; a ordem de leitura é sempre por `sequence`.

create function private.append_cylinder_event(
  p_cylinder uuid, p_organization uuid, p_event_type text, p_actor uuid, p_session uuid,
  p_justification text, p_data jsonb, p_references uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  next_sequence integer;
begin
  perform 1 from public.cylinders c where c.id = p_cylinder and c.organization_id = p_organization for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'cylinder_not_found';
  end if;
  select coalesce(max(e.sequence), 0) + 1 into next_sequence from public.cylinder_events e where e.cylinder_id = p_cylinder;
  insert into public.cylinder_events (organization_id, cylinder_id, sequence, event_type, actor_user_id, actor_session_id,
                                      justification, data, references_event_id)
  values (p_organization, p_cylinder, next_sequence, p_event_type, p_actor, p_session, p_justification, coalesce(p_data, '{}'::jsonb), p_references);
  return next_sequence;
end $$;

revoke all on function private.append_cylinder_event(uuid, uuid, text, uuid, uuid, text, jsonb, uuid) from public, anon, authenticated;

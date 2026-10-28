-- Spec 015 (validação humana, 27/10/2026): "Minha viagem". O papel Motorista não tem `trip.read`, e o painel de coleta só existia no
-- detalhe da viagem; a pessoa motorista não tinha por onde começar a coleta. Esta consulta devolve só as viagens planejadas ou em
-- andamento em que ela é a motorista (cadastro de motorista ativo e vinculado ao usuário), com o mínimo para escolher a viagem.
-- Como `get_driver_tracking_status`, exige só sessão e vínculo ativos e não audita: é a pessoa lendo a própria escala. Outra empresa
-- é negada pelo vínculo; quem não é motorista recebe `is_driver = false` e lista vazia.
create function public.list_my_driver_trips(p_actor uuid, p_session uuid, p_organization uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_driver boolean;
begin
  if not exists (select 1 from public.user_sessions s where s.user_id = p_actor and s.session_id = p_session and s.status = 'active'
                   and s.expires_at > now() and s.last_seen_at > now() - interval '30 minutes') then
    return jsonb_build_object('code', 'AUTH_REQUIRED');
  end if;
  if not exists (select 1 from public.memberships m where m.user_id = p_actor and m.organization_id = p_organization and m.status = 'active') then
    return jsonb_build_object('code', 'ACCESS_DENIED');
  end if;
  v_driver := exists (select 1 from public.drivers d where d.organization_id = p_organization and d.linked_user_id = p_actor and d.status = 'active');
  return jsonb_build_object('code', 'FOUND', 'is_driver', v_driver, 'trips', coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', t.id, 'number', t.number, 'status', t.status, 'planned_date', t.planned_date, 'started_at', t.started_at,
        'vehicle_plate', v.plate,
        'stop_count', (select count(*) from public.trip_stops s where s.trip_id = t.id and s.organization_id = t.organization_id))
      order by (t.status = 'in_progress') desc, coalesce(t.started_at, t.planned_date::timestamptz), t.number)
      from public.trips t
      join public.drivers d on d.id = t.driver_id and d.organization_id = t.organization_id
      join public.vehicles v on v.id = t.vehicle_id and v.organization_id = t.organization_id
     where v_driver and t.organization_id = p_organization and d.linked_user_id = p_actor and d.status = 'active'
       and t.status in ('planned', 'in_progress')), '[]'::jsonb));
end $$;

revoke all on function public.list_my_driver_trips(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_my_driver_trips(uuid, uuid, uuid) to service_role;

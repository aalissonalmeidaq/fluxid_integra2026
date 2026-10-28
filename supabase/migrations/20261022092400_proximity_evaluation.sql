-- Spec 015 (T045; RF-008 a RF-017, RF-007e, RF-007f, RF-023): avaliação de proximidade na transação da ingestão, com a mesma regra de
-- src/domain/tracking/proximity-evaluator.ts. Para cada par do celular com um lacre da carga, a posição do lacre mais recente até 60 s
-- depois do instante do celular é comparada: futura, velha ou imprecisa é inconclusiva e não mexe na sequência; dentro zera; fora soma.
-- A sequência que chega a 3 abre uma ocorrência: com a viagem ativa, com alerta (marcado como retrospectivo se a posição chegou depois);
-- com a viagem encerrada, só histórico. Nada muda custódia nem trava. A abertura é auditada sem coordenadas.

-- Versão vigente gravada da regra (a comparação precisa apontar uma); cria a versão 1 com o padrão quando a empresa ainda não tem regra.
create function private.tracking_rule_row(p_organization uuid) returns public.proximity_rules
language plpgsql security definer set search_path = '' as $$
declare
  v_rule public.proximity_rules;
begin
  select r.* into v_rule from public.proximity_rules r where r.organization_id = p_organization and r.valid_until is null;
  if found then return v_rule; end if;
  insert into public.proximity_rules (organization_id, version, distance_threshold_m, max_age_seconds, max_accuracy_m, valid_from)
  values (p_organization, 1, 100, 120, 50, '2000-01-01T00:00:00Z')
  on conflict do nothing;
  select r.* into v_rule from public.proximity_rules r where r.organization_id = p_organization and r.valid_until is null;
  return v_rule;
end $$;

create function private.evaluate_proximity_for_position(p_position uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_mobile public.mobile_positions;
  v_session public.tracking_sessions;
  v_trip_status text;
  v_rule public.proximity_rules;
  v_pair public.proximity_pairs;
  v_seal public.seal_positions;
  v_result text;
  v_reason text;
  v_distance numeric;
  v_ordinal integer;
  v_comparison uuid;
  v_streak integer;
  v_first uuid;
  v_occurrence uuid;
  v_alert uuid;
  v_live boolean;
  v_created integer := 0;
begin
  select m.* into v_mobile from public.mobile_positions m where m.id = p_position;
  select s.* into v_session from public.tracking_sessions s where s.id = v_mobile.tracking_session_id;
  select t.status into v_trip_status from public.trips t where t.id = v_mobile.trip_id;
  perform private.tracking_ensure_pairs(v_session.id);
  v_rule := private.tracking_rule_row(v_mobile.organization_id);

  for v_pair in select p.* from public.proximity_pairs p
                 where p.tracking_session_id = v_session.id and v_mobile.observed_at >= p.started_at
                   and (p.ended_at is null or v_mobile.observed_at < p.ended_at)
                 order by p.id for update loop
    select sp.* into v_seal from public.seal_positions sp
     where sp.device_id = v_pair.device_id and sp.organization_id = v_pair.organization_id
       and sp.read_at <= v_mobile.observed_at + interval '60 seconds'
     order by sp.read_at desc, sp.id desc limit 1;

    v_distance := null;
    if v_seal.id is null then
      v_result := 'inconclusive'; v_reason := 'seal_missing';
    elsif v_mobile.observed_at - greatest(v_seal.read_at, v_seal.last_seen_at) > make_interval(secs => v_rule.max_age_seconds) then
      v_result := 'inconclusive'; v_reason := 'stale';
    elsif v_mobile.accuracy_m is null or v_mobile.accuracy_m > v_rule.max_accuracy_m
          or v_seal.accuracy_m is null or v_seal.accuracy_m > v_rule.max_accuracy_m then
      v_result := 'inconclusive'; v_reason := 'imprecise';
    else
      v_distance := round(extensions.st_distance(v_mobile.point, v_seal.point)::numeric, 2);
      if v_distance > v_rule.distance_threshold_m then v_result := 'outside'; v_reason := 'beyond_limit';
      else v_result := 'inside'; v_reason := 'within_limit'; end if;
    end if;

    select coalesce(max(c.sequence_ordinal), 0) + 1 into v_ordinal from public.proximity_comparisons c where c.pair_id = v_pair.id;
    insert into public.proximity_comparisons (organization_id, pair_id, rule_id, rule_version, mobile_position_id, seal_position_id, distance_m,
      distance_threshold_m, max_age_seconds, max_accuracy_m, result, reason, sequence_ordinal, retrospective)
    values (v_pair.organization_id, v_pair.id, v_rule.id, v_rule.version, v_mobile.id, v_seal.id, v_distance,
      v_rule.distance_threshold_m, v_rule.max_age_seconds, v_rule.max_accuracy_m, v_result, v_reason, v_ordinal, v_mobile.sync_kind = 'retrospective')
    on conflict (pair_id, mobile_position_id) do nothing
    returning id into v_comparison;
    if v_comparison is null then continue; end if;
    v_created := v_created + 1;

    if v_result = 'inconclusive' then continue; end if;
    v_streak := case when v_result = 'outside' then v_pair.outside_streak + 1 else 0 end;
    update public.proximity_pairs set outside_streak = v_streak, updated_at = now() where id = v_pair.id;

    -- A sequência chega a 3: abre a ocorrência, uma só enquanto houver outra aberta ou reconhecida para o par.
    if v_streak = 3 and not exists (select 1 from public.proximity_occurrences o where o.pair_id = v_pair.id and o.status in ('open', 'acknowledged')) then
      select c.id into v_first from (select c2.id, c2.sequence_ordinal from public.proximity_comparisons c2
        where c2.pair_id = v_pair.id and c2.result <> 'inconclusive' order by c2.sequence_ordinal desc limit 3) c order by c.sequence_ordinal limit 1;
      v_live := v_trip_status = 'in_progress' and v_pair.status = 'active';
      v_occurrence := gen_random_uuid();
      v_alert := null;
      if v_live then
        v_alert := private.open_seal_alert(v_pair.device_id, 'proximity_separation', 'high', 'system',
          jsonb_build_object('occurrence_id', v_occurrence, 'trip_id', v_pair.trip_id, 'trip_item_id', v_pair.trip_item_id,
            'retrospective', v_mobile.sync_kind = 'retrospective'), true);
      end if;
      insert into public.proximity_occurrences (id, organization_id, pair_id, trip_id, trip_item_id, cylinder_id, device_id, alert_id, status,
        detection_kind, first_comparison_id, confirming_comparison_id)
      values (v_occurrence, v_pair.organization_id, v_pair.id, v_pair.trip_id, v_pair.trip_item_id, v_pair.cylinder_id, v_pair.device_id, v_alert,
        case when v_live then 'open' else 'historical_only' end, case when v_mobile.sync_kind = 'retrospective' then 'retrospective' else 'live' end,
        v_first, v_comparison);
      update public.proximity_pairs set confirmed_occurrence_id = v_occurrence where id = v_pair.id;
      perform private.tracking_audit(v_pair.organization_id, v_session.driver_user_id, null, 'tracking.proximity_open', 'proximity_occurrence',
        v_occurrence::text, 'success', null, null, jsonb_build_object('trip_id', v_pair.trip_id, 'trip_item_id', v_pair.trip_item_id,
          'detection_kind', case when v_mobile.sync_kind = 'retrospective' then 'retrospective' else 'live' end, 'historical_only', not v_live,
          'rule_version', v_rule.version));
      perform private.tracking_broadcast(v_pair.organization_id, 'occurrence', v_pair.trip_id);
    end if;
  end loop;
  return v_created;
end $$;

revoke all on function private.tracking_rule_row(uuid), private.evaluate_proximity_for_position(uuid) from public, anon, authenticated;

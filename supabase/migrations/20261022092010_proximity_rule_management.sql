-- Spec 015 (T041b; RF-009, RF-009a, contracts/rastreamento-e-sincronizacao.md, "Regra de proximidade"): consultar e alterar a regra.
-- Alterar exige `proximity_rule.manage` e justificativa de 10 a 500 caracteres, respeita as faixas, fecha a versão vigente e cria a
-- próxima na mesma transação, com auditoria dos valores anterior e novo. Comparações já gravadas apontam a versão usada e não mudam.
-- Idempotente por `request_id`.

alter table public.proximity_rules add column request_id uuid;
alter table public.proximity_rules add constraint proximity_rules_request_key unique (organization_id, request_id);

create function private.tracking_rule_values(p_rule public.proximity_rules) returns jsonb
language sql immutable security definer set search_path = '' as $$
  select jsonb_build_object('version', p_rule.version, 'distance_m', p_rule.distance_threshold_m, 'max_age_s', p_rule.max_age_seconds,
    'max_accuracy_m', p_rule.max_accuracy_m)
$$;

create function public.get_proximity_rule(p_actor uuid, p_session uuid, p_organization uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
begin
  denied := private.tracking_authorize(p_actor, p_session, p_organization, 'tracking.read');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  return jsonb_build_object('code', 'FOUND', 'rule', private.tracking_rule(p_organization));
end $$;

create function public.set_proximity_rule(p_actor uuid, p_session uuid, p_organization uuid, p_request uuid, p_distance numeric,
  p_max_age integer, p_max_accuracy numeric, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_previous public.proximity_rules;
  v_rule public.proximity_rules;
begin
  denied := private.tracking_authorize(p_actor, p_session, p_organization, 'proximity_rule.manage');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select r.* into v_rule from public.proximity_rules r where r.organization_id = p_organization and r.request_id = p_request;
  if found then return jsonb_build_object('code', 'UPDATED', 'rule', private.tracking_rule(p_organization), 'replayed', true); end if;
  if p_distance is null or p_distance <> trunc(p_distance) or p_distance not between 50 and 500
     or p_max_age is null or p_max_age not between 60 and 300
     or p_max_accuracy is null or p_max_accuracy <> trunc(p_max_accuracy) or p_max_accuracy not between 20 and 100 then
    return jsonb_build_object('code', 'VALIDATION_FAILED');
  end if;
  if p_justification is null or char_length(btrim(p_justification)) not between 10 and 500 then
    return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED');
  end if;

  select r.* into v_previous from public.proximity_rules r where r.organization_id = p_organization and r.valid_until is null for update;
  if found then update public.proximity_rules set valid_until = clock_timestamp() where id = v_previous.id; end if;
  insert into public.proximity_rules (organization_id, version, distance_threshold_m, max_age_seconds, max_accuracy_m, valid_from, justification,
    created_by, request_id)
  values (p_organization, coalesce(v_previous.version, 0) + 1, p_distance, p_max_age, p_max_accuracy, clock_timestamp(), btrim(p_justification),
    p_actor, p_request)
  returning * into v_rule;

  perform private.tracking_audit(p_organization, p_actor, p_session, 'tracking.rule_update', 'proximity_rule', v_rule.id::text, 'success', null,
    btrim(p_justification), jsonb_build_object('previous', case when v_previous.id is null then null else private.tracking_rule_values(v_previous) end,
      'current', private.tracking_rule_values(v_rule)));
  return jsonb_build_object('code', 'UPDATED', 'rule', private.tracking_rule(p_organization));
end $$;

revoke all on function private.tracking_rule_values(public.proximity_rules) from public, anon, authenticated;
revoke all on function public.get_proximity_rule(uuid, uuid, uuid), public.set_proximity_rule(uuid, uuid, uuid, uuid, numeric, integer, numeric, text)
  from public, anon, authenticated;
grant execute on function public.get_proximity_rule(uuid, uuid, uuid), public.set_proximity_rule(uuid, uuid, uuid, uuid, numeric, integer, numeric, text)
  to service_role;

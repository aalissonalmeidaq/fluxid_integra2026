-- Spec 015 (T132; RF-014, RF-015; decisão da pessoa responsável em 28/10/2026): cada afastamento confirmado abre o próprio alerta.
-- A regra da Spec 012 de um alerta aberto por lacre e tipo continua para os alertas do lacre. No afastamento, a ocorrência já impede
-- duplicata (uma aberta ou reconhecida por par), e o alerta passa a ser único por ocorrência. Antes, um alerta antigo ainda aberto ou
-- reconhecido do mesmo lacre (de outra viagem) absorvia a ocorrência nova: sem push, com o estado do antigo, com o contexto misturado,
-- e fechar um fechava as duas.

drop index public.seal_alerts_open_key;
create unique index seal_alerts_open_key on public.seal_alerts (device_id, kind) where status <> 'closed' and kind <> 'proximity_separation';
create unique index seal_alerts_proximity_occurrence_key on public.seal_alerts ((context->>'occurrence_id')) where kind = 'proximity_separation';

create or replace function private.open_seal_alert(p_device uuid, p_kind text, p_severity text, p_source text, p_context jsonb, p_requires_push boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_cylinder uuid;
  v_id uuid;
begin
  select d.organization_id into v_org from public.seal_devices d where d.id = p_device;
  select b.cylinder_id into v_cylinder from public.seal_bindings b where b.device_id = p_device and b.unbound_at is null;
  if p_kind = 'proximity_separation' then
    -- Um alerta por ocorrência: o mesmo pedido (mesma ocorrência) devolve o alerta já aberto.
    select a.id into v_id from public.seal_alerts a where a.kind = p_kind and a.context->>'occurrence_id' = p_context->>'occurrence_id';
    if v_id is null then
      insert into public.seal_alerts (organization_id, device_id, cylinder_id, kind, severity, source, context, requires_push)
      values (v_org, p_device, v_cylinder, p_kind, p_severity, p_source, coalesce(p_context, '{}'), true)
      returning id into v_id;
    end if;
  else
    insert into public.seal_alerts (organization_id, device_id, cylinder_id, kind, severity, source, context, requires_push)
    values (v_org, p_device, v_cylinder, p_kind, p_severity, p_source, coalesce(p_context, '{}'),
      p_requires_push or p_kind = 'possible_loss' or p_severity in ('high', 'critical'))
    on conflict (device_id, kind) where status <> 'closed' and kind <> 'proximity_separation'
    do update set context = public.seal_alerts.context || excluded.context, updated_at = now()
    returning id into v_id;
  end if;
  perform private.seal_broadcast(v_org, 'alert', p_device, v_cylinder);
  return v_id;
end $$;

revoke all on function private.open_seal_alert(uuid, text, text, text, jsonb, boolean) from public, anon, authenticated;

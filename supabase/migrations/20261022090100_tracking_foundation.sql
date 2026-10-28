-- Spec 015 (T011): helpers privados comuns do rastreamento, relatórios e avisos. Ator, sessão e empresa são conferidos em toda RPC
-- antes de qualquer leitura; a auditoria nunca guarda coordenadas, pontos ou endereços (RF-023, RF-029, RF-038).

-- Autorização: sessão ativa do ator e a permissão pedida na empresa. Devolve nulo quando autorizado ou o código de erro sanitizado.
create function private.tracking_authorize(p_actor uuid, p_session uuid, p_organization uuid, p_permission text)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  return private.cylinder_authorize(p_actor, p_session, p_organization, p_permission);
end $$;

-- Remove, em qualquer nível, as chaves que carregam localização ou endereço.
create function private.tracking_sanitize(p_value jsonb)
returns jsonb language plpgsql immutable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      select coalesce(jsonb_object_agg(e.key, private.tracking_sanitize(e.value)), '{}'::jsonb) into v_result
        from jsonb_each(p_value) e
       where lower(e.key) not in ('lat', 'lng', 'lon', 'long', 'latitude', 'longitude', 'point', 'position', 'location',
                                  'coordinates', 'coords', 'geom', 'geometry', 'address', 'endereco');
      return v_result;
    when 'array' then
      select coalesce(jsonb_agg(private.tracking_sanitize(e.value) order by e.ordinality), '[]'::jsonb) into v_result
        from jsonb_array_elements(p_value) with ordinality e;
      return v_result;
    else
      return p_value;
  end case;
end $$;

-- Auditoria do rastreamento: mesma assinatura de write_audit_event, com metadados sanitizados.
create function private.tracking_audit(p_organization uuid, p_actor uuid, p_session uuid, p_action text, p_target_type text,
  p_target_id text, p_result text, p_reason text, p_justification text, p_metadata jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  return private.write_audit_event(p_organization, p_actor, p_session, p_action, p_target_type, p_target_id, p_result, p_reason,
    p_justification, private.tracking_sanitize(coalesce(p_metadata, '{}'::jsonb)));
end $$;

revoke all on function private.tracking_authorize(uuid, uuid, uuid, text), private.tracking_sanitize(jsonb),
  private.tracking_audit(uuid, uuid, uuid, text, text, text, text, text, text, jsonb) from public, anon, authenticated;

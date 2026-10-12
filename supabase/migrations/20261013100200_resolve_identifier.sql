-- Spec 009, Fundação: resolução de identificador lido por câmera, NFC, digitação ou leitor (RF-002, RF-003, RF-007, RN-005, CA-001).
-- Estende `query_cylinder_lookup` (Spec 006) para até três valores candidatos, necessários ao NFC: o número de série pode ter sido
-- cadastrado com ou sem dois-pontos, ou o valor pode ser o texto gravado na etiqueta. Procura só identificadores ATIVOS da organização
-- ativa, na ordem dos candidatos; o primeiro que casa vale. Código inexistente e código de outra organização recebem a MESMA resposta.
-- A viagem que reserva o cilindro só vai a quem tem `trip.read`. É leitura: sem auditoria de sucesso, e o valor lido nunca é registrado.

create function public.query_identifier_resolve(p_actor uuid, p_session uuid, p_organization uuid, p_candidates text[], p_expected_kind text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.read');
  v_count integer;
  v_candidate text;
  v_index integer;
  v_value text;
  v_ident public.cylinder_identifiers;
  v_cyl public.cylinders;
  v_trip public.trips;
  v_result jsonb;
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;

  v_count := coalesce(cardinality(p_candidates), 0);
  if v_count not between 1 and 3
     or exists (select 1 from unnest(p_candidates) c where c is null or char_length(btrim(c)) not between 1 and 200 or c ~ '[\r\n]') then
    return jsonb_build_object('code', 'VALIDATION_FAILED',
      'fields', private.field_error('candidates', 'Informe de 1 a 3 valores, cada um com 1 a 200 caracteres e sem quebra de linha.'));
  end if;
  if p_expected_kind is not null and p_expected_kind not in ('qr_code', 'data_matrix', 'nfc_tag', 'hull_number') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('expected_kind', 'Tipo de identificador inválido.'));
  end if;

  -- Identificador ativo: o primeiro candidato que casa vale.
  for v_candidate, v_index in select c, (n - 1)::integer from unnest(p_candidates) with ordinality as t(c, n) order by n loop
    v_value := upper(btrim(v_candidate));
    select i.* into v_ident from public.cylinder_identifiers i
     where i.organization_id = p_organization and i.value_normalized = v_value and i.status = 'active'
       and (p_expected_kind is null or i.kind = p_expected_kind);
    if found then
      select c.* into v_cyl from public.cylinders c where c.id = v_ident.cylinder_id and c.organization_id = p_organization;
      v_result := jsonb_build_object(
        'code', 'FOUND',
        'cylinder', jsonb_build_object('id', v_cyl.id, 'serial_number', v_cyl.serial_number, 'status', v_cyl.status, 'stock_status', v_cyl.stock_status,
                                       'hydro_status', private.hydro_status(v_cyl.hydro_last_result, v_cyl.hydro_next_due_on)),
        'identifier', jsonb_build_object('id', v_ident.id, 'kind', v_ident.kind),
        'matched', v_index);
      -- A viagem que reserva o cilindro só vai a quem pode ver viagens (RF-003).
      if private.actor_has_permission(p_actor, p_session, p_organization, 'trip.read') then
        select t.* into v_trip from public.trips t
          join public.trip_items ti on ti.trip_id = t.id and ti.organization_id = t.organization_id
         where ti.cylinder_id = v_cyl.id and ti.organization_id = p_organization and ti.is_open;
        if found then
          v_result := v_result || jsonb_build_object('trip', jsonb_build_object('id', v_trip.id, 'number', v_trip.number, 'status', v_trip.status));
        end if;
      end if;
      return v_result;
    end if;
  end loop;

  -- Valor desativado: informa a quem pertencia, no mínimo, sem identificá-lo como cilindro ativo (como o `lookup` da Spec 006).
  for v_candidate in select c from unnest(p_candidates) with ordinality as t(c, n) order by n loop
    v_value := upper(btrim(v_candidate));
    select i.* into v_ident from public.cylinder_identifiers i
     where i.organization_id = p_organization and i.value_normalized = v_value and i.status = 'deactivated' and i.transferred_to_identifier_id is null
       and (p_expected_kind is null or i.kind = p_expected_kind)
     order by i.deactivated_at desc, i.id limit 1;
    if found then
      select c.* into v_cyl from public.cylinders c where c.id = v_ident.cylinder_id and c.organization_id = p_organization;
      return jsonb_build_object('code', 'NOT_FOUND', 'deactivated', true,
                                'cylinder', jsonb_build_object('id', v_cyl.id, 'serial_number', v_cyl.serial_number));
    end if;
  end loop;

  return jsonb_build_object('code', 'NOT_FOUND');
end $$;

revoke all on function public.query_identifier_resolve(uuid, uuid, uuid, text[], text) from public, anon, authenticated;
grant execute on function public.query_identifier_resolve(uuid, uuid, uuid, text[], text) to service_role;

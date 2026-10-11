-- Spec 008, RF-024a: a entrada no estoque e a inativação (Spec 006) recusam cilindro com item de carga aberto (`CYLINDER_IN_TRIP`,
-- com a viagem). Só essa consulta é acrescentada; o resto das duas funções é o da Spec 006 e `reactivate_cylinder` não muda.

create or replace function public.stock_in_cylinder(
  p_actor uuid, p_session uuid, p_organization uuid, p_identifier_value text, p_operation_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_value text := upper(btrim(coalesce(p_identifier_value, '')));
  v_key text := p_operation_key::text;
  v_hash text;
  v_ledger private.idempotency_ledger;
  v_ident public.cylinder_identifiers;
  v_cyl public.cylinders;
  v_owner public.cylinders;
  v_hydro text;
  v_trip record;
  v_warning text;
  v_sequence integer;
  v_result jsonb;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.stock_in');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if char_length(v_value) not between 1 and 200 or p_operation_key is null then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('identifier_value', 'Informe o valor do identificador.'));
  end if;

  -- Duas requisições simultâneas com a mesma chave são serializadas: a segunda enxerga o resultado da primeira.
  perform pg_advisory_xact_lock(hashtextextended(p_organization::text || ':stockin:' || v_key, 0));
  v_hash := encode(extensions.digest(convert_to('cylinder.stock_in|' || v_value, 'UTF8'), 'sha256'), 'hex');

  select l.* into v_ledger from private.idempotency_ledger l where l.organization_id = p_organization and l.idempotency_key = v_key;
  if found then
    if v_ledger.request_hash <> v_hash or v_ledger.actor_user_id <> p_actor or v_ledger.operation <> 'cylinder.stock_in' then
      return jsonb_build_object('code', 'IDEMPOTENCY_PAYLOAD_CONFLICT');
    end if;
    return v_ledger.result_payload || jsonb_build_object('replayed', true);
  end if;

  select i.* into v_ident from public.cylinder_identifiers i
   where i.organization_id = p_organization and i.value_normalized = v_value and i.status = 'active';
  if not found then
    select i.* into v_ident from public.cylinder_identifiers i
     where i.organization_id = p_organization and i.value_normalized = v_value and i.status = 'deactivated' and i.transferred_to_identifier_id is null
     order by i.deactivated_at desc, i.id limit 1;
    if found then
      select c.* into v_owner from public.cylinders c where c.id = v_ident.cylinder_id;
      return jsonb_build_object('code', 'NOT_FOUND', 'deactivated', true,
                                'cylinder', jsonb_build_object('id', v_owner.id, 'serial_number', v_owner.serial_number));
    end if;
    return jsonb_build_object('code', 'NOT_FOUND');
  end if;

  select c.* into v_cyl from public.cylinders c where c.id = v_ident.cylinder_id and c.organization_id = p_organization for update;
  if v_cyl.status <> 'active' then return jsonb_build_object('code', 'CYLINDER_INACTIVE'); end if;
  -- Spec 008 (RF-024a): cilindro em viagem aberta não entra no estoque; o retorno é um registro da própria viagem.
  select t.id as trip_id, t.number as trip_number into v_trip
    from public.trip_items i join public.trips t on t.id = i.trip_id
   where i.cylinder_id = v_cyl.id and i.is_open limit 1;
  if found then return jsonb_build_object('code', 'CYLINDER_IN_TRIP', 'trip_id', v_trip.trip_id, 'trip_number', v_trip.trip_number); end if;
  if v_cyl.stock_status = 'in_stock' then return jsonb_build_object('code', 'ALREADY_IN_STOCK'); end if;

  -- Teste vencido ou reprovado não impede o recebimento físico: a entrada é registrada com o aviso e a situação do momento (RF-017).
  v_hydro := private.hydro_status(v_cyl.hydro_last_result, v_cyl.hydro_next_due_on);
  v_warning := case v_hydro when 'vencido' then 'hydro_expired' when 'reprovado' then 'hydro_rejected' else null end;

  update public.cylinders set stock_status = 'in_stock', version = version + 1, updated_at = now() where id = v_cyl.id;
  v_sequence := private.append_cylinder_event(v_cyl.id, p_organization, 'stock_in', p_actor, p_session, null,
    jsonb_build_object('identifier_id', v_ident.id, 'identifier_kind', v_ident.kind, 'hydro_status', v_hydro));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'cylinder.stock_in', 'cylinder', v_cyl.id::text, 'success', null, null,
    jsonb_build_object('cylinder_id', v_cyl.id, 'hydro_status', v_hydro));

  v_result := jsonb_build_object(
    'code', 'STOCKED', 'replayed', false,
    'cylinder', jsonb_build_object('id', v_cyl.id, 'serial_number', v_cyl.serial_number, 'stock_status', 'in_stock'),
    'event_sequence', v_sequence, 'hydro_status', v_hydro, 'warning', v_warning);

  insert into private.idempotency_ledger (organization_id, idempotency_key, actor_user_id, operation, request_hash, result_code, result_payload)
  values (p_organization, v_key, p_actor, 'cylinder.stock_in', v_hash, 'STOCKED', v_result);
  return v_result;
end $$;

create or replace function public.inactivate_cylinder(
  p_actor uuid, p_session uuid, p_organization uuid, p_cylinder uuid, p_reason text, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_cyl public.cylinders;
  v_justification text := btrim(coalesce(p_justification, ''));
  v_was_in_stock boolean;
  v_version bigint;
  v_trip record;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.deactivate');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  select c.* into v_cyl from public.cylinders c where c.id = p_cylinder and c.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_cyl.status = 'inactive' then return jsonb_build_object('code', 'ALREADY_INACTIVE'); end if;
  -- Spec 008 (RF-024a): cilindro em viagem aberta não pode ser inativado antes de a viagem decidir o destino dele.
  select t.id as trip_id, t.number as trip_number into v_trip
    from public.trip_items i join public.trips t on t.id = i.trip_id
   where i.cylinder_id = p_cylinder and i.is_open limit 1;
  if found then return jsonb_build_object('code', 'CYLINDER_IN_TRIP', 'trip_id', v_trip.trip_id, 'trip_number', v_trip.trip_number); end if;

  if p_reason is null or p_reason not in ('written_off', 'lost', 'condemned', 'other') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('reason', 'Escolha o motivo da inativação.'));
  end if;
  if char_length(v_justification) not between 5 and 500 then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;

  v_was_in_stock := v_cyl.stock_status = 'in_stock';
  update public.cylinders
     set status = 'inactive', inactivation_reason = p_reason, stock_status = 'out_of_stock', version = version + 1, updated_at = now()
   where id = p_cylinder
   returning version into v_version;

  perform private.append_cylinder_event(p_cylinder, p_organization, 'cylinder_inactivated', p_actor, p_session, v_justification,
    jsonb_build_object('reason', p_reason, 'was_in_stock', v_was_in_stock));
  if v_was_in_stock then
    perform private.append_cylinder_event(p_cylinder, p_organization, 'stock_out_inactivation', p_actor, p_session, v_justification,
      jsonb_build_object('reason', p_reason));
  end if;
  perform private.write_audit_event(p_organization, p_actor, p_session, 'cylinder.inactivate', 'cylinder', p_cylinder::text, 'success', null, v_justification,
    jsonb_build_object('cylinder_id', p_cylinder, 'reason', p_reason, 'version', v_version));
  return jsonb_build_object('code', 'OK', 'version', v_version);
end $$;

revoke all on function public.stock_in_cylinder(uuid, uuid, uuid, text, uuid), public.inactivate_cylinder(uuid, uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.stock_in_cylinder(uuid, uuid, uuid, text, uuid), public.inactivate_cylinder(uuid, uuid, uuid, uuid, text, text) to service_role;

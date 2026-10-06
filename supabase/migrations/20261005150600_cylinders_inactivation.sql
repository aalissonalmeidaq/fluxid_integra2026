-- Spec 006, US6: inativar e reativar cilindro, sem apagar nada (RF-006, RF-016, RF-040).
-- Os identificadores ficam como estão: continuam ativos e reservados ao cilindro inativo (decisão de /speckit-clarify). A saída do
-- estoque acontece apenas pela inativação nesta spec; a reativação devolve o cilindro ativo e FORA do estoque.

create function public.inactivate_cylinder(
  p_actor uuid, p_session uuid, p_organization uuid, p_cylinder uuid, p_reason text, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_cyl public.cylinders;
  v_justification text := btrim(coalesce(p_justification, ''));
  v_was_in_stock boolean;
  v_version bigint;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.deactivate');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  select c.* into v_cyl from public.cylinders c where c.id = p_cylinder and c.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_cyl.status = 'inactive' then return jsonb_build_object('code', 'ALREADY_INACTIVE'); end if;

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

create function public.reactivate_cylinder(
  p_actor uuid, p_session uuid, p_organization uuid, p_cylinder uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_cyl public.cylinders;
  v_justification text := btrim(coalesce(p_justification, ''));
  v_version bigint;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.deactivate');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  select c.* into v_cyl from public.cylinders c where c.id = p_cylinder and c.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if char_length(v_justification) not between 5 and 500 then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  if v_cyl.status = 'active' then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('cylinder_id', 'Este cilindro já está ativo.'));
  end if;

  update public.cylinders
     set status = 'active', inactivation_reason = null, stock_status = 'out_of_stock', version = version + 1, updated_at = now()
   where id = p_cylinder
   returning version into v_version;

  perform private.append_cylinder_event(p_cylinder, p_organization, 'cylinder_reactivated', p_actor, p_session, v_justification,
    jsonb_build_object('previous_reason', v_cyl.inactivation_reason));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'cylinder.reactivate', 'cylinder', p_cylinder::text, 'success', null, v_justification,
    jsonb_build_object('cylinder_id', p_cylinder, 'version', v_version));
  return jsonb_build_object('code', 'OK', 'version', v_version);
end $$;

revoke all on function public.inactivate_cylinder(uuid, uuid, uuid, uuid, text, text), public.reactivate_cylinder(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.inactivate_cylinder(uuid, uuid, uuid, uuid, text, text), public.reactivate_cylinder(uuid, uuid, uuid, uuid, text)
  to service_role;

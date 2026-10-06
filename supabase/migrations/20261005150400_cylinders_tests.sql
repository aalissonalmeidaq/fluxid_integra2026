-- Spec 006, US4: teste hidrostático (RF-019, RF-020, RF-022, RF-040). A situação do teste nunca é gravada: o cilindro guarda
-- só o último resultado e a próxima data do teste efetivo, para filtro e ordenação. A situação é calculada por private.hydro_status.
-- Registrar teste não incrementa `version` do cadastro (spec, RF-004).

-- Teste efetivo: o de maior data de realização (desempate pela criação) entre os que não foram retificados.
create function private.refresh_cylinder_hydro(p_cylinder uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_result text;
  v_due date;
begin
  select t.result, t.next_due_on into v_result, v_due
    from public.cylinder_tests t
   where t.cylinder_id = p_cylinder
     and not exists (select 1 from public.cylinder_tests r where r.rectifies_test_id = t.id)
   order by t.performed_on desc, t.created_at desc, t.id desc
   limit 1;
  update public.cylinders
     set hydro_last_result = v_result, hydro_next_due_on = case when v_result = 'approved' then v_due else null end, updated_at = now()
   where id = p_cylinder;
  return private.hydro_status(v_result, case when v_result = 'approved' then v_due else null end);
end $$;

-- Regras dos campos do teste. Lista de erros por campo (vazia quando válido).
create function private.validate_test_fields(
  p_performed_on date, p_result text, p_report_number text, p_executor text, p_next_due_on date, p_notes text)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  errors jsonb := '[]'::jsonb;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_performed_on is null or p_performed_on > today then
    errors := errors || private.field_error('performed_on', 'A data de realização não pode ser futura.');
  end if;
  if p_result is null or p_result not in ('approved', 'rejected') then
    errors := errors || private.field_error('result', 'Escolha o resultado do teste.');
  end if;
  if char_length(btrim(coalesce(p_executor, ''))) not between 2 and 120 then
    errors := errors || private.field_error('executor', 'Informe quem executou o teste, com 2 a 120 caracteres.');
  end if;
  if p_report_number is not null and char_length(p_report_number) > 60 then
    errors := errors || private.field_error('report_number', 'Use até 60 caracteres no número do laudo.');
  end if;
  if p_notes is not null and char_length(p_notes) > 500 then
    errors := errors || private.field_error('notes', 'Use até 500 caracteres nas observações.');
  end if;
  if p_result = 'approved' and p_next_due_on is null then
    errors := errors || private.field_error('next_due_on', 'Informe a próxima data do teste.');
  elsif p_next_due_on is not null and p_performed_on is not null then
    if p_next_due_on <= p_performed_on then
      errors := errors || private.field_error('next_due_on', 'A próxima data deve ser posterior à data de realização.');
    elsif p_next_due_on > p_performed_on + interval '10 years' then
      errors := errors || private.field_error('next_due_on', 'A próxima data fica a mais de 10 anos da realização.');
    end if;
  end if;
  return errors;
end $$;

create function public.register_hydrostatic_test(
  p_actor uuid, p_session uuid, p_organization uuid, p_cylinder uuid, p_performed_on date, p_result text,
  p_report_number text, p_executor text, p_next_due_on date, p_notes text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  errors jsonb;
  v_cyl public.cylinders;
  v_report text := nullif(btrim(coalesce(p_report_number, '')), '');
  v_executor text := btrim(coalesce(p_executor, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_test uuid;
  v_status text;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.test');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  select c.* into v_cyl from public.cylinders c where c.id = p_cylinder and c.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_cyl.status <> 'active' then return jsonb_build_object('code', 'CYLINDER_INACTIVE'); end if;

  errors := private.validate_test_fields(p_performed_on, p_result, v_report, v_executor, p_next_due_on, v_notes);
  if jsonb_array_length(errors) > 0 then return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors); end if;

  insert into public.cylinder_tests (organization_id, cylinder_id, performed_on, result, report_number, executor, next_due_on, notes, created_at, created_by)
  values (p_organization, p_cylinder, p_performed_on, p_result, v_report, v_executor, p_next_due_on, v_notes, clock_timestamp(), p_actor)
  returning id into v_test;
  v_status := private.refresh_cylinder_hydro(p_cylinder);

  perform private.append_cylinder_event(p_cylinder, p_organization, 'hydrostatic_test_registered', p_actor, p_session, null,
    jsonb_build_object('test_id', v_test, 'result', p_result, 'performed_on', p_performed_on, 'next_due_on', p_next_due_on, 'hydro_status', v_status));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'cylinder.test_register', 'cylinder', p_cylinder::text, 'success', null, null,
    jsonb_build_object('cylinder_id', p_cylinder, 'test_id', v_test, 'result', p_result));

  return jsonb_build_object('code', 'OK', 'test_id', v_test, 'hydro_status', v_status);
end $$;

create function public.rectify_hydrostatic_test(
  p_actor uuid, p_session uuid, p_organization uuid, p_test uuid, p_performed_on date, p_result text,
  p_report_number text, p_executor text, p_next_due_on date, p_notes text, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  errors jsonb;
  v_old public.cylinder_tests;
  v_cyl public.cylinders;
  v_justification text := btrim(coalesce(p_justification, ''));
  v_report text := nullif(btrim(coalesce(p_report_number, '')), '');
  v_executor text := btrim(coalesce(p_executor, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_test uuid;
  v_status text;
  v_reference uuid;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'cylinder.test');
  if denied is not null then return jsonb_build_object('code', denied); end if;

  select t.* into v_old from public.cylinder_tests t where t.id = p_test and t.organization_id = p_organization;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  select c.* into v_cyl from public.cylinders c where c.id = v_old.cylinder_id and c.organization_id = p_organization for update;
  if v_cyl.status <> 'active' then return jsonb_build_object('code', 'CYLINDER_INACTIVE'); end if;

  if char_length(v_justification) not between 5 and 500 then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  if exists (select 1 from public.cylinder_tests r where r.rectifies_test_id = p_test) then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('test_id', 'Este registro já foi retificado.'));
  end if;
  errors := private.validate_test_fields(p_performed_on, p_result, v_report, v_executor, p_next_due_on, v_notes);
  if jsonb_array_length(errors) > 0 then return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', errors); end if;

  insert into public.cylinder_tests (organization_id, cylinder_id, performed_on, result, report_number, executor, next_due_on, notes,
                                     rectifies_test_id, rectification_justification, created_at, created_by)
  values (p_organization, v_old.cylinder_id, p_performed_on, p_result, v_report, v_executor, p_next_due_on, v_notes,
          p_test, v_justification, clock_timestamp(), p_actor)
  returning id into v_test;
  v_status := private.refresh_cylinder_hydro(v_old.cylinder_id);

  select e.id into v_reference from public.cylinder_events e
   where e.cylinder_id = v_old.cylinder_id and e.event_type in ('hydrostatic_test_registered', 'hydrostatic_test_rectified') and e.data ->> 'test_id' = p_test::text
   order by e.sequence desc limit 1;
  perform private.append_cylinder_event(v_old.cylinder_id, p_organization, 'hydrostatic_test_rectified', p_actor, p_session, v_justification,
    jsonb_build_object('test_id', v_test, 'rectifies_test_id', p_test, 'result', p_result, 'performed_on', p_performed_on, 'next_due_on', p_next_due_on, 'hydro_status', v_status),
    v_reference);
  perform private.write_audit_event(p_organization, p_actor, p_session, 'cylinder.test_rectify', 'cylinder', v_old.cylinder_id::text, 'success', null, v_justification,
    jsonb_build_object('cylinder_id', v_old.cylinder_id, 'test_id', v_test, 'rectifies_test_id', p_test));

  return jsonb_build_object('code', 'OK', 'test_id', v_test, 'hydro_status', v_status);
end $$;

revoke all on function private.refresh_cylinder_hydro(uuid), private.validate_test_fields(date, text, text, text, date, text) from public, anon, authenticated;
revoke all on function public.register_hydrostatic_test(uuid, uuid, uuid, uuid, date, text, text, text, date, text),
  public.rectify_hydrostatic_test(uuid, uuid, uuid, uuid, date, text, text, text, date, text, text) from public, anon, authenticated;
grant execute on function public.register_hydrostatic_test(uuid, uuid, uuid, uuid, date, text, text, text, date, text),
  public.rectify_hydrostatic_test(uuid, uuid, uuid, uuid, date, text, text, text, date, text, text) to service_role;

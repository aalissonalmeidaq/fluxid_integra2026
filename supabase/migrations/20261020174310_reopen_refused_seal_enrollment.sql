create function public.reopen_enrollment(
  p_actor uuid, p_session uuid, p_request uuid, p_enrollment uuid,
  p_justification text, p_expected_updated_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text := private.seal_platform_authorize(p_actor, p_session);
  replay jsonb;
  v_text text := private.seal_justification(p_justification);
  v_guard text;
  v_enrollment public.seal_enrollments;
begin
  if denied is not null then return jsonb_build_object('code', denied); end if;
  replay := private.seal_replay(private.seal_platform_org(), p_request, 'reopen_enrollment');
  if replay is not null then return replay; end if;
  if not private.seal_text_ok(v_text) then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  v_guard := private.seal_enrollment_guard(p_enrollment, p_expected_updated_at);
  if v_guard is not null then return jsonb_build_object('code', v_guard); end if;
  select e.* into v_enrollment from public.seal_enrollments e where e.id = p_enrollment;
  if v_enrollment.status <> 'refused' then return jsonb_build_object('code', 'INVALID_STATE'); end if;

  update public.seal_enrollments
     set status = 'pending', decided_by = null, decided_at = null, decision_note = null, updated_at = now()
   where id = p_enrollment;
  perform private.write_audit_event(null, p_actor, p_session, 'seal.enrollment_reopen', 'seal_enrollment', p_enrollment::text,
    'success', null, v_text, jsonb_build_object('device_code', v_enrollment.device_code, 'previous_status', 'refused'));
  return private.seal_remember(private.seal_platform_org(), p_request, 'reopen_enrollment',
    jsonb_build_object('code', 'REOPENED', 'enrollment_id', p_enrollment));
end $$;

revoke all on function public.reopen_enrollment(uuid, uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reopen_enrollment(uuid, uuid, uuid, uuid, text, timestamptz) to service_role;

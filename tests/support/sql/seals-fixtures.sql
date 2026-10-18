-- Apoio SÓ DE TESTE da Spec 012 (T019): cria dispositivos e vínculos direto no banco local enquanto o cadastro pela tela (US5) não
-- existe. Nunca é aplicado por migration; `tests/support/seal-db.ts` o carrega no Supabase local, e `supabase db reset` o apaga.
-- A chave é a da suíte (gerada no teste); o banco guarda só o SHA-256, como o cadastro real.

create schema if not exists tests_support;

create or replace function tests_support.seal_device(p_org uuid, p_key text, p_created_by uuid, p_label text default 'Lacre de teste')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_code text := 'DSP-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
  v_id uuid;
begin
  insert into public.seal_devices (organization_id, device_code, label, key_hash, created_by)
  values (p_org, v_code, p_label, extensions.digest(p_key, 'sha256'), p_created_by)
  returning id into v_id;
  return jsonb_build_object('device_id', v_id, 'device_code', v_code);
end $$;

create or replace function tests_support.seal_bind(p_device uuid, p_cylinder uuid, p_by uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_id uuid;
begin
  select organization_id into v_org from public.seal_devices where id = p_device;
  insert into public.seal_bindings (organization_id, device_id, cylinder_id, bound_by) values (v_org, p_device, p_cylinder, p_by)
  returning id into v_id;
  return v_id;
end $$;

-- Relógio dos testes: recua todos os horários de um dispositivo, para simular a passagem do tempo sem esperar.
create or replace function tests_support.seal_age(p_device uuid, p_seconds integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.seal_devices
     set last_seen_at = last_seen_at - make_interval(secs => p_seconds),
         last_read_at = last_read_at - make_interval(secs => p_seconds),
         no_gps_since = no_gps_since - make_interval(secs => p_seconds),
         health_changed_at = health_changed_at - make_interval(secs => p_seconds)
   where id = p_device;
end $$;

revoke all on schema tests_support from anon, authenticated;

-- Cilindro de teste ativo (tipo próprio da suíte), para vincular ao lacre sem passar pelo cadastro da Spec 006.
create or replace function tests_support.seal_cylinder(p_org uuid, p_serial text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_type uuid;
  v_id uuid;
begin
  insert into public.cylinder_types (organization_id, gas, capacity_value, capacity_unit, classification)
  values (p_org, 'Gás lacre ' || p_serial, 10, 'l', 'medicinal') returning id into v_type;
  insert into public.cylinders (organization_id, cylinder_type_id, serial_number) values (p_org, v_type, p_serial) returning id into v_id;
  return v_id;
end $$;

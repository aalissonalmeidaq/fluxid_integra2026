-- Spec 014, RF-018 (pedido de 20/10/2026): dados de exemplo da empresa da demonstração. A restauração cria e devolve ao estado
-- publicado cilindros, clientes, unidades, geocercas, veículos, motoristas, viagens e lacres simulados, sempre pelas operações do
-- domínio, em nome do administrador de demonstração (com a sessão de serviço da restauração). Cada registro é tratado numa
-- subtransação: se uma operação recusar, o registro fica como estava e a recusa vira aviso, sem derrubar o resto.

-- 1. Referência publicada → registro criado (ex.: ('customer', 'hospital') → id do cliente).
create table private.demo_records (
  kind text not null,
  ref text not null,
  record_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (kind, ref),
  constraint demo_records_kind_check check (kind in ('cylinder_type', 'cylinder', 'customer', 'site', 'geofence', 'vehicle', 'driver', 'trip', 'seal'))
);
alter table private.demo_records enable row level security;
revoke all on table private.demo_records from public, anon, authenticated;

-- 2. O manifesto da última restauração fica com a marca da empresa (os testes e o suporte reaproveitam).
alter table private.demo_tenant add column manifest jsonb;

create function private.demo_record(p_kind text, p_ref text) returns uuid
language sql stable security definer set search_path = '' as $$
  select r.record_id from private.demo_records r where r.kind = p_kind and r.ref = p_ref
$$;

create function private.demo_remember(p_kind text, p_ref text, p_id uuid) returns uuid
language sql security definer set search_path = '' as $$
  insert into private.demo_records (kind, ref, record_id) values (p_kind, p_ref, p_id)
  on conflict (kind, ref) do update set record_id = excluded.record_id, updated_at = now()
   where private.demo_records.record_id is distinct from excluded.record_id
  returning p_id
$$;

-- Confere o resultado de uma operação do domínio; fora dos códigos de sucesso, levanta exceção (a subtransação desfaz o registro).
create function private.demo_ok(p_result jsonb, p_what text) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  if coalesce(p_result ->> 'code', '') not in ('CREATED', 'OK', 'STOCKED', 'TYPE_SAVED', 'REACTIVATED', 'STATUS_CHANGED', 'LINKED', 'LOADING',
      'CHECKED', 'STARTED', 'ARRIVED', 'DELIVERED', 'COMPLETED', 'BOUND', 'UPDATED') then
    raise exception using errcode = 'P0001', message = 'demo_sample', detail = p_what || ':' || coalesce(p_result ->> 'code', 'sem_codigo');
  end if;
  return p_result;
end $$;

revoke all on function private.demo_record(text, text), private.demo_remember(text, text, uuid), private.demo_ok(jsonb, text)
  from public, anon, authenticated;

-- 3. Viagem de exemplo: planeja e leva até a situação publicada pelas operações de viagem. Devolve o id da viagem nova.
create function private.demo_run_trip(p_org uuid, p_actor uuid, p_session uuid, p_trip jsonb, p_stops jsonb, p_vehicle uuid, p_driver uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_state text := p_trip ->> 'state';
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_result jsonb;
  v_trip uuid;
  v_item record;
  v_stop record;
begin
  v_result := private.demo_ok(public.create_trip(p_actor => p_actor, p_session => p_session, p_organization => p_org, p_request => gen_random_uuid(),
    p_planned_date => v_today + coalesce((p_trip ->> 'planned_in_days')::integer, 0), p_vehicle => p_vehicle, p_driver => p_driver,
    p_notes => 'Viagem de exemplo da demonstração.', p_stops => p_stops), 'trip.create.' || (p_trip ->> 'ref'));
  v_trip := (v_result ->> 'trip_id')::uuid;
  if v_state = 'planned' then return v_trip; end if;

  perform private.demo_ok(public.start_loading(p_actor => p_actor, p_session => p_session, p_organization => p_org, p_request => gen_random_uuid(),
    p_trip => v_trip, p_expected_version => (select t.version from public.trips t where t.id = v_trip)), 'trip.loading');
  for v_item in select i.id from public.trip_items i where i.trip_id = v_trip order by i.id loop
    perform private.demo_ok(public.check_item(p_actor => p_actor, p_session => p_session, p_organization => p_org, p_request => gen_random_uuid(),
      p_trip => v_trip, p_item => v_item.id, p_source => 'manual'), 'trip.check');
  end loop;
  perform private.demo_ok(public.start_trip(p_actor => p_actor, p_session => p_session, p_organization => p_org, p_request => gen_random_uuid(),
    p_trip => v_trip, p_expected_version => (select t.version from public.trips t where t.id = v_trip)), 'trip.start');
  if v_state = 'in_progress' then return v_trip; end if;

  for v_stop in select s.id from public.trip_stops s where s.trip_id = v_trip order by s.position loop
    perform private.demo_ok(public.arrive_stop(p_actor => p_actor, p_session => p_session, p_organization => p_org, p_request => gen_random_uuid(),
      p_trip => v_trip, p_stop => v_stop.id, p_arrived_at => null, p_latitude => null, p_longitude => null, p_accuracy_m => null,
      p_position_source => null, p_position_read_at => null, p_queued_at => null), 'trip.arrive');
    perform private.demo_ok(public.register_delivery(p_actor => p_actor, p_session => p_session, p_organization => p_org, p_request => gen_random_uuid(),
      p_trip => v_trip, p_stop => v_stop.id, p_delivered_at => now(), p_recipient_name => 'Recebedor Exemplo', p_recipient_role => 'Almoxarifado',
      p_latitude => null, p_longitude => null, p_at_site_address => false,
      p_results => (select jsonb_agg(jsonb_build_object('item_id', i.id, 'delivered', true, 'reason', null)) from public.trip_items i where i.stop_id = v_stop.id),
      p_supersedes => null, p_correction_reason => null, p_accuracy_m => null, p_position_source => null, p_position_read_at => null, p_queued_at => null),
      'trip.deliver');
  end loop;
  perform private.demo_ok(public.complete_trip(p_actor => p_actor, p_session => p_session, p_organization => p_org, p_request => gen_random_uuid(),
    p_trip => v_trip, p_expected_version => (select t.version from public.trips t where t.id = v_trip)), 'trip.complete');
  return v_trip;
end $$;

-- 4. Mensagens de um lacre simulado pelo mesmo caminho do lacre real (seal_ingest), para gerar posição e o alerta publicado.
create function private.demo_seal_messages(p_device uuid, p_seal jsonb, p_activate boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_device public.seal_devices;
  v_alert text := p_seal ->> 'alert';
  v_position jsonb;
  v_messages jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  select d.* into v_device from public.seal_devices d where d.id = p_device;
  v_position := jsonb_build_object('latitude', (p_seal ->> 'latitude')::numeric, 'longitude', (p_seal ->> 'longitude')::numeric, 'quality', 'gps',
    'accuracy_m', 6, 'battery_pct', 82, 'signal_dbm', -62, 'seal_state', 'closed');
  if p_activate then
    v_messages := v_messages || jsonb_build_object('message_id', gen_random_uuid()::text, 'type', 'activation', 'read_at', now() - interval '4 seconds',
      'problem', null, 'data', v_position || jsonb_build_object('valve', 'closed'));
  end if;
  v_messages := v_messages || jsonb_build_object('message_id', gen_random_uuid()::text, 'type', 'position', 'read_at', now() - interval '3 seconds',
    'problem', null, 'data', v_position);
  v_messages := v_messages || case v_alert
    when 'low_battery' then jsonb_build_object('message_id', gen_random_uuid()::text, 'type', 'position', 'read_at', now() - interval '2 seconds',
      'problem', null, 'data', v_position || jsonb_build_object('battery_pct', 12))
    when 'weak_signal' then jsonb_build_object('message_id', gen_random_uuid()::text, 'type', 'position', 'read_at', now() - interval '2 seconds',
      'problem', null, 'data', v_position || jsonb_build_object('signal_dbm', -101))
    when 'seal_open' then jsonb_build_object('message_id', gen_random_uuid()::text, 'type', 'alert', 'read_at', now() - interval '2 seconds',
      'problem', null, 'data', jsonb_build_object('code', 'seal_open', 'value', null))
    else jsonb_build_object('message_id', gen_random_uuid()::text, 'type', 'shutdown', 'read_at', now() - interval '2 seconds',
      'problem', null, 'data', v_position)
  end;
  v_result := public.seal_ingest(v_device.device_code, v_device.key_hash, extensions.digest('demo_restore', 'sha256'),
    jsonb_build_object('protocol', 1, 'watch_version', v_device.watch_version_ack, 'messages', v_messages));
  if coalesce(v_result ->> 'status', '') <> '200' then
    raise exception using errcode = 'P0001', message = 'demo_sample', detail = 'seal.ingest:' || coalesce(v_result ->> 'status', 'sem_status');
  end if;
end $$;

-- 5. Os dados de exemplo. Devolve { created, restored, unchanged, warnings }.
create function private.demo_restore_sample(p_org uuid, p_actor uuid, p_session uuid, p_manifest jsonb, p_published_type uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sample jsonb := p_manifest -> 'sample';
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_reason constant text := 'Restauração da demonstração (Spec 014)';
  v_created integer := 0;
  v_restored integer := 0;
  v_unchanged integer := 0;
  v_warnings jsonb := '[]'::jsonb;
  v_item jsonb;
  v_stop jsonb;
  v_id uuid;
  v_id2 uuid;
  v_status text;
  v_result jsonb;
  v_trip_cylinders text[];
  v_stops jsonb;
  v_user uuid;
  v_changed boolean;
  v_cyl public.cylinders;
  v_detail text;
  v_message text;
begin
  if v_sample is null or jsonb_typeof(v_sample) <> 'object' then
    return jsonb_build_object('created', 0, 'restored', 0, 'unchanged', 0, 'warnings', '[]'::jsonb);
  end if;
  perform private.demo_remember('cylinder_type', 'publicado', p_published_type) where p_published_type is not null;
  select coalesce(array_agg(c), '{}') into v_trip_cylinders
    from jsonb_array_elements(v_sample -> 'trips') t, jsonb_array_elements(t -> 'stops') s, jsonb_array_elements_text(s -> 'cylinders') c;

  -- Tipos de cilindro.
  for v_item in select value from jsonb_array_elements(v_sample -> 'cylinder_types') loop
    begin
      select t.id, case when t.active then 'active' else 'inactive' end into v_id, v_status from public.cylinder_types t
       where t.organization_id = p_org and lower(btrim(t.gas)) = lower(v_item ->> 'gas') and t.capacity_value = (v_item ->> 'capacity_value')::numeric
         and t.capacity_unit = v_item ->> 'capacity_unit' and t.classification = v_item ->> 'classification';
      if v_id is null or v_status = 'inactive' then
        v_result := private.demo_ok(public.save_cylinder_type(p_actor, p_session, p_org, v_id, v_item ->> 'gas', (v_item ->> 'capacity_value')::numeric,
          v_item ->> 'capacity_unit', v_item ->> 'classification', true), 'type');
        if v_id is null then v_created := v_created + 1; else v_restored := v_restored + 1; end if;
        v_id := (v_result ->> 'type_id')::uuid;
      else
        v_unchanged := v_unchanged + 1;
      end if;
      perform private.demo_remember('cylinder_type', v_item ->> 'ref', v_id);
    exception when others then
      get stacked diagnostics v_detail = pg_exception_detail, v_message = message_text;
      v_warnings := v_warnings || to_jsonb('sample_' || coalesce(nullif(v_detail, ''), 'type.' || v_message));
    end;
  end loop;

  -- Cilindros, com o teste hidrostático e a entrada no estoque.
  for v_item in select value from jsonb_array_elements(v_sample -> 'cylinders') loop
    begin
      v_id := private.demo_record('cylinder', v_item ->> 'serial_number');
      select c.* into v_cyl from public.cylinders c where c.id = v_id and c.organization_id = p_org;
      if v_cyl.id is null then
        select c.* into v_cyl from public.cylinders c where c.organization_id = p_org and c.serial_normalized = upper(v_item ->> 'serial_number');
      end if;
      if v_cyl.id is null then
        v_result := private.demo_ok(public.create_cylinder(p_actor, p_session, p_org, private.demo_record('cylinder_type', v_item ->> 'type'),
          v_item ->> 'serial_number', null, null, null, 'Cilindro de exemplo da demonstração.', 'hull_number', v_item ->> 'serial_number'), 'cylinder.create');
        v_id := (v_result ->> 'cylinder_id')::uuid;
        perform private.demo_ok(public.register_hydrostatic_test(p_actor, p_session, p_org, v_id,
          case when v_item ->> 'hydro' = 'expired' then v_today - 1860 else v_today - 30 end, 'approved', 'TH-EXEMPLO-' || (v_item ->> 'serial_number'),
          'Laboratório Exemplo', case when v_item ->> 'hydro' = 'expired' then v_today - 35 else v_today + 335 end, null), 'cylinder.test');
        if coalesce((v_item ->> 'in_stock')::boolean, true) then
          perform private.demo_ok(public.stock_in_cylinder(p_actor, p_session, p_org, v_item ->> 'serial_number', gen_random_uuid()), 'cylinder.stock_in');
        end if;
        v_created := v_created + 1;
      elsif exists (select 1 from public.trip_items i where i.cylinder_id = v_cyl.id and i.is_open) then
        v_id := v_cyl.id;
        v_unchanged := v_unchanged + 1;
      else
        v_id := v_cyl.id;
        v_changed := false;
        if v_cyl.status <> 'active' then
          perform private.demo_ok(public.reactivate_cylinder(p_actor, p_session, p_org, v_id, v_reason), 'cylinder.reactivate');
          v_changed := true;
        end if;
        -- Cilindro de viagem publicada fica onde a viagem o deixou (com o cliente, por exemplo).
        if coalesce((v_item ->> 'in_stock')::boolean, true) and not (v_item ->> 'serial_number' = any (v_trip_cylinders))
           and (select c.stock_status <> 'in_stock' and c.custody_status = 'in_organization' from public.cylinders c where c.id = v_id) then
          perform private.demo_ok(public.stock_in_cylinder(p_actor, p_session, p_org, v_item ->> 'serial_number', gen_random_uuid()), 'cylinder.stock_in');
          v_changed := true;
        end if;
        if v_changed then v_restored := v_restored + 1; else v_unchanged := v_unchanged + 1; end if;
      end if;
      perform private.demo_remember('cylinder', v_item ->> 'serial_number', v_id);
    exception when others then
      get stacked diagnostics v_detail = pg_exception_detail, v_message = message_text;
      v_warnings := v_warnings || to_jsonb('sample_' || coalesce(nullif(v_detail, ''), 'cylinder.' || v_message) || ':' || (v_item ->> 'serial_number'));
    end;
  end loop;

  -- Clientes, unidades e geocercas.
  for v_item in select value from jsonb_array_elements(v_sample -> 'customers') loop
    begin
      v_id := private.demo_record('customer', v_item ->> 'ref');
      select c.status into v_status from public.customers c where c.id = v_id and c.organization_id = p_org;
      if v_status is null then
        v_result := private.demo_ok(public.create_customer(p_actor, p_session, p_org, v_item ->> 'person_type', v_item ->> 'document', v_item ->> 'legal_name',
          v_item ->> 'trade_name', v_item ->> 'segment', null, 'Cliente de exemplo da demonstração.', v_item -> 'contacts'), 'customer.create');
        v_id := (v_result ->> 'customer_id')::uuid;
        v_created := v_created + 1;
      elsif exists (select 1 from public.customers c where c.id = v_id and c.anonymized_at is not null) then
        v_warnings := v_warnings || to_jsonb('sample_customer_anonymized:' || (v_item ->> 'ref'));
        continue;
      elsif v_status = 'inactive' then
        perform private.demo_ok(public.reactivate_customer(p_actor, p_session, p_org, v_id, v_reason), 'customer.reactivate');
        v_restored := v_restored + 1;
      else
        v_unchanged := v_unchanged + 1;
      end if;
      perform private.demo_remember('customer', v_item ->> 'ref', v_id);

      v_id2 := private.demo_record('site', v_item ->> 'ref');
      select s.status into v_status from public.customer_sites s where s.id = v_id2 and s.organization_id = p_org;
      if v_status is null then
        v_result := private.demo_ok(public.create_site(p_actor => p_actor, p_session => p_session, p_organization => p_org, p_customer => v_id,
          p_name => v_item #>> '{site,name}', p_postal_code => v_item #>> '{site,postal_code}', p_street => v_item #>> '{site,street}',
          p_number => v_item #>> '{site,number}', p_complement => null, p_district => v_item #>> '{site,district}', p_city => v_item #>> '{site,city}',
          p_state => v_item #>> '{site,state}', p_ibge_code => v_item #>> '{site,ibge_code}', p_latitude => (v_item #>> '{site,latitude}')::numeric,
          p_longitude => (v_item #>> '{site,longitude}')::numeric, p_receiving_contact_name => v_item #>> '{site,receiving_contact_name}',
          p_receiving_contact_phone => v_item #>> '{site,receiving_contact_phone}', p_receiving_days => array[1, 2, 3, 4, 5]::smallint[],
          p_receiving_from => '07:00'::time, p_receiving_to => '17:00'::time, p_access_instructions => null, p_coordinates_source => 'manual'), 'site.create');
        v_id2 := (v_result ->> 'site_id')::uuid;
        v_created := v_created + 1;
      elsif v_status = 'inactive' then
        perform private.demo_ok(public.reactivate_site(p_actor, p_session, p_org, v_id2, v_reason), 'site.reactivate');
        v_restored := v_restored + 1;
      else
        v_unchanged := v_unchanged + 1;
      end if;
      perform private.demo_remember('site', v_item ->> 'ref', v_id2);

      v_id := private.demo_record('geofence', v_item ->> 'ref');
      select g.status into v_status from public.geofences g where g.id = v_id and g.organization_id = p_org;
      if v_status is null then
        v_result := private.demo_ok(public.create_geofence(p_actor, p_session, p_org, v_id2, v_item #>> '{geofence,name}', 'circle',
          jsonb_build_object('lat', (v_item #>> '{site,latitude}')::numeric, 'lng', (v_item #>> '{site,longitude}')::numeric),
          (v_item #>> '{geofence,radius_m}')::integer, null), 'geofence.create');
        v_id := (v_result ->> 'geofence_id')::uuid;
        v_created := v_created + 1;
      elsif v_status = 'inactive' then
        perform private.demo_ok(public.reactivate_geofence(p_actor, p_session, p_org, v_id, v_reason), 'geofence.reactivate');
        v_restored := v_restored + 1;
      else
        v_unchanged := v_unchanged + 1;
      end if;
      perform private.demo_remember('geofence', v_item ->> 'ref', v_id);
    exception when others then
      get stacked diagnostics v_detail = pg_exception_detail, v_message = message_text;
      v_warnings := v_warnings || to_jsonb('sample_' || coalesce(nullif(v_detail, ''), 'customer.' || v_message) || ':' || (v_item ->> 'ref'));
    end;
  end loop;

  -- Veículos.
  for v_item in select value from jsonb_array_elements(v_sample -> 'vehicles') loop
    begin
      v_id := private.demo_record('vehicle', v_item ->> 'plate');
      select v.status into v_status from public.vehicles v where v.id = v_id and v.organization_id = p_org;
      if v_status is null then
        v_result := private.demo_ok(public.create_vehicle(p_actor, p_session, p_org, v_item ->> 'plate', v_item ->> 'vehicle_type', null, v_item ->> 'brand',
          v_item ->> 'model', (v_item ->> 'manufacture_year')::integer, (v_item ->> 'capacity_cylinders')::integer, (v_item ->> 'max_load_kg')::numeric,
          v_today + (v_item ->> 'licensing_due_in_days')::integer), 'vehicle.create');
        v_id := (v_result ->> 'vehicle_id')::uuid;
        v_created := v_created + 1;
      elsif v_status <> 'available' then
        perform private.demo_ok(public.change_vehicle_status(p_actor, p_session, p_org, v_id, (select v.version from public.vehicles v where v.id = v_id),
          'available', v_reason), 'vehicle.status');
        v_restored := v_restored + 1;
      else
        v_unchanged := v_unchanged + 1;
      end if;
      perform private.demo_remember('vehicle', v_item ->> 'plate', v_id);
    exception when others then
      get stacked diagnostics v_detail = pg_exception_detail, v_message = message_text;
      v_warnings := v_warnings || to_jsonb('sample_' || coalesce(nullif(v_detail, ''), 'vehicle.' || v_message) || ':' || (v_item ->> 'plate'));
    end;
  end loop;

  -- Motoristas; o publicado com `account_role` fica ligado ao perfil de demonstração desse papel.
  for v_item in select value from jsonb_array_elements(v_sample -> 'drivers') loop
    begin
      v_changed := false;
      v_id := private.demo_record('driver', v_item ->> 'ref');
      select d.status into v_status from public.drivers d where d.id = v_id and d.organization_id = p_org;
      if v_status is null then
        v_result := private.demo_ok(public.create_driver(p_actor, p_session, p_org, v_item ->> 'full_name', v_item ->> 'cpf', v_item ->> 'cnh_number',
          v_item ->> 'cnh_category', v_today + (v_item ->> 'cnh_valid_in_days')::integer, v_item ->> 'phone'), 'driver.create');
        v_id := (v_result ->> 'driver_id')::uuid;
        v_created := v_created + 1;
      elsif v_status = 'inactive' then
        perform private.demo_ok(public.reactivate_driver(p_actor, p_session, p_org, v_id, v_reason), 'driver.reactivate');
        v_changed := true;
      end if;
      if v_item ? 'account_role' then
        select (a ->> 'user_id')::uuid into v_user from jsonb_array_elements(p_manifest -> 'accounts') a where a ->> 'role_code' = v_item ->> 'account_role';
        if (select d.linked_user_id is distinct from v_user from public.drivers d where d.id = v_id) then
          perform private.demo_ok(public.link_driver_user(p_actor, p_session, p_org, v_id, v_user), 'driver.link');
          if v_status is not null then v_changed := true; end if;
        end if;
      end if;
      if v_status is not null then
        if v_changed then v_restored := v_restored + 1; else v_unchanged := v_unchanged + 1; end if;
      end if;
      perform private.demo_remember('driver', v_item ->> 'ref', v_id);
    exception when others then
      get stacked diagnostics v_detail = pg_exception_detail, v_message = message_text;
      v_warnings := v_warnings || to_jsonb('sample_' || coalesce(nullif(v_detail, ''), 'driver.' || v_message) || ':' || (v_item ->> 'ref'));
    end;
  end loop;

  -- Viagens. Viagem que um visitante fez avançar não volta atrás: se a publicada não está mais na situação publicada, cria outra.
  for v_item in select value from jsonb_array_elements(v_sample -> 'trips') loop
    begin
      v_id := private.demo_record('trip', v_item ->> 'ref');
      select t.status into v_status from public.trips t where t.id = v_id and t.organization_id = p_org;
      if v_status is not null and v_status = v_item ->> 'state' then
        v_unchanged := v_unchanged + 1;
      else
        select jsonb_agg(jsonb_build_object('site_id', private.demo_record('site', s ->> 'customer'),
                 'cylinder_ids', (select jsonb_agg(private.demo_record('cylinder', c)) from jsonb_array_elements_text(s -> 'cylinders') c)))
          into v_stops from jsonb_array_elements(v_item -> 'stops') s;
        v_id2 := private.demo_run_trip(p_org, p_actor, p_session, v_item, v_stops, private.demo_record('vehicle', v_item ->> 'vehicle'),
          private.demo_record('driver', v_item ->> 'driver'));
        perform private.demo_remember('trip', v_item ->> 'ref', v_id2);
        if v_status is null then v_created := v_created + 1; else v_restored := v_restored + 1; end if;
      end if;
    exception when others then
      get stacked diagnostics v_detail = pg_exception_detail, v_message = message_text;
      v_warnings := v_warnings || to_jsonb('sample_' || coalesce(nullif(v_detail, ''), 'trip.' || v_message) || ':' || (v_item ->> 'ref'));
    end;
  end loop;

  -- Lacres simulados: cadastro, vínculo e as mensagens que geram a posição e o alerta publicado.
  for v_item in select value from jsonb_array_elements(v_sample -> 'seals') loop
    begin
      v_changed := false;
      v_id := private.demo_record('seal', v_item ->> 'ref');
      v_id2 := private.demo_record('cylinder', v_item ->> 'cylinder');
      select d.status into v_status from public.seal_devices d where d.id = v_id and d.organization_id = p_org;
      if v_status is null then
        v_result := private.demo_ok(public.create_device(p_actor, p_session, p_org, gen_random_uuid(), v_item ->> 'label', 60), 'seal.create');
        v_id := (v_result ->> 'device_id')::uuid;
        perform private.demo_remember('seal', v_item ->> 'ref', v_id);
        perform private.demo_ok(public.bind_seal(p_actor, p_session, p_org, gen_random_uuid(), v_id, v_id2), 'seal.bind');
        perform private.demo_seal_messages(v_id, v_item, true);
        v_created := v_created + 1;
      elsif v_status <> 'active' then
        v_warnings := v_warnings || to_jsonb('sample_seal_inactive:' || (v_item ->> 'ref'));
      else
        if not exists (select 1 from public.seal_bindings b where b.device_id = v_id and b.unbound_at is null)
           and not exists (select 1 from public.seal_bindings b where b.cylinder_id = v_id2 and b.unbound_at is null) then
          perform private.demo_ok(public.bind_seal(p_actor, p_session, p_org, gen_random_uuid(), v_id, v_id2), 'seal.bind');
          v_changed := true;
        end if;
        if not exists (select 1 from public.seal_alerts a where a.device_id = v_id and a.kind = v_item ->> 'alert' and a.status <> 'closed') then
          perform private.demo_seal_messages(v_id, v_item, false);
          v_changed := true;
        end if;
        if v_changed then v_restored := v_restored + 1; else v_unchanged := v_unchanged + 1; end if;
      end if;
    exception when others then
      get stacked diagnostics v_detail = pg_exception_detail, v_message = message_text;
      v_warnings := v_warnings || to_jsonb('sample_' || coalesce(nullif(v_detail, ''), 'seal.' || v_message) || ':' || (v_item ->> 'ref'));
    end;
  end loop;

  return jsonb_build_object('created', v_created, 'restored', v_restored, 'unchanged', v_unchanged, 'warnings', v_warnings);
end $$;

revoke all on function private.demo_run_trip(uuid, uuid, uuid, jsonb, jsonb, uuid, uuid), private.demo_seal_messages(uuid, jsonb, boolean),
  private.demo_restore_sample(uuid, uuid, uuid, jsonb, uuid) from public, anon, authenticated;

-- 6. A restauração passa pelos dados de exemplo antes de encerrar a sessão de serviço e os inclui no resumo (`sample`).
create or replace function public.demo_restore(p_manifest jsonb, p_phase text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  problems text[];
  v_org uuid;
  v_org_row public.organizations;
  v_tenant text := 'unchanged';
  v_cylinder text := 'unchanged';
  v_seal text := 'unchanged';
  v_warnings jsonb := '[]'::jsonb;
  v_restored integer := 0;
  v_unchanged integer := 0;
  v_account jsonb;
  v_user uuid;
  v_membership uuid;
  v_role uuid;
  v_changed boolean;
  v_admin uuid;
  v_session uuid;
  v_cyl public.cylinders;
  v_cyl_id uuid;
  v_type uuid;
  v_type_active boolean;
  v_result jsonb;
  v_device public.seal_devices;
  v_summary jsonb;
  v_sample jsonb;
  v_published_type uuid;
  v_serial text := btrim(p_manifest #>> '{cylinder,serial_number}');
  v_ident_kind text := p_manifest #>> '{cylinder,identifier,kind}';
  v_ident_value text := btrim(p_manifest #>> '{cylinder,identifier,value}');
  v_notes text := nullif(btrim(coalesce(p_manifest #>> '{cylinder,notes}', '')), '');
  v_gas text := btrim(p_manifest #>> '{cylinder,type,gas}');
  v_capacity numeric;
  v_unit text := p_manifest #>> '{cylinder,type,capacity_unit}';
  v_class text := p_manifest #>> '{cylinder,type,classification}';
  v_code text := p_manifest #>> '{seal,device_code}';
  v_reason constant text := 'Restauração da demonstração (Spec 014)';
begin
  if p_phase is null or p_phase not in ('markers', 'state') then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', jsonb_build_array('phase'));
  end if;
  problems := private.demo_manifest_problems(p_manifest);
  if cardinality(problems) > 0 then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', to_jsonb(problems));
  end if;
  v_org := (p_manifest #>> '{tenant,id}')::uuid;
  v_capacity := (p_manifest #>> '{cylinder,type,capacity_value}')::numeric;

  -- Uma restauração por vez.
  perform pg_advisory_xact_lock(hashtextextended('demo_restore', 0));

  if private.demo_has_foreign_members(v_org, p_manifest) then
    perform private.write_audit_event(null, null, null, 'demo.restore', 'organization', v_org::text, 'denied', 'demo_foreign_members', null,
      jsonb_build_object('phase', p_phase));
    return jsonb_build_object('code', 'DEMO_FOREIGN_MEMBERS');
  end if;

  ---------------------------------------------------------------------------------------------------------------------------------
  if p_phase = 'markers' then
    -- Contas que saíram do manifesto deixam de ser de demonstração.
    delete from private.demo_accounts d
     where d.user_id::text not in (select a ->> 'user_id' from jsonb_array_elements(p_manifest -> 'accounts') a);
    insert into private.demo_accounts (user_id, email, published_password, role_code, updated_at)
    select (a ->> 'user_id')::uuid, a ->> 'email', a ->> 'password', a ->> 'role_code', now()
      from jsonb_array_elements(p_manifest -> 'accounts') a
    on conflict (user_id) do update set email = excluded.email, published_password = excluded.published_password,
      role_code = excluded.role_code, updated_at = now()
     where (private.demo_accounts.email, private.demo_accounts.published_password, private.demo_accounts.role_code)
       is distinct from (excluded.email, excluded.published_password, excluded.role_code);
    -- O tenant só é marcado quando já existe; na criação do zero, a fase state cria e marca.
    if exists (select 1 from public.organizations o where o.id = v_org) then
      delete from private.demo_tenant where organization_id <> v_org;
      insert into private.demo_tenant (organization_id) values (v_org) on conflict (organization_id) do nothing;
    end if;
    return jsonb_build_object('code', 'DEMO_MARKED', 'accounts', jsonb_array_length(p_manifest -> 'accounts'));
  end if;

  ---------------------------------------------------------------------------------------------------------------------------------
  -- Fase state. As marcas e os usuários do Auth precisam existir (o script roda markers e acerta o Auth antes).
  if (select count(*) from jsonb_array_elements(p_manifest -> 'accounts') a
        join private.demo_accounts d on d.user_id = (a ->> 'user_id')::uuid and d.email = a ->> 'email'
        join auth.users u on u.id = d.user_id and lower(u.email) = d.email) <> 5 then
    return jsonb_build_object('code', 'DEMO_ACCOUNTS_MISSING');
  end if;

  -- Tenant: cria inativo (como qualquer tenant novo) ou acerta os nomes; ativa depois do administrador.
  select * into v_org_row from public.organizations where id = v_org for update;
  if v_org_row.id is null then
    insert into public.organizations (id, kind, legal_name, display_name, status)
    values (v_org, 'tenant', btrim(p_manifest #>> '{tenant,legal_name}'), btrim(p_manifest #>> '{tenant,display_name}'), 'inactive')
    returning * into v_org_row;
    v_tenant := 'created';
  elsif v_org_row.kind <> 'tenant' then
    return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', jsonb_build_array('tenant.id'));
  elsif v_org_row.display_name <> btrim(p_manifest #>> '{tenant,display_name}') or v_org_row.legal_name <> btrim(p_manifest #>> '{tenant,legal_name}') then
    update public.organizations set display_name = btrim(p_manifest #>> '{tenant,display_name}'), legal_name = btrim(p_manifest #>> '{tenant,legal_name}'),
      version = version + 1, updated_at = now() where id = v_org;
    v_tenant := 'reactivated';
  end if;
  perform private.bootstrap_tenant_roles(v_org);
  delete from private.demo_tenant where organization_id <> v_org;
  insert into private.demo_tenant (organization_id) values (v_org) on conflict (organization_id) do nothing;
  update private.demo_tenant set manifest = p_manifest, updated_at = now() where organization_id = v_org and manifest is distinct from p_manifest;

  select (a ->> 'user_id')::uuid into v_admin from jsonb_array_elements(p_manifest -> 'accounts') a where a ->> 'role_code' = 'tenant_admin';

  -- Perfis, vínculos e um papel por vínculo. O administrador vem primeiro: tirar o papel de administrador de outro perfil exige que ele exista.
  for v_account in
    select a from jsonb_array_elements(p_manifest -> 'accounts') a order by (a ->> 'role_code') <> 'tenant_admin'
  loop
    v_changed := false;
    v_user := (v_account ->> 'user_id')::uuid;
    v_membership := (v_account ->> 'membership_id')::uuid;

    insert into public.profiles (user_id, display_name) values (v_user, btrim(v_account ->> 'display_name'))
    on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now()
     where public.profiles.display_name is distinct from excluded.display_name;
    if found then v_changed := true; end if;

    if not exists (select 1 from public.memberships m where m.organization_id = v_org and m.user_id = v_user) then
      insert into public.memberships (id, organization_id, user_id, status, activated_at) values (v_membership, v_org, v_user, 'active', now());
      v_changed := true;
    else
      select m.id into v_membership from public.memberships m where m.organization_id = v_org and m.user_id = v_user;
      update public.memberships set status = 'active', activated_at = coalesce(activated_at, now()), blocked_at = null, inactivated_at = null,
        version = version + 1, updated_at = now()
       where id = v_membership and status <> 'active';
      if found then v_changed := true; end if;
    end if;

    select r.id into v_role from public.roles r where r.organization_id = v_org and r.code = v_account ->> 'role_code' and r.system;
    insert into public.membership_roles (membership_id, role_id, assigned_by) values (v_membership, v_role, v_admin) on conflict do nothing;
    if found then v_changed := true; end if;
    delete from public.membership_roles where membership_id = v_membership and role_id <> v_role;
    if found then v_changed := true; end if;

    if v_changed then v_restored := v_restored + 1; else v_unchanged := v_unchanged + 1; end if;
  end loop;

  if v_org_row.status <> 'active' then
    update public.organizations set status = 'active', version = version + 1, updated_at = now() where id = v_org;
    if v_tenant = 'unchanged' then v_tenant := 'reactivated'; end if;
  end if;

  -- Sessão de serviço do administrador de demonstração: as operações do domínio exigem ator e sessão vigentes.
  v_session := gen_random_uuid();
  insert into public.user_sessions (session_id, user_id, kind, aal, started_at, last_seen_at, expires_at)
  values (v_session, v_admin, 'service', 'aal1', now(), now(), now() + interval '10 minutes');

  -- Cilindro C262: ativo, em estoque e com o tipo publicado. O histórico nunca é apagado.
  select t.cylinder_id into v_cyl_id from private.demo_tenant t where t.organization_id = v_org;
  select c.* into v_cyl from public.cylinders c where c.id = v_cyl_id and c.organization_id = v_org;
  if v_cyl.id is null then
    select c.* into v_cyl from public.cylinders c where c.organization_id = v_org and c.serial_normalized = upper(v_serial);
  end if;

  if v_cyl.id is not null and exists (select 1 from public.trip_items i where i.cylinder_id = v_cyl.id and i.is_open) then
    v_cylinder := 'skipped_in_trip';
    v_warnings := v_warnings || '"cylinder_in_trip"'::jsonb;
  else
    select t.id, t.active into v_type, v_type_active from public.cylinder_types t
     where t.organization_id = v_org and lower(btrim(t.gas)) = lower(v_gas) and t.capacity_value = v_capacity
       and t.capacity_unit = v_unit and t.classification = v_class;
    if v_type is null or not v_type_active then
      v_result := public.save_cylinder_type(v_admin, v_session, v_org, v_type, v_gas, v_capacity, v_unit, v_class, true);
      if v_result ->> 'code' <> 'TYPE_SAVED' then raise exception 'demo_restore_type_failed: %', v_result ->> 'code'; end if;
      v_type := (v_result ->> 'type_id')::uuid;
    end if;

    if v_cyl.id is null then
      v_result := public.create_cylinder(v_admin, v_session, v_org, v_type, v_serial, null, null, null, v_notes, v_ident_kind, v_ident_value);
      if v_result ->> 'code' <> 'CREATED' then raise exception 'demo_restore_cylinder_failed: %', v_result ->> 'code'; end if;
      select c.* into v_cyl from public.cylinders c where c.id = (v_result ->> 'cylinder_id')::uuid;
      v_cylinder := 'created';
    else
      if v_cyl.status <> 'active' then
        v_result := public.reactivate_cylinder(v_admin, v_session, v_org, v_cyl.id, v_reason);
        if v_result ->> 'code' <> 'OK' then raise exception 'demo_restore_reactivate_failed: %', v_result ->> 'code'; end if;
        v_cylinder := 'restored';
        select c.* into v_cyl from public.cylinders c where c.id = v_cyl.id;
      end if;
      if v_cyl.cylinder_type_id <> v_type or v_cyl.serial_number <> v_serial or v_cyl.notes is distinct from v_notes then
        v_result := public.update_cylinder(v_admin, v_session, v_org, v_cyl.id, v_cyl.version, v_type, v_serial,
          v_cyl.manufacturer, v_cyl.manufacture_year, v_cyl.working_pressure_bar, v_notes);
        if v_result ->> 'code' = 'UPDATED' then v_cylinder := 'restored';
        else v_warnings := v_warnings || to_jsonb('cylinder_update_' || lower(coalesce(v_result ->> 'code', 'failed'))); end if;
        select c.* into v_cyl from public.cylinders c where c.id = v_cyl.id;
      end if;
    end if;

    if v_cyl.stock_status <> 'in_stock' then
      if v_cyl.custody_status = 'at_customer' then
        v_warnings := v_warnings || '"cylinder_at_customer"'::jsonb;
      else
        v_result := public.stock_in_cylinder(v_admin, v_session, v_org, v_ident_value, gen_random_uuid());
        if v_result ->> 'code' = 'STOCKED' then
          if v_cylinder = 'unchanged' then v_cylinder := 'restored'; end if;
        else
          v_warnings := v_warnings || to_jsonb('cylinder_stock_in_' || lower(coalesce(v_result ->> 'code', 'failed')));
        end if;
      end if;
    end if;
    update private.demo_tenant set cylinder_id = v_cyl.id, updated_at = now() where organization_id = v_org and cylinder_id is distinct from v_cyl.id;
  end if;

  -- Lacre de bancada: vinculado ao C262 quando destinado ao tenant e livre. Destinar é só do Master (Spec 013): aqui, só aviso.
  select d.* into v_device from public.seal_devices d where d.organization_id = v_org and d.device_code = v_code and d.status = 'active';
  if v_device.id is null then
    if exists (select 1 from public.seal_enrollments e where e.device_code = v_code)
       or exists (select 1 from public.seal_devices d where d.device_code = v_code) then
      v_seal := 'not_assigned';
      v_warnings := v_warnings || '"seal_not_assigned"'::jsonb;
    else
      v_seal := 'absent';
    end if;
  elsif v_cyl.id is not null and exists (select 1 from public.seal_bindings b where b.device_id = v_device.id and b.cylinder_id = v_cyl.id and b.unbound_at is null) then
    v_seal := 'unchanged';
  elsif exists (select 1 from public.seal_bindings b where b.device_id = v_device.id and b.unbound_at is null) then
    v_warnings := v_warnings || '"seal_bound_elsewhere"'::jsonb;
  elsif v_cyl.id is null or v_cyl.status <> 'active' then
    v_warnings := v_warnings || '"seal_cylinder_unavailable"'::jsonb;
  elsif exists (select 1 from public.seal_bindings b where b.cylinder_id = v_cyl.id and b.unbound_at is null) then
    v_warnings := v_warnings || '"cylinder_bound_elsewhere"'::jsonb;
  else
    v_result := public.bind_seal(v_admin, v_session, v_org, gen_random_uuid(), v_device.id, v_cyl.id);
    if v_result ->> 'code' = 'BOUND' then v_seal := 'bound';
    else v_warnings := v_warnings || to_jsonb('seal_bind_' || lower(coalesce(v_result ->> 'code', 'failed'))); end if;
  end if;

  -- RF-018: dados de exemplo (clientes, frota, cilindros, viagens e lacres simulados), com a mesma sessão de serviço.
  select t.id into v_published_type from public.cylinder_types t
   where t.organization_id = v_org and lower(btrim(t.gas)) = lower(v_gas) and t.capacity_value = v_capacity
     and t.capacity_unit = v_unit and t.classification = v_class;
  v_sample := private.demo_restore_sample(v_org, v_admin, v_session, p_manifest, v_published_type);
  v_warnings := v_warnings || coalesce(v_sample -> 'warnings', '[]'::jsonb);

  update public.user_sessions set status = 'revoked', ended_at = now(), end_reason = 'demo_restore' where session_id = v_session;

  v_summary := jsonb_build_object('code', 'DEMO_RESTORED', 'tenant', v_tenant,
    'accounts', jsonb_build_object('restored', v_restored, 'unchanged', v_unchanged),
    'cylinder', v_cylinder, 'seal', v_seal, 'sample', v_sample - 'warnings', 'warnings', v_warnings);
  perform private.write_audit_event(null, null, null, 'demo.restore', 'organization', v_org::text, 'success', null, null, v_summary - 'code');
  return v_summary;
end $$;

revoke all on function public.demo_restore(jsonb, text) from public, anon, authenticated;
grant execute on function public.demo_restore(jsonb, text) to service_role;

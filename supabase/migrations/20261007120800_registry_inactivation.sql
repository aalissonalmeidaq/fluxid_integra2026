-- Spec 007, US6: inativar e reativar sem apagar nada, com cascata atômica no cliente e na unidade (RF-033 a RF-035, CA-002, CA-010).
-- A cascata roda em uma transação só, bloqueando cliente -> unidades -> geocercas em ordem estável. `expected_counts` protege contra a
-- mudança das quantidades entre a prévia e a confirmação. Reativar nunca desfaz a cascata: cada filho é reativado à mão, e só se o pai está ativo.

create function private.check_justification(p_justification text) returns text language sql immutable set search_path = '' as $$
  select case when nullif(btrim(coalesce(p_justification, '')), '') is null or char_length(btrim(p_justification)) not between 5 and 500 then null else btrim(p_justification) end
$$;

create function private.count_active_children(p_customer uuid, p_site uuid, out sites integer, out geofences integer) language sql stable security definer set search_path = '' as $$
  select
    case when p_customer is null then 0 else (select count(*)::integer from public.customer_sites s where s.customer_id = p_customer and s.status = 'active') end,
    (select count(*)::integer from public.geofences g join public.customer_sites s on s.id = g.site_id
      where g.status = 'active' and ((p_customer is not null and s.customer_id = p_customer) or (p_site is not null and g.site_id = p_site)))
$$;

create function public.preview_customer_inactivation(p_actor uuid, p_session uuid, p_organization uuid, p_customer uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_counts record;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.deactivate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if not exists (select 1 from public.customers c where c.id = p_customer and c.organization_id = p_organization) then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  select * into v_counts from private.count_active_children(p_customer, null);
  return jsonb_build_object('code', 'FOUND', 'sites', v_counts.sites, 'geofences', v_counts.geofences);
end $$;

create function public.preview_site_inactivation(p_actor uuid, p_session uuid, p_organization uuid, p_site uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  denied text;
  v_counts record;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.deactivate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  if not exists (select 1 from public.customer_sites s where s.id = p_site and s.organization_id = p_organization) then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  select * into v_counts from private.count_active_children(null, p_site);
  return jsonb_build_object('code', 'FOUND', 'geofences', v_counts.geofences);
end $$;

create function public.inactivate_customer(p_actor uuid, p_session uuid, p_organization uuid, p_customer uuid, p_justification text, p_expected_counts jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_cust public.customers;
  v_justification text := private.check_justification(p_justification);
  v_counts record;
  v_site record;
  v_geo record;
  v_sites integer := 0;
  v_geofences integer := 0;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.deactivate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select c.* into v_cust from public.customers c where c.id = p_customer and c.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_justification is null then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  if v_cust.status = 'inactive' then return jsonb_build_object('code', 'ALREADY_INACTIVE'); end if;

  -- Bloqueio em ordem estável: cliente (acima) -> unidades -> geocercas, para duas cascatas nunca se cruzarem.
  perform 1 from public.customer_sites s where s.customer_id = p_customer order by s.id for update;
  perform 1 from public.geofences g join public.customer_sites s on s.id = g.site_id where s.customer_id = p_customer order by g.id for update of g;
  select * into v_counts from private.count_active_children(p_customer, null);
  if p_expected_counts is not null and ((p_expected_counts->>'sites')::integer is distinct from v_counts.sites or (p_expected_counts->>'geofences')::integer is distinct from v_counts.geofences) then
    return jsonb_build_object('code', 'CASCADE_CHANGED', 'counts', jsonb_build_object('sites', v_counts.sites, 'geofences', v_counts.geofences));
  end if;

  for v_geo in select g.id from public.geofences g join public.customer_sites s on s.id = g.site_id where s.customer_id = p_customer and g.status = 'active' order by g.id loop
    update public.geofences set status = 'inactive', inactivated_at = now(), inactivated_by = p_actor, version = version + 1, updated_at = now() where id = v_geo.id;
    perform private.append_registry_event('geofence', v_geo.id, p_organization, 'geofence_inactivated', p_actor, p_session, v_justification, jsonb_build_object('cascade_of', p_customer));
    v_geofences := v_geofences + 1;
  end loop;
  for v_site in select s.id from public.customer_sites s where s.customer_id = p_customer and s.status = 'active' order by s.id loop
    update public.customer_sites set status = 'inactive', inactivated_at = now(), inactivated_by = p_actor, version = version + 1, updated_at = now() where id = v_site.id;
    perform private.append_registry_event('site', v_site.id, p_organization, 'site_inactivated', p_actor, p_session, v_justification, jsonb_build_object('cascade_of', p_customer));
    v_sites := v_sites + 1;
  end loop;
  update public.customers set status = 'inactive', inactivated_at = now(), inactivated_by = p_actor, version = version + 1, updated_at = now() where id = p_customer;
  perform private.append_registry_event('customer', p_customer, p_organization, 'customer_inactivated', p_actor, p_session, v_justification, jsonb_build_object('sites', v_sites, 'geofences', v_geofences));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'customer.inactivate', 'customer', p_customer::text, 'success', null, v_justification,
    jsonb_build_object('customer_id', p_customer, 'sites', v_sites, 'geofences', v_geofences));
  return jsonb_build_object('code', 'INACTIVATED', 'version', v_cust.version + 1, 'sites', v_sites, 'geofences', v_geofences);
end $$;

create function public.reactivate_customer(p_actor uuid, p_session uuid, p_organization uuid, p_customer uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_cust public.customers;
  v_justification text := private.check_justification(p_justification);
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.deactivate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select c.* into v_cust from public.customers c where c.id = p_customer and c.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_cust.anonymized_at is not null then return jsonb_build_object('code', 'ANONYMIZED_RECORD'); end if;
  if v_justification is null then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  if v_cust.status = 'active' then return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('status', 'O cliente já está ativo.')); end if;
  -- Reativa só o cliente: unidades e geocercas inativadas junto continuam inativas (RF-034).
  update public.customers set status = 'active', inactivated_at = null, inactivated_by = null, version = version + 1, updated_at = now() where id = p_customer;
  perform private.append_registry_event('customer', p_customer, p_organization, 'customer_reactivated', p_actor, p_session, v_justification, '{}'::jsonb);
  perform private.write_audit_event(p_organization, p_actor, p_session, 'customer.reactivate', 'customer', p_customer::text, 'success', null, v_justification, jsonb_build_object('customer_id', p_customer));
  return jsonb_build_object('code', 'REACTIVATED', 'version', v_cust.version + 1);
end $$;

create function public.inactivate_site(p_actor uuid, p_session uuid, p_organization uuid, p_site uuid, p_justification text, p_expected_counts jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_site public.customer_sites;
  v_justification text := private.check_justification(p_justification);
  v_counts record;
  v_geo record;
  v_geofences integer := 0;
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.deactivate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select s.* into v_site from public.customer_sites s where s.id = p_site and s.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_justification is null then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  if v_site.status = 'inactive' then return jsonb_build_object('code', 'ALREADY_INACTIVE'); end if;
  perform 1 from public.geofences g where g.site_id = p_site order by g.id for update;
  select * into v_counts from private.count_active_children(null, p_site);
  if p_expected_counts is not null and (p_expected_counts->>'geofences')::integer is distinct from v_counts.geofences then
    return jsonb_build_object('code', 'CASCADE_CHANGED', 'counts', jsonb_build_object('sites', 0, 'geofences', v_counts.geofences));
  end if;
  for v_geo in select g.id from public.geofences g where g.site_id = p_site and g.status = 'active' order by g.id loop
    update public.geofences set status = 'inactive', inactivated_at = now(), inactivated_by = p_actor, version = version + 1, updated_at = now() where id = v_geo.id;
    perform private.append_registry_event('geofence', v_geo.id, p_organization, 'geofence_inactivated', p_actor, p_session, v_justification, jsonb_build_object('cascade_of', p_site));
    v_geofences := v_geofences + 1;
  end loop;
  update public.customer_sites set status = 'inactive', inactivated_at = now(), inactivated_by = p_actor, version = version + 1, updated_at = now() where id = p_site;
  perform private.append_registry_event('site', p_site, p_organization, 'site_inactivated', p_actor, p_session, v_justification, jsonb_build_object('geofences', v_geofences));
  perform private.write_audit_event(p_organization, p_actor, p_session, 'site.inactivate', 'site', p_site::text, 'success', null, v_justification,
    jsonb_build_object('site_id', p_site, 'geofences', v_geofences));
  return jsonb_build_object('code', 'INACTIVATED', 'version', v_site.version + 1, 'geofences', v_geofences);
end $$;

create function public.reactivate_site(p_actor uuid, p_session uuid, p_organization uuid, p_site uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_site public.customer_sites;
  v_justification text := private.check_justification(p_justification);
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'customer.deactivate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select s.* into v_site from public.customer_sites s where s.id = p_site and s.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if exists (select 1 from public.customers c where c.id = v_site.customer_id and c.anonymized_at is not null) then return jsonb_build_object('code', 'ANONYMIZED_RECORD'); end if;
  if v_justification is null then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  if v_site.status = 'active' then return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('status', 'A unidade já está ativa.')); end if;
  if exists (select 1 from public.customers c where c.id = v_site.customer_id and c.status <> 'active') then return jsonb_build_object('code', 'PARENT_INACTIVE'); end if;
  update public.customer_sites set status = 'active', inactivated_at = null, inactivated_by = null, version = version + 1, updated_at = now() where id = p_site;
  perform private.append_registry_event('site', p_site, p_organization, 'site_reactivated', p_actor, p_session, v_justification, '{}'::jsonb);
  perform private.write_audit_event(p_organization, p_actor, p_session, 'site.reactivate', 'site', p_site::text, 'success', null, v_justification, jsonb_build_object('site_id', p_site));
  return jsonb_build_object('code', 'REACTIVATED', 'version', v_site.version + 1);
end $$;

create function public.inactivate_geofence(p_actor uuid, p_session uuid, p_organization uuid, p_geofence uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_geo public.geofences;
  v_justification text := private.check_justification(p_justification);
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'geofence.deactivate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select g.* into v_geo from public.geofences g where g.id = p_geofence and g.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_justification is null then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  if v_geo.status = 'inactive' then return jsonb_build_object('code', 'ALREADY_INACTIVE'); end if;
  update public.geofences set status = 'inactive', inactivated_at = now(), inactivated_by = p_actor, version = version + 1, updated_at = now() where id = p_geofence;
  perform private.append_registry_event('geofence', p_geofence, p_organization, 'geofence_inactivated', p_actor, p_session, v_justification, '{}'::jsonb);
  perform private.write_audit_event(p_organization, p_actor, p_session, 'geofence.inactivate', 'geofence', p_geofence::text, 'success', null, v_justification, jsonb_build_object('geofence_id', p_geofence));
  return jsonb_build_object('code', 'INACTIVATED', 'version', v_geo.version + 1);
end $$;

create function public.reactivate_geofence(p_actor uuid, p_session uuid, p_organization uuid, p_geofence uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_geo public.geofences;
  v_justification text := private.check_justification(p_justification);
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'geofence.deactivate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select g.* into v_geo from public.geofences g where g.id = p_geofence and g.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_justification is null then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  if v_geo.status = 'active' then return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('status', 'A geocerca já está ativa.')); end if;
  if exists (select 1 from public.customer_sites s where s.id = v_geo.site_id and s.status <> 'active') then return jsonb_build_object('code', 'PARENT_INACTIVE'); end if;
  update public.geofences set status = 'active', inactivated_at = null, inactivated_by = null, version = version + 1, updated_at = now() where id = p_geofence;
  perform private.append_registry_event('geofence', p_geofence, p_organization, 'geofence_reactivated', p_actor, p_session, v_justification, '{}'::jsonb);
  perform private.write_audit_event(p_organization, p_actor, p_session, 'geofence.reactivate', 'geofence', p_geofence::text, 'success', null, v_justification, jsonb_build_object('geofence_id', p_geofence));
  return jsonb_build_object('code', 'REACTIVATED', 'version', v_geo.version + 1);
end $$;

-- Motorista: o vínculo com o usuário não muda ao inativar nem ao reativar (RF-027).
create function public.inactivate_driver(p_actor uuid, p_session uuid, p_organization uuid, p_driver uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_drv public.drivers;
  v_justification text := private.check_justification(p_justification);
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'driver.deactivate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select d.* into v_drv from public.drivers d where d.id = p_driver and d.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_justification is null then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  if v_drv.status = 'inactive' then return jsonb_build_object('code', 'ALREADY_INACTIVE'); end if;
  update public.drivers set status = 'inactive', inactivated_at = now(), inactivated_by = p_actor, version = version + 1, updated_at = now() where id = p_driver;
  perform private.append_registry_event('driver', p_driver, p_organization, 'driver_inactivated', p_actor, p_session, v_justification, '{}'::jsonb);
  perform private.write_audit_event(p_organization, p_actor, p_session, 'driver.inactivate', 'driver', p_driver::text, 'success', null, v_justification, jsonb_build_object('driver_id', p_driver));
  return jsonb_build_object('code', 'INACTIVATED', 'version', v_drv.version + 1);
end $$;

create function public.reactivate_driver(p_actor uuid, p_session uuid, p_organization uuid, p_driver uuid, p_justification text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  denied text;
  v_drv public.drivers;
  v_justification text := private.check_justification(p_justification);
begin
  denied := private.cylinder_authorize(p_actor, p_session, p_organization, 'driver.deactivate');
  if denied is not null then return jsonb_build_object('code', denied); end if;
  select d.* into v_drv from public.drivers d where d.id = p_driver and d.organization_id = p_organization for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_drv.anonymized_at is not null then return jsonb_build_object('code', 'ANONYMIZED_RECORD'); end if;
  if v_justification is null then return jsonb_build_object('code', 'JUSTIFICATION_REQUIRED'); end if;
  if v_drv.status = 'active' then return jsonb_build_object('code', 'VALIDATION_FAILED', 'fields', private.field_error('status', 'O motorista já está ativo.')); end if;
  update public.drivers set status = 'active', inactivated_at = null, inactivated_by = null, version = version + 1, updated_at = now() where id = p_driver;
  perform private.append_registry_event('driver', p_driver, p_organization, 'driver_reactivated', p_actor, p_session, v_justification, '{}'::jsonb);
  perform private.write_audit_event(p_organization, p_actor, p_session, 'driver.reactivate', 'driver', p_driver::text, 'success', null, v_justification, jsonb_build_object('driver_id', p_driver));
  return jsonb_build_object('code', 'REACTIVATED', 'version', v_drv.version + 1);
end $$;

revoke all on function private.check_justification(text), private.count_active_children(uuid, uuid) from public, anon, authenticated;
revoke all on function
  public.preview_customer_inactivation(uuid, uuid, uuid, uuid), public.preview_site_inactivation(uuid, uuid, uuid, uuid),
  public.inactivate_customer(uuid, uuid, uuid, uuid, text, jsonb), public.reactivate_customer(uuid, uuid, uuid, uuid, text),
  public.inactivate_site(uuid, uuid, uuid, uuid, text, jsonb), public.reactivate_site(uuid, uuid, uuid, uuid, text),
  public.inactivate_geofence(uuid, uuid, uuid, uuid, text), public.reactivate_geofence(uuid, uuid, uuid, uuid, text),
  public.inactivate_driver(uuid, uuid, uuid, uuid, text), public.reactivate_driver(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function
  public.preview_customer_inactivation(uuid, uuid, uuid, uuid), public.preview_site_inactivation(uuid, uuid, uuid, uuid),
  public.inactivate_customer(uuid, uuid, uuid, uuid, text, jsonb), public.reactivate_customer(uuid, uuid, uuid, uuid, text),
  public.inactivate_site(uuid, uuid, uuid, uuid, text, jsonb), public.reactivate_site(uuid, uuid, uuid, uuid, text),
  public.inactivate_geofence(uuid, uuid, uuid, uuid, text), public.reactivate_geofence(uuid, uuid, uuid, uuid, text),
  public.inactivate_driver(uuid, uuid, uuid, uuid, text), public.reactivate_driver(uuid, uuid, uuid, uuid, text) to service_role;

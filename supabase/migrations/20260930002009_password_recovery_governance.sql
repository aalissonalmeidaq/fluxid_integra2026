create table private.password_recovery_requests (
  identity_hash text primary key,
  generation bigint not null default 1,
  delivery_status text not null default 'pending',
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  constraint password_recovery_identity_hash_check check (identity_hash ~ '^[0-9a-f]{64}$'),
  constraint password_recovery_delivery_check check (delivery_status in ('pending', 'confirmed', 'failed', 'not_applicable')),
  constraint password_recovery_expiry_check check (expires_at = requested_at + interval '1 hour')
);

create function public.reserve_password_recovery(p_identity_hash text, p_interval_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare reserved boolean;
begin
  if p_identity_hash !~ '^[0-9a-f]{64}$' or p_interval_seconds not between 60 and 3600 then
    raise exception using errcode = '22023', message = 'invalid_recovery_reservation';
  end if;
  insert into private.password_recovery_requests(identity_hash)
  values (p_identity_hash)
  on conflict (identity_hash) do update
    set generation = private.password_recovery_requests.generation + 1,
        delivery_status = 'pending', requested_at = now(), expires_at = now() + interval '1 hour'
    where private.password_recovery_requests.requested_at <= now() - make_interval(secs => p_interval_seconds)
  returning true into reserved;
  return coalesce(reserved, false);
end;
$$;

create function public.record_password_recovery_delivery(p_identity_hash text, p_delivery text)
returns void language plpgsql security definer set search_path = '' as $$
declare audit_result text;
begin
  if p_delivery not in ('pending', 'confirmed', 'failed', 'not_applicable') then
    raise exception using errcode = '22023', message = 'invalid_delivery';
  end if;
  update private.password_recovery_requests set delivery_status = p_delivery
   where identity_hash = p_identity_hash;
  audit_result := case when p_delivery = 'failed' then 'failed' else 'success' end;
  perform private.write_audit_event(null, null, null, 'auth.recovery.request', 'identity_hash', null,
    audit_result, p_delivery, null, '{}'::jsonb);
end;
$$;

revoke all on table private.password_recovery_requests from public, anon, authenticated;
revoke all on function public.reserve_password_recovery(text, integer) from public, anon, authenticated;
revoke all on function public.record_password_recovery_delivery(text, text) from public, anon, authenticated;
grant execute on function public.reserve_password_recovery(text, integer) to service_role;
grant execute on function public.record_password_recovery_delivery(text, text) to service_role;

comment on table private.password_recovery_requests is
  'Guarda somente hash da identidade, geração e estado de entrega; não persiste e-mail, token ou link.';

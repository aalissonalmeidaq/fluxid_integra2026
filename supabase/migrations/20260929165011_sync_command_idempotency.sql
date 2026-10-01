create or replace function public.process_sync_command(
  requested_organization_id uuid,
  requested_idempotency_key text,
  requested_actor_user_id uuid,
  requested_operation text,
  requested_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
  ledger_row private.idempotency_ledger%rowtype;
begin
  if requested_idempotency_key is null or char_length(requested_idempotency_key) < 8
     or requested_operation is null or requested_operation !~ '^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$'
     or requested_hash is null or char_length(requested_hash) <> 64 then
    raise exception using errcode = '22023', message = 'invalid_sync_command';
  end if;

  if not exists (
    select 1
    from public.memberships as membership
    join public.organizations as organization on organization.id = membership.organization_id
    where membership.organization_id = requested_organization_id
      and membership.user_id = requested_actor_user_id
      and membership.status = 'active'
      and organization.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'tenant_actor_mismatch';
  end if;

  insert into private.idempotency_ledger (
    organization_id, idempotency_key, actor_user_id, operation, request_hash,
    result_code, result_payload
  ) values (
    requested_organization_id, requested_idempotency_key, requested_actor_user_id,
    requested_operation, requested_hash, 'accepted', '{"accepted":true}'::jsonb
  )
  on conflict (organization_id, idempotency_key) do nothing;

  get diagnostics inserted_count = row_count;

  select * into strict ledger_row
  from private.idempotency_ledger
  where organization_id = requested_organization_id
    and idempotency_key = requested_idempotency_key
  for update;

  if ledger_row.request_hash <> requested_hash
     or ledger_row.actor_user_id <> requested_actor_user_id
     or ledger_row.operation <> requested_operation then
    raise exception using errcode = 'P0001', message = 'idempotency_payload_conflict';
  end if;

  return jsonb_build_object(
    'status', case when inserted_count = 1 then 'created' else 'replayed' end,
    'result_code', ledger_row.result_code,
    'result', ledger_row.result_payload
  );
end;
$$;

revoke all on function public.process_sync_command(uuid,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.process_sync_command(uuid,text,uuid,text,text) to service_role;

comment on function public.process_sync_command(uuid,text,uuid,text,text) is
  'Fronteira servidor idempotente. Uso exclusivo pela Edge Function autenticada; valida ator/tenant e estabiliza o resultado por chave.';

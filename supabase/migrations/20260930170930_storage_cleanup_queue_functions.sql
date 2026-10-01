-- Consumo da fila de limpeza do Storage. A anonimização enfileira o caminho do avatar; uma função servidor lê o lote,
-- remove os objetos pelo Storage API (SQL não pode apagá-los sem deixar arquivo órfão) e só então conclui os itens (AUD-009).

-- Lê o lote mais antigo sem removê-lo da fila: se a remoção falhar, o item permanece para nova tentativa.
create function public.take_storage_cleanup_batch(p_limit integer default 100)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('bucket', q.bucket, 'path', q.path) order by q.enqueued_at, q.path), '[]'::jsonb)
  from (
    select bucket, path, enqueued_at
      from private.storage_cleanup_queue
     order by enqueued_at, path
     limit least(greatest(coalesce(p_limit, 100), 1), 500)
  ) q;
$$;

-- Conclui somente os caminhos informados; devolve quantos saíram da fila.
create function public.complete_storage_cleanup(p_paths text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare completed integer;
begin
  with removed as (
    delete from private.storage_cleanup_queue where path = any(coalesce(p_paths, '{}')) returning 1
  )
  select count(*) into completed from removed;
  return completed;
end $$;

revoke all on function public.take_storage_cleanup_batch(integer), public.complete_storage_cleanup(text[]) from public, anon, authenticated;
grant execute on function public.take_storage_cleanup_batch(integer), public.complete_storage_cleanup(text[]) to service_role;

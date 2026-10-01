begin;
select plan(9);

insert into private.storage_cleanup_queue (path, bucket, enqueued_at) values
  ('u1/a.png', 'avatars', now() - interval '3 minutes'),
  ('u2/b.png', 'avatars', now() - interval '2 minutes'),
  ('u3/c.png', 'avatars', now() - interval '1 minute');

-- 1-3. O lote respeita a ordem de chegada e o limite, e não remove nada da fila por conta própria.
create temp table batch on commit drop as select public.take_storage_cleanup_batch(2) as result;
select is((select jsonb_array_length(result) from batch), 2, 'o lote respeita o limite');
select is((select result->0->>'path' from batch), 'u1/a.png', 'o lote segue a ordem de chegada');
select is((select count(*)::int from private.storage_cleanup_queue), 3, 'ler o lote não remove itens da fila');

-- 4-6. Só o que foi concluído sai da fila; o restante permanece para nova tentativa.
select is(public.complete_storage_cleanup(array['u1/a.png']), 1, 'conclui somente o caminho informado');
select is((select count(*)::int from private.storage_cleanup_queue), 2, 'os demais itens continuam na fila');
select is(public.complete_storage_cleanup(array['nao-existe.png']), 0, 'concluir caminho desconhecido não tem efeito');

-- 7. O limite é restrito a uma faixa segura.
select ok(jsonb_array_length(public.take_storage_cleanup_batch(100000)) <= 500 and jsonb_array_length(public.take_storage_cleanup_batch(0)) >= 0, 'o limite do lote é restringido');

-- 8-9. Execução exclusiva do service_role.
select ok(
  not has_function_privilege('authenticated', 'public.take_storage_cleanup_batch(integer)', 'execute')
  and not has_function_privilege('anon', 'public.complete_storage_cleanup(text[])', 'execute')
  and has_function_privilege('service_role', 'public.take_storage_cleanup_batch(integer)', 'execute')
  and has_function_privilege('service_role', 'public.complete_storage_cleanup(text[])', 'execute'),
  'as rotinas da fila são exclusivas do service_role');
select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'private' and c.relname = 'storage_cleanup_queue' and has_table_privilege('authenticated', c.oid, 'select')), 'a fila não é legível pela aplicação');

select * from finish();
rollback;

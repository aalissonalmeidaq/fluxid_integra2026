begin;
select plan(7);

-- Spec 013, US2: limites contra pedidos falsos (RF-017; research.md, item 11): 20 pedidos novos por resumo de endereço e por hora, e
-- 6 chamadas por minuto de um mesmo pedido pendente. O excesso de pedidos novos é contado para o Master. Hermético: rollback.

create function pg_temp.call(p_code text, p_key text, p_ip text) returns jsonb language sql as $$
  select public.seal_ingest(p_code, extensions.digest(p_key, 'sha256'), extensions.digest(p_ip, 'sha256'),
    jsonb_build_object('protocol', 1, 'firmware_version', '3.0.0', 'messages', jsonb_build_array(
      jsonb_build_object('message_id', 'b-' || p_code, 'type', 'event', 'read_at', now(), 'problem', null,
        'data', jsonb_build_object('code', 'boot', 'detail', null)))))
$$;

select is((select count(*)::int from generate_series(1, 20) i
  where (pg_temp.call('DSP-RATE' || lpad(i::text, 4, '0'), 'k' || i, 'ip-falso'))->>'status' = '202'), 20,
  '20 pedidos novos do mesmo endereço na hora são aceitos');
select is(pg_temp.call('DSP-RATE0021', 'k21', 'ip-falso')->>'status', '429', 'o 21º pedido novo do mesmo endereço recebe 429');
select ok((pg_temp.call('DSP-RATE0022', 'k22', 'ip-falso')->>'retry_after')::int > 0, 'o 429 traz Retry-After');
select is((select count(*)::int from public.seal_enrollments where device_code in ('DSP-RATE0021', 'DSP-RATE0022')), 0,
  'pedido acima do limite não é criado');
select is(pg_temp.call('DSP-RATE0001', 'k1', 'ip-falso')->>'status', '202', 'pedido já existente não conta no limite de novos');
select is(pg_temp.call('DSP-RATE0023', 'k23', 'ip-outro')->>'status', '202', 'outro endereço tem o próprio limite');

-- Um mesmo pedido pendente: 6 chamadas por minuto (a 1ª chamada acima de DSP-RATE0001 já conta).
select is((select array_agg(pg_temp.call('DSP-RATE0002', 'k2', 'ip-falso')->>'status' order by i) from generate_series(1, 6) i),
  array['202', '202', '202', '202', '202', '429'], 'a 7ª chamada do mesmo pedido no mesmo minuto recebe 429');

select * from finish();
rollback;

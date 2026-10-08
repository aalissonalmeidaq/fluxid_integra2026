begin;
select plan(17);

-- Cache da geocodificação do protótipo, com dois tenants: acerto no próprio tenant, falha no outro, prazo, limpeza e bloqueio
-- ao cliente. Hermético: desfeito pelo rollback.

create temp table loc (v jsonb);
insert into loc values ('{"latitude": -23.550453, "longitude": -46.633911, "display_name": "Praça da Sé", "precision": "address"}');
grant select on loc to public;

select lives_ok($$select public.write_geocode_cache('20000000-0000-0000-0000-00000000000a', repeat('a', 64), (select v from loc))$$, 'o Tenant A grava no cache');
select is(public.read_geocode_cache('20000000-0000-0000-0000-00000000000a', repeat('a', 64)), (select v from loc), 'o Tenant A lê a própria entrada (acerto)');
select is(public.read_geocode_cache('20000000-0000-0000-0000-00000000000b', repeat('a', 64)), null::jsonb, 'o Tenant B não enxerga a entrada do A com a mesma chave (falha)');
select is(public.read_geocode_cache('20000000-0000-0000-0000-00000000000a', repeat('b', 64)), null::jsonb, 'chave desconhecida é falha');

-- A mesma chave no Tenant B é outra linha.
select public.write_geocode_cache('20000000-0000-0000-0000-00000000000b', repeat('a', 64), '{"latitude": 1, "longitude": 2, "display_name": "B", "precision": "street"}');
select is((select count(*)::int from private.geocode_cache where address_key = repeat('a', 64)), 2, 'a mesma chave existe uma vez por tenant');
select is(public.read_geocode_cache('20000000-0000-0000-0000-00000000000a', repeat('a', 64))->>'display_name', 'Praça da Sé', 'o A continua vendo o próprio valor');
select is(public.read_geocode_cache('20000000-0000-0000-0000-00000000000b', repeat('a', 64))->>'display_name', 'B', 'o B vê o próprio valor');

-- Prazo de retenção configurável (1 a 90 dias): 30 por padrão, 7 quando pedido; prazo inválido é recusado.
select public.write_geocode_cache('20000000-0000-0000-0000-00000000000b', repeat('d', 64), (select v from loc), 7);
select ok((select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'
  from private.geocode_cache where organization_id = '20000000-0000-0000-0000-00000000000b' and address_key = repeat('d', 64)), 'o prazo pedido (7 dias) é respeitado');
select throws_ok($$select public.write_geocode_cache('20000000-0000-0000-0000-00000000000b', repeat('e', 64), (select v from loc), 0)$$, '22023', 'invalid_geocode_cache_ttl', 'prazo 0 é recusado');
select throws_ok($$select public.write_geocode_cache('20000000-0000-0000-0000-00000000000b', repeat('e', 64), (select v from loc), 91)$$, '22023', 'invalid_geocode_cache_ttl', 'prazo acima de 90 dias é recusado');
select is(public.read_geocode_cache('20000000-0000-0000-0000-00000000000a', repeat('d', 64)), null::jsonb, 'a entrada do Tenant B com prazo próprio não aparece no A');

-- Prazo de retenção de 30 dias (padrão).
select ok((select expires_at between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour'
  from private.geocode_cache where organization_id = '20000000-0000-0000-0000-00000000000a' and address_key = repeat('a', 64)), 'retenção de 30 dias');
update private.geocode_cache set expires_at = now() - interval '1 second' where organization_id = '20000000-0000-0000-0000-00000000000a';
select is(public.read_geocode_cache('20000000-0000-0000-0000-00000000000a', repeat('a', 64)), null::jsonb, 'entrada vencida nunca é devolvida');
select public.write_geocode_cache('20000000-0000-0000-0000-00000000000a', repeat('c', 64), (select v from loc));
select is((select count(*)::int from private.geocode_cache where organization_id = '20000000-0000-0000-0000-00000000000a'), 1, 'a escrita apaga as entradas vencidas da própria organização');
select is((select count(*)::int from private.geocode_cache where organization_id = '20000000-0000-0000-0000-00000000000b' and address_key = repeat('a', 64)), 1, 'a limpeza não toca o outro tenant');

-- Cliente autenticado (qualquer tenant) não usa o cache nem enxerga a tabela.
set local role authenticated;
select throws_ok($$select public.read_geocode_cache('20000000-0000-0000-0000-00000000000a', repeat('a', 64))$$, '42501', null, 'o cliente autenticado não executa a leitura');
select throws_ok($$select * from private.geocode_cache$$, '42501', null, 'o cliente autenticado não enxerga a tabela');
reset role;

select * from finish();
rollback;

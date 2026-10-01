begin;
select plan(12);

-- 1-4. Janela fixa: permite até o limite e nega a partir do seguinte.
select is(public.take_rate_limit_token('avatar-upload', 'user-a', 3, 3600), true, 'primeiro uso é permitido');
select is(public.take_rate_limit_token('avatar-upload', 'user-a', 3, 3600), true, 'segundo uso é permitido');
select is(public.take_rate_limit_token('avatar-upload', 'user-a', 3, 3600), true, 'terceiro uso (o limite) é permitido');
select is(public.take_rate_limit_token('avatar-upload', 'user-a', 3, 3600), false, 'o uso acima do limite é negado');

-- 5-6. Isolamento por sujeito e por finalidade.
select is(public.take_rate_limit_token('avatar-upload', 'user-b', 3, 3600), true, 'outro sujeito não é afetado');
select is(public.take_rate_limit_token('invitation-send', 'user-a', 3, 3600), true, 'outra finalidade não é afetada');

-- 7. A negação continua enquanto a janela vale, sem estourar contadores.
select is(public.take_rate_limit_token('avatar-upload', 'user-a', 3, 3600), false, 'a negação persiste na mesma janela');

-- 8. Nova janela libera o sujeito.
select public.take_rate_limit_token('janela-curta', 'user-a', 1, 1);
select is(public.take_rate_limit_token('janela-curta', 'user-a', 1, 1), false, 'dentro da janela curta o segundo uso é negado');
select pg_sleep(1.2);
select is(public.take_rate_limit_token('janela-curta', 'user-a', 1, 1), true, 'após a janela o sujeito é liberado');

-- 10-11. Parâmetros inválidos são recusados.
select throws_ok($$ select public.take_rate_limit_token('x', 'y', 0, 60) $$, '22023', 'invalid_rate_limit', 'limite inválido é recusado');
select throws_ok($$ select public.take_rate_limit_token('x', 'y', 5, 0) $$, '22023', 'invalid_rate_limit', 'janela inválida é recusada');

-- 12. Somente o service_role executa.
select ok(
  not has_function_privilege('authenticated', 'public.take_rate_limit_token(text,text,integer,integer)', 'execute')
  and not has_function_privilege('anon', 'public.take_rate_limit_token(text,text,integer,integer)', 'execute')
  and has_function_privilege('service_role', 'public.take_rate_limit_token(text,text,integer,integer)', 'execute'),
  'execução exclusiva do service_role');

select * from finish();
rollback;

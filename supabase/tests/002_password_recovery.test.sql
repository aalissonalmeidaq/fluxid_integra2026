begin;
select plan(7);

select has_table('private', 'password_recovery_requests', 'ledger privado de recuperação existe');
select ok(public.reserve_password_recovery(repeat('a', 64), 60), 'primeira reserva é aceita');
select is(public.reserve_password_recovery(repeat('a', 64), 60), false, 'segunda reserva dentro do intervalo é recusada');
select is((select generation from private.password_recovery_requests where identity_hash = repeat('a', 64)), 1::bigint, 'reserva recusada não avança a geração');

update private.password_recovery_requests set requested_at = now() - interval '61 seconds', expires_at = now() - interval '61 seconds' + interval '1 hour'
 where identity_hash = repeat('a', 64);
select ok(public.reserve_password_recovery(repeat('a', 64), 60), 'reenvio após o intervalo é aceito');
select is((select generation from private.password_recovery_requests where identity_hash = repeat('a', 64)), 2::bigint, 'reenvio revoga a geração anterior');
select function_privs_are('public', 'reserve_password_recovery', array['text', 'integer'], 'service_role', array['EXECUTE'], 'somente service_role reserva recuperação');

select * from finish();
rollback;

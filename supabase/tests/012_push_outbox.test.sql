begin;
select plan(10);

-- Spec 012, US6: fila das notificações push (RF-036a, RF-036d, CA-010). Só alertas que exigem notificação; só para inscrições ativas de
-- quem tem `seal.read` naquela organização; uma por aparelho por alerta; a volta gera a de retorno; perder a permissão revoga a inscrição.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001203a2', 'aal1');

insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by) values
  ('a1700000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-PUSHA001', 'Lacre A', extensions.digest('k-a', 'sha256'), '10000000-0000-0000-0000-000000000002'),
  ('a1700000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 'DSP-PUSHB001', 'Lacre B', extensions.digest('k-b', 'sha256'), '10000000-0000-0000-0000-000000000003');

-- Inscrições: A (admin A, com seal.read), B (admin B, outra organização) e uma revogada.
select is(public.push_subscribe('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001203a2', '20000000-0000-0000-0000-00000000000a',
  gen_random_uuid(), 'https://push.example.invalid/a1', 'p256-a1', 'auth-a1', 'Chrome no Android')->>'code', 'SUBSCRIBED', 'quem tem seal.read se inscreve');
insert into public.push_subscriptions (id, organization_id, user_id, endpoint, p256dh, auth_secret) values
  ('a1710000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', 'https://push.example.invalid/a2', 'p', 'a'),
  ('a1710000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000003', 'https://push.example.invalid/b1', 'p', 'a');
update public.push_subscriptions set revoked_at = now(), revoke_reason = 'user' where id = 'a1710000-0000-0000-0000-0000000000a2';

create function pg_temp.outbox(p_kind text) returns int language sql as $$
  select count(*)::int from public.push_outbox where kind = p_kind
$$;

select private.open_seal_alert('a1700000-0000-0000-0000-0000000000a1', 'no_comm', 'medium', 'system', '{}', false);
select is(pg_temp.outbox('opened'), 0, 'alerta médio sem notificação não entra na fila');

select private.open_seal_alert('a1700000-0000-0000-0000-0000000000a1', 'possible_loss', 'high', 'system', '{}', true);
select is(pg_temp.outbox('opened'), 1, 'possível extravio: uma notificação, só para a inscrição ativa do A');
select is((select s.endpoint from public.push_outbox o join public.push_subscriptions s on s.id = o.subscription_id), 'https://push.example.invalid/a1',
  'a inscrição do B e a revogada não recebem');

select private.open_seal_alert('a1700000-0000-0000-0000-0000000000a1', 'possible_loss', 'high', 'system', '{"again": true}', true);
select is(pg_temp.outbox('opened'), 1, 'o mesmo alerta chegando de novo não repete a notificação');

select private.open_seal_alert('a1700000-0000-0000-0000-0000000000a1', 'seal_broken', 'critical', 'device', '{}', false);
select is(pg_temp.outbox('opened'), 2, 'todo alerta crítico notifica, mesmo sem pedir explicitamente');

select private.seal_recover('a1700000-0000-0000-0000-0000000000a1');
select is(pg_temp.outbox('recovered'), 1, 'a volta do lacre gera uma notificação de retorno do alerta de possível extravio');

-- Perder a permissão: a fila não manda e a inscrição é revogada na hora do envio.
select private.open_seal_alert('a1700000-0000-0000-0000-0000000000a1', 'geofence_violation', 'high', 'system', '{}', true);
-- O papel de sistema só perde permissão na carga do sistema; o teste usa a mesma chave para simular a perda.
select set_config('app.system_bootstrap', 'on', true);
delete from public.role_permissions rp using public.roles r, public.permissions p
 where rp.role_id = r.id and rp.permission_id = p.id and r.organization_id = '20000000-0000-0000-0000-00000000000a' and p.code = 'seal.read';
select set_config('app.system_bootstrap', 'off', true);
create temp table lote as select private.claim_push_outbox_items(10) as r;
select is(jsonb_array_length((select r from lote)), 0, 'sem seal.read no momento do envio, nada é entregue');
select is((select revoke_reason from public.push_subscriptions where endpoint = 'https://push.example.invalid/a1'), 'permission_lost',
  'a inscrição de quem perdeu a permissão é revogada');
select ok(not exists (select 1 from public.push_outbox where status = 'pending'), 'os pendentes dessa inscrição ficam marcados como não enviados');

select * from finish();
rollback;

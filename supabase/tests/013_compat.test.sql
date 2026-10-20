begin;
select plan(6);

-- Spec 013, US2: lacres da Spec 012 cadastrados à mão (research.md, item 12; RF-018; RN-006). A migration de compatibilidade cria um
-- pedido approved para cada linha ativa; aqui o mesmo procedimento roda de novo sobre uma linha criada no teste. Hermético: rollback.

delete from public.user_sessions where user_id = '10000000-0000-0000-0000-000000000001';
select public.start_user_session('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000135001', 'aal2');

insert into public.seal_devices (id, organization_id, device_code, label, key_hash, created_by, created_at) values
  ('a1390000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'DSP-CMP13001', 'Lacre manual', extensions.digest('fxk_manual', 'sha256'),
   '10000000-0000-0000-0000-000000000002', now() - interval '1 day');

select private.seal_enrollment_backfill();

select ok((select e.status = 'approved' and e.key_hash = extensions.digest('fxk_manual', 'sha256') and e.organization_id = '20000000-0000-0000-0000-00000000000a'
  and e.device_id = 'a1390000-0000-0000-0000-0000000000a1' and e.last_organization_id = e.organization_id
  from public.seal_enrollments e where e.device_code = 'DSP-CMP13001'), 'o lacre manual ganha um pedido approved com o último tenant');
select ok((select d.enrollment_id = e.id and d.approved_at = d.created_at from public.seal_devices d join public.seal_enrollments e on e.device_id = d.id
  where d.id = 'a1390000-0000-0000-0000-0000000000a1'), 'a linha aponta para o pedido e a aprovação fica com a data do cadastro');
select is(private.seal_enrollment_backfill(), 0, 'rodar de novo não cria nada');

delete from private.seal_rate_windows;
select is(public.seal_ingest('DSP-CMP13001', extensions.digest('fxk_manual', 'sha256'), extensions.digest('ip', 'sha256'), jsonb_build_object('protocol', 1,
  'messages', jsonb_build_array(jsonb_build_object('message_id', 'cmp-1', 'type', 'event', 'read_at', now(), 'problem', null,
    'data', jsonb_build_object('code', 'boot', 'detail', null)))))->>'status', '200', 'continua recebendo 200 com a chave manual');

select is(public.withdraw_device('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000135001', 'a1391000-0000-0000-0000-000000000001',
  (select id from public.seal_enrollments where device_code = 'DSP-CMP13001'), null, 'Lacre recolhido para regravar',
  (select updated_at from public.seal_enrollments where device_code = 'DSP-CMP13001'))->>'code', 'WITHDRAWN', 'o Master retira o lacre manual');
select is(public.approve_enrollment('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000135001', 'a1391000-0000-0000-0000-000000000002',
  (select id from public.seal_enrollments where device_code = 'DSP-CMP13001'), '20000000-0000-0000-0000-00000000000b', 'Destinação ao B',
  (select updated_at from public.seal_enrollments where device_code = 'DSP-CMP13001'))->>'code', 'NETWORKS_NOT_CLEARED',
  'retirado, não vai para outro tenant sem confirmar o esquecimento das redes');

select * from finish();
rollback;

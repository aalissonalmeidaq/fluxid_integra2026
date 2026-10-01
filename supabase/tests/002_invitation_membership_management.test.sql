begin;
select plan(13);

insert into public.user_sessions(session_id,user_id,status,aal,expires_at) values
('60000000-0000-0000-0000-0000000000e1','10000000-0000-0000-0000-000000000002','active','aal2',now()+interval '1 hour');

select ok(public.tenant_actor_authorized('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-00000000000a'),'administrador autorizado somente por sessão e vínculo vigentes');
select is(public.tenant_actor_authorized('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-00000000000b'),false,'Tenant B negado');

create temporary table reserved as select public.reserve_tenant_invitation(
  '10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-00000000000a',
  'admin-a@example.invalid','50000000-0000-0000-0000-000000000003','Convite aprovado pelo responsável',false) value;
select is((select value->>'kind' from reserved),'reserved','convite reservado');
select ok((select expires_at between now()+interval '71 hours 59 minutes' and now()+interval '72 hours 1 minute' from public.invitations where id=(select (value->>'id')::uuid from reserved)),'validade de 72 horas');
select is((public.reserve_tenant_invitation('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-00000000000a','admin-a@example.invalid','50000000-0000-0000-0000-000000000003','Convite aprovado pelo responsável',false)->>'kind'),'conflict','duplicidade recusada');
select is((public.reserve_tenant_invitation('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-00000000000a','admin-a@example.invalid','50000000-0000-0000-0000-000000000003','Reenvio aprovado pelo responsável',true)->>'kind'),'delivery_pending','reenvio antes de cinco minutos recusado');
select lives_ok(format('select public.mark_invitation_delivery(%L,%L,%L)',(select value->>'id' from reserved),'sent','auth-opaco'),'entrega confirmada sem armazenar link');
select is((public.accept_tenant_invitation('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000e1',(select (value->>'id')::uuid from reserved))->>'kind'),'accepted','destinatário aceita uma vez');
select is((public.accept_tenant_invitation('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000e1',(select (value->>'id')::uuid from reserved))->>'kind'),'conflict','segundo consumo recusado');

select is((public.change_tenant_membership_status('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-00000000000a','inactive',2,'Inativação aprovada pelo responsável')->>'kind'),'last_admin','último administrador preservado');
select is((public.change_tenant_membership_status('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-00000000000b','30000000-0000-0000-0000-00000000000b','inactive',1,'Tentativa fora do tenant atual')->>'kind'),'access_denied','mudança no Tenant B recusada');
select function_privs_are('public','change_tenant_membership_status',array['uuid','uuid','uuid','uuid','text','bigint','text'],'service_role',array['EXECUTE'],'RPC restrita ao servidor');
select ok(exists(select 1 from public.audit_logs where action in ('invitation.reserve','invitation.accept')),'ações sensíveis auditadas');

select * from finish();
rollback;

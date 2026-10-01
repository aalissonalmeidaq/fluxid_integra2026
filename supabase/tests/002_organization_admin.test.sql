begin;
select plan(8);
insert into public.user_sessions(session_id,user_id,status,aal,expires_at) values
('60000000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-000000000001','active','aal2',now()+interval '1 hour'),
('60000000-0000-0000-0000-0000000000f2','10000000-0000-0000-0000-000000000002','active','aal2',now()+interval '1 hour');

select ok((public.global_actor_context('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-0000000000f1')->>'can_manage_platform')::boolean,'Master autorizado');
select is((public.global_actor_context('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000f2')->>'can_manage_platform')::boolean,false,'ator de tenant bloqueado');
create temporary table created as select public.create_managed_organization('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-0000000000f1','Empresa Nova Ltda.','Empresa Nova','active','Contrato aprovado') value;
select is((select value->>'status' from created),'inactive','tenant nasce inactive até haver administrador ativo (RF-009)');
select ok(exists(select 1 from public.roles where organization_id=(select (value->>'id')::uuid from created) and code='tenant_admin'),'papel administrativo criado no tenant');
select lives_ok(format('select public.invite_first_tenant_admin(%L,%L,%L,%L,%L)','10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-0000000000f1',(select value->>'id' from created),'responsavel@example.invalid','Responsável contratual'),'primeiro administrador convidado');
select is((select count(*) from public.invitations where organization_id=(select (value->>'id')::uuid from created)),1::bigint,'convite isolado no tenant criado');
select throws_ok($$select public.create_managed_organization('10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-0000000000f2','Ataque Ltda.','Ataque','active','Tentativa negada')$$,'42501','access_denied','administrador de tenant não cria organização');
select function_privs_are('public','create_managed_organization',array['uuid','uuid','text','text','text','text'],'service_role',array['EXECUTE'],'RPC restrita ao service_role');
select * from finish(); rollback;

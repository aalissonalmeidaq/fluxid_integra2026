begin;
select plan(66);

-- Spec 007, US5: motoristas, documentos protegidos e vínculo com usuário (RF-024 a RF-032, RF-038, CA-004, CA-005). Hermético.
-- Todos os documentos, nomes e telefones são fictícios.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';

-- Usuários: U1 e U2 com o papel driver no Tenant A (ativos), U3 com o papel driver no Tenant B, U4 sem papel driver no A,
-- U5 com papel driver mas membro bloqueado, e o auditor do A.
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000007e1', 'authenticated', 'authenticated', 'drv-1@example.invalid'),
  ('10000000-0000-0000-0000-0000000007e2', 'authenticated', 'authenticated', 'drv-2@example.invalid'),
  ('10000000-0000-0000-0000-0000000007e3', 'authenticated', 'authenticated', 'drv-3@example.invalid'),
  ('10000000-0000-0000-0000-0000000007e4', 'authenticated', 'authenticated', 'drv-4@example.invalid'),
  ('10000000-0000-0000-0000-0000000007e5', 'authenticated', 'authenticated', 'drv-5@example.invalid'),
  ('10000000-0000-0000-0000-0000000007d1', 'authenticated', 'authenticated', 'drv-auditor@example.invalid');
insert into public.profiles (user_id, display_name) values
  ('10000000-0000-0000-0000-0000000007e1', 'Condutor Um'), ('10000000-0000-0000-0000-0000000007e2', 'Condutor Dois'), ('10000000-0000-0000-0000-0000000007e3', 'Condutor Três'),
  ('10000000-0000-0000-0000-0000000007e4', 'Sem Papel'), ('10000000-0000-0000-0000-0000000007e5', 'Bloqueado'), ('10000000-0000-0000-0000-0000000007d1', 'Auditor');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000007e1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007e1', 'active', now()),
  ('30000000-0000-0000-0000-0000000007e2', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007e2', 'active', now()),
  ('30000000-0000-0000-0000-0000000007e3', '20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-0000000007e3', 'active', now()),
  ('30000000-0000-0000-0000-0000000007e4', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007e4', 'active', now()),
  ('30000000-0000-0000-0000-0000000007e5', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007e5', 'active', now()),
  ('30000000-0000-0000-0000-0000000007d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007d1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select m.id, r.id, '10000000-0000-0000-0000-000000000001'
    from (values ('30000000-0000-0000-0000-0000000007e1'::uuid, 'driver', '20000000-0000-0000-0000-00000000000a'::uuid), ('30000000-0000-0000-0000-0000000007e2', 'driver', '20000000-0000-0000-0000-00000000000a'),
                 ('30000000-0000-0000-0000-0000000007e3', 'driver', '20000000-0000-0000-0000-00000000000b'), ('30000000-0000-0000-0000-0000000007e4', 'stock_operator', '20000000-0000-0000-0000-00000000000a'),
                 ('30000000-0000-0000-0000-0000000007e5', 'driver', '20000000-0000-0000-0000-00000000000a'), ('30000000-0000-0000-0000-0000000007d1', 'tenant_auditor', '20000000-0000-0000-0000-00000000000a')) m(id, code, org)
    join public.roles r on r.code = m.code and r.organization_id = m.org;
update public.memberships set status = 'blocked', blocked_at = now() where id = '30000000-0000-0000-0000-0000000007e5';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', 'aal1');

create temp table r (k text primary key, v jsonb);
grant all on r to public;

create function pg_temp.create_a(p_name text, p_cpf text, p_cnh text, p_category text default 'B', p_valid date default null, p_phone text default '11987654321') returns jsonb language sql as $$
  select public.create_driver('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    p_name, p_cpf, p_cnh, p_category, coalesce(p_valid, (now() at time zone 'America/Sao_Paulo')::date + 365), p_phone)
$$;
create function pg_temp.update_a(p_driver uuid, p_version bigint, p_name text, p_cpf text default null, p_cnh text default null, p_justification text default null, p_phone text default '11987654321',
  p_valid date default null) returns jsonb language sql as $$
  select public.update_driver('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    p_driver, p_version, p_name, 'B', coalesce(p_valid, (now() at time zone 'America/Sao_Paulo')::date + 365), p_phone, p_cpf, p_cnh, p_justification)
$$;
create function pg_temp.link_a(p_driver uuid, p_user uuid) returns jsonb language sql as $$
  select public.link_driver_user('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', p_driver, p_user)
$$;
create function pg_temp.list_a(p_search text default null, p_status text default null, p_cnh text default null, p_linked boolean default null) returns jsonb language sql as $$
  select public.list_drivers('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', p_search, p_status, p_cnh, p_linked, null, null, null)
$$;

-- ---------- criação e proteção dos documentos
insert into r values
  ('d1', pg_temp.create_a('Carlos Motorista', '529.982.247-25', '12345678900')),
  ('dupcpf', pg_temp.create_a('Outro Nome', '52998224725', '98765432109')),
  ('dupcnh', pg_temp.create_a('Outro Nome', '11144477735', '123.456.789-00')),
  ('badcpf', pg_temp.create_a('Nome Ok', '11111111111', '98765432109')),
  ('badcnh', pg_temp.create_a('Nome Ok', '11144477735', '12345678901'));
select is((select v->>'code' from r where k = 'd1'), 'CREATED', 'motorista é criado com CPF e CNH válidos');
select is((select cpf_display from public.drivers where id = (select (v->>'driver_id')::uuid from r where k = 'd1')), '***.***.***-25', 'o CPF aparece mascarado');
select is((select cnh_display from public.drivers where id = (select (v->>'driver_id')::uuid from r where k = 'd1')), '********900', 'a CNH aparece mascarada (3 últimos dígitos)');
select is((select cpf || '/' || cnh_number from public.driver_documents where driver_id = (select (v->>'driver_id')::uuid from r where k = 'd1')), '52998224725/12345678900', 'os valores completos ficam só na tabela de documentos');
select is((select v->>'code' from r where k = 'dupcpf'), 'DOCUMENT_CONFLICT', 'CPF repetido na organização é recusado');
select is((select v->>'field' from r where k = 'dupcpf'), 'cpf', 'o conflito aponta o campo');
select is((select v->>'owner_name' from r where k = 'dupcpf'), 'Carlos Motorista', 'o conflito indica o nome do dono');
select ok((select v::text !~ '(52998224725|12345678900)' from r where k = 'dupcpf'), 'o conflito nunca mostra o documento');
select is((select v->>'field' from r where k = 'dupcnh'), 'cnh_number', 'CNH repetida na organização é recusada');
select is((select v->>'code' from r where k = 'badcpf'), 'VALIDATION_FAILED', 'CPF inválido é recusado');
select is((select v->>'code' from r where k = 'badcnh'), 'VALIDATION_FAILED', 'CNH inválida é recusada');
select is((select v->>'code' from (select pg_temp.create_a('Nome Ok', '11144477735', '98765432109', 'Z') v) s), 'VALIDATION_FAILED', 'categoria fora da lista é recusada');
select is((select v->>'code' from (select public.create_driver('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b',
  'Motorista do B', '52998224725', '12345678900', 'B', current_date + 100, null) v) s), 'CREATED', 'os mesmos CPF e CNH em outra organização são aceitos');

-- ---------- evento e auditoria sem documento nem nome
select is((select event_type from public.registry_events where entity_type = 'driver' and entity_id = (select (v->>'driver_id')::uuid from r where k = 'd1') and sequence = 1), 'driver_created', 'evento driver_created');
select ok(exists (select 1 from public.audit_logs where action = 'driver.create' and target_id = (select v->>'driver_id' from r where k = 'd1')), 'auditoria driver.create gravada');
select ok(not exists (select 1 from public.registry_events where entity_type = 'driver' and data::text ~ '(52998224725|12345678900|Carlos|11987654321)'), 'nenhum CPF, CNH, nome ou telefone nos eventos');
select ok(not exists (select 1 from public.audit_logs where action like 'driver.%' and metadata::text ~ '(52998224725|12345678900|Carlos|11987654321)'), 'nenhum CPF, CNH, nome ou telefone na auditoria');


-- ---------- situação da CNH calculada (31, 30, 0 e -1 dia)
create function pg_temp.cnh_status_of(p_driver uuid) returns text language sql as $$
  select i->>'cnh_status' from jsonb_array_elements(pg_temp.list_a(null, 'all')->'items') i where i->>'id' = p_driver::text
$$;
update public.drivers set cnh_valid_until = (now() at time zone 'America/Sao_Paulo')::date + 31 where id = (select (v->>'driver_id')::uuid from r where k = 'd1');
select is(pg_temp.cnh_status_of((select (v->>'driver_id')::uuid from r where k = 'd1')), 'em_dia', 'CNH com 31 dias: em dia');
update public.drivers set cnh_valid_until = (now() at time zone 'America/Sao_Paulo')::date + 30 where id = (select (v->>'driver_id')::uuid from r where k = 'd1');
select is(pg_temp.cnh_status_of((select (v->>'driver_id')::uuid from r where k = 'd1')), 'a_vencer', 'CNH com 30 dias: a vencer');
update public.drivers set cnh_valid_until = (now() at time zone 'America/Sao_Paulo')::date where id = (select (v->>'driver_id')::uuid from r where k = 'd1');
select is(pg_temp.cnh_status_of((select (v->>'driver_id')::uuid from r where k = 'd1')), 'a_vencer', 'CNH que vence hoje: ainda a vencer');
update public.drivers set cnh_valid_until = (now() at time zone 'America/Sao_Paulo')::date - 1 where id = (select (v->>'driver_id')::uuid from r where k = 'd1');
select is(pg_temp.cnh_status_of((select (v->>'driver_id')::uuid from r where k = 'd1')), 'vencido', 'CNH vencida ontem: vencida');
update public.drivers set cnh_valid_until = (now() at time zone 'America/Sao_Paulo')::date + 365 where id = (select (v->>'driver_id')::uuid from r where k = 'd1');

-- ---------- edição
insert into r values ('upd', pg_temp.update_a((select (v->>'driver_id')::uuid from r where k = 'd1'), 1, 'Carlos Motorista Silva', null, null, null, '11911112222'));
select is((select v->>'code' from r where k = 'upd'), 'UPDATED', 'o motorista é editado sem tocar nos documentos');
select is((select (v->>'version')::int from r where k = 'upd'), 2, 'a versão sobe');
select is((select v->>'code' from (select pg_temp.update_a((select (v->>'driver_id')::uuid from r where k = 'd1'), 1, 'Antigo') v) s), 'VERSION_CONFLICT', 'gravação sobre versão antiga é recusada');
select ok((select e.data::text like '%changed_sensitive%' and e.data::text not like '%Carlos%' and e.data::text not like '%1191111%' from public.registry_events e
            where e.event_type = 'driver_updated' and e.entity_id = (select (v->>'driver_id')::uuid from r where k = 'd1')), 'a edição de nome e telefone gera evento só com os nomes dos campos');
select is((select v->>'code' from (select pg_temp.update_a((select (v->>'driver_id')::uuid from r where k = 'd1'), 2, 'Carlos Motorista Silva', '11144477735') v) s), 'JUSTIFICATION_REQUIRED', 'trocar o CPF exige justificativa');
select is((select v->>'code' from (select pg_temp.update_a((select (v->>'driver_id')::uuid from r where k = 'd1'), 2, 'Carlos Motorista Silva', '11111111111', null, 'Correção de digitação') v) s), 'VALIDATION_FAILED', 'CPF novo inválido é recusado');
insert into r values ('fixcpf', pg_temp.update_a((select (v->>'driver_id')::uuid from r where k = 'd1'), 2, 'Carlos Motorista Silva', '111.444.777-35', null, 'Correção de digitação'));
select is((select v->>'code' from r where k = 'fixcpf'), 'UPDATED', 'CPF novo com justificativa é aceito');
select is((select cpf_display from public.drivers where id = (select (v->>'driver_id')::uuid from r where k = 'd1')), '***.***.***-35', 'a máscara acompanha o CPF novo');
select is((select e.data->>'kind' from public.registry_events e where e.event_type = 'document_changed' and e.entity_id = (select (v->>'driver_id')::uuid from r where k = 'd1')), 'cpf', 'o evento diz que o CPF mudou');
select ok(not exists (select 1 from public.registry_events where data::text ~ '(11144477735|52998224725)'), 'o evento não guarda o valor antigo nem o novo');
insert into r values ('d2', pg_temp.create_a('Maria Condutora', '529.982.247-25', '98765432109'));
select is((select v->>'code' from r where k = 'd2'), 'CREATED', 'o CPF antigo foi liberado e pode ser usado por outro motorista');
select is((select v->>'code' from (select pg_temp.update_a((select (v->>'driver_id')::uuid from r where k = 'd2'), 1, 'Maria Condutora', '111.444.777-35', null, 'Correção de digitação') v) s), 'DOCUMENT_CONFLICT', 'trocar para um CPF já usado por outro motorista é recusado');

-- ---------- vínculo com usuário
select is((select v->>'code' from (select pg_temp.link_a((select (v->>'driver_id')::uuid from r where k = 'd1'), '10000000-0000-0000-0000-0000000007e1') v) s), 'LINKED', 'vincula um usuário com o papel driver');
select is((select v->>'code' from (select pg_temp.link_a((select (v->>'driver_id')::uuid from r where k = 'd2'), '10000000-0000-0000-0000-0000000007e1') v) s), 'USER_NOT_ELIGIBLE', 'o usuário já vinculado a outro motorista não é elegível');
select is((select v->>'code' from (select pg_temp.link_a((select (v->>'driver_id')::uuid from r where k = 'd1'), '10000000-0000-0000-0000-0000000007e2') v) s), 'USER_NOT_ELIGIBLE', 'o motorista que já tem usuário não recebe outro');
select is((select v->>'code' from (select pg_temp.link_a((select (v->>'driver_id')::uuid from r where k = 'd2'), '10000000-0000-0000-0000-0000000007e3') v) s), 'USER_NOT_ELIGIBLE', 'usuário de outra organização não é elegível');
select is((select v from (select pg_temp.link_a((select (v->>'driver_id')::uuid from r where k = 'd2'), '10000000-0000-0000-0000-0000000007e3') v) s), '{"code": "USER_NOT_ELIGIBLE"}'::jsonb, 'a resposta não revela se o usuário existe em outra organização');
select is((select v->>'code' from (select pg_temp.link_a((select (v->>'driver_id')::uuid from r where k = 'd2'), '10000000-0000-0000-0000-0000000007e4') v) s), 'USER_NOT_ELIGIBLE', 'usuário sem o papel driver não é elegível');
select is((select v->>'code' from (select pg_temp.link_a((select (v->>'driver_id')::uuid from r where k = 'd2'), '10000000-0000-0000-0000-0000000007e5') v) s), 'USER_NOT_ELIGIBLE', 'usuário com vínculo bloqueado não é elegível');
select is((select v->>'code' from (select pg_temp.link_a((select (v->>'driver_id')::uuid from r where k = 'd2'), '10000000-0000-0000-0000-0000000007ff') v) s), 'USER_NOT_ELIGIBLE', 'usuário inexistente não é elegível');
select is((select jsonb_array_length(public.list_linkable_users('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', null, null)->'users')), 1,
  'só o usuário elegível (U2) aparece como vinculável');
select ok((select public.list_linkable_users('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', null, null)::text !~ 'example.invalid'), 'a lista de vinculáveis não traz e-mail');
select is((select public.list_linkable_users('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', '20000000-0000-0000-0000-00000000000a', null, null)->>'code'), 'ACCESS_DENIED', 'o auditor não lista usuários vinculáveis');
select is((select get_d->'linked_user'->>'display_name' from (select public.get_driver('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'driver_id')::uuid from r where k = 'd1')) get_d) s),
  'Condutor Um', 'o detalhe mostra o usuário vinculado pelo nome');
update public.memberships set status = 'inactive', inactivated_at = now() where id = '30000000-0000-0000-0000-0000000007e1';
select is((select (get_d->'linked_user'->>'active')::boolean from (select public.get_driver('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'driver_id')::uuid from r where k = 'd1')) get_d) s),
  false, 'usuário desativado depois aparece como inativo, sem apagar o vínculo');
select is((select v->>'code' from (select public.unlink_driver_user('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'driver_id')::uuid from r where k = 'd1'), null) v) s),
  'JUSTIFICATION_REQUIRED', 'desvincular exige justificativa');
update public.drivers set status = 'inactive', inactivated_at = now(), inactivated_by = '10000000-0000-0000-0000-000000000002' where id = (select (v->>'driver_id')::uuid from r where k = 'd1');
select is((select v->>'code' from (select pg_temp.link_a((select (v->>'driver_id')::uuid from r where k = 'd1'), '10000000-0000-0000-0000-0000000007e2') v) s), 'INACTIVE_RECORD', 'não se vincula usuário a motorista inativo');
select is((select v->>'code' from (select public.unlink_driver_user('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'driver_id')::uuid from r where k = 'd1'), 'Usuário saiu da empresa') v) s),
  'UNLINKED', 'desvincular funciona com o motorista inativo');
select is((select linked_user_id from public.drivers where id = (select (v->>'driver_id')::uuid from r where k = 'd1')), null, 'o vínculo foi removido');
select is((select v->>'code' from (select pg_temp.update_a((select (v->>'driver_id')::uuid from r where k = 'd1'), 3, 'Carlos Motorista Silva') v) s), 'INACTIVE_RECORD', 'motorista inativo não é editado');

-- ---------- lista, busca e filtros
select is((select (pg_temp.list_a()->>'total')::int), 1, 'o padrão lista só os ativos');
select is((select (pg_temp.list_a(null, 'all')->>'total')::int), 2, 'todos');
select is((select pg_temp.list_a('maria')->'items'->0->>'full_name'), 'Maria Condutora', 'busca por trecho do nome');
select is((select pg_temp.list_a('529.982.247-25')->'items'->0->>'full_name'), 'Maria Condutora', 'busca pelo CPF completo digitado');
select is((select (pg_temp.list_a('5299822')->>'total')::int), 0, 'trecho do CPF não encontra');
select is((select (pg_temp.list_a(null, 'all', 'em_dia')->>'total')::int), 2, 'filtro por situação da CNH');
select is((select (pg_temp.list_a(null, 'all', null, true)->>'total')::int), 0, 'filtro por vinculado');
select ok((select pg_temp.list_a(null, 'all')::text !~ '(52998224725|98765432109|12345678900|111444777)'), 'a lista não traz CPF nem CNH completos');
select is((select pg_temp.list_a(null, 'all')->'items'->0->>'cpf_display'), '***.***.***-35', 'a lista traz o CPF mascarado');

-- ---------- isolamento e permissões
select is((select public.get_driver('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b', (select (v->>'driver_id')::uuid from r where k = 'd2'))->>'code'), 'NOT_FOUND', 'o Tenant B não vê o motorista do A');
select is((select (public.list_drivers('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b', null, 'all', null, null, null, null, null)->>'total')::int), 1, 'o Tenant B lista só o motorista dele');
select is((select public.list_drivers('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', '20000000-0000-0000-0000-00000000000a', null, null, null, null, null, null, null)->>'code'), 'LISTED', 'o auditor lê motoristas');
select is((select v->>'code' from (select public.create_driver('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', '20000000-0000-0000-0000-00000000000a',
  'Nome Auditor', '11144477735', '24681357982', 'B', current_date + 10, null) v) s), 'ACCESS_DENIED', 'o auditor não cadastra motorista');
select ok(exists (select 1 from public.audit_logs where action = 'driver.user_link'), 'auditoria driver.user_link gravada');
select ok(exists (select 1 from public.audit_logs where action = 'driver.user_unlink'), 'auditoria driver.user_unlink gravada');

select * from finish();
rollback;

begin;
select plan(69);

-- Spec 007, US8: anonymize_driver, anonymize_customer e anonymize_contact (RF-054 a RF-061, CA-016, CA-017). Hermético.
-- Todos os nomes, documentos, telefones e e-mails são fictícios.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000007d1', 'authenticated', 'authenticated', 'an-auditor@example.invalid'),
  ('10000000-0000-0000-0000-0000000007d2', 'authenticated', 'authenticated', 'an-estoque@example.invalid'),
  ('10000000-0000-0000-0000-0000000007d3', 'authenticated', 'authenticated', 'an-tecnico@example.invalid'),
  ('10000000-0000-0000-0000-0000000007d4', 'authenticated', 'authenticated', 'an-motorista@example.invalid'),
  ('10000000-0000-0000-0000-0000000007e1', 'authenticated', 'authenticated', 'an-condutor@example.invalid');
insert into public.profiles (user_id, display_name) values
  ('10000000-0000-0000-0000-0000000007d1', 'Auditor'), ('10000000-0000-0000-0000-0000000007d2', 'Estoquista'), ('10000000-0000-0000-0000-0000000007d3', 'Técnico'),
  ('10000000-0000-0000-0000-0000000007d4', 'Motorista Papel'), ('10000000-0000-0000-0000-0000000007e1', 'Condutor');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000007d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007d1', 'active', now()),
  ('30000000-0000-0000-0000-0000000007d2', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007d2', 'active', now()),
  ('30000000-0000-0000-0000-0000000007d3', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007d3', 'active', now()),
  ('30000000-0000-0000-0000-0000000007d4', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007d4', 'active', now()),
  ('30000000-0000-0000-0000-0000000007e1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007e1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select m.id, r.id, '10000000-0000-0000-0000-000000000001'
    from (values ('30000000-0000-0000-0000-0000000007d1'::uuid, 'tenant_auditor'), ('30000000-0000-0000-0000-0000000007d2', 'stock_operator'),
                 ('30000000-0000-0000-0000-0000000007d3', 'technical_operator'), ('30000000-0000-0000-0000-0000000007d4', 'driver'), ('30000000-0000-0000-0000-0000000007e1', 'driver')) m(id, code)
    join public.roles r on r.code = m.code and r.organization_id = '20000000-0000-0000-0000-00000000000a';
-- Administrador A com duas sessões: aal1 (a2) e aal2 (a3); administrador B com aal2.
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a3', 'aal2');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', 'aal2');
select public.start_user_session('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', 'aal2');
select public.start_user_session('10000000-0000-0000-0000-0000000007d2', '60000000-0000-0000-0000-0000000700d2', 'aal2');
select public.start_user_session('10000000-0000-0000-0000-0000000007d3', '60000000-0000-0000-0000-0000000700d3', 'aal2');
select public.start_user_session('10000000-0000-0000-0000-0000000007d4', '60000000-0000-0000-0000-0000000700d4', 'aal2');

create temp table r (k text primary key, v jsonb);
grant all on r to public;
create function pg_temp.adm() returns uuid language sql as $$ select '10000000-0000-0000-0000-000000000002'::uuid $$;
create function pg_temp.org() returns uuid language sql as $$ select '20000000-0000-0000-0000-00000000000a'::uuid $$;

-- Massa: motorista (vinculado ao usuário e1), cliente pessoa física com 2 contatos e 1 unidade com geocerca, cliente jurídico com 1 contato.
insert into r values
  ('drv', public.create_driver(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), 'Carlos Sigiloso', '529.982.247-25', '12345678900', 'B', current_date + 100, '11987654321')),
  ('pf', public.create_customer(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), 'individual', '111.444.777-35', 'Ana Sigilosa', 'Ana Fantasia', 'other', 'Consultório',
     'Anotação privada', '[{"name":"Ana Sigilosa","role":"Titular","phone":"11911112222","email":"ana.sigilosa@exemplo.invalid","is_primary":true},{"name":"Bruno Parente","phone":"1133334444"}]'::jsonb)),
  ('pj', public.create_customer(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), 'legal', '11.222.333/0001-81', 'Hospital Alfa Ltda', null, 'hospital', null, null,
     '[{"name":"Maria Contato","role":"Compras","phone":"11955556666","email":"maria.contato@exemplo.invalid","is_primary":true}]'::jsonb));
select public.link_driver_user(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), (select (v->>'driver_id')::uuid from r where k = 'drv'), '10000000-0000-0000-0000-0000000007e1');
insert into r values ('site', public.create_site(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), (select (v->>'customer_id')::uuid from r where k = 'pf'),
  'Casa da Ana', '01001000', 'Praça da Sé', '123', 'Apto 4', 'Sé', 'São Paulo', 'SP', '3550308', -23.55052, -46.633308, 'Ana Sigilosa', '11911112222', array[1,2]::smallint[], '08:00', '17:00', 'Portão azul'));
select public.create_geofence(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), (select (v->>'site_id')::uuid from r where k = 'site'), 'Entrada', 'circle', '{"lat":-23.55,"lng":-46.63}'::jsonb, 100, null);
-- Ações anteriores (edição) para provar que os valores antigos também não ficam em evento nem auditoria.
select public.update_driver(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), (select (v->>'driver_id')::uuid from r where k = 'drv'), 1, 'Carlos Sigiloso Silva', 'B', current_date + 100, '11999998888', null, null, null);

create function pg_temp.an_driver(p_user uuid, p_session uuid, p_driver uuid, p_version bigint, p_reason text default 'data_subject_request', p_just text default 'Pedido do titular', p_confirmed boolean default true) returns jsonb language sql as $$
  select public.anonymize_driver(p_user, p_session, pg_temp.org(), p_driver, p_version, p_reason, p_just, p_confirmed)
$$;
create function pg_temp.an_customer(p_user uuid, p_session uuid, p_customer uuid, p_version bigint, p_reason text default 'data_subject_request', p_just text default 'Pedido do titular', p_confirmed boolean default true) returns jsonb language sql as $$
  select public.anonymize_customer(p_user, p_session, pg_temp.org(), p_customer, p_version, p_reason, p_just, p_confirmed)
$$;
create function pg_temp.an_contact(p_user uuid, p_session uuid, p_contact uuid, p_reason text default 'retention_expired', p_just text default 'Prazo vencido', p_confirmed boolean default true) returns jsonb language sql as $$
  select public.anonymize_contact(p_user, p_session, pg_temp.org(), p_contact, p_reason, p_just, p_confirmed)
$$;
create function pg_temp.counts() returns text language sql as $$
  select (select count(*) from public.drivers) || '/' || (select count(*) from public.driver_documents) || '/' || (select count(*) from public.customers) || '/' ||
         (select count(*) from public.customer_documents) || '/' || (select count(*) from public.customer_contacts) || '/' || (select count(*) from public.customer_sites) || '/' || (select count(*) from public.geofences)
$$;
insert into r values ('before', to_jsonb(pg_temp.counts()));

-- ---------- recusas: permissão, MFA, confirmação, motivo, justificativa, registro ativo, versão
select is(pg_temp.an_driver('10000000-0000-0000-0000-0000000007d2', '60000000-0000-0000-0000-0000000700d2', (select (v->>'driver_id')::uuid from r where k = 'drv'), 2)->>'code', 'ACCESS_DENIED', 'o estoquista não anonimiza');
select is(pg_temp.an_driver('10000000-0000-0000-0000-0000000007d3', '60000000-0000-0000-0000-0000000700d3', (select (v->>'driver_id')::uuid from r where k = 'drv'), 2)->>'code', 'ACCESS_DENIED', 'o técnico não anonimiza');
select is(pg_temp.an_driver('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', (select (v->>'driver_id')::uuid from r where k = 'drv'), 2)->>'code', 'ACCESS_DENIED', 'o auditor não anonimiza');
select is(pg_temp.an_driver('10000000-0000-0000-0000-0000000007d4', '60000000-0000-0000-0000-0000000700d4', (select (v->>'driver_id')::uuid from r where k = 'drv'), 2)->>'code', 'ACCESS_DENIED', 'o papel driver não anonimiza');
select is(pg_temp.an_customer('10000000-0000-0000-0000-0000000007d2', '60000000-0000-0000-0000-0000000700d2', (select (v->>'customer_id')::uuid from r where k = 'pf'), 1)->>'code', 'ACCESS_DENIED', 'o estoquista não anonimiza cliente');
select is(pg_temp.an_contact('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', (select id from public.customer_contacts where name = 'Maria Contato'))->>'code', 'ACCESS_DENIED', 'o auditor não anonimiza contato');
select is(pg_temp.an_driver(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a2', (select (v->>'driver_id')::uuid from r where k = 'drv'), 2)->>'code', 'MFA_REQUIRED', 'sem segundo fator (aal1) a anonimização é recusada');
select is(pg_temp.an_driver(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', (select (v->>'driver_id')::uuid from r where k = 'drv'), 2, 'data_subject_request', 'Pedido do titular', false)->>'code', 'CONFIRMATION_REQUIRED', 'sem confirmação é recusada');
select is(pg_temp.an_driver(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', (select (v->>'driver_id')::uuid from r where k = 'drv'), 2, 'curiosidade')->>'code', 'VALIDATION_FAILED', 'motivo fora da lista é recusado');
select is(pg_temp.an_driver(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', (select (v->>'driver_id')::uuid from r where k = 'drv'), 2, 'other', 'abc')->>'code', 'JUSTIFICATION_REQUIRED', 'justificativa com menos de 5 caracteres é recusada');
select is(pg_temp.an_driver(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', (select (v->>'driver_id')::uuid from r where k = 'drv'), 2)->>'code', 'ACTIVE_RECORD', 'motorista ativo não é anonimizado');
select is(pg_temp.an_customer(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', (select (v->>'customer_id')::uuid from r where k = 'pf'), 1)->>'code', 'ACTIVE_RECORD', 'cliente pessoa física ativo não é anonimizado');
select is(pg_temp.an_customer(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', (select (v->>'customer_id')::uuid from r where k = 'pj'), 1)->>'code', 'VALIDATION_FAILED', 'cliente pessoa jurídica não é anonimizado (só os contatos)');
select is(pg_temp.counts(), (select v #>> '{}' from r where k = 'before'), 'as recusas não mudam nada');

-- Inativar os dois (pré-condição) e testar a versão.
select public.inactivate_driver(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), (select (v->>'driver_id')::uuid from r where k = 'drv'), 'Desligado');
select public.inactivate_customer(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), (select (v->>'customer_id')::uuid from r where k = 'pf'), 'Cliente encerrou', '{"sites":1,"geofences":1}'::jsonb);
select is(pg_temp.an_driver(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', (select (v->>'driver_id')::uuid from r where k = 'drv'), 1)->>'code', 'VERSION_CONFLICT', 'versão antiga é recusada');
select is(pg_temp.an_customer(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', (select (v->>'customer_id')::uuid from r where k = 'pf'), 1)->>'code', 'VERSION_CONFLICT', 'versão antiga do cliente é recusada');
select is(public.anonymize_driver('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b', (select (v->>'driver_id')::uuid from r where k = 'drv'), 3,
  'other', 'Tentativa de outro tenant', true)->>'code', 'NOT_FOUND', 'o Tenant B recebe NOT_FOUND, igual ao inexistente');

-- ---------- atomicidade: falha injetada no meio desfaz tudo
create function pg_temp.boom() returns trigger language plpgsql as $$
begin
  if new.name = 'Contato anonimizado' and old.name = 'Bruno Parente' then raise exception 'falha injetada'; end if;
  return new;
end $$;
create trigger boom before update on public.customer_contacts for each row execute function pg_temp.boom();
do $$
begin
  begin
    perform public.anonymize_customer('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a3', '20000000-0000-0000-0000-00000000000a',
      (select (v->>'customer_id')::uuid from r where k = 'pf'), 2, 'other', 'Teste de atomicidade', true);
  exception when others then
    null;
  end;
end $$;
drop trigger boom on public.customer_contacts;
select is((select legal_name from public.customers where id = (select (v->>'customer_id')::uuid from r where k = 'pf')), 'Ana Sigilosa', 'falha no meio: o cliente não foi alterado');
select is((select count(*)::int from public.customer_contacts where name = 'Ana Sigilosa'), 1, 'falha no meio: os contatos já processados voltaram');
select is((select count(*)::int from public.registry_events where event_type in ('person_anonymized', 'contact_anonymized')), 0, 'falha no meio: nenhum evento de anonimização ficou');

-- ---------- anonimização do motorista
insert into r values ('adrv', pg_temp.an_driver(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', (select (v->>'driver_id')::uuid from r where k = 'drv'), 3));
select is((select v->>'code' from r where k = 'adrv'), 'ANONYMIZED', 'o motorista inativo é anonimizado');
select is((select full_name || '|' || coalesce(phone, 'nulo') || '|' || coalesce(linked_user_id::text, 'nulo') || '|' || cpf_display || '|' || cnh_display from public.drivers where id = (select (v->>'driver_id')::uuid from r where k = 'drv')),
  'Motorista anonimizado|nulo|nulo|anonimizado|anonimizado', 'nome trocado pelo texto fixo; telefone, vínculo, CPF e CNH exibidos removidos');
select is((select coalesce(cpf, 'nulo') || '|' || coalesce(cnh_number, 'nulo') from public.driver_documents where driver_id = (select (v->>'driver_id')::uuid from r where k = 'drv')), 'nulo|nulo', 'CPF e CNH completos viraram nulos');
select is((select cnh_category || '|' || status from public.drivers where id = (select (v->>'driver_id')::uuid from r where k = 'drv')), 'B|inactive', 'categoria da CNH e situação permanecem');
select ok((select anonymized_at is not null and anonymized_by = pg_temp.adm() from public.drivers where id = (select (v->>'driver_id')::uuid from r where k = 'drv')), 'quem e quando foram registrados');
select is(pg_temp.an_driver(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', (select (v->>'driver_id')::uuid from r where k = 'drv'), 4)->>'code', 'ALREADY_ANONYMIZED', 'repetição: já anonimizado');
select is((select count(*)::int from public.registry_events where entity_id = (select (v->>'driver_id')::uuid from r where k = 'drv') and event_type = 'driver_user_unlinked'), 1, 'o desvínculo automático gera evento');
select is((select e.data->'fields' ? 'cpf' and e.data->>'reason' = 'data_subject_request' from public.registry_events e where e.event_type = 'person_anonymized' and e.entity_type = 'driver'), true, 'o evento traz a lista de campos e o motivo');
select is((select justification from public.registry_events where event_type = 'person_anonymized' and entity_type = 'driver'), 'Pedido do titular', 'o evento traz a justificativa');
select ok(exists (select 1 from public.audit_logs where action = 'driver.anonymize' and justification = 'Pedido do titular' and metadata->'fields' ? 'phone'), 'a auditoria traz motivo, justificativa e campos');

-- Bloqueios depois de anonimizado.
select is(public.update_driver(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), (select (v->>'driver_id')::uuid from r where k = 'drv'), 5, 'Outro Nome', 'B', current_date + 1, null, null, null, null)->>'code', 'ANONYMIZED_RECORD', 'edição de motorista anonimizado é recusada');
select is(public.reactivate_driver(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), (select (v->>'driver_id')::uuid from r where k = 'drv'), 'Voltou')->>'code', 'ANONYMIZED_RECORD', 'reativação é recusada');
select is(public.link_driver_user(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), (select (v->>'driver_id')::uuid from r where k = 'drv'), '10000000-0000-0000-0000-0000000007e1')->>'code', 'ANONYMIZED_RECORD', 'vínculo é recusado');
select is(public.reveal_document(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), 'driver', (select (v->>'driver_id')::uuid from r where k = 'drv'), 'cpf')->>'code', 'ANONYMIZED_RECORD', 'revelação é recusada');
select throws_ok($$update public.drivers set full_name = 'Fulano' where full_name = 'Motorista anonimizado'$$, 'P0001', 'anonymized_record', 'update direto de motorista anonimizado é recusado pelo gatilho');
select throws_ok($$update public.driver_documents set cpf = '52998224725' where anonymized_at is not null$$, 'P0001', 'anonymized_record', 'não se recupera o CPF por update direto');

-- Libera os documentos: o mesmo CPF e a mesma CNH cadastram de novo.
select is((public.create_driver(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), 'Novo Condutor', '529.982.247-25', '12345678900', 'C', current_date + 50, null))->>'code', 'CREATED', 'o mesmo CPF e a mesma CNH são aceitos como registro novo');
select is((select count(*)::int from public.drivers where full_name = 'Motorista anonimizado'), 1, 'o motorista anonimizado continua listado, com o nome fixo');
select is((select (public.list_drivers(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), 'Carlos', 'all', null, null, null, null, null)->>'total')::int), 0, 'a busca pelo nome antigo não encontra nada');
select is((select (public.list_drivers(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), null, 'active', null, null, null, null, null)->'items')::text !~ 'anonimizado'), true, 'o filtro padrão "ativos" não mostra o anonimizado');
select is((select (public.list_drivers(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), null, 'inactive', null, null, null, null, null)->'items'->0->>'full_name')), 'Motorista anonimizado', 'a visão "inativos" mostra com o nome fixo');

-- ---------- anonimização do cliente pessoa física
insert into r values ('apf', pg_temp.an_customer(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', (select (v->>'customer_id')::uuid from r where k = 'pf'), 2, 'other', 'Encerramento do relacionamento'));
select is((select v->>'code' from r where k = 'apf'), 'ANONYMIZED', 'o cliente pessoa física inativo é anonimizado');
select is((select (v->'affected'->>'contacts') || '/' || (v->'affected'->>'sites') from r where k = 'apf'), '2/1', 'a resposta traz quantos contatos e unidades foram afetados');
select is((select legal_name || '|' || coalesce(trade_name, 'nulo') || '|' || coalesce(notes, 'nulo') || '|' || document_display from public.customers where id = (select (v->>'customer_id')::uuid from r where k = 'pf')),
  'Cliente anonimizado|nulo|nulo|anonimizado', 'nome, nome fantasia, observações e CPF exibido removidos');
select is((select coalesce(document_key, 'nulo') from public.customer_documents where customer_id = (select (v->>'customer_id')::uuid from r where k = 'pf')), 'nulo', 'o CPF completo virou nulo');
select is((select count(*)::int from public.customer_contacts where customer_id = (select (v->>'customer_id')::uuid from r where k = 'pf') and name = 'Contato anonimizado' and phone is null and email is null and role is null and anonymized_at is not null), 2, 'todos os contatos foram anonimizados e continuam existindo');
select is((select name || '|' || number || '|' || coalesce(complement, 'nulo') || '|' || coalesce(receiving_contact_name, 'nulo') || '|' || coalesce(access_instructions, 'nulo') || '|' || coalesce(latitude::text, 'nulo')
            from public.customer_sites where customer_id = (select (v->>'customer_id')::uuid from r where k = 'pf')), 'Unidade anonimizada ' || left((select (v->>'site_id') from r where k = 'site'), 8) || '|S/N|nulo|nulo|nulo|nulo',
  'a unidade perde nome, complemento, responsável, instruções e coordenadas');
select is((select postal_code || '|' || street || '|' || district || '|' || city || '|' || state from public.customer_sites where customer_id = (select (v->>'customer_id')::uuid from r where k = 'pf')),
  '01001000|Praça da Sé|Sé|São Paulo|SP', 'CEP, logradouro, bairro, cidade e UF permanecem');
select is((select count(*)::int from public.geofences where name = 'Entrada'), 1, 'a geocerca permanece');
select is(pg_temp.an_customer(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', (select (v->>'customer_id')::uuid from r where k = 'pf'), 3)->>'code', 'ALREADY_ANONYMIZED', 'repetição: já anonimizado');
select is(public.update_customer(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), (select (v->>'customer_id')::uuid from r where k = 'pf'), 4, 'Outro Nome', null, 'other', 'Consultório', null, null, null, null)->>'code', 'ANONYMIZED_RECORD', 'edição do cliente anonimizado é recusada');
select is(public.update_site(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), (select (v->>'site_id')::uuid from r where k = 'site'), 2, 'Outro', '01001000', 'Rua', '1', null, null, 'São Paulo', 'SP', null, null, null, null, null, null, null, null, null)->>'code', 'ANONYMIZED_RECORD', 'edição da unidade é recusada');
select is(public.reactivate_customer(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), (select (v->>'customer_id')::uuid from r where k = 'pf'), 'Voltou')->>'code', 'ANONYMIZED_RECORD', 'reativação do cliente é recusada');
select is(public.reveal_document(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), 'customer', (select (v->>'customer_id')::uuid from r where k = 'pf'), 'cpf')->>'code', 'ANONYMIZED_RECORD', 'revelação do CPF do cliente é recusada');
select is((public.create_customer(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), 'individual', '111.444.777-35', 'Outra Pessoa', null, 'other', 'Outro', null, '[]'::jsonb))->>'code', 'CREATED', 'o mesmo CPF cadastra de novo como registro novo');
select is((public.list_customers(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), 'Ana Sigilosa', 'all', null, null, null, null, null, null)->>'total')::int, 0, 'a busca pelo nome antigo não encontra o cliente');
select is((public.list_customers(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), null, 'inactive', null, null, null, null, null, null)->'items')::text ~ 'Cliente anonimizado', true, 'aparece como inativo, com o nome fixo, na visão de inativos');

-- ---------- anonimização de contato de cliente jurídico (cliente ativo)
insert into r values ('actc', pg_temp.an_contact(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', (select id from public.customer_contacts where name = 'Maria Contato')));
select is((select v->>'code' from r where k = 'actc'), 'ANONYMIZED', 'o contato de cliente jurídico ativo é anonimizado');
select is((select name || '|' || coalesce(phone, 'nulo') || '|' || coalesce(email, 'nulo') || '|' || coalesce(role, 'nulo') || '|' || is_primary::text from public.customer_contacts where customer_id = (select (v->>'customer_id')::uuid from r where k = 'pj')),
  'Contato anonimizado|nulo|nulo|nulo|false', 'o contato perde nome, telefone, e-mail, função e a marca de principal');
select is((select legal_name from public.customers where id = (select (v->>'customer_id')::uuid from r where k = 'pj')), 'Hospital Alfa Ltda', 'o cliente jurídico não é alterado');
select is(pg_temp.an_contact(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', (select id from public.customer_contacts where customer_id = (select (v->>'customer_id')::uuid from r where k = 'pj')))->>'code', 'ALREADY_ANONYMIZED', 'contato já anonimizado');
select is((select count(*)::int from public.customer_contacts where customer_id = (select (v->>'customer_id')::uuid from r where k = 'pj')), 1, 'o contato anonimizado permanece na lista do cliente');
select ok((public.get_customer(pg_temp.adm(), '60000000-0000-0000-0000-0000000700a3', pg_temp.org(), (select (v->>'customer_id')::uuid from r where k = 'pj'))->'contacts'->0->>'name') = 'Contato anonimizado', 'get_customer mostra o contato com o nome fixo');
select ok(exists (select 1 from public.audit_logs where action = 'customer.contact_anonymize' and metadata->'fields' ? 'email'), 'auditoria customer.contact_anonymize gravada');

-- ---------- nenhuma linha apagada e nenhum dado identificável resta
select is(pg_temp.counts(),
  (select (string_to_array(v #>> '{}', '/'))[1]::int + 1 || '/' || ((string_to_array(v #>> '{}', '/'))[2]::int + 1) || '/' || ((string_to_array(v #>> '{}', '/'))[3]::int + 1) || '/' ||
          ((string_to_array(v #>> '{}', '/'))[4]::int + 1) || '/' || (string_to_array(v #>> '{}', '/'))[5] || '/' || (string_to_array(v #>> '{}', '/'))[6] || '/' || (string_to_array(v #>> '{}', '/'))[7]
     from r where k = 'before'),
  'nenhuma linha foi apagada em nenhuma tabela de cadastro: só cresceu pelos dois registros novos que o teste criou');
select ok(not exists (select 1 from public.drivers d where d.full_name ~* 'carlos' or d.phone is not null), 'nenhum motorista guarda o nome ou telefone antigo');
select ok(not exists (select 1 from public.customer_contacts k where k.anonymized_at is not null and (k.phone is not null or k.email is not null)), 'nenhum contato anonimizado guarda telefone ou e-mail');
select ok(not exists (select 1 from public.registry_events where data::text ~* '(52998224725|12345678900|11144477735|Sigilos|Ana Fantasia|Bruno Parente|ana\.sigilosa|maria\.contato|11987654321|11999998888|11911112222|1133334444|11955556666|privada|Portão azul)'
                       or coalesce(justification, '') ~* '(Sigilos|11144477735)'), 'nenhum valor antigo em nenhum evento');
select ok(not exists (select 1 from public.audit_logs where metadata::text ~* '(52998224725|12345678900|11144477735|Sigilos|Ana Fantasia|Bruno Parente|ana\.sigilosa|maria\.contato|11987654321|11999998888|11911112222|1133334444|11955556666|privada|Portão azul)'
                       or coalesce(justification, '') ~* '(Sigilos|11144477735)'), 'nenhum valor antigo em nenhuma auditoria');

select * from finish();
rollback;

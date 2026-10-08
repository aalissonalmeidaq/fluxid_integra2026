begin;
select plan(52);

-- Spec 007, US1: create_customer e update_customer (RF-001 a RF-004a, RF-031, RF-032, CA-004, CA-005). Hermético: desfeito pelo rollback.
-- Todos os documentos, nomes e e-mails são fictícios.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
-- Motorista do Tenant A: papel driver, sem nenhuma permissão da Fase 3.
insert into auth.users (id, aud, role, email) values ('10000000-0000-0000-0000-0000000007c1', 'authenticated', 'authenticated', 'reg-driver@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000007c1', 'Motorista Cadastros');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000007c1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007c1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000007c1', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'driver';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007c1', '60000000-0000-0000-0000-0000000700c1', 'aal1');

create temp table r (k text primary key, v jsonb);
grant all on r to public;

-- Atalhos: ator A (administrador do Tenant A), ator B (do Tenant B) e motorista (sem permissão).
create function pg_temp.create_as_a(p_type text, p_doc text, p_name text, p_segment text, p_detail text, p_contacts jsonb default '[]'::jsonb)
returns jsonb language sql as $$
  select public.create_customer('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    p_type, p_doc, p_name, null, p_segment, p_detail, null, p_contacts)
$$;

insert into r values
  ('legal', pg_temp.create_as_a('legal', '11.222.333/0001-81', 'Hospital Alfa Ltda', 'hospital', null,
     '[{"name":"Maria Souza","role":"Compras","phone":"11912345678","email":"maria@exemplo.invalid","is_primary":true},{"name":"João Dias","role":null,"phone":null,"email":null,"is_primary":false}]'::jsonb)),
  ('alnum', pg_temp.create_as_a('legal', '12.abc.345/01de-35', 'Indústria Beta SA', 'industry', null)),
  ('pf', pg_temp.create_as_a('individual', '529.982.247-25', 'Ana Lima', 'other', 'Consultório particular',
     '[{"name":"Ana Lima","role":null,"phone":"11987654321","email":"ana@exemplo.invalid","is_primary":true}]'::jsonb));

-- ---------- criação
select is((select v->>'code' from r where k = 'legal'), 'CREATED', 'cliente jurídico é criado');
select is((select (v->>'version')::int from r where k = 'legal'), 1, 'a versão inicial é 1');
select is((select status from public.customers where id = (select (v->>'customer_id')::uuid from r where k = 'legal')), 'active', 'nasce ativo');
select is((select document_key from public.customer_documents where customer_id = (select (v->>'customer_id')::uuid from r where k = 'legal')),
  '11222333000181', 'o CNPJ é guardado normalizado, sem pontuação');
select is((select document_display from public.customers where id = (select (v->>'customer_id')::uuid from r where k = 'legal')),
  '11222333000181', 'o CNPJ de pessoa jurídica aparece completo');
select is((select count(*)::int from public.customer_contacts where customer_id = (select (v->>'customer_id')::uuid from r where k = 'legal')), 2, 'os dois contatos foram gravados');
select is((select count(*)::int from public.customer_contacts where customer_id = (select (v->>'customer_id')::uuid from r where k = 'legal') and is_primary), 1, 'um contato principal');
select is((select v->>'code' from r where k = 'alnum'), 'CREATED', 'CNPJ alfanumérico com pontuação e minúsculas é aceito');
select is((select document_key from public.customer_documents where customer_id = (select (v->>'customer_id')::uuid from r where k = 'alnum')),
  '12ABC34501DE35', 'o CNPJ alfanumérico é normalizado em maiúsculas');
select is((select v->>'code' from r where k = 'pf'), 'CREATED', 'cliente pessoa física com CPF válido é criado');
select is((select document_display from public.customers where id = (select (v->>'customer_id')::uuid from r where k = 'pf')),
  '***.***.***-25', 'o CPF aparece mascarado (só os dois últimos dígitos)');
select is((select document_key from public.customer_documents where customer_id = (select (v->>'customer_id')::uuid from r where k = 'pf')),
  '52998224725', 'o CPF completo fica só na tabela de documentos');

-- ---------- evento e auditoria, sem dado pessoal
select is((select event_type from public.registry_events where entity_type = 'customer' and entity_id = (select (v->>'customer_id')::uuid from r where k = 'legal') and sequence = 1),
  'customer_created', 'evento customer_created na sequência 1');
select ok(exists (select 1 from public.audit_logs where action = 'customer.create' and target_id = (select v->>'customer_id' from r where k = 'legal')),
  'auditoria customer.create gravada');
select ok(not exists (select 1 from public.registry_events where data::text ~ '(52998224725|Ana Lima|ana@exemplo|11987654321|529\.982)'),
  'nenhum CPF, nome, e-mail ou telefone de pessoa física nos eventos');
select ok(not exists (select 1 from public.audit_logs where metadata::text ~ '(52998224725|Ana Lima|ana@exemplo|11987654321|11222333000181|529\.982)'),
  'nenhum documento, nome, e-mail ou telefone na auditoria');

-- ---------- unicidade e validações
insert into r values ('dup', pg_temp.create_as_a('legal', '11222333000181', 'Outro Nome Ltda', 'hospital', null));
select is((select v->>'code' from r where k = 'dup'), 'DOCUMENT_CONFLICT', 'documento repetido na organização é recusado');
select is((select v->>'owner_name' from r where k = 'dup'), 'Hospital Alfa Ltda', 'o conflito indica o cadastro existente pelo nome');
select ok((select v::text !~ '11222333000181' from r where k = 'dup'), 'o conflito nunca mostra o documento');
select is((select count(*)::int from public.customers where legal_name = 'Outro Nome Ltda'), 0, 'nada é criado pela metade');
insert into r values ('tenantb', public.create_customer('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3',
  '20000000-0000-0000-0000-00000000000b', 'legal', '11222333000181', 'Hospital do Tenant B', null, 'hospital', null, null, '[]'::jsonb));
select is((select v->>'code' from r where k = 'tenantb'), 'CREATED', 'o mesmo CNPJ em outra organização é aceito');

insert into r values ('badcnpj', pg_temp.create_as_a('legal', '11222333000182', 'Cliente Inválido', 'hospital', null));
select is((select v->>'code' from r where k = 'badcnpj'), 'VALIDATION_FAILED', 'CNPJ com dígito errado é recusado');
select ok((select v::text like '%"document"%' from r where k = 'badcnpj'), 'o erro aponta o campo document');
insert into r values ('badcpf', pg_temp.create_as_a('individual', '11111111111', 'Cliente Inválido', 'hospital', null));
select is((select v->>'code' from r where k = 'badcpf'), 'VALIDATION_FAILED', 'CPF inválido para pessoa física é recusado');
insert into r values ('other', pg_temp.create_as_a('legal', '04252011000110', 'Cliente Segmento', 'other', null));
select ok((select v::text like '%segment_detail%' from r where k = 'other'), 'segmento "outro" exige o detalhe');
insert into r values ('elevenc', pg_temp.create_as_a('legal', '04252011000110', 'Cliente Onze Contatos', 'hospital', null,
  (select jsonb_agg(jsonb_build_object('name', 'Contato ' || n, 'is_primary', n = 1)) from generate_series(10, 20) n)));
select is((select v->>'code' from r where k = 'elevenc'), 'VALIDATION_FAILED', 'mais de 10 contatos é recusado');
insert into r values ('twoprim', pg_temp.create_as_a('legal', '04252011000110', 'Cliente Dois Principais', 'hospital', null,
  '[{"name":"Um","is_primary":true},{"name":"Dois","is_primary":true}]'::jsonb));
select is((select v->>'code' from r where k = 'twoprim'), 'VALIDATION_FAILED', 'dois contatos principais são recusados');
insert into r values ('badphone', pg_temp.create_as_a('legal', '04252011000110', 'Cliente Telefone', 'hospital', null, '[{"name":"Contato","phone":"123"}]'::jsonb));
select ok((select v::text like '%contacts.0.phone%' from r where k = 'badphone'), 'telefone inválido aponta contacts.0.phone');

-- ---------- autorização
select is((select public.create_customer('10000000-0000-0000-0000-0000000007c1', '60000000-0000-0000-0000-0000000700c1', '20000000-0000-0000-0000-00000000000a',
  'legal', '04252011000110', 'Sem Permissão', null, 'hospital', null, null, '[]'::jsonb)->>'code'), 'ACCESS_DENIED', 'motorista sem a permissão não cadastra');
select is((select public.create_customer('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700ff', '20000000-0000-0000-0000-00000000000a',
  'legal', '04252011000110', 'Sem Sessão', null, 'hospital', null, null, '[]'::jsonb)->>'code'), 'AUTH_REQUIRED', 'sessão inválida não cadastra');

-- ---------- update_customer
create function pg_temp.update_as_a(p_customer uuid, p_version bigint, p_name text, p_contacts jsonb default null, p_document text default null, p_justification text default null)
returns jsonb language sql as $$
  select public.update_customer('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
    p_customer, p_version, p_name, null, 'hospital', null, null, p_contacts, p_document, p_justification)
$$;
insert into r values ('upd', pg_temp.update_as_a((select (v->>'customer_id')::uuid from r where k = 'legal'), 1, 'Hospital Alfa Renomeado Ltda'));
select is((select v->>'code' from r where k = 'upd'), 'UPDATED', 'cliente é editado');
select is((select (v->>'version')::int from r where k = 'upd'), 2, 'a versão sobe a cada edição');
select is((select v->>'code' from (select pg_temp.update_as_a((select (v->>'customer_id')::uuid from r where k = 'legal'), 1, 'Nome Antigo Ltda') v) s),
  'VERSION_CONFLICT', 'gravação baseada em versão antiga é recusada');
select is((select e.data->'changes'->0->>'old' from public.registry_events e where e.entity_id = (select (v->>'customer_id')::uuid from r where k = 'legal') and e.event_type = 'customer_updated'),
  'Hospital Alfa Ltda', 'o evento de cliente jurídico traz o valor antigo e o novo');
insert into r values ('updpf', pg_temp.update_as_a((select (v->>'customer_id')::uuid from r where k = 'pf'), 1, 'Ana Lima Souza'));
select ok((select e.data::text like '%changed_sensitive%' and e.data::text not like '%Ana Lima%' from public.registry_events e
  where e.entity_id = (select (v->>'customer_id')::uuid from r where k = 'pf') and e.event_type = 'customer_updated'),
  'o evento de cliente pessoa física só diz que o nome mudou, sem os valores');
select is((select v->>'code' from (select public.update_customer('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b',
  (select (v->>'customer_id')::uuid from r where k = 'legal'), 2, 'Invasão', null, 'hospital', null, null, null, null, null) v) s),
  'NOT_FOUND', 'o Tenant B não edita (nem enxerga) cliente do Tenant A');

-- ---------- correção de documento (RF-004a): justificativa, unicidade e evento sem valor de CPF
select is((select v->>'code' from (select pg_temp.update_as_a((select (v->>'customer_id')::uuid from r where k = 'legal'), 2, 'Hospital Alfa Renomeado Ltda', null, '11222333000262', null) v) s),
  'JUSTIFICATION_REQUIRED', 'corrigir o documento exige justificativa');
select is((select v->>'code' from (select pg_temp.update_as_a((select (v->>'customer_id')::uuid from r where k = 'legal'), 2, 'Hospital Alfa Renomeado Ltda', null, '12ABC34501DE35', 'Correção de digitação') v) s),
  'DOCUMENT_CONFLICT', 'corrigir para um documento já usado por outro cliente é recusado');
select is((select v->>'code' from (select pg_temp.update_as_a((select (v->>'customer_id')::uuid from r where k = 'legal'), 2, 'Hospital Alfa Renomeado Ltda', null, '52998224725', 'Correção de digitação') v) s),
  'VALIDATION_FAILED', 'CPF no lugar do CNPJ é recusado: o tipo de pessoa é fixo');
insert into r values ('fixcnpj', pg_temp.update_as_a((select (v->>'customer_id')::uuid from r where k = 'legal'), 2, 'Hospital Alfa Renomeado Ltda', null, '11.222.333/0002-62', 'Correção de digitação'));
select is((select v->>'code' from r where k = 'fixcnpj'), 'UPDATED', 'a correção do CNPJ é aceita com justificativa');
select is((select document_key from public.customer_documents where customer_id = (select (v->>'customer_id')::uuid from r where k = 'legal')), '11222333000262', 'o documento novo é gravado normalizado');
select is((select e.data->>'new' from public.registry_events e where e.event_type = 'document_changed'
            and e.entity_id = (select (v->>'customer_id')::uuid from r where k = 'legal')), '11222333000262', 'o evento do CNPJ traz o valor novo (e o antigo)');
insert into r values ('fixcpf', pg_temp.update_as_a((select (v->>'customer_id')::uuid from r where k = 'pf'), 2, 'Ana Lima Souza', null, '111.444.777-35', 'Correção de digitação'));
select is((select v->>'code' from r where k = 'fixcpf'), 'UPDATED', 'a correção do CPF é aceita com justificativa');
select ok(not exists (select 1 from public.registry_events e where e.data::text ~ '(11144477735|52998224725|529\.982|111\.444)'),
  'o evento de correção de CPF não guarda o valor antigo nem o novo');
select is((select document_display from public.customers where id = (select (v->>'customer_id')::uuid from r where k = 'pf')), '***.***.***-35', 'a máscara acompanha o CPF novo');

-- ---------- contatos: substituição, evento só com contagem e contato anonimizado preservado
insert into public.customer_contacts (id, organization_id, customer_id, name, position, anonymized_at, anonymized_by)
  select '83000000-0000-0000-0000-0000000007a1', '20000000-0000-0000-0000-00000000000a', (v->>'customer_id')::uuid, 'Contato anonimizado', 5,
         now(), '10000000-0000-0000-0000-000000000002' from r where k = 'legal';
insert into r values ('contacts', pg_temp.update_as_a((select (v->>'customer_id')::uuid from r where k = 'legal'), 3, 'Hospital Alfa Renomeado Ltda',
  '[{"name":"Novo Contato","role":"Direção","phone":"1131234567","email":"novo@exemplo.invalid","is_primary":true}]'::jsonb));
select is((select v->>'code' from r where k = 'contacts'), 'UPDATED', 'a lista de contatos é substituída pela edição');
select is((select count(*)::int from public.customer_contacts where customer_id = (select (v->>'customer_id')::uuid from r where k = 'legal') and anonymized_at is null), 1,
  'os contatos não anonimizados passaram a ser só o novo');
select is((select count(*)::int from public.customer_contacts where id = '83000000-0000-0000-0000-0000000007a1'), 1, 'o contato anonimizado permanece');
select ok((select e.data::text !~ '(novo@exemplo|1131234567|Novo Contato)' and e.data->>'count' = '1' from public.registry_events e
            where e.event_type = 'contacts_changed' and e.entity_id = (select (v->>'customer_id')::uuid from r where k = 'legal')),
  'o evento contacts_changed traz só a contagem, nunca os dados do contato');

-- ---------- cliente inativo não é editado; auditoria da edição
update public.customers set status = 'inactive', inactivated_at = now(), inactivated_by = '10000000-0000-0000-0000-000000000002'
 where id = (select (v->>'customer_id')::uuid from r where k = 'alnum');
select is((select v->>'code' from (select pg_temp.update_as_a((select (v->>'customer_id')::uuid from r where k = 'alnum'), 1, 'Indústria Beta Renomeada SA') v) s),
  'INACTIVE_RECORD', 'cliente inativo não é editado');
select ok(exists (select 1 from public.audit_logs where action = 'customer.update' and target_id = (select v->>'customer_id' from r where k = 'legal')),
  'auditoria customer.update gravada');
select ok(not exists (select 1 from public.audit_logs where action like 'customer.%' and metadata::text ~ '(11222333000181|11222333000262|12ABC34501DE35|52998224725|11144477735)'),
  'nenhum documento na auditoria das edições');

select * from finish();
rollback;

begin;
select plan(26);

-- Spec 007, US7: query_registry_history (RF-036, RF-037, História 7). Hermético. Dados fictícios.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001'
    from public.roles r where r.organization_id = '20000000-0000-0000-0000-00000000000b' and r.code = 'tenant_admin';
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000007d1', 'authenticated', 'authenticated', 'h-auditor@example.invalid'),
  ('10000000-0000-0000-0000-0000000007d2', 'authenticated', 'authenticated', 'h-estoque@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000007d1', 'Auditor'), ('10000000-0000-0000-0000-0000000007d2', 'Estoquista');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000007d1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007d1', 'active', now()),
  ('30000000-0000-0000-0000-0000000007d2', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007d2', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select m.id, r.id, '10000000-0000-0000-0000-000000000001'
    from (values ('30000000-0000-0000-0000-0000000007d1'::uuid, 'tenant_auditor'), ('30000000-0000-0000-0000-0000000007d2', 'stock_operator')) m(id, code)
    join public.roles r on r.code = m.code and r.organization_id = '20000000-0000-0000-0000-00000000000a';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-0000000007d2', '60000000-0000-0000-0000-0000000700d2', 'aal1');

create temp table r (k text primary key, v jsonb);
grant all on r to public;

-- Sequência conhecida sobre um veículo: criar, editar (capacidade), manutenção, disponível, editar de novo.
insert into r values ('veh', public.create_vehicle('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
  'ABC1234', 'truck', null, 'Marca', 'Modelo', 2020, 30, null, null));
create function pg_temp.vid() returns uuid language sql as $$ select (v->>'vehicle_id')::uuid from r where k = 'veh' $$;
select public.update_vehicle('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
  pg_temp.vid(), 1, 'ABC1234', 'truck', null, 'Marca', 'Modelo', 2020, 40, null, null, null);
select public.change_vehicle_status('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', pg_temp.vid(), 2, 'maintenance', null);
select public.change_vehicle_status('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', pg_temp.vid(), 3, 'available', null);
select public.update_vehicle('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
  pg_temp.vid(), 4, 'ABC1234', 'truck', null, 'Marca', 'Modelo', 2020, 50, null, null, null);

create function pg_temp.hist(p_user uuid, p_session uuid, p_org uuid, p_type text, p_entity uuid, p_event text default null, p_from date default null, p_to date default null,
  p_order text default null, p_cursor text default null, p_limit integer default null) returns jsonb language sql as $$
  select public.query_registry_history(p_user, p_session, p_org, p_type, p_entity, p_event, p_from, p_to, p_order, p_cursor, p_limit)
$$;
create function pg_temp.as_a(p_type text, p_entity uuid, p_event text default null, p_from date default null, p_to date default null, p_order text default null, p_cursor text default null, p_limit integer default null)
returns jsonb language sql as $$
  select pg_temp.hist('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', p_type, p_entity, p_event, p_from, p_to, p_order, p_cursor, p_limit)
$$;

-- ---------- ordem, sequência e conteúdo
select is((select jsonb_array_length(pg_temp.as_a('vehicle', pg_temp.vid())->'events')), 5, 'cinco eventos na sequência executada');
select is((select string_agg(e->>'sequence', ',') from jsonb_array_elements(pg_temp.as_a('vehicle', pg_temp.vid())->'events') e), '5,4,3,2,1', 'ordem decrescente por sequência (a mais recente primeiro), estável mesmo no mesmo instante');
select is((select string_agg(e->>'sequence', ',') from jsonb_array_elements(pg_temp.as_a('vehicle', pg_temp.vid(), null, null, null, 'asc')->'events') e), '1,2,3,4,5', 'ordem crescente');
select is((select string_agg(e->>'event_type', ',') from jsonb_array_elements(pg_temp.as_a('vehicle', pg_temp.vid(), null, null, null, 'asc')->'events') e),
  'vehicle_created,vehicle_updated,vehicle_status_changed,vehicle_status_changed,vehicle_updated', 'os tipos batem com a sequência executada');
select is((select e->'data'->'changes'->0->>'old' || '>' || (e->'data'->'changes'->0->>'new') from jsonb_array_elements(pg_temp.as_a('vehicle', pg_temp.vid(), null, null, null, 'asc')->'events') e where (e->>'sequence') = '2'), '30>40',
  'a edição mostra o campo e os valores não sensíveis');
select is((select e->>'actor_name' from jsonb_array_elements(pg_temp.as_a('vehicle', pg_temp.vid())->'events') e where (e->>'sequence') = '1'), (select display_name from public.profiles where user_id = '10000000-0000-0000-0000-000000000002'), 'cada evento mostra quem fez');

-- ---------- filtros e paginação
select is((select jsonb_array_length(pg_temp.as_a('vehicle', pg_temp.vid(), 'vehicle_status_changed')->'events')), 2, 'filtro por tipo de evento');
select is((select jsonb_array_length(pg_temp.as_a('vehicle', pg_temp.vid(), null, current_date + 1)->'events')), 0, 'filtro por período: início no futuro não traz nada');
select is((select jsonb_array_length(pg_temp.as_a('vehicle', pg_temp.vid(), null, (now() at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Sao_Paulo')::date)->'events')), 5, 'filtro por período: o dia de hoje traz tudo');
select is((pg_temp.as_a('vehicle', pg_temp.vid(), null, current_date + 5, current_date)->'fields'->0->>'field'), 'from', 'período invertido é recusado');
insert into r values ('p1', pg_temp.as_a('vehicle', pg_temp.vid(), null, null, null, null, null, 2));
select is((select (v->'events'->0->>'sequence') || ',' || (v->'events'->1->>'sequence') || '/' || (v->>'next') from r where k = 'p1'), '5,4/4', 'primeira página de 2 com cursor');
insert into r values ('p2', pg_temp.as_a('vehicle', pg_temp.vid(), null, null, null, null, (select v->>'next' from r where k = 'p1'), 2));
select is((select (v->'events'->0->>'sequence') || ',' || (v->'events'->1->>'sequence') || '/' || (v->>'next') from r where k = 'p2'), '3,2/2', 'segunda página continua sem repetir nem perder');
select is((select v->>'next' from (select pg_temp.as_a('vehicle', pg_temp.vid(), null, null, null, null, '2', 2) v) s), null, 'a última página não tem cursor');
select is((pg_temp.as_a('vehicle', pg_temp.vid(), null, null, null, null, 'abc')->>'code'), 'VALIDATION_FAILED', 'cursor inválido é recusado');
select is((pg_temp.as_a('vehicle', pg_temp.vid(), 'tipo_inexistente')->>'code'), 'VALIDATION_FAILED', 'tipo de evento desconhecido é recusado');

-- ---------- permissões por área e isolamento
select is((pg_temp.hist('10000000-0000-0000-0000-0000000007d1', '60000000-0000-0000-0000-0000000700d1', '20000000-0000-0000-0000-00000000000a', 'vehicle', pg_temp.vid())->>'code'), 'LISTED', 'o auditor lê o histórico');
select is((pg_temp.hist('10000000-0000-0000-0000-0000000007d2', '60000000-0000-0000-0000-0000000700d2', '20000000-0000-0000-0000-00000000000a', 'vehicle', pg_temp.vid())->>'code'), 'ACCESS_DENIED', 'o estoquista não lê o histórico');
select is((pg_temp.hist('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000000700b3', '20000000-0000-0000-0000-00000000000b', 'vehicle', pg_temp.vid())->>'code'), 'NOT_FOUND', 'o histórico de outra organização responde NOT_FOUND');
select is((pg_temp.as_a('vehicle', '84000000-0000-0000-0000-0000000000ff')->>'code'), 'NOT_FOUND', 'cadastro inexistente também');
select is((pg_temp.as_a('widget', pg_temp.vid())->>'code'), 'VALIDATION_FAILED', 'tipo de cadastro desconhecido é recusado');

-- ---------- campos pessoais: só "alterado", nunca o valor
insert into r values ('drv', public.create_driver('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
  'Carlos Motorista', '529.982.247-25', '12345678900', 'B', current_date + 200, '11987654321'));
select public.update_driver('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
  (select (v->>'driver_id')::uuid from r where k = 'drv'), 1, 'Carlos Motorista Silva', 'C', current_date + 200, '11911112222', null, null, null);
select ok((select e->'data'->'changed_sensitive' ? 'full_name' and e->'data'->'changed_sensitive' ? 'phone'
             from jsonb_array_elements(pg_temp.as_a('driver', (select (v->>'driver_id')::uuid from r where k = 'drv'))->'events') e where e->>'event_type' = 'driver_updated'),
  'a edição de motorista traz só os nomes dos campos pessoais');
select ok((pg_temp.as_a('driver', (select (v->>'driver_id')::uuid from r where k = 'drv'))::text !~ '(Carlos|11987654321|11911112222|52998224725|12345678900)'), 'o histórico do motorista não traz nome, telefone nem documento');
select is((select e->'data'->'changes'->0->>'field' from jsonb_array_elements(pg_temp.as_a('driver', (select (v->>'driver_id')::uuid from r where k = 'drv'))->'events') e where e->>'event_type' = 'driver_updated'), 'cnh_category', 'campos não sensíveis aparecem com valores');

-- ---------- cliente pessoa física e unidade
insert into r values ('pf', public.create_customer('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
  'individual', '111.444.777-35', 'Ana Lima', null, 'other', 'Consultório', null, '[{"name":"Ana Lima","phone":"11987654321","email":"ana@exemplo.invalid","is_primary":true}]'::jsonb));
select public.update_customer('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
  (select (v->>'customer_id')::uuid from r where k = 'pf'), 1, 'Ana Lima Souza', null, 'other', 'Consultório', 'Observação privada', null, null, null);
select ok((pg_temp.as_a('customer', (select (v->>'customer_id')::uuid from r where k = 'pf'))::text !~ '(Ana Lima|ana@exemplo|11987654321|Observação privada|11144477735)'), 'o histórico do cliente pessoa física não traz nome, contato, observação nem CPF');
select ok(exists (select 1 from jsonb_array_elements(pg_temp.as_a('customer', (select (v->>'customer_id')::uuid from r where k = 'pf'))->'events') e
                   where e->>'event_type' = 'customer_updated' and e->'data'->'changed_sensitive' ? 'legal_name' and e->'data'->'changed_sensitive' ? 'notes'), 'só diz que nome e observações mudaram');
select ok(exists (select 1 from jsonb_array_elements(pg_temp.as_a('customer', (select (v->>'customer_id')::uuid from r where k = 'pf'))->'events') e where e->>'event_type' = 'customer_created'), 'o cadastro do cliente aparece');

select * from finish();
rollback;

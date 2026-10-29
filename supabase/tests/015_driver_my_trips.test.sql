begin;
select plan(14);

-- Spec 015 (validação humana, 27/10/2026): a pessoa que é motorista chega à coleta pela tela "Minha viagem", sem `trip.read`.
-- `list_my_driver_trips` exige sessão e vínculo ativos e devolve só as viagens planejadas ou em andamento em que ela é a motorista,
-- com o mínimo para escolher a viagem (número, situação, data, placa e número de paradas): nada de cliente, endereço ou posição.
-- Dois tenants: o B nunca vê nada do A. Leitura da própria escala, sem auditoria. Hermético: rollback.

delete from public.user_sessions where user_id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005');
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000001580a2', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-0000001580b3', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-0000001580a4', 'aal1');
select public.start_user_session('10000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-0000001580a5', 'aal1');

-- No A: o usuário 4 dirige uma viagem em andamento, uma planejada e uma concluída; o usuário 5 dirige outra em andamento.
-- No B: o usuário 3 dirige uma viagem em andamento.
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('e1580000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 'MVG1A11', 'truck', 5),
  ('e1580000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 'MVG1A22', 'truck', 5),
  ('e1580000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-00000000000a', 'MVG1A33', 'truck', 5),
  ('e1580000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 'MVG1B11', 'truck', 5);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until, linked_user_id) values
  ('e1581000-0000-0000-0000-0000000000a4', '20000000-0000-0000-0000-00000000000a', 'Motorista Quatro', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, '10000000-0000-0000-0000-000000000004'),
  ('e1581000-0000-0000-0000-0000000000a5', '20000000-0000-0000-0000-00000000000a', 'Motorista Cinco', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, '10000000-0000-0000-0000-000000000005'),
  ('e1581000-0000-0000-0000-0000000000b3', '20000000-0000-0000-0000-00000000000b', 'Motorista B', 'x', 'x', 'D',
   (now() at time zone 'America/Sao_Paulo')::date + 365, '10000000-0000-0000-0000-000000000003');
insert into public.trips (id, organization_id, number, planned_date, vehicle_id, driver_id, status, started_at, started_by, completed_at, completed_by, created_by) values
  ('e1582000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000a', 9581, (now() at time zone 'America/Sao_Paulo')::date,
   'e1580000-0000-0000-0000-0000000000a1', 'e1581000-0000-0000-0000-0000000000a4', 'in_progress', now() - interval '1 hour',
   '10000000-0000-0000-0000-000000000002', null, null, '10000000-0000-0000-0000-000000000002'),
  ('e1582000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-00000000000a', 9582, (now() at time zone 'America/Sao_Paulo')::date + 1,
   'e1580000-0000-0000-0000-0000000000a2', 'e1581000-0000-0000-0000-0000000000a4', 'planned', null, null, null, null,
   '10000000-0000-0000-0000-000000000002'),
  ('e1582000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-00000000000a', 9583, (now() at time zone 'America/Sao_Paulo')::date - 1,
   'e1580000-0000-0000-0000-0000000000a3', 'e1581000-0000-0000-0000-0000000000a4', 'completed', now() - interval '1 day',
   '10000000-0000-0000-0000-000000000002', now() - interval '20 hours', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002'),
  ('e1582000-0000-0000-0000-0000000000a4', '20000000-0000-0000-0000-00000000000a', 9584, (now() at time zone 'America/Sao_Paulo')::date,
   'e1580000-0000-0000-0000-0000000000a3', 'e1581000-0000-0000-0000-0000000000a5', 'in_progress', now() - interval '2 hours',
   '10000000-0000-0000-0000-000000000002', null, null, '10000000-0000-0000-0000-000000000002'),
  ('e1582000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-00000000000b', 9585, (now() at time zone 'America/Sao_Paulo')::date,
   'e1580000-0000-0000-0000-0000000000b1', 'e1581000-0000-0000-0000-0000000000b3', 'in_progress', now() - interval '1 hour',
   '10000000-0000-0000-0000-000000000003', null, null, '10000000-0000-0000-0000-000000000003');

create function pg_temp.mine(p_user text, p_session text, p_org text) returns jsonb language sql as $$
  select public.list_my_driver_trips(('10000000-0000-0000-0000-00000000000' || p_user)::uuid,
    ('60000000-0000-0000-0000-0000001580' || p_session)::uuid, ('20000000-0000-0000-0000-00000000000' || p_org)::uuid)
$$;

-- 1. Só service_role executa.
select ok(not has_function_privilege('authenticated', 'public.list_my_driver_trips(uuid, uuid, uuid)', 'execute'), 'authenticated não executa');
select ok(has_function_privilege('service_role', 'public.list_my_driver_trips(uuid, uuid, uuid)', 'execute'), 'service_role executa');

-- 2. A motorista vê as próprias viagens planejadas e em andamento (em andamento primeiro), nunca a concluída nem a de outra pessoa.
select is(pg_temp.mine('4', 'a4', 'a')->>'code', 'FOUND', 'motorista vinculada: encontrado');
select is((pg_temp.mine('4', 'a4', 'a')->>'is_driver')::boolean, true, 'é motorista nesta empresa');
select is((select jsonb_agg(t->>'number') from jsonb_array_elements(pg_temp.mine('4', 'a4', 'a')->'trips') t), '["9581", "9582"]'::jsonb,
  'em andamento e planejada, nessa ordem; sem a concluída e sem a do usuário 5');
select is((select array_agg(k order by k) from jsonb_object_keys(pg_temp.mine('4', 'a4', 'a')->'trips'->0) k),
  array['id', 'number', 'planned_date', 'started_at', 'status', 'stop_count', 'vehicle_plate'], 'só o mínimo para escolher a viagem');
select is(pg_temp.mine('4', 'a4', 'a')->'trips'->0->>'vehicle_plate', 'MVG1A11', 'placa do veículo da viagem');

-- 3. Quem não é motorista recebe lista vazia, sem erro (a tela só não aparece).
select is(pg_temp.mine('2', 'a2', 'a')->>'is_driver', 'false', 'administrador sem vínculo de motorista: não é motorista');
select is(jsonb_array_length(pg_temp.mine('2', 'a2', 'a')->'trips'), 0, 'e não vê viagem nenhuma');

-- 4. Isolamento: o motorista do B não vê nada do A, nem o do A nada do B.
select is(pg_temp.mine('3', 'b3', 'a')->>'code', 'ACCESS_DENIED', 'motorista do B pedindo o A: negado');
select is(pg_temp.mine('4', 'a4', 'b')->>'code', 'ACCESS_DENIED', 'motorista do A pedindo o B: negado');
select is((select jsonb_agg(t->>'number') from jsonb_array_elements(pg_temp.mine('3', 'b3', 'b')->'trips') t), '["9585"]'::jsonb, 'o B vê só a própria');

-- 5. Sessão e cadastro: sem sessão ativa não há resposta; motorista inativado deixa de ver.
select is(public.list_my_driver_trips('10000000-0000-0000-0000-000000000004', gen_random_uuid(), '20000000-0000-0000-0000-00000000000a')->>'code',
  'AUTH_REQUIRED', 'sessão desconhecida: exige entrar de novo');
update public.drivers set status = 'inactive', inactivated_at = now(), inactivated_by = '10000000-0000-0000-0000-000000000002'
 where id = 'e1581000-0000-0000-0000-0000000000a4';
select is(pg_temp.mine('4', 'a4', 'a')->>'is_driver', 'false', 'cadastro de motorista inativado: não é mais motorista');

select * from finish();
rollback;

begin;
select plan(19);

-- Spec 007, US7: cada ação sensível grava o evento e a auditoria na mesma transação, e nenhum dado pessoal vai a nenhum dos dois
-- (RF-050, CA-004, CA-005). Hermético. Todos os dados são fictícios.

delete from public.user_sessions where user_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
insert into auth.users (id, aud, role, email) values ('10000000-0000-0000-0000-0000000007e1', 'authenticated', 'authenticated', 'au-driver@example.invalid');
insert into public.profiles (user_id, display_name) values ('10000000-0000-0000-0000-0000000007e1', 'Condutor Sigiloso');
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000007e1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000007e1', 'active', now());
insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-0000000007e1', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r
   where r.organization_id = '20000000-0000-0000-0000-00000000000a' and r.code = 'driver';
select public.start_user_session('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', 'aal1');

create temp table r (k text primary key, v jsonb);
grant all on r to public;
create function pg_temp.actor() returns uuid language sql as $$ select '10000000-0000-0000-0000-000000000002'::uuid $$;

-- Ações: cadastro, edição, inativação, reativação, situação do veículo, vínculo, desvínculo e revelação.
insert into r values
  ('cust', public.create_customer(pg_temp.actor(), '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', 'individual', '111.444.777-35', 'Ana Sigilosa', null, 'other', 'Consultório',
     'Anotação privada', '[{"name":"Ana Sigilosa","phone":"11987654321","email":"ana.sigilosa@exemplo.invalid","is_primary":true}]'::jsonb)),
  ('drv', public.create_driver(pg_temp.actor(), '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', 'Carlos Sigiloso', '529.982.247-25', '12345678900', 'B', current_date + 100, '11911112222')),
  ('veh', public.create_vehicle(pg_temp.actor(), '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', 'ABC1234', 'truck', null, null, null, null, 10, null, null));
select public.update_customer(pg_temp.actor(), '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'customer_id')::uuid from r where k = 'cust'), 1,
  'Ana Sigilosa Souza', null, 'other', 'Consultório', 'Outra anotação privada', null, null, null);
select public.update_driver(pg_temp.actor(), '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'driver_id')::uuid from r where k = 'drv'), 1,
  'Carlos Sigiloso Silva', 'B', current_date + 100, '11933334444', null, null, null);
select public.change_vehicle_status(pg_temp.actor(), '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'vehicle_id')::uuid from r where k = 'veh'), 1, 'maintenance', null);
select public.link_driver_user(pg_temp.actor(), '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'driver_id')::uuid from r where k = 'drv'), '10000000-0000-0000-0000-0000000007e1');
select public.unlink_driver_user(pg_temp.actor(), '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'driver_id')::uuid from r where k = 'drv'), 'Usuário trocou de função');
select public.reveal_document(pg_temp.actor(), '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', 'driver', (select (v->>'driver_id')::uuid from r where k = 'drv'), 'cpf');
select public.reveal_document(pg_temp.actor(), '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', 'customer', (select (v->>'customer_id')::uuid from r where k = 'cust'), 'cpf');
select public.inactivate_customer(pg_temp.actor(), '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'customer_id')::uuid from r where k = 'cust'), 'Cliente encerrou', '{"sites":0,"geofences":0}'::jsonb);
select public.reactivate_customer(pg_temp.actor(), '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'customer_id')::uuid from r where k = 'cust'), 'Cliente voltou');
select public.inactivate_driver(pg_temp.actor(), '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'driver_id')::uuid from r where k = 'drv'), 'Desligado');
select public.reactivate_driver(pg_temp.actor(), '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a', (select (v->>'driver_id')::uuid from r where k = 'drv'), 'Recontratado');

-- Cada ação tem o par evento + auditoria, com o mesmo alvo.
create function pg_temp.pair(p_action text, p_event text, p_entity text, p_entity_id text) returns boolean language sql as $$
  select exists (select 1 from public.audit_logs a where a.action = p_action and a.target_id = p_entity_id and a.result = 'success')
     and exists (select 1 from public.registry_events e where e.event_type = p_event and e.entity_type = p_entity and e.entity_id::text = p_entity_id)
$$;
select ok(pg_temp.pair('customer.create', 'customer_created', 'customer', (select v->>'customer_id' from r where k = 'cust')), 'cadastro de cliente: evento e auditoria');
select ok(pg_temp.pair('customer.update', 'customer_updated', 'customer', (select v->>'customer_id' from r where k = 'cust')), 'edição de cliente: evento e auditoria');
select ok(pg_temp.pair('customer.inactivate', 'customer_inactivated', 'customer', (select v->>'customer_id' from r where k = 'cust')), 'inativação de cliente: evento e auditoria');
select ok(pg_temp.pair('customer.reactivate', 'customer_reactivated', 'customer', (select v->>'customer_id' from r where k = 'cust')), 'reativação de cliente: evento e auditoria');
select ok(pg_temp.pair('customer.document_reveal', 'document_revealed', 'customer', (select v->>'customer_id' from r where k = 'cust')), 'revelação de documento de cliente: evento e auditoria');
select ok(pg_temp.pair('driver.create', 'driver_created', 'driver', (select v->>'driver_id' from r where k = 'drv')), 'cadastro de motorista: evento e auditoria');
select ok(pg_temp.pair('driver.update', 'driver_updated', 'driver', (select v->>'driver_id' from r where k = 'drv')), 'edição de motorista: evento e auditoria');
select ok(pg_temp.pair('driver.user_link', 'driver_user_linked', 'driver', (select v->>'driver_id' from r where k = 'drv')), 'vínculo de usuário: evento e auditoria');
select ok(pg_temp.pair('driver.user_unlink', 'driver_user_unlinked', 'driver', (select v->>'driver_id' from r where k = 'drv')), 'desvínculo de usuário: evento e auditoria');
select ok(pg_temp.pair('driver.document_reveal', 'document_revealed', 'driver', (select v->>'driver_id' from r where k = 'drv')), 'revelação de documento de motorista: evento e auditoria');
select ok(pg_temp.pair('driver.inactivate', 'driver_inactivated', 'driver', (select v->>'driver_id' from r where k = 'drv')), 'inativação de motorista: evento e auditoria');
select ok(pg_temp.pair('driver.reactivate', 'driver_reactivated', 'driver', (select v->>'driver_id' from r where k = 'drv')), 'reativação de motorista: evento e auditoria');
select ok(pg_temp.pair('vehicle.create', 'vehicle_created', 'vehicle', (select v->>'vehicle_id' from r where k = 'veh')), 'cadastro de veículo: evento e auditoria');
select ok(pg_temp.pair('vehicle.status_change', 'vehicle_status_changed', 'vehicle', (select v->>'vehicle_id' from r where k = 'veh')), 'mudança de situação do veículo: evento e auditoria');

-- Nenhum dado pessoal em nenhum dos dois.
select ok(not exists (select 1 from public.registry_events where data::text ~* '(11144477735|52998224725|12345678900|Sigilos|ana\.sigilosa|11987654321|11911112222|11933334444|privada|Condutor)'
                       or coalesce(justification, '') ~* '(Sigilos|11144477735)'), 'nenhum CPF, CNH, nome, telefone, e-mail ou observação nos eventos');
select ok(not exists (select 1 from public.audit_logs where metadata::text ~* '(11144477735|52998224725|12345678900|Sigilos|ana\.sigilosa|11987654321|11911112222|11933334444|privada|Condutor)'), 'nenhum dado pessoal na auditoria');
select ok(not exists (select 1 from public.audit_logs where action like 'customer.%' and metadata::text ~ '(111\.444|11222333)'), 'nenhum documento formatado na auditoria de cliente');

-- Atomicidade: se a auditoria falha, o evento e a alteração não ficam.
create function pg_temp.refuse_audit() returns trigger language plpgsql as $$
begin
  if new.action = 'vehicle.status_change' then raise exception 'falha injetada na auditoria'; end if;
  return new;
end $$;
create trigger refuse_audit before insert on public.audit_logs for each row execute function pg_temp.refuse_audit();
do $$
begin
  begin
    perform public.change_vehicle_status('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-0000000700a2', '20000000-0000-0000-0000-00000000000a',
      (select (v->>'vehicle_id')::uuid from r where k = 'veh'), 2, 'available', null);
  exception when others then
    null;
  end;
end $$;
select is((select status from public.vehicles where id = (select (v->>'vehicle_id')::uuid from r where k = 'veh')), 'maintenance', 'falha na auditoria: a situação do veículo não mudou');
select is((select count(*)::int from public.registry_events where event_type = 'vehicle_status_changed'), 1, 'falha na auditoria: nenhum evento novo ficou');
drop trigger refuse_audit on public.audit_logs;

select * from finish();
rollback;

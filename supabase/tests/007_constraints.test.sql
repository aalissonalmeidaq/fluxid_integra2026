begin;
select plan(74);

-- Spec 007: restrições do data-model.md, uma a uma (RF-001 a RF-028, CA-016). Hermético: desfeito pelo rollback.
-- Todos os documentos são fictícios.

create function pg_temp.fails(p_sql text, p_state text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return sqlstate = p_state;
end $$;

create function pg_temp.works(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return true;
exception when others then
  return false;
end $$;

-- Massa base válida: Tenant A (cliente jurídico, cliente físico, contato, unidade, geocercas, veículo, motorista e evento) e Tenant B.
insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values
  ('81000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'legal', '11222333000181', 'Hospital Alfa Ltda', 'hospital'),
  ('81000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', 'individual', '***.***.***-25', 'Pessoa Física Teste', 'laboratory'),
  ('81000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'legal', '11222333000181', 'Hospital Beta Ltda', 'hospital');
update public.customers set segment = 'other', segment_detail = 'Consultório' where id = '81000000-0000-0000-0000-000000000002';
insert into public.customer_documents (customer_id, organization_id, kind, document_key) values
  ('81000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'cnpj', '11222333000181'),
  ('81000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', 'cpf', '52998224725'),
  ('81000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'cnpj', '11222333000181');
insert into public.customer_contacts (id, organization_id, customer_id, name, is_primary, position) values
  ('83000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-000000000001', 'Contato Principal', true, 0);
insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state) values
  ('82000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-000000000001',
   'Unidade Central', '01001000', 'Praça da Sé', '100', 'São Paulo', 'SP');
insert into public.geofences (id, organization_id, site_id, name, shape, center, radius_m, area) values
  ('84000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '82000000-0000-0000-0000-000000000001',
   'Entrada', 'circle', extensions.st_point(-46.633, -23.55)::extensions.geography, 200,
   extensions.st_buffer(extensions.st_point(-46.633, -23.55)::extensions.geography, 210)::extensions.geography);
insert into public.geofences (id, organization_id, site_id, name, shape, vertices, area) values
  ('84000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000a', '82000000-0000-0000-0000-000000000001',
   'Pátio', 'polygon', '[{"lat":-23.55,"lng":-46.63},{"lat":-23.55,"lng":-46.62},{"lat":-23.54,"lng":-46.62}]'::jsonb,
   extensions.st_geogfromtext('POLYGON((-46.63 -23.55,-46.62 -23.55,-46.62 -23.54,-46.63 -23.55))'));
insert into public.vehicles (id, organization_id, plate, vehicle_type, capacity_cylinders) values
  ('85000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'ABC1234', 'truck', 40),
  ('85000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', 'ABC1234', 'van', 20);
insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until, linked_user_id) values
  ('86000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'Motorista Teste', '***.***.***-25', '********900', 'D',
   current_date + 365, '10000000-0000-0000-0000-000000000002');
insert into public.driver_documents (driver_id, organization_id, cpf, cnh_number) values
  ('86000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', '52998224725', '12345678900');
insert into public.registry_events (id, organization_id, entity_type, entity_id, sequence, event_type, actor_user_id) values
  ('87000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a', 'customer', '81000000-0000-0000-0000-000000000001', 1,
   'customer_created', '10000000-0000-0000-0000-000000000002');

-- ---------- customers
select ok(pg_temp.fails('insert into public.customers (organization_id, person_type, document_display, legal_name, segment) values (''20000000-0000-0000-0000-00000000000a'', ''x'', ''x'', ''Cliente Inválido'', ''hospital'')', '23514'), 'person_type só aceita legal ou individual');
select ok(pg_temp.fails('update public.customers set person_type = ''individual'' where id = ''81000000-0000-0000-0000-000000000001''', 'P0001'), 'person_type é imutável depois do cadastro');
select ok(pg_temp.fails('update public.customers set legal_name = ''A'' where id = ''81000000-0000-0000-0000-000000000001''', '23514'), 'razão social com menos de 2 caracteres é recusada');
select ok(pg_temp.fails('update public.customers set legal_name = repeat(''x'', 161) where id = ''81000000-0000-0000-0000-000000000001''', '23514'), 'razão social com mais de 160 caracteres é recusada');
select ok(pg_temp.fails('update public.customers set trade_name = repeat(''x'', 161) where id = ''81000000-0000-0000-0000-000000000001''', '23514'), 'nome fantasia com mais de 160 caracteres é recusado');
select ok(pg_temp.fails('update public.customers set segment = ''x'' where id = ''81000000-0000-0000-0000-000000000001''', '23514'), 'segmento fora da lista é recusado');
select ok(pg_temp.fails('update public.customers set segment = ''other'', segment_detail = null where id = ''81000000-0000-0000-0000-000000000001''', '23514'), 'segmento "outro" exige detalhe');
select ok(pg_temp.fails('update public.customers set segment_detail = ''x'' where id = ''81000000-0000-0000-0000-000000000001''', '23514'), 'segmento diferente de "outro" não aceita detalhe');
select ok(pg_temp.fails('update public.customers set segment_detail = repeat(''x'', 61) where id = ''81000000-0000-0000-0000-000000000002''', '23514'), 'detalhe do segmento com mais de 60 caracteres é recusado');
select ok(pg_temp.fails('update public.customers set notes = repeat(''x'', 501) where id = ''81000000-0000-0000-0000-000000000001''', '23514'), 'observações com mais de 500 caracteres são recusadas');
select ok(pg_temp.fails('update public.customers set status = ''x'' where id = ''81000000-0000-0000-0000-000000000001''', '23514'), 'situação fora de active e inactive é recusada');
select ok(pg_temp.fails('update public.customers set status = ''inactive'' where id = ''81000000-0000-0000-0000-000000000001''', '23514'), 'cliente inativo exige a data de inativação');
select ok(pg_temp.fails('update public.customers set status = ''inactive'', inactivated_at = now(), inactivated_by = ''10000000-0000-0000-0000-000000000002'', anonymized_at = now(), anonymized_by = ''10000000-0000-0000-0000-000000000002'' where id = ''81000000-0000-0000-0000-000000000001''', '23514'), 'só cliente pessoa física pode ser anonimizado');

-- ---------- customer_documents
select ok(pg_temp.fails('update public.customer_documents set kind = ''x'' where customer_id = ''81000000-0000-0000-0000-000000000001''', '23514'), 'tipo de documento só aceita cnpj ou cpf');
select ok(pg_temp.fails('update public.customer_documents set document_key = ''123'' where customer_id = ''81000000-0000-0000-0000-000000000001''', '23514'), 'CNPJ com formato inválido é recusado');
select ok(pg_temp.fails('update public.customer_documents set document_key = ''123'' where customer_id = ''81000000-0000-0000-0000-000000000002''', '23514'), 'CPF com formato inválido é recusado');
select ok(pg_temp.fails('update public.customer_documents set document_key = null where customer_id = ''81000000-0000-0000-0000-000000000001''', '23514'), 'documento nulo só com a marca de anonimização na própria linha');
select ok(pg_temp.fails('update public.customer_documents set anonymized_at = now() where customer_id = ''81000000-0000-0000-0000-000000000001''', '23514'), 'marca de anonimização sem anular o documento é recusada');
select ok(pg_temp.fails('insert into public.customers (id, organization_id, person_type, document_display, legal_name, segment) values (''81000000-0000-0000-0000-000000000003'', ''20000000-0000-0000-0000-00000000000a'', ''legal'', ''x'', ''Cliente Três'', ''hospital'');'
     || 'insert into public.customer_documents (customer_id, organization_id, kind, document_key) values (''81000000-0000-0000-0000-000000000003'', ''20000000-0000-0000-0000-00000000000a'', ''cnpj'', ''11222333000181'')', '23505'),
  'o documento do cliente é único por organização');
select ok(pg_temp.works('select 1 from public.customer_documents where organization_id = ''20000000-0000-0000-0000-00000000000b'' and document_key = ''11222333000181'''), 'o mesmo CNPJ existe no Tenant B sem conflito');

-- ---------- customer_contacts
select ok(pg_temp.fails('update public.customer_contacts set name = ''A'' where id = ''83000000-0000-0000-0000-000000000001''', '23514'), 'nome do contato com menos de 2 caracteres é recusado');
select ok(pg_temp.fails('update public.customer_contacts set role = repeat(''x'', 81) where id = ''83000000-0000-0000-0000-000000000001''', '23514'), 'função do contato com mais de 80 caracteres é recusada');
select ok(pg_temp.fails('update public.customer_contacts set phone = ''123'' where id = ''83000000-0000-0000-0000-000000000001''', '23514'), 'telefone fora de 10 ou 11 dígitos é recusado');
select ok(pg_temp.fails('update public.customer_contacts set email = ''Maiusculo@exemplo.com'' where id = ''83000000-0000-0000-0000-000000000001''', '23514'), 'e-mail deve estar em minúsculas');
select ok(pg_temp.fails('update public.customer_contacts set email = ''sem-arroba'' where id = ''83000000-0000-0000-0000-000000000001''', '23514'), 'e-mail sem formato válido é recusado');
select ok(pg_temp.fails('insert into public.customer_contacts (organization_id, customer_id, name, is_primary, position) values (''20000000-0000-0000-0000-00000000000a'', ''81000000-0000-0000-0000-000000000001'', ''Segundo Principal'', true, 1)', '23505'), 'no máximo um contato principal por cliente');

-- ---------- customer_sites
select ok(pg_temp.fails('update public.customer_sites set name = ''A'' where id = ''82000000-0000-0000-0000-000000000001''', '23514'), 'nome da unidade com menos de 2 caracteres é recusado');
select ok(pg_temp.fails('update public.customer_sites set postal_code = ''1234567'' where id = ''82000000-0000-0000-0000-000000000001''', '23514'), 'CEP precisa de 8 dígitos');
select ok(pg_temp.fails('update public.customer_sites set state = ''XX'' where id = ''82000000-0000-0000-0000-000000000001''', '23514'), 'UF fora das 27 é recusada');
select ok(pg_temp.fails('update public.customer_sites set ibge_code = ''123'' where id = ''82000000-0000-0000-0000-000000000001''', '23514'), 'código IBGE precisa de 7 dígitos');
select ok(pg_temp.fails('update public.customer_sites set latitude = 10 where id = ''82000000-0000-0000-0000-000000000001''', '23514'), 'latitude e longitude são informadas juntas');
select ok(pg_temp.fails('update public.customer_sites set latitude = 91, longitude = 10 where id = ''82000000-0000-0000-0000-000000000001''', '23514'), 'latitude fora de -90..90 é recusada');
select ok(pg_temp.fails('update public.customer_sites set latitude = 10, longitude = 181 where id = ''82000000-0000-0000-0000-000000000001''', '23514'), 'longitude fora de -180..180 é recusada');
select ok(pg_temp.fails('update public.customer_sites set receiving_days = ''{7}'' where id = ''82000000-0000-0000-0000-000000000001''', '23514'), 'dia da semana fora de 0 a 6 é recusado');
select ok(pg_temp.fails('update public.customer_sites set receiving_days = ''{1,1}'' where id = ''82000000-0000-0000-0000-000000000001''', '23514'), 'dias da semana repetidos são recusados');
select ok(pg_temp.fails('update public.customer_sites set receiving_days = ''{1}'', receiving_from = ''10:00'', receiving_to = ''09:00'' where id = ''82000000-0000-0000-0000-000000000001''', '23514'), 'horário final deve ser depois do inicial');
select ok(pg_temp.fails('update public.customer_sites set receiving_from = ''08:00'', receiving_to = ''17:00'' where id = ''82000000-0000-0000-0000-000000000001''', '23514'), 'horário de recebimento exige ao menos um dia marcado');
select ok(pg_temp.fails('update public.customer_sites set access_instructions = repeat(''x'', 501) where id = ''82000000-0000-0000-0000-000000000001''', '23514'), 'instruções de acesso com mais de 500 caracteres são recusadas');
select ok(pg_temp.fails('insert into public.customer_sites (organization_id, customer_id, name, postal_code, street, number, city, state) values (''20000000-0000-0000-0000-00000000000a'', ''81000000-0000-0000-0000-000000000001'', ''  unidade central '', ''01001000'', ''Rua'', ''1'', ''São Paulo'', ''SP'')', '23505'), 'nome da unidade é único no cliente sem diferenciar caixa nem espaços');

-- ---------- geofences
select ok(pg_temp.fails('update public.geofences set name = ''A'' where id = ''84000000-0000-0000-0000-000000000001''', '23514'), 'nome da geocerca com menos de 2 caracteres é recusado');
select ok(pg_temp.fails('update public.geofences set shape = ''x'' where id = ''84000000-0000-0000-0000-000000000001''', '23514'), 'forma só aceita círculo ou polígono');
select ok(pg_temp.fails('update public.geofences set radius_m = 24 where id = ''84000000-0000-0000-0000-000000000001''', '23514'), 'raio de 24 m é recusado');
select ok(pg_temp.works('update public.geofences set radius_m = 25 where id = ''84000000-0000-0000-0000-000000000001'''), 'raio de 25 m é aceito');
select ok(pg_temp.works('update public.geofences set radius_m = 5000 where id = ''84000000-0000-0000-0000-000000000001'''), 'raio de 5000 m é aceito');
select ok(pg_temp.fails('update public.geofences set radius_m = 5001 where id = ''84000000-0000-0000-0000-000000000001''', '23514'), 'raio de 5001 m é recusado');
select ok(pg_temp.fails('update public.geofences set vertices = ''[{"lat":1,"lng":1}]''::jsonb where id = ''84000000-0000-0000-0000-000000000001''', '23514'), 'círculo não aceita vértices');
select ok(pg_temp.fails('update public.geofences set center = extensions.st_point(-46.6, -23.5)::extensions.geography, radius_m = 100 where id = ''84000000-0000-0000-0000-000000000002''', '23514'), 'polígono não aceita centro e raio');
select ok(pg_temp.fails('update public.geofences set vertices = ''[{"lat":1,"lng":1},{"lat":2,"lng":2}]''::jsonb where id = ''84000000-0000-0000-0000-000000000002''', '23514'), 'polígono com 2 vértices é recusado');
select ok(pg_temp.fails('update public.geofences set vertices = (select jsonb_agg(jsonb_build_object(''lat'', 1, ''lng'', g)) from generate_series(1, 101) g) where id = ''84000000-0000-0000-0000-000000000002''', '23514'), 'polígono com 101 vértices é recusado');
select ok(pg_temp.fails('insert into public.geofences (organization_id, site_id, name, shape, center, radius_m, area) values (''20000000-0000-0000-0000-00000000000a'', ''82000000-0000-0000-0000-000000000001'', '' ENTRADA '', ''circle'', extensions.st_point(-46.6, -23.5)::extensions.geography, 100, extensions.st_buffer(extensions.st_point(-46.6, -23.5)::extensions.geography, 110)::extensions.geography)', '23505'), 'nome da geocerca é único na unidade sem diferenciar caixa nem espaços');

-- ---------- vehicles
select ok(pg_temp.fails('update public.vehicles set plate = ''AB12345'' where id = ''85000000-0000-0000-0000-000000000001''', '23514'), 'placa fora dos dois padrões é recusada');
select ok(pg_temp.works('update public.vehicles set plate = ''ABC1D23'' where id = ''85000000-0000-0000-0000-000000000001'''), 'placa Mercosul é aceita');
select ok(pg_temp.fails('update public.vehicles set vehicle_type = ''x'' where id = ''85000000-0000-0000-0000-000000000001''', '23514'), 'tipo de veículo fora da lista é recusado');
select ok(pg_temp.fails('update public.vehicles set vehicle_type = ''other'' where id = ''85000000-0000-0000-0000-000000000001''', '23514'), 'tipo "outro" exige detalhe');
select ok(pg_temp.fails('update public.vehicles set manufacture_year = 1979 where id = ''85000000-0000-0000-0000-000000000001''', '23514'), 'ano de fabricação anterior a 1980 é recusado');
select ok(pg_temp.fails('update public.vehicles set manufacture_year = extract(year from now())::int + 2 where id = ''85000000-0000-0000-0000-000000000001''', '23514'), 'ano de fabricação além do ano seguinte ao atual é recusado');
select ok(pg_temp.fails('update public.vehicles set capacity_cylinders = 0 where id = ''85000000-0000-0000-0000-000000000001''', '23514'), 'capacidade zero é recusada');
select ok(pg_temp.fails('update public.vehicles set capacity_cylinders = 10000 where id = ''85000000-0000-0000-0000-000000000001''', '23514'), 'capacidade acima de 9999 é recusada');
select ok(pg_temp.fails('update public.vehicles set max_load_kg = 0 where id = ''85000000-0000-0000-0000-000000000001''', '23514'), 'carga máxima deve ser maior que zero');
select ok(pg_temp.fails('update public.vehicles set status = ''inactive'' where id = ''85000000-0000-0000-0000-000000000001''', '23514'), 'veículo inativo exige a data de inativação');
select ok(pg_temp.fails('insert into public.vehicles (organization_id, plate, vehicle_type, capacity_cylinders) values (''20000000-0000-0000-0000-00000000000a'', ''ABC1D23'', ''van'', 10)', '23505'), 'a placa é única na organização');

-- ---------- drivers e driver_documents
select ok(pg_temp.fails('update public.drivers set full_name = ''A'' where id = ''86000000-0000-0000-0000-000000000001''', '23514'), 'nome do motorista com menos de 2 caracteres é recusado');
select ok(pg_temp.fails('update public.drivers set phone = ''123'' where id = ''86000000-0000-0000-0000-000000000001''', '23514'), 'telefone do motorista fora de 10 ou 11 dígitos é recusado');
select ok(pg_temp.fails('update public.drivers set cnh_category = ''Z'' where id = ''86000000-0000-0000-0000-000000000001''', '23514'), 'categoria da CNH fora da lista é recusada');
select ok(pg_temp.fails('insert into public.drivers (organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until, linked_user_id) values (''20000000-0000-0000-0000-00000000000a'', ''Outro Motorista'', ''x'', ''x'', ''B'', current_date + 10, ''10000000-0000-0000-0000-000000000002'')', '23505'), 'um usuário só se vincula a um motorista por organização');
select ok(pg_temp.fails('update public.driver_documents set cpf = ''123'' where driver_id = ''86000000-0000-0000-0000-000000000001''', '23514'), 'CPF do motorista com formato inválido é recusado');
select ok(pg_temp.fails('update public.driver_documents set cnh_number = ''123'' where driver_id = ''86000000-0000-0000-0000-000000000001''', '23514'), 'número da CNH com formato inválido é recusado');
select ok(pg_temp.fails('update public.driver_documents set cpf = null where driver_id = ''86000000-0000-0000-0000-000000000001''', '23514'), 'CPF nulo só com a marca de anonimização na própria linha');
select ok(pg_temp.fails('update public.driver_documents set anonymized_at = now() where driver_id = ''86000000-0000-0000-0000-000000000001''', '23514'), 'marca de anonimização sem anular CPF e CNH é recusada');
select ok(pg_temp.fails('insert into public.drivers (id, organization_id, full_name, cpf_display, cnh_display, cnh_category, cnh_valid_until) values (''86000000-0000-0000-0000-000000000002'', ''20000000-0000-0000-0000-00000000000a'', ''Segundo Motorista'', ''x'', ''x'', ''B'', current_date + 10);'
  || 'insert into public.driver_documents (driver_id, organization_id, cpf, cnh_number) values (''86000000-0000-0000-0000-000000000002'', ''20000000-0000-0000-0000-00000000000a'', ''52998224725'', ''98765432109'')', '23505'),
  'o CPF do motorista é único na organização');

-- ---------- registry_events
select ok(pg_temp.fails('insert into public.registry_events (organization_id, entity_type, entity_id, sequence, event_type, actor_user_id) values (''20000000-0000-0000-0000-00000000000a'', ''x'', gen_random_uuid(), 1, ''customer_created'', ''10000000-0000-0000-0000-000000000002'')', '23514'), 'entity_type fora da lista é recusado');
select ok(pg_temp.fails('insert into public.registry_events (organization_id, entity_type, entity_id, sequence, event_type, actor_user_id) values (''20000000-0000-0000-0000-00000000000a'', ''customer'', ''81000000-0000-0000-0000-000000000001'', 1, ''customer_updated'', ''10000000-0000-0000-0000-000000000002'')', '23505'), 'a sequência é única por entidade');
select ok(pg_temp.fails('insert into public.registry_events (organization_id, entity_type, entity_id, sequence, event_type, actor_user_id) values (''20000000-0000-0000-0000-00000000000a'', ''customer'', gen_random_uuid(), 1, ''tipo_inexistente'', ''10000000-0000-0000-0000-000000000002'')', '23514'), 'tipo de evento fora do vocabulário é recusado');
select ok(pg_temp.fails('insert into public.registry_events (organization_id, entity_type, entity_id, sequence, event_type, actor_user_id, data) values (''20000000-0000-0000-0000-00000000000a'', ''customer'', gen_random_uuid(), 1, ''customer_created'', ''10000000-0000-0000-0000-000000000002'', ''{"token":"x"}''::jsonb)', '23514'), 'dados do evento não aceitam chaves sensíveis');

select * from finish();
rollback;

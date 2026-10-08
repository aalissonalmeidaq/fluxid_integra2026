-- Massa de volume da Spec 007 (RNF-001 a RNF-003): no Tenant F, 10 mil clientes, 50 mil unidades, 50 mil geocercas, 5 mil veículos
-- e 5 mil motoristas, com situações variadas. Os documentos têm o formato certo, mas são fictícios (sequências numéricas) e não
-- passam pelos dígitos verificadores: a massa entra por inserção privilegiada, nunca pelas funções do aplicativo.
-- Somente para ambiente local de teste. Um único bloco DO: `supabase db query --file` executa um comando por vez.
do $$
begin
  -- Clientes jurídicos (documento de 14 dígitos fictício) e o documento em tabela própria.
  insert into public.customers (id, organization_id, person_type, document_display, legal_name, trade_name, segment, segment_detail, status, inactivated_at)
  select ('81000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000f', 'legal', lpad(n::text, 14, '0'),
         'Cliente Volume ' || lpad(n::text, 5, '0'), 'Volume ' || n,
         (array['hospital', 'clinic', 'laboratory', 'industry', 'distributor', 'other'])[1 + n % 6],
         case when n % 6 = 5 then 'Segmento volume' end,
         case when n % 25 = 0 then 'inactive' else 'active' end, case when n % 25 = 0 then now() end
    from generate_series(1, 10000) n;
  insert into public.customer_documents (customer_id, organization_id, kind, document_key)
  select c.id, c.organization_id, 'cnpj', c.document_display
    from public.customers c where c.organization_id = '20000000-0000-0000-0000-00000000000f';

  -- Unidades: 5 por cliente, em cidades variadas.
  insert into public.customer_sites (id, organization_id, customer_id, name, postal_code, street, number, city, state, status, inactivated_at)
  select ('82000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000f',
         ('81000000-0000-0000-0000-' || lpad(to_hex(1 + (n - 1) / 5), 12, '0'))::uuid, 'Unidade Volume ' || lpad(n::text, 6, '0'),
         lpad((1000000 + n)::text, 8, '0'), 'Rua Volume ' || n, (n % 900 + 1)::text,
         (array['São Paulo', 'Campinas', 'Santos', 'Sorocaba', 'Osasco', 'Guarulhos', 'Barueri'])[1 + n % 7], 'SP',
         case when ((n - 1) / 5 + 1) % 25 = 0 then 'inactive' else 'active' end, case when ((n - 1) / 5 + 1) % 25 = 0 then now() end
    from generate_series(1, 50000) n;

  -- Geocercas: um círculo por unidade, espalhado numa grade para o índice espacial ter o que filtrar. A área é o círculo
  -- circunscrito (raio com folga), como as funções do servidor a calculam.
  insert into public.geofences (organization_id, site_id, name, shape, center, radius_m, area, status, inactivated_at)
  select '20000000-0000-0000-0000-00000000000f', s.id, 'Geocerca ' || right(s.name, 6), 'circle', g.center, g.radius,
         extensions.st_buffer(g.center, g.radius * 1.1)::extensions.geography, s.status, s.inactivated_at
    from public.customer_sites s
    cross join lateral (
      select extensions.st_point(-46.9 + ((right(s.name, 6))::int % 250) * 0.002, -23.8 + ((right(s.name, 6))::int / 250) * 0.002)::extensions.geography as center,
             100 + ((right(s.name, 6))::int % 20) * 10 as radius) g
   where s.organization_id = '20000000-0000-0000-0000-00000000000f';

  -- Veículos: placas VOL0001 a VOL5000, situações e licenciamentos variados.
  insert into public.vehicles (organization_id, plate, vehicle_type, brand, model, capacity_cylinders, licensing_due_on, status, inactivated_at)
  select '20000000-0000-0000-0000-00000000000f', 'VOL' || lpad(n::text, 4, '0'), (array['truck', 'van', 'utility'])[1 + n % 3], 'Marca Volume', 'Modelo ' || n % 40,
         10 + n % 90, case n % 5 when 0 then null when 1 then current_date - 20 when 2 then current_date + 10 else current_date + 200 end,
         case when n % 20 = 0 then 'inactive' when n % 7 = 0 then 'maintenance' else 'available' end, case when n % 20 = 0 then now() end
    from generate_series(1, 5000) n;

  -- Motoristas: documentos fictícios em tabela própria; CNH vencida, a vencer e em dia.
  insert into public.drivers (id, organization_id, full_name, phone, cpf_display, cnh_display, cnh_category, cnh_valid_until, status, inactivated_at)
  select ('86000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, '20000000-0000-0000-0000-00000000000f', 'Motorista Volume ' || lpad(n::text, 5, '0'),
         '119' || lpad(n::text, 8, '0'), '***.***.***-' || lpad((n % 100)::text, 2, '0'), '********' || lpad((n % 1000)::text, 3, '0'),
         (array['B', 'C', 'D', 'E', 'AB', 'AC'])[1 + n % 6],
         case n % 4 when 0 then current_date - 30 when 1 then current_date + 15 else current_date + 400 end,
         case when n % 20 = 0 then 'inactive' else 'active' end, case when n % 20 = 0 then now() end
    from generate_series(1, 5000) n;
  insert into public.driver_documents (driver_id, organization_id, cpf, cnh_number)
  select d.id, d.organization_id, lpad(((right(d.full_name, 5))::int)::text, 11, '0'), lpad(((right(d.full_name, 5))::int + 10000)::text, 11, '0')
    from public.drivers d where d.organization_id = '20000000-0000-0000-0000-00000000000f';

  analyze public.customers;
  analyze public.customer_sites;
  analyze public.geofences;
  analyze public.vehicles;
  analyze public.drivers;
end $$;

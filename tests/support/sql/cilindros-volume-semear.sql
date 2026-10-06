-- Massa de volume da Spec 006 (RNF-001, RNF-002): 50 mil cilindros no Tenant F, cada um com um identificador ativo, com
-- cilindros ativos e inativos, dentro e fora do estoque e com todas as situações do teste. Somente para ambiente local de teste.
-- Um único bloco DO: `supabase db query --file` executa um comando por vez.
do $$
begin
  insert into public.cylinder_types (id, organization_id, gas, capacity_value, capacity_unit, classification)
  values ('71000000-0000-0000-0000-0000000f0001', '20000000-0000-0000-0000-00000000000f', 'Volume', 10, 'l', 'industrial');

  insert into public.cylinders (organization_id, cylinder_type_id, serial_number, status, inactivation_reason, stock_status, hydro_last_result, hydro_next_due_on)
  select '20000000-0000-0000-0000-00000000000f', '71000000-0000-0000-0000-0000000f0001', 'VOL-' || lpad(n::text, 6, '0'),
         case when n % 20 = 0 then 'inactive' else 'active' end, case when n % 20 = 0 then 'lost' end,
         case when n % 20 <> 0 and n % 4 = 0 then 'in_stock' else 'out_of_stock' end,
         case n % 5 when 0 then null when 1 then 'rejected' else 'approved' end,
         case n % 5 when 2 then current_date + 200 when 3 then current_date + 10 when 4 then current_date - 5 end
    from generate_series(1, 50000) n;

  insert into public.cylinder_identifiers (organization_id, cylinder_id, kind, value)
  select c.organization_id, c.id, 'qr_code', 'QR-VOL-' || substr(c.serial_number, 5)
    from public.cylinders c where c.organization_id = '20000000-0000-0000-0000-00000000000f' and c.serial_number like 'VOL-%';

  analyze public.cylinders;
  analyze public.cylinder_identifiers;
end $$;

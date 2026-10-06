-- Remove a massa de volume da Spec 006 (somente testes). Os gatilhos de imutabilidade e de exclusão valem para todos os papéis,
-- então a limpeza os desliga por tabela (o dono das tabelas pode) dentro de uma única transação e os religa antes de terminar.
-- Um único bloco DO: `supabase db query --file` executa um comando por vez.
do $$
begin
  alter table public.cylinder_events disable trigger user;
  alter table public.cylinder_tests disable trigger user;
  alter table public.cylinder_identifiers disable trigger user;
  alter table public.cylinders disable trigger user;
  alter table public.cylinder_types disable trigger user;
  delete from public.cylinder_events where organization_id = '20000000-0000-0000-0000-00000000000f' and cylinder_id in (select id from public.cylinders where serial_number like 'VOL-%');
  delete from public.cylinder_tests where organization_id = '20000000-0000-0000-0000-00000000000f' and cylinder_id in (select id from public.cylinders where serial_number like 'VOL-%');
  delete from public.cylinder_identifiers where organization_id = '20000000-0000-0000-0000-00000000000f' and value like 'QR-VOL-%';
  delete from public.cylinders where organization_id = '20000000-0000-0000-0000-00000000000f' and serial_number like 'VOL-%';
  delete from public.cylinder_types where id = '71000000-0000-0000-0000-0000000f0001';
  alter table public.cylinder_events enable trigger user;
  alter table public.cylinder_tests enable trigger user;
  alter table public.cylinder_identifiers enable trigger user;
  alter table public.cylinders enable trigger user;
  alter table public.cylinder_types enable trigger user;
end $$;

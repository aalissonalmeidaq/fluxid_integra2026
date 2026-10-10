-- Remove a massa de volume da Spec 008 (somente testes). Os gatilhos de imutabilidade e de exclusão valem para todos os papéis,
-- então a limpeza os desliga por tabela (o dono das tabelas pode) dentro de uma única transação e os religa antes de terminar.
-- Os cilindros próprios da massa (TRV-*) saem junto. Um único bloco DO: `supabase db query --file` executa um comando por vez.
do $$
begin
  alter table public.trip_events disable trigger user;
  alter table public.trip_deliveries disable trigger user;
  alter table public.trip_unlocks disable trigger user;
  alter table public.trip_items disable trigger user;
  alter table public.trip_stops disable trigger user;
  alter table public.trips disable trigger user;
  alter table public.cylinder_events disable trigger user;
  alter table public.cylinders disable trigger user;
  alter table public.cylinder_types disable trigger user;
  delete from public.trip_events where organization_id = '20000000-0000-0000-0000-00000000000f';
  delete from public.trip_deliveries where organization_id = '20000000-0000-0000-0000-00000000000f';
  delete from public.trip_unlocks where organization_id = '20000000-0000-0000-0000-00000000000f';
  delete from public.trip_items where organization_id = '20000000-0000-0000-0000-00000000000f';
  delete from public.trip_stops where organization_id = '20000000-0000-0000-0000-00000000000f';
  delete from public.trips where organization_id = '20000000-0000-0000-0000-00000000000f';
  delete from public.cylinder_events where organization_id = '20000000-0000-0000-0000-00000000000f' and cylinder_id in (select id from public.cylinders where serial_number like 'TRV-%');
  delete from public.cylinders where organization_id = '20000000-0000-0000-0000-00000000000f' and serial_number like 'TRV-%';
  delete from public.cylinder_types where id = '71000000-0000-0000-0000-0000000f0008';
  delete from private.trip_requests where organization_id = '20000000-0000-0000-0000-00000000000f';
  delete from private.trip_counters where organization_id = '20000000-0000-0000-0000-00000000000f';
  alter table public.trip_events enable trigger user;
  alter table public.trip_deliveries enable trigger user;
  alter table public.trip_unlocks enable trigger user;
  alter table public.trip_items enable trigger user;
  alter table public.trip_stops enable trigger user;
  alter table public.trips enable trigger user;
  alter table public.cylinder_events enable trigger user;
  alter table public.cylinders enable trigger user;
  alter table public.cylinder_types enable trigger user;
end $$;

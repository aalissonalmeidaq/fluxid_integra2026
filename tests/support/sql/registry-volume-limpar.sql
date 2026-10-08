-- Remove a massa de volume da Spec 007 (somente testes). Os gatilhos de imutabilidade e de exclusão valem para todos os papéis,
-- então a limpeza os desliga por tabela (o dono das tabelas pode) dentro de uma única transação e os religa antes de terminar.
-- Um único bloco DO: `supabase db query --file` executa um comando por vez.
do $$
begin
  alter table public.registry_events disable trigger user;
  alter table public.customer_documents disable trigger user;
  alter table public.driver_documents disable trigger user;
  alter table public.customer_contacts disable trigger user;
  alter table public.geofences disable trigger user;
  alter table public.customer_sites disable trigger user;
  alter table public.customers disable trigger user;
  alter table public.vehicles disable trigger user;
  alter table public.drivers disable trigger user;
  delete from public.registry_events where organization_id = '20000000-0000-0000-0000-00000000000f';
  delete from public.customer_documents where organization_id = '20000000-0000-0000-0000-00000000000f';
  delete from public.driver_documents where organization_id = '20000000-0000-0000-0000-00000000000f';
  delete from public.customer_contacts where organization_id = '20000000-0000-0000-0000-00000000000f';
  delete from public.geofences where organization_id = '20000000-0000-0000-0000-00000000000f';
  delete from public.customer_sites where organization_id = '20000000-0000-0000-0000-00000000000f';
  delete from public.customers where organization_id = '20000000-0000-0000-0000-00000000000f';
  delete from public.vehicles where organization_id = '20000000-0000-0000-0000-00000000000f';
  delete from public.drivers where organization_id = '20000000-0000-0000-0000-00000000000f';
  alter table public.registry_events enable trigger user;
  alter table public.customer_documents enable trigger user;
  alter table public.driver_documents enable trigger user;
  alter table public.customer_contacts enable trigger user;
  alter table public.geofences enable trigger user;
  alter table public.customer_sites enable trigger user;
  alter table public.customers enable trigger user;
  alter table public.vehicles enable trigger user;
  alter table public.drivers enable trigger user;
end $$;

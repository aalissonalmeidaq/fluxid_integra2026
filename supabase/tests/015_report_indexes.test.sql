begin;
select plan(7);

-- Spec 015 (T104; CS-006): cada fonte de relatório é filtrada por empresa e período. Os índices começam pela empresa (o isolamento por
-- tenant continua no topo) e seguem pela data do recorte, para que anos de histórico não virem leitura da tabela inteira.
select has_index('public', 'seal_alerts', 'seal_alerts_org_opened_idx', array['organization_id', 'opened_at'], 'alertas por empresa e abertura');
select has_index('public', 'proximity_occurrences', 'proximity_occurrences_org_opened_idx', array['organization_id', 'opened_at'],
  'ocorrências por empresa e abertura');
select has_index('public', 'cylinder_events', 'cylinder_events_org_occurred_idx', array['organization_id', 'occurred_at'], 'custódia por empresa e instante');
select has_index('public', 'trip_deliveries', 'trip_deliveries_org_delivered_idx', array['organization_id', 'delivered_at'], 'entregas por empresa e instante');
select has_index('public', 'tracking_sessions', 'tracking_sessions_org_started_idx', array['organization_id', 'started_at'], 'coletas por empresa e início');
select has_index('public', 'trips', 'trips_org_period_idx', 'viagens por empresa e início efetivo');

-- Com o planejador proibido de ler a tabela inteira, o recorte de alertas de um dia usa o índice novo.
set local enable_seqscan = off;
create temporary table plano (linha text);
do $$
declare v_line text;
begin
  for v_line in execute $q$explain select a.id from public.seal_alerts a where a.organization_id = '20000000-0000-0000-0000-00000000000a'
    and a.opened_at between '2026-01-15' and '2026-01-16'$q$ loop
    insert into plano values (v_line);
  end loop;
end $$;
select ok(exists (select 1 from plano where linha like '%seal_alerts_org_opened_idx%'), 'o recorte de alertas usa o índice por empresa e período');

select * from finish();
rollback;

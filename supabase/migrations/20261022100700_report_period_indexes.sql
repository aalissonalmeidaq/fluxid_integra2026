-- Spec 015 (T104; CS-006): índices de período para as fontes dos relatórios. Toda consulta de relatório filtra por empresa e por um
-- intervalo de datas; os índices existentes começavam pela empresa mas seguiam por situação, viagem ou cilindro, e o recorte por período
-- acabava lendo a tabela inteira. A empresa continua na frente: o isolamento por tenant não muda. A expressão do índice de viagens é a
-- mesma do filtro do relatório (início efetivo: partida ou, sem ela, criação).
create index seal_alerts_org_opened_idx on public.seal_alerts (organization_id, opened_at);
create index proximity_occurrences_org_opened_idx on public.proximity_occurrences (organization_id, opened_at);
create index cylinder_events_org_occurred_idx on public.cylinder_events (organization_id, occurred_at);
create index trip_deliveries_org_delivered_idx on public.trip_deliveries (organization_id, delivered_at);
create index tracking_sessions_org_started_idx on public.tracking_sessions (organization_id, started_at);
create index trips_org_period_idx on public.trips (organization_id, (coalesce(started_at, created_at)));

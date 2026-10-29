-- Spec 015 (RF-026; validação humana de 27/10/2026): os critérios do relatório, na tela e no arquivo, saíam como texto técnico
-- ("De 2026-01-01T00:00:00.000Z até ..."; "status = in_progress"). Agora vêm por extenso: período no horário de Brasília, nomes dos
-- filtros em português e situações conhecidas traduzidas. Os identificadores continuam como estão (o filtro guarda só o id).
create or replace function private.report_criteria_text(p_filters jsonb) returns text
language sql stable security definer set search_path = '' as $$
  select 'De ' || to_char((p_filters->>'from')::timestamptz at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
    || ' até ' || to_char((p_filters->>'to')::timestamptz at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ' (horário de Brasília)'
    || coalesce((
      select string_agg('; ' || case k when 'trip_id' then 'viagem' when 'vehicle_id' then 'veículo' when 'driver_id' then 'motorista'
          when 'cylinder_id' then 'cilindro' when 'seal_id' then 'lacre' when 'status' then 'situação' else k end
        || ': ' || case when k = 'status' then (
            select string_agg(case v when 'planned' then 'planejada' when 'loading' then 'em carregamento' when 'in_progress' then 'em andamento'
                when 'completed' then 'concluída' when 'cancelled' then 'cancelada' when 'open' then 'aberta' when 'acknowledged' then 'reconhecida'
                when 'closed' then 'encerrada' when 'historical_only' then 'só histórico' else v end, ', ' order by ord)
              from unnest(string_to_array(p_filters->>k, ',')) with ordinality as s(v, ord))
          else p_filters->>k end, '' order by k)
      from jsonb_object_keys(p_filters) k where k not in ('from', 'to')), '')
$$;

revoke all on function private.report_criteria_text(jsonb) from public, anon, authenticated;

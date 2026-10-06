-- Spec 006: situação do teste hidrostático calculada (RF-020, RF-021). O limite de 30 dias existe só aqui no SQL e só em
-- src/domain/cylinders/hydrostatic-status.ts no TypeScript; tests/contract/cylinders-hydrostatic-limit.test.ts reprova divergência.

create function private.hydrostatic_expiring_days() returns integer
language sql immutable set search_path = '' as $$ select 30 $$;

-- Em dia (mais de 30 dias), a vencer (0 a 30 dias, vale até o fim do dia da data), vencido (data passada), reprovado
-- (último teste reprovado) ou sem teste. `today` é o dia em America/Sao_Paulo.
create function private.hydro_status(
  p_last_result text, p_next_due_on date,
  p_today date default (now() at time zone 'America/Sao_Paulo')::date)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_last_result is null then 'sem_teste'
    when p_last_result = 'rejected' then 'reprovado'
    when p_next_due_on is null then 'sem_teste'
    when p_next_due_on < coalesce(p_today, (now() at time zone 'America/Sao_Paulo')::date) then 'vencido'
    when p_next_due_on - coalesce(p_today, (now() at time zone 'America/Sao_Paulo')::date) <= private.hydrostatic_expiring_days() then 'a_vencer'
    else 'em_dia'
  end
$$;

revoke all on function private.hydrostatic_expiring_days(), private.hydro_status(text, date, date) from public, anon, authenticated;

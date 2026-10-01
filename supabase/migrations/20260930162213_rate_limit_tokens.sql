-- Limite de frequência por finalidade e sujeito, em janela fixa (RS-009). Contadores ficam em schema privado e só
-- a fronteira servidor (service_role) consome; o sujeito é um identificador opaco, nunca dado pessoal em claro.
create table private.rate_limits (
  bucket text not null,
  subject text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, subject, window_start),
  constraint rate_limits_hits_check check (hits >= 0)
);

create index rate_limits_window_idx on private.rate_limits (window_start);

-- Devolve verdadeiro enquanto o sujeito está dentro do limite da janela atual. Cada chamada conta um uso, inclusive as negadas.
create function public.take_rate_limit_token(p_bucket text, p_subject text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  current_window timestamptz;
  used integer;
begin
  if p_limit not between 1 and 1000 or p_window_seconds not between 1 and 86400
     or coalesce(p_bucket, '') = '' or coalesce(p_subject, '') = '' then
    raise exception using errcode = '22023', message = 'invalid_rate_limit';
  end if;

  current_window := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  insert into private.rate_limits (bucket, subject, window_start, hits)
  values (p_bucket, p_subject, current_window, 1)
  on conflict (bucket, subject, window_start) do update set hits = private.rate_limits.hits + 1
  returning hits into used;

  -- Limpeza oportunista: janelas antigas deste sujeito e finalidade já não influenciam nenhuma decisão.
  if used = 1 then
    delete from private.rate_limits
     where bucket = p_bucket and subject = p_subject and window_start < clock_timestamp() - interval '1 day';
  end if;
  return used <= p_limit;
end $$;

revoke all on function public.take_rate_limit_token(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.take_rate_limit_token(text, text, integer, integer) to service_role;

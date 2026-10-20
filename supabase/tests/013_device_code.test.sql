begin;
select plan(5);

-- Spec 013, US1 (T047; research.md, item 1): o código do lacre calculado no firmware (nucleo/Identidade) bate com o mesmo cálculo em SQL:
-- 'DSP-' + base32 Crockford dos 40 primeiros bits do SHA-256 de 'fluxid-lacre:' + MAC em hexadecimal maiúsculo. A função existe só dentro
-- desta transação; os vetores são os de firmware/test/test_identidade. Hermético: rollback.

create function pg_temp.codigo_do_chip(p_mac text) returns text language sql immutable as $$
  with h as (select extensions.digest('fluxid-lacre:' || upper(p_mac), 'sha256') as d),
       v as (select (get_byte(d, 0)::bigint << 32) | (get_byte(d, 1)::bigint << 24) | (get_byte(d, 2)::bigint << 16)
                  | (get_byte(d, 3)::bigint << 8) | get_byte(d, 4)::bigint as n from h)
  select 'DSP-' || string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', 1 + ((n >> (35 - 5 * i)) & 31)::int, 1), '' order by i)
    from v, generate_series(0, 7) i
$$;

select is(pg_temp.codigo_do_chip('A0B1C2D3E4F5'), 'DSP-DFQHFXV2', 'MAC A0B1C2D3E4F5');
select is(pg_temp.codigo_do_chip('000000000000'), 'DSP-QPN7NGVD', 'MAC zerado');
select is(pg_temp.codigo_do_chip('FFFFFFFFFFFF'), 'DSP-SSR8T02G', 'MAC todo em FF');
select is(pg_temp.codigo_do_chip('7c2c67a1b2c3'), 'DSP-CHAB4MXA', 'o MAC entra em maiúsculas');
select ok(pg_temp.codigo_do_chip('A0B1C2D3E4F5') ~ '^DSP-[0-9A-Z]{8}$', 'o código segue a regra de seal_devices e seal_enrollments');

select * from finish();
rollback;

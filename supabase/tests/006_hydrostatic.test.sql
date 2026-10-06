begin;
select plan(14);

-- Spec 006: situação do teste hidrostático calculada, e não digitada (RF-020, RF-021, CA-008).
-- A mesma tabela de casos existe em src/domain/cylinders/hydrostatic-status.test.ts.
select is(private.hydrostatic_expiring_days(), 30, 'o limite de "a vencer" é de 30 dias');

select is(private.hydro_status(null, null, date '2026-10-05'), 'sem_teste', 'sem teste');
select is(private.hydro_status('rejected', null, date '2026-10-05'), 'reprovado', 'reprovado');
select is(private.hydro_status('rejected', date '2030-01-01', date '2026-10-05'), 'reprovado', 'reprovado vale mesmo com data futura');
select is(private.hydro_status('approved', date '2026-10-04', date '2026-10-05'), 'vencido', 'ontem: vencido');
select is(private.hydro_status('approved', date '2025-01-01', date '2026-10-05'), 'vencido', 'muito antigo: vencido');
select is(private.hydro_status('approved', date '2026-10-05', date '2026-10-05'), 'a_vencer', 'hoje: ainda a vencer (vale até o fim do dia)');
select is(private.hydro_status('approved', date '2026-10-06', date '2026-10-05'), 'a_vencer', '1 dia: a vencer');
select is(private.hydro_status('approved', date '2026-11-04', date '2026-10-05'), 'a_vencer', '30 dias: a vencer');
select is(private.hydro_status('approved', date '2026-11-05', date '2026-10-05'), 'em_dia', '31 dias: em dia');
select is(private.hydro_status('approved', date '2027-04-05', date '2026-10-05'), 'em_dia', '6 meses: em dia');
select is(private.hydro_status('approved', date '2026-10-25', date '2026-10-05'), 'a_vencer', '20 dias: a vencer');

-- A data de hoje padrão vem de America/Sao_Paulo.
select is(private.hydro_status('approved', (now() at time zone 'America/Sao_Paulo')::date, null), 'a_vencer', 'hoje padrão de São Paulo: a vencer');
select is(private.hydro_status('approved', (now() at time zone 'America/Sao_Paulo')::date - 1), 'vencido', 'o padrão sem terceiro argumento usa o dia de São Paulo');

select * from finish(); rollback;

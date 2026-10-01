begin;
select plan(6);
select has_table('public', 'profiles', 'profiles existe');
select has_pk('public', 'profiles', 'profiles possui PK');
select has_fk('public', 'profiles', 'profiles possui FK');
select col_default_is('public', 'profiles', 'locale', 'pt-BR', 'locale padrão');
select has_check('public', 'profiles', 'profiles_display_name_check');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name in ('role','permission','organization_id')), 'perfil sem autorização');
select * from finish(); rollback;

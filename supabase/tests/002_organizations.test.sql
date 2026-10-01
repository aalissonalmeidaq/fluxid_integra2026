begin;
select plan(6);
select has_table('public', 'organizations', 'organizations existe');
select col_not_null('public', 'organizations', 'legal_name', 'legal_name obrigatório');
select col_not_null('public', 'organizations', 'display_name', 'display_name obrigatório');
select col_default_is('public', 'organizations', 'version', '1', 'version inicia em 1');
select has_check('public', 'organizations', 'organizations_kind_check');
select has_index('public', 'organizations', 'organizations_single_owner_idx', 'owner única');
select * from finish(); rollback;

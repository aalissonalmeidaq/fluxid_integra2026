begin;
select plan(6);
select has_table('public', 'memberships', 'memberships existe');
select has_fk('public', 'memberships', 'memberships possui FK');
select col_not_null('public', 'memberships', 'organization_id', 'organization_id obrigatório');
select has_unique('public', 'memberships', 'memberships_organization_user_key');
select has_check('public', 'memberships', 'memberships_status_check');
select has_function('private', 'ensure_tenant_admin_remains', array['uuid','uuid']);
select * from finish(); rollback;

begin;
select plan(6);
select has_table('public', 'invitations', 'invitations existe');
select has_fk('public', 'invitations', 'invitations possui FK');
select has_check('public', 'invitations', 'invitations_status_check');
select has_check('public', 'invitations', 'invitations_expiry_check');
select has_index('public', 'invitations', 'invitations_one_usable_idx', 'convite utilizável único');
select has_function('private', 'validate_invitation_role', array[]::text[]);
select * from finish(); rollback;

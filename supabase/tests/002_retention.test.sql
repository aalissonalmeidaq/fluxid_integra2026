begin;
select plan(41);

-- Massa: usuários inativos há muito tempo, ativo, recente, sob retenção legal e sem vínculo.
insert into auth.users (id, aud, role, email, raw_user_meta_data, last_sign_in_at) values
  ('10000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'inativo-antigo@example.invalid', '{"nome":"Pessoa Antiga"}', now() - interval '4 years'),
  ('10000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'ativo-antigo@example.invalid', '{}', now() - interval '4 years'),
  ('10000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 'inativo-recente@example.invalid', '{}', now() - interval '1 year'),
  ('10000000-0000-0000-0000-0000000000e4', 'authenticated', 'authenticated', 'inativo-hold@example.invalid', '{}', now() - interval '4 years'),
  ('10000000-0000-0000-0000-0000000000e5', 'authenticated', 'authenticated', 'sem-vinculo@example.invalid', '{}', now() - interval '5 years');
insert into auth.identities (provider_id, user_id, identity_data, provider) values
  ('inativo-antigo@example.invalid', '10000000-0000-0000-0000-0000000000e1', '{"email":"inativo-antigo@example.invalid","sub":"10000000-0000-0000-0000-0000000000e1"}', 'email');
insert into public.profiles (user_id, display_name, avatar_path) values
  ('10000000-0000-0000-0000-0000000000e1', 'Pessoa Antiga', '10000000-0000-0000-0000-0000000000e1/90000000-0000-0000-0000-0000000000e1.png'),
  ('10000000-0000-0000-0000-0000000000e2', 'Pessoa Ativa', null),
  ('10000000-0000-0000-0000-0000000000e3', 'Pessoa Recente', null),
  ('10000000-0000-0000-0000-0000000000e4', 'Pessoa Sob Hold', null),
  ('10000000-0000-0000-0000-0000000000e5', 'Pessoa Sem Vínculo', null);
insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000e1', 'active', now() - interval '5 years'),
  ('30000000-0000-0000-0000-0000000000e2', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000e2', 'active', now() - interval '5 years'),
  ('30000000-0000-0000-0000-0000000000e3', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000e3', 'active', now() - interval '3 years'),
  ('30000000-0000-0000-0000-0000000000e4', '20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000e4', 'active', now() - interval '5 years');
-- Vínculos encerrados: e1 e e4 há 3 anos; e3 há 1 ano; e2 permanece ativo.
update public.memberships set status = 'inactive', inactivated_at = now() - interval '3 years', updated_at = now() - interval '3 years'
  where id in ('30000000-0000-0000-0000-0000000000e1', '30000000-0000-0000-0000-0000000000e4');
update public.memberships set status = 'inactive', inactivated_at = now() - interval '1 year', updated_at = now() - interval '1 year'
  where id = '30000000-0000-0000-0000-0000000000e3';
update public.profiles set updated_at = now() - interval '3 years'
  where user_id in ('10000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000e4', '10000000-0000-0000-0000-0000000000e5');
update public.profiles set updated_at = now() - interval '1 year' where user_id = '10000000-0000-0000-0000-0000000000e3';

-- Eventos de auditoria: antigos (6 anos), no limite de retenção (4 anos) e de uma pessoa que será anonimizada.
insert into public.audit_logs (organization_id, actor_user_id, action, target_type, target_id, result, occurred_at) values
  ('20000000-0000-0000-0000-00000000000a', null, 'retencao.antigo_a', 'x', 'a1', 'success', now() - interval '6 years'),
  ('20000000-0000-0000-0000-00000000000a', null, 'retencao.recente_a', 'x', 'a2', 'success', now() - interval '4 years'),
  ('20000000-0000-0000-0000-00000000000b', null, 'retencao.antigo_b', 'x', 'b1', 'success', now() - interval '6 years'),
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000e4', 'retencao.antigo_hold', 'x', 'h1', 'success', now() - interval '6 years'),
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000e1', 'retencao.da_pessoa_antiga', 'x', 'p1', 'success', now() - interval '3 years');

-- Convites em vários estados e idades.
insert into public.roles (id, organization_id, code, name, scope, system) values
  ('50000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000a', 'retencao_a', 'Retenção A', 'tenant', false);
insert into public.invitations (id, organization_id, email_normalized, intended_role_id, status, created_by, created_at, expires_at, accepted_at, revoked_at) values
  ('70000000-0000-0000-0000-0000000000e1', '20000000-0000-0000-0000-00000000000a', 'aceito-antigo@example.invalid', '50000000-0000-0000-0000-0000000000e1', 'accepted', '10000000-0000-0000-0000-000000000002', now() - interval '120 days', now() - interval '117 days', now() - interval '100 days', null),
  ('70000000-0000-0000-0000-0000000000e2', '20000000-0000-0000-0000-00000000000a', 'aceito-recente@example.invalid', '50000000-0000-0000-0000-0000000000e1', 'accepted', '10000000-0000-0000-0000-000000000002', now() - interval '40 days', now() - interval '37 days', now() - interval '30 days', null),
  ('70000000-0000-0000-0000-0000000000e3', '20000000-0000-0000-0000-00000000000a', 'revogado-antigo@example.invalid', '50000000-0000-0000-0000-0000000000e1', 'revoked', '10000000-0000-0000-0000-000000000002', now() - interval '110 days', now() - interval '107 days', null, now() - interval '91 days'),
  ('70000000-0000-0000-0000-0000000000e4', '20000000-0000-0000-0000-00000000000a', 'expirado-antigo@example.invalid', '50000000-0000-0000-0000-0000000000e1', 'sent', '10000000-0000-0000-0000-000000000002', now() - interval '110 days', now() - interval '107 days', null, null),
  ('70000000-0000-0000-0000-0000000000e5', '20000000-0000-0000-0000-00000000000a', 'expirado-recente@example.invalid', '50000000-0000-0000-0000-0000000000e1', 'expired', '10000000-0000-0000-0000-000000000002', now() - interval '60 days', now() - interval '57 days', null, null),
  ('70000000-0000-0000-0000-0000000000e6', '20000000-0000-0000-0000-00000000000a', 'vigente@example.invalid', '50000000-0000-0000-0000-0000000000e1', 'sent', '10000000-0000-0000-0000-000000000002', now(), now() + interval '72 hours', null, null);
insert into public.audit_logs (organization_id, action, target_type, target_id, result, occurred_at) values
  ('20000000-0000-0000-0000-00000000000a', 'invitation.send', 'invitation', '70000000-0000-0000-0000-0000000000e1', 'success', now() - interval '120 days');

-- 1-2. Sem a rotina de retenção a auditoria continua imutável, inclusive para eventos antigos.
select throws_ok($$ delete from public.audit_logs where action = 'retencao.antigo_a' $$, null, 'audit_immutable', 'evento antigo não é excluído fora da rotina de retenção');
select throws_ok($$ update public.audit_logs set result = 'failed' where action = 'retencao.antigo_a' $$, null, 'audit_immutable', 'evento antigo não é alterado');

-- 3-5. Retenção legal: global, por organização e por pessoa suspendem o descarte.
select is((public.place_retention_hold('organization', '20000000-0000-0000-0000-00000000000b', null, 'Litígio em andamento envolvendo o tenant', '10000000-0000-0000-0000-000000000001'))->>'kind', 'placed', 'registra retenção legal de uma organização');
select is((public.place_retention_hold('user', null, '10000000-0000-0000-0000-0000000000e4', 'Investigação sobre a conduta da pessoa', '10000000-0000-0000-0000-000000000001'))->>'kind', 'placed', 'registra retenção legal de uma pessoa');
select is((public.place_retention_hold('global', null, null, 'curta', '10000000-0000-0000-0000-000000000001'))->>'kind', 'invalid', 'a justificativa da retenção legal tem tamanho mínimo');

-- 6-12. Descarte da auditoria com mais de cinco anos, respeitando as retenções.
create temp table audit_run on commit drop as select public.purge_expired_audit_logs() as result;
select is((select count(*)::int from public.audit_logs where action = 'retencao.antigo_a'), 0, 'evento com mais de 5 anos é descartado');
select is((select count(*)::int from public.audit_logs where action = 'retencao.recente_a'), 1, 'evento dentro do prazo é preservado');
select is((select count(*)::int from public.audit_logs where action = 'retencao.antigo_b'), 1, 'retenção da organização preserva o evento antigo');
select is((select count(*)::int from public.audit_logs where action = 'retencao.antigo_hold'), 1, 'retenção da pessoa preserva o evento antigo');
select ok((select (result->>'purged')::int >= 1 and (result->>'held')::int >= 2 from audit_run), 'o resultado informa descartados e retidos');
select ok(exists(select 1 from public.audit_logs where action = 'audit.retention.purge' and result = 'success'), 'o descarte é auditado');
select is((select count(*)::int from public.audit_logs where action = 'retencao.da_pessoa_antiga'), 1, 'evento recente de pessoa inativa é preservado');

-- 13-14. Liberar a retenção permite o descarte na execução seguinte.
select is((public.release_retention_hold((select (public.place_retention_hold('global', null, null, 'Retenção temporária de teste', '10000000-0000-0000-0000-000000000001')->>'hold_id')::uuid), '10000000-0000-0000-0000-000000000001'))->>'kind', 'released', 'libera uma retenção legal');
update public.audit_logs set action = action where false;
select public.purge_expired_audit_logs();
select is((select count(*)::int from public.audit_logs where action = 'retencao.antigo_b'), 1, 'a retenção da organização continua valendo após liberar a global');

-- 15-20. Convites terminais são eliminados após 90 dias, sem perder a evidência de auditoria.
create temp table invitation_run on commit drop as select public.purge_terminal_invitations() as result;
select is((select count(*)::int from public.invitations where id = '70000000-0000-0000-0000-0000000000e1'), 0, 'convite aceito há mais de 90 dias é eliminado');
select is((select count(*)::int from public.invitations where id = '70000000-0000-0000-0000-0000000000e3'), 0, 'convite revogado há mais de 90 dias é eliminado');
select is((select count(*)::int from public.invitations where id = '70000000-0000-0000-0000-0000000000e4'), 0, 'convite vencido há mais de 90 dias é eliminado mesmo sem ter mudado de estado');
select is((select count(*)::int from public.invitations where id in ('70000000-0000-0000-0000-0000000000e2', '70000000-0000-0000-0000-0000000000e5', '70000000-0000-0000-0000-0000000000e6')), 3, 'convites recentes e vigentes são preservados');
select is((select (result->>'purged')::int from invitation_run), 3, 'o resultado informa quantos convites foram eliminados');
select is((select count(*)::int from public.audit_logs where target_type = 'invitation' and target_id = '70000000-0000-0000-0000-0000000000e1'), 1, 'a evidência de auditoria do convite eliminado permanece');

-- 21-31. Perfis inativos há mais de dois anos são anonimizados; ativos, recentes e sob retenção, não.
create temp table profile_run on commit drop as select public.anonymize_inactive_profiles() as result;
select is((select display_name from public.profiles where user_id = '10000000-0000-0000-0000-0000000000e1'), 'Usuário anonimizado', 'o nome é substituído');
select ok((select avatar_path is null and anonymized_at is not null from public.profiles where user_id = '10000000-0000-0000-0000-0000000000e1'), 'o avatar é desvinculado e a anonimização é registrada');
select ok((select email like 'anonimizado-%@anonimizado.invalid' and raw_user_meta_data = '{}'::jsonb and banned_until is not null and coalesce(encrypted_password, '') = '' from auth.users where id = '10000000-0000-0000-0000-0000000000e1'), 'e-mail e metadados irreversivelmente não identificáveis, sem possibilidade de entrar');
select is((select count(*)::int from auth.identities where user_id = '10000000-0000-0000-0000-0000000000e1'), 0, 'a identidade com o e-mail original é removida');
select is((select display_name from public.profiles where user_id = '10000000-0000-0000-0000-0000000000e2'), 'Pessoa Ativa', 'vínculo ativo não é anonimizado, mesmo com perfil antigo');
select is((select display_name from public.profiles where user_id = '10000000-0000-0000-0000-0000000000e3'), 'Pessoa Recente', 'inatividade de menos de dois anos não é anonimizada');
select is((select display_name from public.profiles where user_id = '10000000-0000-0000-0000-0000000000e4'), 'Pessoa Sob Hold', 'retenção legal da pessoa suspende a anonimização');
select is((select display_name from public.profiles where user_id = '10000000-0000-0000-0000-0000000000e5'), 'Usuário anonimizado', 'pessoa sem vínculo e inativa há mais de dois anos é anonimizada');
select ok(exists(select 1 from private.storage_cleanup_queue where path = '10000000-0000-0000-0000-0000000000e1/90000000-0000-0000-0000-0000000000e1.png'), 'o objeto do avatar anterior entra na fila de limpeza do armazenamento');
select ok(exists(select 1 from public.memberships where user_id = '10000000-0000-0000-0000-0000000000e1') and exists(select 1 from public.audit_logs where action = 'retencao.da_pessoa_antiga' and actor_user_id = '10000000-0000-0000-0000-0000000000e1'), 'as referências mínimas para integridade e auditoria permanecem');
select is((public.anonymize_inactive_profiles()->>'anonymized')::int, 0, 'a rotina é idempotente');

-- 32-35. Orquestração, agendamento e permissões.
select ok((public.run_identity_retention() ? 'audit') and (public.run_identity_retention() ? 'invitations') and (public.run_identity_retention() ? 'profiles'), 'a rotina única devolve o resumo das três retenções');
select ok(
  not has_function_privilege('authenticated', 'public.run_identity_retention()', 'execute')
  and not has_function_privilege('anon', 'public.purge_expired_audit_logs()', 'execute')
  and has_function_privilege('service_role', 'public.run_identity_retention()', 'execute'),
  'as rotinas de retenção são exclusivas do service_role');
select ok(not has_function_privilege('authenticated', 'public.place_retention_hold(text,uuid,uuid,text,uuid)', 'execute') and has_function_privilege('service_role', 'public.place_retention_hold(text,uuid,uuid,text,uuid)', 'execute'), 'a retenção legal só é gerida pelo servidor');
select ok(not exists(select 1 from pg_namespace n join pg_class c on c.relnamespace = n.oid where n.nspname = 'private' and c.relname = 'retention_holds' and has_table_privilege('authenticated', c.oid, 'select')), 'a tabela de retenções legais não é legível pela aplicação');
select ok(exists(select 1 from public.audit_logs where action = 'profile.retention.anonymize' and result = 'success'), 'a anonimização é auditada');

-- 36-40. Preservação por segurança: a rotina nunca apaga o que a retenção não autoriza.
select is((select count(*)::int from public.audit_logs where action = 'retencao.antigo_hold'), 1, 'a retenção da pessoa ainda protege o evento');
select ok((select count(*)::int from public.audit_logs) >= 5, 'a auditoria recente permanece íntegra');
select is((select count(*)::int from private.retention_holds where released_at is null), 2, 'as retenções ativas continuam registradas');
select is(public.release_retention_hold('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001')->>'kind', 'unavailable', 'liberar retenção inexistente não tem efeito');
select ok(exists(select 1 from public.audit_logs where action = 'retention.hold.place' and result = 'success'), 'a criação de retenção legal é auditada');

select * from finish();
rollback;

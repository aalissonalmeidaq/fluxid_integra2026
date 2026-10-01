begin;
select plan(29);

-- Massa sintética isolada na transação.
insert into auth.users (id, aud, role, email) values
  ('10000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'sess-1@example.invalid'),
  ('10000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'sess-2@example.invalid'),
  ('10000000-0000-0000-0000-0000000000b3', 'authenticated', 'authenticated', 'sess-none@example.invalid'),
  ('10000000-0000-0000-0000-0000000000b4', 'authenticated', 'authenticated', 'sess-susp@example.invalid'),
  ('10000000-0000-0000-0000-0000000000b5', 'authenticated', 'authenticated', 'sess-global@example.invalid');

insert into public.organizations (id, kind, legal_name, display_name, status) values
  ('20000000-0000-0000-0000-0000000000b1', 'tenant', 'Org Sessão Ativa', 'Org Ativa', 'active'),
  ('20000000-0000-0000-0000-0000000000b2', 'tenant', 'Org Sessão Suspensa', 'Org Suspensa', 'suspended');

insert into public.memberships (id, organization_id, user_id, status, activated_at) values
  ('30000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1', 'active', now()),
  ('30000000-0000-0000-0000-0000000000b4', '20000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-0000000000b4', 'active', now()),
  ('30000000-0000-0000-0000-0000000000b5', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b5', 'active', now());

insert into public.membership_roles (membership_id, role_id, assigned_by) values
  ('30000000-0000-0000-0000-0000000000b5', '50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-0000000000b5');

-- 1-3. Início de sessão, limite de 8 horas e idempotência.
select is(
  public.start_user_session('10000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b1', 'aal1')->>'status',
  'started', 'primeira sessão é registrada');
select ok(
  (select expires_at <= started_at + interval '8 hours' and aal = 'aal1'
     from public.user_sessions where session_id = '60000000-0000-0000-0000-0000000000b1'),
  'sessão respeita o máximo de 8 horas e registra o AAL');
select is(
  public.start_user_session('10000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b1', 'aal1')->>'status',
  'started', 'repetir a mesma sessão é idempotente');

-- 4-7. Limite de três sessões sem revogação automática.
select public.start_user_session('10000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b2', 'aal1');
select is(
  public.start_user_session('10000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b3', 'aal1')->>'status',
  'started', 'terceira sessão é aceita');
select is(
  public.start_user_session('10000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b4', 'aal1')->>'status',
  'limit_reached', 'quarta sessão não é entregue');
select is(
  jsonb_array_length(public.start_user_session('10000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b4', 'aal1')->'sessions'),
  3, 'o limite devolve a lista das três sessões ativas');
select is(
  (select count(*)::int from public.user_sessions where user_id = '10000000-0000-0000-0000-0000000000b1' and status = 'active'),
  3, 'nenhuma sessão é revogada automaticamente e a quarta não é registrada');
select ok(
  not (public.start_user_session('10000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b4', 'aal1')::text ~* 'token|password|refresh'),
  'a lista devolvida é sanitizada');

-- 8-10. Encerramento explícito libera o limite e respeita o dono da sessão.
select is(
  public.end_user_session('10000000-0000-0000-0000-0000000000b2', '60000000-0000-0000-0000-0000000000b1', 'user_revoked'),
  false, 'não encerra sessão de outro usuário');
select is(
  public.end_user_session('10000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b1', 'user_revoked'),
  true, 'encerra a sessão escolhida');
select is(
  public.start_user_session('10000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b4', 'aal1')->>'status',
  'started', 'nova sessão é aceita após o encerramento explícito');

-- 11-14. Validação: timebox, inatividade, atividade confiável, revogada e ausente.
update public.user_sessions set expires_at = now() - interval '1 minute'
  where session_id = '60000000-0000-0000-0000-0000000000b2';
select is(
  public.validate_user_session('10000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b2')->>'status',
  'expired', 'sessão além de 8 horas expira');
update public.user_sessions set last_seen_at = now() - interval '31 minutes'
  where session_id = '60000000-0000-0000-0000-0000000000b3';
select is(
  public.validate_user_session('10000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b3')->>'reason',
  'inactivity', 'sessão inativa por mais de 30 minutos expira');
update public.user_sessions set last_seen_at = now() - interval '10 minutes'
  where session_id = '60000000-0000-0000-0000-0000000000b4';
select public.validate_user_session('10000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b4');
select ok(
  (select last_seen_at > now() - interval '1 minute' from public.user_sessions where session_id = '60000000-0000-0000-0000-0000000000b4'),
  'validação ativa registra atividade confiável');
select is(
  public.validate_user_session('10000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b1')->>'status',
  'revoked', 'sessão revogada é reconhecida');
select is(
  public.validate_user_session('10000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000ff')->>'status',
  'missing', 'sessão desconhecida é reconhecida como ausente');

-- 15. Sessões expiradas não contam para o limite.
select is(
  (select count(*)::int from public.user_sessions where user_id = '10000000-0000-0000-0000-0000000000b1' and status = 'active'),
  1, 'somente sessões válidas contam para o limite');

-- 16-19. Contexto de login: elegibilidade e MFA de perfil global.
select is(public.login_eligibility('10000000-0000-0000-0000-0000000000b3')->>'eligible', 'false', 'sem vínculo ativo não é elegível');
select is(public.login_eligibility('10000000-0000-0000-0000-0000000000b4')->>'eligible', 'false', 'tenant suspenso não é elegível');
select is(
  public.login_eligibility('10000000-0000-0000-0000-0000000000b1')->>'requires_mfa', 'false',
  'usuário de tenant não exige MFA no login');
select is(
  public.login_eligibility('10000000-0000-0000-0000-0000000000b5')->>'requires_mfa', 'true',
  'perfil global exige MFA no login');

-- 20-22. Limite de tentativas por chave sanitizada.
select public.register_login_failure(repeat('a', 64)) from generate_series(1, 4);
select is(public.is_login_rate_limited(repeat('a', 64)), false, 'quatro falhas ainda não bloqueiam');
select public.register_login_failure(repeat('a', 64));
select is(public.is_login_rate_limited(repeat('a', 64)), true, 'a quinta falha bloqueia');
select public.clear_login_failures(repeat('a', 64));
select is(public.is_login_rate_limited(repeat('a', 64)), false, 'sucesso limpa o contador');

-- 23-24. Auditoria sanitizada por allowlist de ações.
select ok(
  public.record_auth_event('10000000-0000-0000-0000-0000000000b1', '60000000-0000-0000-0000-0000000000b4', 'auth.login', 'success', null, null) > 0,
  'evento de login é auditado');
select throws_ok(
  $$ select public.record_auth_event('10000000-0000-0000-0000-0000000000b1', null, 'auth.arbitrary', 'success', null, null) $$,
  '22023', 'invalid_auth_event', 'ação fora da allowlist é rejeitada');

-- 25-27. Execução exclusiva do service_role.
select ok(
  not has_function_privilege('authenticated', 'public.start_user_session(uuid,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.start_user_session(uuid,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.start_user_session(uuid,uuid,text)', 'execute'),
  'start_user_session é exclusiva do service_role');
select ok(
  not has_function_privilege('authenticated', 'public.validate_user_session(uuid,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.validate_user_session(uuid,uuid)', 'execute'),
  'validate_user_session é exclusiva do service_role');
select ok(
  not has_function_privilege('authenticated', 'public.register_login_failure(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.record_auth_event(uuid,uuid,text,text,text,uuid)', 'execute'),
  'contador de falhas e auditoria não são executáveis por usuários da aplicação');

select * from finish();
rollback;

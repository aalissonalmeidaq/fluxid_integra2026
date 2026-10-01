import type { Page, Route } from '@playwright/test';

// Backend simulado por rede para os E2E de autenticação: exercita a interface e o cliente Supabase reais
// sem depender de um Supabase em execução. Comportamento real de Auth, RLS e sessões é provado nas suítes
// `.live.test.ts`.
const ORIGIN = 'http://127.0.0.1:54321';
// QR Code simulado, como o Auth real o envia: SVG puro (o supabase-js acrescenta o prefixo data:image/svg+xml). Sem "#", que
// quebraria a URL de dados.
const QR_SIMULADO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" width="192" height="192"><rect width="8" height="8" fill="white"/><path d="M0 0h3v3H0zM5 0h3v3H5zM0 5h3v3H0zM4 4h1v1H4zM6 5h2v1H6zM5 7h1v1H5zM7 7h1v1H7z" fill="black"/></svg>';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

const base64Url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

export function fakeJwt(claims: { sub?: string; aal?: 'aal1' | 'aal2'; sessionId?: string } = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    base64Url({ alg: 'HS256', typ: 'JWT' }),
    base64Url({
      sub: claims.sub ?? '10000000-0000-0000-0000-000000000004',
      aud: 'authenticated',
      role: 'authenticated',
      aal: claims.aal ?? 'aal1',
      session_id: claims.sessionId ?? '60000000-0000-0000-0000-000000000001',
      iat: now,
      exp: now + 3600,
    }),
    'assinatura-simulada',
  ].join('.');
}

export interface RawAuditEvent { id: number; organization_id: string | null; actor: { id: string | null; display_name: string | null }; action: string; target_type: string; target_id: string | null; result: string; reason_code: string | null; justification: string | null; origin: string; occurred_at: string; metadata: Record<string, unknown> }

// Eventos sintéticos de auditoria: alterna ações e resultados para exercitar filtros e paginação.
export function makeAuditEvents(organizationId: string, count: number, firstId: number): RawAuditEvent[] {
  const actions = [['role.create', 'role', 'success'], ['invitation.send', 'invitation', 'denied'], ['membership.status.change', 'membership', 'success']] as const;
  return Array.from({ length: count }, (_, index) => {
    const [action, target, result] = actions[index % 3]!;
    const id = firstId + index;
    return { id, organization_id: organizationId, actor: { id: '10000000-0000-0000-0000-000000000002', display_name: 'Administrador A' }, action, target_type: target, target_id: `alvo-${id}`, result, reason_code: result === 'denied' ? 'permission_denied' : null, justification: null, origin: 'database', occurred_at: new Date(Date.UTC(2026, 8, 30, 12, 0, 0) - (firstId + count - id) * 60_000).toISOString(), metadata: {} };
  });
}

export interface SessionSummary { session_id: string; started_at: string; last_seen_at: string; aal: string }

export type LoginScript = { status: number; body: Record<string, unknown> };

export class MockBackend {
  organizations = [{ id:'20000000-0000-0000-0000-00000000000a',legal_name:'Tenant A Sintético',display_name:'Tenant A',status:'active',version:1 }];
  members = [{ id:'30000000-0000-0000-0000-000000000099',display_name:'Operador A',email:'operador-a@example.invalid',status:'active',version:1 }];
  membersB = [{ id:'30000000-0000-0000-0000-000000000098',display_name:'Operador B',email:'operador-b@example.invalid',status:'active',version:1 }];
  // Vínculos do usuário devolvidos pela Data API (a RLS já filtra); por padrão um único tenant, selecionado sozinho.
  tenantMemberships: Array<{ id: string; organization_id: string; status: string; organizations: { id: string; kind: string; status: string; display_name: string } | null }> = [
    { id: '30000000-0000-0000-0000-00000000000a', organization_id: '20000000-0000-0000-0000-00000000000a', status: 'active', organizations: { id: '20000000-0000-0000-0000-00000000000a', kind: 'tenant', status: 'active', display_name: 'Tenant A' } },
  ];
  // Estado de RBAC do tenant simulado; `accessDenied` faz a fronteira negar a listagem (403).
  accessDenied = false;
  accessRoles: Array<{ id: string; code: string; name: string; description: string; system: boolean; active: boolean; version: number; permissions: string[] }> = [
    { id: '50000000-0000-0000-0000-000000000003', code: 'tenant_admin', name: 'Administrador do tenant', description: 'Administra o tenant', system: true, active: true, version: 1, permissions: ['audit.read', 'tenant.manage'] },
    { id: '50000000-0000-0000-0000-000000000004', code: 'technical_operator', name: 'Operador técnico', description: 'Acesso somente ao próprio perfil', system: true, active: true, version: 1, permissions: [] },
  ];
  accessPermissions = [
    { code: 'audit.read', description: 'Consultar auditoria', critical: false, delegable: true },
    { code: 'profile.read', description: 'Consultar perfil', critical: false, delegable: true },
    { code: 'tenant.manage', description: 'Administrar tenant', critical: true, delegable: true },
    { code: 'platform.manage', description: 'Administrar plataforma', critical: true, delegable: false },
  ];
  accessAssignments: Array<{ membership_id: string; role_id: string }> = [];
  // Comportamento do endpoint idempotente de sincronização: ok, conflict (409), expired (401), server (503) ou network (sem resposta).
  syncBehavior: 'ok' | 'conflict' | 'expired' | 'server' | 'network' = 'ok';
  // Perfil e avatar simulados: vatarBehavior faz a fronteira responder ok, limite de frequência ou falha.
  profile = { display_name: 'Ana Souza', locale: 'pt-BR', avatar_path: null as string | null };
  avatarBehavior: 'ok' | 'rate' | 'fail' = 'ok';
  avatarUploads: Array<{ contentType: string; size: number }> = [];
  // Auditoria simulada: 60 eventos no Tenant A e 3 no Tenant B; uditDenied faz a fronteira negar a consulta.
  auditDenied = false;
  auditEvents: RawAuditEvent[] = [...makeAuditEvents('20000000-0000-0000-0000-00000000000a', 60, 1), ...makeAuditEvents('20000000-0000-0000-0000-00000000000b', 3, 100)];
  recoveryUpdateOk = true;
  loginResponses: LoginScript[] = [];
  statusResponse: LoginScript = { status: 401, body: { code: 'SESSION_INVALID' } };
  compatibility = '002.1';
  aalAfterMfa = 'aal2' as const;
  factors: Array<{ id: string; factor_type: string; status: string }> = [];
  verifyOk = true;
  readonly calls: Array<{ path: string; body: unknown }> = [];
  // Atraso em milissegundos por caminho, para exercitar os estados de carregamento.
  delayByPath: Record<string, number> = {};

  session(aal: 'aal1' | 'aal2' = 'aal1') {
    return { access_token: fakeJwt({ aal }), refresh_token: 'refresh-simulado', expires_in: 3600, token_type: 'bearer' };
  }

  authenticated(code: 'AUTHENTICATED' | 'MFA_REQUIRED' = 'AUTHENTICATED'): LoginScript {
    return { status: 200, body: { code, session: this.session() } };
  }

  activeStatus(aal: 'aal1' | 'aal2' = 'aal1', mfaRequired = false): LoginScript {
    return { status: 200, body: { code: 'SESSION_ACTIVE', aal, expires_at: new Date(Date.now() + 8 * 3600_000).toISOString(), mfa_required: mfaRequired } };
  }

  async install(page: Page): Promise<void> {
    await page.route(`${ORIGIN}/**`, (route) => this.handle(route));
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

    const raw = request.postData();
    let body: unknown = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { /* corpo não JSON */ }
    this.calls.push({ path: pathname, body });
    const delay = this.delayByPath[pathname];
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const respond = (status: number, json: unknown) => route.fulfill({ status, json, headers: CORS });

    if (pathname === '/auth/v1/health') return respond(200, { status: 'ok' });
    if (pathname === '/functions/v1/public-compatibility') return respond(200, { contractVersion: this.compatibility });
    if (pathname === '/functions/v1/session-login') {
      const next = this.loginResponses.length > 1 ? this.loginResponses.shift()! : this.loginResponses[0];
      return next ? respond(next.status, next.body) : respond(500, { code: 'INTERNAL_ERROR' });
    }
    if (pathname === '/functions/v1/session-status') return respond(this.statusResponse.status, this.statusResponse.body);
    if (pathname === '/functions/v1/query-audit') {
      if (this.auditDenied) return respond(403, { code: 'ACCESS_DENIED' });
      const input = body as { scope: string; organization_id?: string; action?: string; result?: string; target_type?: string; before?: { id: number }; limit?: number };
      const limit = input.limit ?? 50;
      const matching = this.auditEvents
        .filter((event) => input.scope === 'global' || event.organization_id === input.organization_id)
        .filter((event) => (!input.action || event.action === input.action) && (!input.result || event.result === input.result) && (!input.target_type || event.target_type === input.target_type))
        .filter((event) => !input.before || event.id < input.before.id)
        .sort((left, right) => right.id - left.id);
      const page = matching.slice(0, limit);
      const last = page.at(-1);
      return respond(200, { code: 'AUDIT_LISTED', events: page, next: matching.length > limit && last ? { occurred_at: last.occurred_at, id: last.id } : null });
    }
    if (pathname === '/rest/v1/profiles') {
      if (request.method() === 'PATCH') { const changes = body as { display_name?: string } | null; if (changes?.display_name) this.profile.display_name = changes.display_name; return respond(200, [{ user_id: '10000000-0000-0000-0000-000000000004' }]); }
      return respond(200, [this.profile]);
    }
    if (pathname === '/functions/v1/profile-avatar') {
      if (request.method() === 'DELETE') { this.profile.avatar_path = null; return respond(200, { code: 'AVATAR_REMOVED' }); }
      if (this.avatarBehavior === 'rate') return respond(429, { code: 'RATE_LIMITED' });
      if (this.avatarBehavior === 'fail') return respond(500, { code: 'UPLOAD_FAILED' });
      this.avatarUploads.push({ contentType: request.headers()['content-type'] ?? '', size: request.postDataBuffer()?.length ?? 0 });
      this.profile.avatar_path = `10000000-0000-0000-0000-000000000004/90000000-0000-0000-0000-00000000000${this.avatarUploads.length}.png`;
      return respond(200, { code: 'AVATAR_UPDATED' });
    }
    if (pathname.startsWith('/storage/v1/object/sign/avatars/')) {
      if (request.method() === 'POST') return respond(200, { signedURL: `/object/sign/avatars/${pathname.split('/avatars/')[1]}?token=teste` });
      return route.fulfill({ status: 200, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'), headers: { ...CORS, 'content-type': 'image/png' } });
    }
    if (pathname === '/functions/v1/sync-command') {
      if (this.syncBehavior === 'network') return route.abort('connectionrefused');
      if (this.syncBehavior === 'conflict') return respond(409, { error: 'idempotency_payload_conflict' });
      if (this.syncBehavior === 'expired') return respond(401, { error: 'invalid_authentication' });
      if (this.syncBehavior === 'server') return respond(503, { error: 'unavailable' });
      return respond(200, { status: 'created' });
    }
    if (pathname === '/rest/v1/memberships') return respond(200, this.tenantMemberships);
    if (pathname === '/functions/v1/session-logout') return respond(200, { code: 'SIGNED_OUT' });
    if (pathname === '/functions/v1/password-recovery') return respond(202, { code: 'RECOVERY_REQUEST_ACCEPTED' });
    if(pathname==='/functions/v1/manage-organizations'){
      const input=body as Record<string,unknown>;
      if(input.operation==='list')return respond(200,{code:'ORGANIZATIONS_LISTED',organizations:this.organizations});
      if(input.operation==='create'){const organization={id:'20000000-0000-0000-0000-000000000099',legal_name:input.legal_name,display_name:input.display_name,status:'inactive',version:1};this.organizations.push(organization as typeof this.organizations[number]);return respond(201,{code:'ORGANIZATION_CREATED',organization});}
    }
    if(pathname==='/functions/v1/manage-membership'){
      const input=body as Record<string,unknown>;
      if(input.operation==='list')return respond(200,{code:'MEMBERS_LISTED',members:input.organization_id==='20000000-0000-0000-0000-00000000000b'?this.membersB:this.members,roles:[{id:'50000000-0000-0000-0000-000000000004',name:'Operador técnico'}]});
      const member=this.members.find(item=>item.id===input.membership_id);if(member){member.status=String(input.status);member.version+=1;return respond(200,{code:'MEMBERSHIP_STATUS_CHANGED',membership:member});}
    }
    if(pathname==='/functions/v1/manage-access'){
      const input=body as Record<string,unknown>;
      if(this.accessDenied)return respond(403,{code:'ACCESS_DENIED'});
      if(input.operation==='list')return respond(200,{code:'ACCESS_LISTED',roles:this.accessRoles,permissions:this.accessPermissions,assignments:this.accessAssignments});
      if(input.operation==='save_role'){
        const codes=(input.permissions as string[]);
        if(codes.some(code=>!this.accessPermissions.find(item=>item.code===code)?.delegable))return respond(403,{code:'PERMISSION_NOT_DELEGABLE'});
        if(typeof input.role_id==='string'){const role=this.accessRoles.find(item=>item.id===input.role_id);if(!role||role.version!==input.expected_version)return respond(409,{code:'CONFLICT'});Object.assign(role,{name:input.name,description:input.description,permissions:codes,version:role.version+1});return respond(200,{code:'ROLE_UPDATED',role:{id:role.id,version:role.version}});}
        const role={id:`50000000-0000-0000-0000-0000000000${String(this.accessRoles.length+10)}`,code:`custom_${this.accessRoles.length}`,name:String(input.name),description:String(input.description??''),system:false,active:true,version:1,permissions:codes};this.accessRoles.push(role);return respond(201,{code:'ROLE_CREATED',role:{id:role.id,version:1}});
      }
      if(input.operation==='set_role_active'){const role=this.accessRoles.find(item=>item.id===input.role_id);if(!role)return respond(409,{code:'ROLE_UNAVAILABLE'});if(role.system)return respond(403,{code:'ROLE_IMMUTABLE'});role.active=Boolean(input.active);role.version+=1;return respond(200,{code:'ROLE_STATE_CHANGED',role:{id:role.id,version:role.version,active:role.active}});}
      if(input.operation==='assign_role'){this.accessAssignments.push({membership_id:String(input.membership_id),role_id:String(input.role_id)});return respond(200,{code:'ROLE_ASSIGNED'});}
      if(input.operation==='remove_role'){this.accessAssignments=this.accessAssignments.filter(item=>!(item.membership_id===input.membership_id&&item.role_id===input.role_id));return respond(200,{code:'ROLE_REMOVED'});}
    }
    if(pathname==='/functions/v1/invite-user')return respond(202,{code:'INVITATION_SENT',invitation_id:'70000000-0000-0000-0000-000000000001',status:'sent'});
    if (pathname === '/auth/v1/user' && request.method() === 'PUT') {
      return this.recoveryUpdateOk
        ? respond(200, { id: '10000000-0000-0000-0000-000000000004' })
        : respond(400, { code: 'otp_expired', message: 'expired' });
    }
    if (pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: CORS });
    if (pathname === '/auth/v1/user') {
      return respond(200, { id: '10000000-0000-0000-0000-000000000004', aud: 'authenticated', role: 'authenticated', email: 'usuario@example.invalid', factors: this.factors });
    }
    if (pathname === '/auth/v1/factors') {
      this.factors = [{ id: 'fator-1', factor_type: 'totp', status: 'unverified' }];
      return respond(200, { id: 'fator-1', type: 'totp', totp: { qr_code: QR_SIMULADO, secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/FluxID' } });
    }
    if (/^\/auth\/v1\/factors\/[^/]+\/challenge$/.test(pathname)) return respond(200, { id: 'desafio-1', expires_at: Math.floor(Date.now() / 1000) + 300 });
    if (/^\/auth\/v1\/factors\/[^/]+\/verify$/.test(pathname)) {
      if (!this.verifyOk) return respond(400, { code: 'mfa_verification_failed', message: 'Invalid TOTP code entered' });
      return respond(200, { ...this.session(this.aalAfterMfa), user: { id: '10000000-0000-0000-0000-000000000004' } });
    }
    return respond(404, { message: 'não simulado' });
  }
}

export const threeSessions: SessionSummary[] = [
  { session_id: 'a0000000-0000-0000-0000-000000000001', started_at: '2026-09-29T10:00:00Z', last_seen_at: '2026-09-29T11:00:00Z', aal: 'aal1' },
  { session_id: 'a0000000-0000-0000-0000-000000000002', started_at: '2026-09-29T12:00:00Z', last_seen_at: '2026-09-29T12:30:00Z', aal: 'aal2' },
  { session_id: 'a0000000-0000-0000-0000-000000000003', started_at: '2026-09-29T13:00:00Z', last_seen_at: '2026-09-29T13:10:00Z', aal: 'aal1' },
];

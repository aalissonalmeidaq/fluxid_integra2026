import { json, preflight, UUID_PATTERN } from '../_shared/http.ts';

type OrganizationStatus = 'active' | 'suspended' | 'inactive';
export interface GlobalIdentity { userId: string; aal: 'aal1' | 'aal2'; sessionActive: boolean; canManagePlatform: boolean; canManageMaster: boolean }
export interface OrganizationSummary { id: string; legal_name: string; display_name: string; status: OrganizationStatus; version: number }
export interface OrganizationGateway {
  authenticate(token: string): Promise<GlobalIdentity | null>;
  list(): Promise<OrganizationSummary[]>;
  // O tenant sempre nasce `inactive` (RF-009); a ativação exige administrador ativo.
  create(input: { legalName: string; displayName: string; justification: string }): Promise<{ id: string; status: OrganizationStatus; version: number }>;
  changeStatus(input: { organizationId: string; status: OrganizationStatus; expectedVersion: number; justification: string }): Promise<{ id: string; status: OrganizationStatus; version: number } | { kind: 'admin_required' } | null>;
  inviteFirstAdmin(input: { organizationId: string; email: string; roleCode: 'admin_tenant'; justification: string }): Promise<{ invitationId: string }>;
  audit(event: { actorId?: string; action: string; result: 'success' | 'denied' | 'failed'; targetId?: string; reason?: string; justification?: string }): Promise<void>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (value: unknown, min: number, max: number) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max ? value.trim() : null;
const status = (value: unknown): value is OrganizationStatus => value === 'active' || value === 'suspended' || value === 'inactive';
const bearer = (request: Request) => request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

export function createManageOrganizationsHandler(gateway: OrganizationGateway) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
    const token = bearer(request);
    if (!token) return json({ code: 'AUTH_REQUIRED' }, 401);
    const identity = await gateway.authenticate(token).catch(() => null);
    if (!identity || !identity.sessionActive) return json({ code: 'AUTH_REQUIRED' }, 401);
    if (identity.aal !== 'aal2') {
      await gateway.audit({ actorId: identity.userId, action: 'organization.access', result: 'denied', reason: 'mfa_required' });
      return json({ code: 'MFA_REQUIRED' }, 403);
    }
    if (!identity.canManagePlatform) {
      await gateway.audit({ actorId: identity.userId, action: 'organization.access', result: 'denied', reason: 'permission_denied' });
      return json({ code: 'ACCESS_DENIED' }, 403);
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.operation !== 'string') return json({ code: 'INVALID_REQUEST' }, 400);
    try {
      if (body.operation === 'list') return json({ code: 'ORGANIZATIONS_LISTED', organizations: await gateway.list() });
      const justification = text(body.justification, 10, 500);
      if (!justification) return json({ code: 'INVALID_REQUEST' }, 400);

      if (body.operation === 'create') {
        const legalName = text(body.legal_name, 2, 160), displayName = text(body.display_name, 2, 100);
        if (!legalName || !displayName || (body.initial_status !== undefined && body.initial_status !== 'inactive')) return json({ code: 'INVALID_REQUEST' }, 400);
        const organization = await gateway.create({ legalName, displayName, justification });
        await gateway.audit({ actorId: identity.userId, action: 'organization.create', result: 'success', targetId: organization.id, justification });
        return json({ code: 'ORGANIZATION_CREATED', organization }, 201);
      }

      if (body.operation === 'change_status') {
        if (typeof body.organization_id !== 'string' || !UUID_PATTERN.test(body.organization_id) || !status(body.status) || !Number.isSafeInteger(body.expected_version) || Number(body.expected_version) < 1) return json({ code: 'INVALID_REQUEST' }, 400);
        const organization = await gateway.changeStatus({ organizationId: body.organization_id, status: body.status, expectedVersion: Number(body.expected_version), justification });
        if (!organization) return json({ code: 'CONFLICT' }, 409);
        if ('kind' in organization) return json({ code: 'LAST_ADMIN_REQUIRED' }, 409);
        await gateway.audit({ actorId: identity.userId, action: 'organization.status.change', result: 'success', targetId: organization.id, justification });
        return json({ code: 'ORGANIZATION_STATUS_CHANGED', organization });
      }

      if (body.operation === 'invite_first_admin') {
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (typeof body.organization_id !== 'string' || !UUID_PATTERN.test(body.organization_id) || !EMAIL.test(email) || email.length > 254) return json({ code: 'INVALID_REQUEST' }, 400);
        const invitation = await gateway.inviteFirstAdmin({ organizationId: body.organization_id, email, roleCode: 'admin_tenant', justification });
        await gateway.audit({ actorId: identity.userId, action: 'organization.first_admin.invite', result: 'success', targetId: body.organization_id, justification });
        return json({ code: 'ADMIN_INVITATION_ACCEPTED', invitation_id: invitation.invitationId }, 202);
      }
      return json({ code: 'INVALID_REQUEST' }, 400);
    } catch {
      await gateway.audit({ actorId: identity.userId, action: 'organization.operation', result: 'failed', reason: 'internal_error' }).catch(() => undefined);
      return json({ code: 'INTERNAL_ERROR' }, 500);
    }
  };
}

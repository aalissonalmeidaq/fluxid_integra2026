// Serviço do Master sobre a Edge Function `platform-seals` (Spec 013, contracts/operacoes-plataforma.md). Não há tenant de contexto: só a
// aprovação leva o tenant de destino. Cada escrita leva request_id (a repetição não duplica), justificativa e o updated_at lido (duas
// decisões simultâneas: só a primeira vale). Sem conexão, nem chama o servidor; a senha revelada nunca é guardada.
import { validateJustification, type EnrollmentStatus } from '@/domain/seals/seal-enrollment';
import { toEnrollmentPage, type EnrollmentPage, type EnrollmentView, type OrganizationRef, type PlatformFailureKind, type Raw } from './platform-seal-views';

export interface PlatformSealTransport {
  call(body: Raw): Promise<{ status: number; body: unknown }>;
}

export type PlatformOutcome<T> = { kind: 'success'; value: T } | { kind: PlatformFailureKind; fields?: Record<string, string> };

const FAILURES: Record<string, PlatformFailureKind> = {
  AUTH_REQUIRED: 'session_expired', ACCESS_DENIED: 'access_denied', MFA_REQUIRED: 'mfa_required', NOT_FOUND: 'not_found',
  VALIDATION_FAILED: 'invalid', JUSTIFICATION_REQUIRED: 'justification_required', STALE: 'stale', INVALID_STATE: 'invalid_state',
  ENROLLMENT_CONFLICT: 'enrollment_conflict', TENANT_INACTIVE: 'tenant_inactive', NETWORKS_NOT_CLEARED: 'networks_not_cleared',
  CYLINDER_IN_TRIP: 'cylinder_in_trip', NOT_CONFIGURED: 'not_configured', REQUEST_REUSED: 'request_reused',
};

const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);

export class PlatformSealService {
  constructor(
    private readonly transport: PlatformSealTransport,
    private readonly isOnline: () => boolean = () => true,
    private readonly newRequestId: () => string = () => crypto.randomUUID(),
  ) {}

  private async run<T>(write: boolean, body: Raw, pick: (payload: Raw) => T | null): Promise<PlatformOutcome<T>> {
    if (!this.isOnline()) return { kind: 'offline' };
    try {
      const response = await this.transport.call(body);
      const payload = isObject(response.body) ? response.body : {};
      if (response.status >= 200 && response.status < 300) {
        const value = pick(payload);
        return value !== null ? { kind: 'success', value } : { kind: write ? 'unknown' : 'unavailable' };
      }
      if (response.status === 401) return { kind: 'session_expired' };
      const kind = typeof payload.code === 'string' ? FAILURES[payload.code] : undefined;
      if (!kind || response.status >= 500) return { kind: write ? 'unknown' : 'unavailable' };
      if (!Array.isArray(payload.fields)) return { kind };
      const fields: Record<string, string> = {};
      for (const entry of payload.fields) if (isObject(entry) && typeof entry.field === 'string' && typeof entry.message === 'string') fields[entry.field] = entry.message;
      return { kind, fields };
    } catch {
      return { kind: write ? 'unknown' : 'unavailable' };
    }
  }

  // Comando sobre um pedido: justificativa conferida antes de enviar, request_id novo e o updated_at lido.
  private decide(operation: string, enrollment: EnrollmentView, justification: string, extra: Raw, done: string): Promise<PlatformOutcome<true>> {
    const text = validateJustification(justification);
    if (!text.ok) return Promise.resolve({ kind: 'justification_required' });
    return this.run(true, {
      operation, request_id: this.newRequestId(), enrollment_id: enrollment.id, ...extra, justification: text.value,
      expected_updated_at: enrollment.updatedAt,
    }, (p) => (p.code === done ? true : null));
  }

  listEnrollments(filters: { status?: EnrollmentStatus; conflict?: boolean; offset?: number; limit?: number }): Promise<PlatformOutcome<EnrollmentPage>> {
    return this.run(false, {
      operation: 'list_enrollments', ...(filters.status ? { status: filters.status } : {}), ...(filters.conflict === undefined ? {} : { conflict: filters.conflict }),
      offset: filters.offset ?? 0, limit: filters.limit ?? 100,
    }, toEnrollmentPage);
  }

  listTenants(): Promise<PlatformOutcome<OrganizationRef[]>> {
    return this.run(false, { operation: 'list_tenants_for_seals' }, (p) => {
      if (p.code !== 'LISTED' || !Array.isArray(p.items)) return null;
      const items = p.items.filter((i): i is OrganizationRef => isObject(i) && typeof i.id === 'string' && typeof i.name === 'string')
        .map((i) => ({ id: i.id, name: i.name }));
      return items.length === p.items.length ? items : null;
    });
  }

  approve(enrollment: EnrollmentView, organizationId: string, justification: string): Promise<PlatformOutcome<true>> {
    return this.decide('approve_enrollment', enrollment, justification, { organization_id: organizationId }, 'APPROVED');
  }

  refuse(enrollment: EnrollmentView, justification: string): Promise<PlatformOutcome<true>> {
    return this.decide('refuse_enrollment', enrollment, justification, {}, 'REFUSED');
  }

  reopen(enrollment: EnrollmentView, justification: string): Promise<PlatformOutcome<true>> {
    return this.decide('reopen_enrollment', enrollment, justification, {}, 'REOPENED');
  }

  resolveConflict(enrollment: EnrollmentView, keepCurrent: boolean, justification: string): Promise<PlatformOutcome<true>> {
    return this.decide('replace_enrollment_key', enrollment, justification, { keep_current: keepCurrent }, keepCurrent ? 'CONFLICT_CLEARED' : 'KEY_REPLACED');
  }

  withdraw(enrollment: EnrollmentView, forgetNetworks: 'extras' | 'all', justification: string): Promise<PlatformOutcome<true>> {
    return this.decide('withdraw_device', enrollment, justification, { forget_networks: forgetNetworks }, 'WITHDRAWN');
  }

  requestForgetNetworks(enrollment: EnrollmentView, justification: string): Promise<PlatformOutcome<true>> {
    return this.decide('request_forget_networks', enrollment, justification, {}, 'FORGET_REQUESTED');
  }

  revealPortalPassword(justification: string): Promise<PlatformOutcome<string>> {
    const text = validateJustification(justification);
    if (!text.ok) return Promise.resolve({ kind: 'justification_required' });
    return this.run(true, { operation: 'reveal_portal_password', request_id: this.newRequestId(), justification: text.value },
      (p) => (p.code === 'REVEALED' && typeof p.password === 'string' ? p.password : null));
  }
}

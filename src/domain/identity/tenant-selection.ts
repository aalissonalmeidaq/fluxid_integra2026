import type { MembershipStatus, OrganizationKind, OrganizationStatus } from './authorization';

// Seleção do tenant ativo. O identificador escolhido no cliente é apenas um pedido: só vale se estiver entre os
// vínculos elegíveis informados por uma fonte confiável (RF-026, RF-023, ISO-003).
export interface MembershipRecord {
  membershipId: string;
  organizationId: string;
  membershipStatus: MembershipStatus;
  organization: { id: string; kind: OrganizationKind; status: OrganizationStatus; displayName: string } | null;
}

export interface TenantOption {
  organizationId: string;
  displayName: string;
  kind: OrganizationKind;
}

export type SelectionState =
  | { kind: 'none' }
  | { kind: 'selected'; option: TenantOption }
  | { kind: 'choose'; options: readonly TenantOption[] };

export type SelectionRequest = { ok: true; option: TenantOption } | { ok: false; reason: 'not_eligible' };

// Elegível: vínculo ativo em organização ativa; bloqueado, inativo, convidado ou tenant suspenso nunca operam (RN-006, RN-007).
export function eligibleOptions(records: readonly MembershipRecord[]): TenantOption[] {
  const byOrganization = new Map<string, TenantOption>();
  for (const record of records) {
    const organization = record.organization;
    if (record.membershipStatus !== 'active' || !organization) continue;
    if (organization.id !== record.organizationId || organization.status !== 'active') continue;
    byOrganization.set(organization.id, { organizationId: organization.id, displayName: organization.displayName, kind: organization.kind });
  }
  return [...byOrganization.values()].sort(
    (left, right) => left.displayName.localeCompare(right.displayName, 'pt-BR') || left.organizationId.localeCompare(right.organizationId),
  );
}

export function resolveSelection(options: readonly TenantOption[], currentOrganizationId: string | null): SelectionState {
  const current = options.find((option) => option.organizationId === currentOrganizationId);
  if (current) return { kind: 'selected', option: current };
  const [only] = options;
  if (options.length === 0 || !only) return { kind: 'none' };
  if (options.length === 1) return { kind: 'selected', option: only };
  return { kind: 'choose', options };
}

export function requestSelection(options: readonly TenantOption[], requestedOrganizationId: unknown): SelectionRequest {
  const option = typeof requestedOrganizationId === 'string'
    ? options.find((candidate) => candidate.organizationId === requestedOrganizationId)
    : undefined;
  return option ? { ok: true, option } : { ok: false, reason: 'not_eligible' };
}

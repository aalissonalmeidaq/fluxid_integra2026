import type { SupabaseClient } from '@supabase/supabase-js';
import type { MembershipStatus, OrganizationKind, OrganizationStatus } from '@/domain/identity/authorization';
import type { MembershipRecord } from '@/domain/identity/tenant-selection';

const MEMBERSHIP_STATUSES: readonly MembershipStatus[] = ['invited', 'active', 'blocked', 'inactive'];
const ORGANIZATION_KINDS: readonly OrganizationKind[] = ['owner', 'tenant'];
const ORGANIZATION_STATUSES: readonly OrganizationStatus[] = ['active', 'suspended', 'inactive'];

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';
const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && (values as readonly string[]).includes(value);

// A RLS já restringe a consulta aos vínculos do próprio usuário e às organizações ativas em que ele é membro ativo;
// nenhum identificador de tenant é enviado. Linhas fora do formato esperado são descartadas.
function toRecord(row: unknown): MembershipRecord | null {
  if (!isObject(row) || typeof row.id !== 'string' || typeof row.organization_id !== 'string') return null;
  if (!oneOf(MEMBERSHIP_STATUSES, row.status)) return null;
  const embedded = row.organizations;
  if (embedded === null || embedded === undefined) {
    return { membershipId: row.id, organizationId: row.organization_id, membershipStatus: row.status, organization: null };
  }
  if (!isObject(embedded) || typeof embedded.id !== 'string' || typeof embedded.display_name !== 'string') return null;
  if (!oneOf(ORGANIZATION_KINDS, embedded.kind) || !oneOf(ORGANIZATION_STATUSES, embedded.status)) return null;
  return {
    membershipId: row.id,
    organizationId: row.organization_id,
    membershipStatus: row.status,
    organization: { id: embedded.id, kind: embedded.kind, status: embedded.status, displayName: embedded.display_name },
  };
}

export function createMembershipRecordSource(client: SupabaseClient): () => Promise<MembershipRecord[]> {
  return async () => {
    const { data, error } = await client.from('memberships').select('id, organization_id, status, organizations(id, kind, status, display_name)');
    if (error) throw new Error('memberships_query_failed');
    if (!Array.isArray(data)) return [];
    return data.map(toRecord).filter((record): record is MembershipRecord => record !== null);
  };
}

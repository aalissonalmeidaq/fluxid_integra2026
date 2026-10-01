import type { ActorPermissions } from '@/domain/navigation/visible-screens';

export interface PermissionsTransport {
  call(body: Record<string, unknown>): Promise<{ status: number; body: unknown }>;
}

export type PermissionsOutcome = { kind: 'success'; value: ActorPermissions } | { kind: 'unavailable' };

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const codes = (value: unknown): string[] | null => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : null;

// Consulta das próprias permissões pela fronteira servidor. Qualquer resposta fora do contrato vira `unavailable`,
// nunca um item de menu (RF-007). Sessão inválida (401) é tratada pelo AuthProvider, não como lista vazia.
export class PermissionsService {
  constructor(private readonly transport: PermissionsTransport) {}

  async query(organizationId: string | null): Promise<PermissionsOutcome> {
    try {
      const response = await this.transport.call(organizationId ? { organization_id: organizationId } : {});
      if (response.status !== 200 || !isObject(response.body) || response.body.code !== 'PERMISSIONS_LISTED') return { kind: 'unavailable' };
      const tenant = codes(response.body.tenant);
      const global = codes(response.body.global);
      return tenant && global ? { kind: 'success', value: { tenant, global } } : { kind: 'unavailable' };
    } catch {
      return { kind: 'unavailable' };
    }
  }
}

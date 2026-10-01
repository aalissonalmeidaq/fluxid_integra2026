import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMembershipRecordSource } from './membership-source';

const A = '20000000-0000-0000-0000-00000000000a';
const B = '20000000-0000-0000-0000-00000000000b';

function clientReturning(result: { data: unknown; error: unknown }) {
  const select = vi.fn(() => Promise.resolve(result));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from, select };
}

describe('createMembershipRecordSource', () => {
  it('consulta somente os vínculos do usuário com a organização embutida, sem enviar identificador de tenant', async () => {
    const { client, from, select } = clientReturning({ data: [], error: null });
    await createMembershipRecordSource(client)();
    expect(from).toHaveBeenCalledWith('memberships');
    expect(select).toHaveBeenCalledWith('id, organization_id, status, organizations(id, kind, status, display_name)');
  });

  it('converte as linhas em registros de vínculo', async () => {
    const { client } = clientReturning({
      data: [{ id: 'm-a', organization_id: A, status: 'active', organizations: { id: A, kind: 'tenant', status: 'active', display_name: 'Tenant A' } }],
      error: null,
    });
    expect(await createMembershipRecordSource(client)()).toEqual([
      { membershipId: 'm-a', organizationId: A, membershipStatus: 'active', organization: { id: A, kind: 'tenant', status: 'active', displayName: 'Tenant A' } },
    ]);
  });

  it('mantém o vínculo sem organização visível (a RLS não a devolveu) para que ele não seja elegível', async () => {
    const { client } = clientReturning({ data: [{ id: 'm-b', organization_id: B, status: 'active', organizations: null }], error: null });
    expect(await createMembershipRecordSource(client)()).toEqual([
      { membershipId: 'm-b', organizationId: B, membershipStatus: 'active', organization: null },
    ]);
  });

  it('descarta linhas malformadas em vez de confiar nelas', async () => {
    const { client } = clientReturning({
      data: [
        { id: 1, organization_id: A, status: 'active', organizations: null },
        { id: 'm', organization_id: A, status: 'desconhecido', organizations: null },
        { id: 'm', organization_id: A, status: 'active', organizations: { id: A, kind: 'qualquer', status: 'active', display_name: 'X' } },
        null,
        'texto',
      ],
      error: null,
    });
    expect(await createMembershipRecordSource(client)()).toEqual([]);
  });

  it('trata a resposta que não é lista como vazia', async () => {
    expect(await createMembershipRecordSource(clientReturning({ data: null, error: null }).client)()).toEqual([]);
  });

  it('propaga a falha de consulta sem simular sucesso', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'JWT expired' } });
    await expect(createMembershipRecordSource(client)()).rejects.toThrow('memberships_query_failed');
  });
});

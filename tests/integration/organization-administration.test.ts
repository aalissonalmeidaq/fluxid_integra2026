// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createManageOrganizationsHandler, type OrganizationGateway } from '../../supabase/functions/manage-organizations/handler';

const request = (body: unknown) => new Request('http://local/manage-organizations', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('administração de organização', () => {
  it('convite inicial fica restrito ao tenant criado e ao papel Administrador do tenant', async () => {
    const inviteFirstAdmin = vi.fn(async () => ({ invitationId: '30000000-0000-0000-0000-000000000099' }));
    const gw = {
      authenticate: vi.fn(async () => ({ userId: '10000000-0000-0000-0000-000000000001', aal: 'aal2' as const, sessionActive: true, canManagePlatform: true, canManageMaster: false })),
      list: vi.fn(), create: vi.fn(), changeStatus: vi.fn(), inviteFirstAdmin, audit: vi.fn(async () => undefined),
    } as unknown as OrganizationGateway;
    const response = await createManageOrganizationsHandler(gw)(request({ operation: 'invite_first_admin', organization_id: '20000000-0000-0000-0000-000000000099', email: 'admin@empresa.invalid', justification: 'Responsável contratual' }));
    expect(response.status).toBe(202);
    expect(inviteFirstAdmin).toHaveBeenCalledWith(expect.objectContaining({ roleCode: 'admin_tenant', organizationId: '20000000-0000-0000-0000-000000000099' }));
  });
});

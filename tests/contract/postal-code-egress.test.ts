// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createLookupPostalCodeHandler, type LookupGateway } from '../../supabase/functions/lookup-postal-code/handler';
import { ViaCepProvider, type FetchLike } from '../../supabase/functions/lookup-postal-code/viacep-provider';

// CA-006 e RF-009: a ÚNICA chamada de saída é GET /ws/{8 dígitos}/json/, sem nenhum outro dado do formulário, mesmo que o corpo da
// requisição traga número, complemento, nome ou documento. Executa a função inteira (manipulador + adaptador) com um `fetch` capturado.

const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000700a2';
const ORG = '20000000-0000-4000-8000-00000000000a';

const gateway: LookupGateway = {
  authenticate: async () => ({ userId: USER, sessionId: SESSION }),
  checkPermission: async () => 'OK',
  takeToken: async () => true,
};

function capture() {
  const calls: Array<{ url: string; init: { method: string; headers: Record<string, string>; body?: unknown } }> = [];
  const fetcher: FetchLike = async (url, init) => {
    calls.push({ url, init: init as never });
    return new Response(JSON.stringify({ cep: '01001-000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP', ibge: '3550308' }), { status: 200 });
  };
  return { calls, handler: createLookupPostalCodeHandler({ gateway, provider: new ViaCepProvider(fetcher) }) };
}

const post = (body: unknown) =>
  new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt-secreto', cookie: 'sessao=abc', 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('saída para o provedor de CEP (CA-006)', () => {
  it('a única chamada externa é GET /ws/{CEP}/json/, mesmo com campos extras no corpo', async () => {
    const { calls, handler } = capture();
    const response = await handler(post({
      organization_id: ORG, postal_code: '01001-000', number: '10', complement: 'Sala 2', name: 'Hospital Alfa Ltda', document: '11222333000181',
      email: 'maria@exemplo.invalid', latitude: -23.55, notes: 'dado interno',
    }));
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe('https://viacep.com.br/ws/01001000/json/');
    expect(call?.init.method).toBe('GET');
    expect(call?.init.body).toBeUndefined();
  });

  it('nenhum dado do formulário, da pessoa ou da organização aparece na URL nem nos cabeçalhos', async () => {
    const { calls, handler } = capture();
    await handler(post({ organization_id: ORG, postal_code: '01001000', number: '10', name: 'Hospital Alfa Ltda', document: '11222333000181' }));
    const serialized = JSON.stringify(calls);
    for (const dado of ['Hospital Alfa', '11222333000181', 'maria@', ORG, USER, SESSION, 'jwt-secreto', 'sessao=abc', 'Sala 2']) {
      expect(serialized).not.toContain(dado);
    }
    expect(Object.keys(calls[0]?.init.headers ?? {}).sort()).toEqual(['accept', 'user-agent']);
    expect(new URL(calls[0]?.url ?? 'http://x').search).toBe('');
  });

  it('CEP inválido, sem permissão ou acima do limite nunca geram chamada externa', async () => {
    const fetcher = vi.fn();
    const negado = createLookupPostalCodeHandler({ gateway: { ...gateway, checkPermission: async () => 'ACCESS_DENIED' }, provider: new ViaCepProvider(fetcher as never) });
    const limitado = createLookupPostalCodeHandler({ gateway: { ...gateway, takeToken: async () => false }, provider: new ViaCepProvider(fetcher as never) });
    const normal = createLookupPostalCodeHandler({ gateway, provider: new ViaCepProvider(fetcher as never) });
    expect((await normal(post({ organization_id: ORG, postal_code: '0100' }))).status).toBe(400);
    expect((await negado(post({ organization_id: ORG, postal_code: '01001000' }))).status).toBe(403);
    expect((await limitado(post({ organization_id: ORG, postal_code: '01001000' }))).status).toBe(429);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

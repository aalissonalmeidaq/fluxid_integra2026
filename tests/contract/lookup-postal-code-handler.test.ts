// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  createLookupPostalCodeHandler, LIMITS, PROVIDER_TIMEOUT_MS, type LookupGateway, type PostalCodeProvider,
} from '../../supabase/functions/lookup-postal-code/handler';

// Spec 007, US1: função lookup-postal-code (RF-009 a RF-012, RNF-004). O provedor é sempre falso: o CI nunca chama o ViaCEP real.

const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000700a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const ADDRESS = { postal_code: '01001000', street: 'Praça da Sé', district: 'Sé', city: 'São Paulo', state: 'SP', ibge_code: '3550308' };

type Gateway = LookupGateway & { authenticate: ReturnType<typeof vi.fn>; checkPermission: ReturnType<typeof vi.fn>; takeToken: ReturnType<typeof vi.fn> };
const gateway = (overrides: Partial<LookupGateway> = {}): Gateway => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION })),
  checkPermission: vi.fn(async () => 'OK' as const),
  takeToken: vi.fn(async () => true),
  ...overrides,
}) as never;

type Provider = PostalCodeProvider & { lookup: ReturnType<typeof vi.fn> };
const provider = (impl: PostalCodeProvider['lookup'] = async () => ADDRESS): Provider => ({ lookup: vi.fn(impl) }) as never;

const post = (body: unknown, token: string | undefined = 'jwt', method = 'POST') =>
  new Request('http://local/fn', {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
const run = (gw: Gateway, prov: Provider, request: Request, log = vi.fn()) => createLookupPostalCodeHandler({ gateway: gw, provider: prov, log })(request);
const body = (response: Response) => response.json() as Promise<Record<string, unknown>>;

describe('lookup-postal-code: sucesso e CEP inexistente', () => {
  it('devolve o endereço padronizado e normaliza o CEP antes de chamar o provedor', async () => {
    const prov = provider();
    const response = await run(gateway(), prov, post({ organization_id: ORG, postal_code: ' 01001-000 ' }));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ code: 'FOUND', address: ADDRESS });
    expect(prov.lookup).toHaveBeenCalledTimes(1);
    expect(prov.lookup.mock.calls[0]?.[0]).toBe('01001000');
  });

  it('CEP que o provedor diz não existir é NOT_FOUND com HTTP 200', async () => {
    const response = await run(gateway(), provider(async () => 'NOT_FOUND'), post({ organization_id: ORG, postal_code: '99999999' }));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ code: 'NOT_FOUND' });
  });

  it('só o CEP é repassado: campos extras do corpo nunca chegam ao provedor', async () => {
    const prov = provider();
    await run(gateway(), prov, post({ organization_id: ORG, postal_code: '01001000', number: '10', complement: 'sala 2', name: 'Hospital Alfa', document: '11222333000181' }));
    expect(prov.lookup).toHaveBeenCalledTimes(1);
    expect(prov.lookup.mock.calls[0]).toHaveLength(2);
    expect(JSON.stringify(prov.lookup.mock.calls[0]?.[0])).toBe('"01001000"');
  });
});

describe('lookup-postal-code: validação e autorização antes de qualquer chamada externa', () => {
  it.each([['0100100'], ['010010000'], ['0100A000'], [''], [12345678], [null]])('CEP inválido %j: 400 sem chamar o provedor', async (cep) => {
    const prov = provider();
    const gw = gateway();
    const response = await run(gw, prov, post({ organization_id: ORG, postal_code: cep }));
    expect(response.status).toBe(400);
    expect((await body(response)).code).toBe('VALIDATION_FAILED');
    expect(prov.lookup).not.toHaveBeenCalled();
    expect(gw.takeToken).not.toHaveBeenCalled();
  });

  it('só aceita POST e responde ao preflight', async () => {
    expect((await run(gateway(), provider(), post({}, 'jwt', 'GET'))).status).toBe(405);
    expect((await run(gateway(), provider(), new Request('http://local/fn', { method: 'OPTIONS' }))).status).toBe(204);
  });

  it('sem token ou com token inválido: 401, sem consultar permissão nem provedor', async () => {
    const prov = provider();
    const gw = gateway();
    expect((await run(gw, prov, post({ organization_id: ORG, postal_code: '01001000' }, ''))).status).toBe(401);
    const invalid = gateway({ authenticate: vi.fn(async () => null) });
    expect((await run(invalid, prov, post({ organization_id: ORG, postal_code: '01001000' }))).status).toBe(401);
    expect(gw.checkPermission).not.toHaveBeenCalled();
    expect(prov.lookup).not.toHaveBeenCalled();
  });

  it('corpo inválido ou organização que não é UUID: 400', async () => {
    const prov = provider();
    expect((await run(gateway(), prov, new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt' }, body: 'não é json' }))).status).toBe(400);
    expect((await run(gateway(), prov, post({ organization_id: 'abc', postal_code: '01001000' }))).status).toBe(400);
    expect((await run(gateway(), prov, post([1, 2]))).status).toBe(400);
    expect(prov.lookup).not.toHaveBeenCalled();
  });

  it('sem a permissão customer.write: 403, sem consumir limite nem chamar o provedor', async () => {
    const prov = provider();
    const gw = gateway({ checkPermission: vi.fn(async () => 'ACCESS_DENIED' as const) });
    const response = await run(gw, prov, post({ organization_id: ORG, postal_code: '01001000' }));
    expect(response.status).toBe(403);
    expect(gw.takeToken).not.toHaveBeenCalled();
    expect(prov.lookup).not.toHaveBeenCalled();
  });

  it('sessão vencida (AUTH_REQUIRED do banco): 401', async () => {
    const gw = gateway({ checkPermission: vi.fn(async () => 'AUTH_REQUIRED' as const) });
    expect((await run(gw, provider(), post({ organization_id: ORG, postal_code: '01001000' }))).status).toBe(401);
  });

  it('falha na conferência de permissão é erro interno, nunca liberação', async () => {
    const prov = provider();
    const gw = gateway({ checkPermission: vi.fn(async () => { throw new Error('rpc_failed'); }) });
    expect((await run(gw, prov, post({ organization_id: ORG, postal_code: '01001000' }))).status).toBe(500);
    expect(prov.lookup).not.toHaveBeenCalled();
  });
});

describe('lookup-postal-code: limite de taxa (10/min por pessoa, 100/min por organização)', () => {
  it('usa os dois baldes com a pessoa e a organização como sujeito (nunca o CEP)', async () => {
    const gw = gateway();
    await run(gw, provider(), post({ organization_id: ORG, postal_code: '01001000' }));
    expect(gw.takeToken).toHaveBeenCalledWith('postal_code:user', USER, 10, 60);
    expect(gw.takeToken).toHaveBeenCalledWith('postal_code:org', ORG, 100, 60);
    expect(LIMITS.user.limit).toBe(10);
    expect(LIMITS.organization.limit).toBe(100);
  });

  it('passou do limite da pessoa: 429 com o tempo para tentar de novo, sem chamar o provedor', async () => {
    const prov = provider();
    const gw = gateway({ takeToken: vi.fn(async (bucket: string) => bucket !== 'postal_code:user') });
    const response = await run(gw, prov, post({ organization_id: ORG, postal_code: '01001000' }));
    expect(response.status).toBe(429);
    expect(await body(response)).toEqual({ code: 'RATE_LIMITED', retry_after_seconds: 60 });
    expect(prov.lookup).not.toHaveBeenCalled();
  });

  it('passou do limite da organização: 429', async () => {
    const gw = gateway({ takeToken: vi.fn(async (bucket: string) => bucket !== 'postal_code:org') });
    expect((await run(gw, provider(), post({ organization_id: ORG, postal_code: '01001000' }))).status).toBe(429);
  });

  it('as duas tentativas são contadas mesmo quando o limite já estourou', async () => {
    const gw = gateway({ takeToken: vi.fn(async () => false) });
    await run(gw, provider(), post({ organization_id: ORG, postal_code: '01001000' }));
    expect(gw.takeToken).toHaveBeenCalledTimes(2);
  });

  it('falha ao consumir o limite é erro interno, nunca liberação', async () => {
    const prov = provider();
    const gw = gateway({ takeToken: vi.fn(async () => { throw new Error('rpc_failed'); }) });
    expect((await run(gw, prov, post({ organization_id: ORG, postal_code: '01001000' }))).status).toBe(500);
    expect(prov.lookup).not.toHaveBeenCalled();
  });
});

describe('lookup-postal-code: falhas do provedor nunca bloqueiam o cadastro', () => {
  it.each([
    ['exceção do provedor', async () => { throw new Error('provider_status'); }],
    ['resposta inválida', async () => { throw new Error('provider_body'); }],
  ])('%s vira 503 SERVICE_UNAVAILABLE', async (_nome, impl) => {
    const response = await run(gateway(), provider(impl as never), post({ organization_id: ORG, postal_code: '01001000' }));
    expect(response.status).toBe(503);
    expect(await body(response)).toEqual({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('tempo esgotado (prazo de 4 s) aborta a chamada e vira 503', async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const prov = provider((_cep, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
      }));
      const pending = run(gateway(), prov, post({ organization_id: ORG, postal_code: '01001000' }));
      await vi.advanceTimersByTimeAsync(PROVIDER_TIMEOUT_MS);
      const response = await pending;
      expect(aborted).toBe(true);
      expect(response.status).toBe(503);
      expect(PROVIDER_TIMEOUT_MS).toBeLessThanOrEqual(5000);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('lookup-postal-code: registro sem dado da pessoa (RF-012)', () => {
  it('o log tem só código e duração: nunca o CEP, o ator, a sessão nem a organização', async () => {
    const log = vi.fn();
    let tick = 0;
    const handler = createLookupPostalCodeHandler({ gateway: gateway(), provider: provider(), log, now: () => (tick += 7) });
    await handler(post({ organization_id: ORG, postal_code: '01001-000' }));
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toEqual({ code: 'FOUND', durationMs: 7 });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/01001|10000000|60000000|20000000/);
  });

  it('as respostas nunca vêm do cache e não carregam dado da organização', async () => {
    const response = await run(gateway(), provider(), post({ organization_id: ORG, postal_code: '01001000' }));
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

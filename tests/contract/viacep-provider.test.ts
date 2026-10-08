// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { USER_AGENT, VIACEP_BASE_URL, ViaCepProvider, type FetchLike } from '../../supabase/functions/lookup-postal-code/viacep-provider';

// Adaptador do ViaCEP com as três respostas reais observadas em 07/10/2026 (research.md, decisão 5). Nunca chama a rede.

const signal = new AbortController().signal;

const REAL_FOUND = {
  cep: '01001-000', logradouro: 'Praça da Sé', complemento: 'lado ímpar', unidade: '', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP',
  estado: 'São Paulo', regiao: 'Sudeste', ibge: '3550308', gia: '1004', ddd: '11', siafi: '7107',
};

const fetcherOf = (status: number, body: unknown, asText = false): FetchLike & ReturnType<typeof vi.fn> =>
  vi.fn(async () => new Response(asText ? String(body) : JSON.stringify(body), { status, headers: { 'content-type': asText ? 'text/html' : 'application/json' } })) as never;

describe('ViaCepProvider: o que sai para o provedor (RF-009, CA-006)', () => {
  it('só o CEP no caminho da URL, método GET, cabeçalhos fixos, sem corpo e sem query', async () => {
    const fetcher = fetcherOf(200, REAL_FOUND);
    await new ViaCepProvider(fetcher).lookup('01001000', signal);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, { method: string; headers: Record<string, string>; signal: AbortSignal; body?: unknown }];
    expect(url).toBe('https://viacep.com.br/ws/01001000/json/');
    expect(url).toBe(`${VIACEP_BASE_URL}/01001000/json/`);
    expect(new URL(url).search).toBe('');
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({ accept: 'application/json', 'user-agent': USER_AGENT });
    expect(USER_AGENT).toBe('FluxID/1.0');
    expect(init.body).toBeUndefined();
    expect(init.signal).toBe(signal);
  });

  it('CEP que não tem 8 dígitos nunca chega à rede', async () => {
    const fetcher = fetcherOf(200, REAL_FOUND);
    await expect(new ViaCepProvider(fetcher).lookup('0100', signal)).rejects.toThrow();
    await expect(new ViaCepProvider(fetcher).lookup('01001-000', signal)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('ViaCepProvider: respostas reais', () => {
  it('CEP existente: devolve só os campos padronizados e ignora o "complemento" do logradouro', async () => {
    const result = await new ViaCepProvider(fetcherOf(200, REAL_FOUND)).lookup('01001000', signal);
    expect(result).toEqual({ postal_code: '01001000', street: 'Praça da Sé', district: 'Sé', city: 'São Paulo', state: 'SP', ibge_code: '3550308' });
    expect(JSON.stringify(result)).not.toMatch(/lado ímpar|Sudeste|1004|7107/);
  });

  it('CEP que não existe: HTTP 200 com {"erro":"true"} (texto) vira NOT_FOUND', async () => {
    expect(await new ViaCepProvider(fetcherOf(200, { erro: 'true' })).lookup('99999999', signal)).toBe('NOT_FOUND');
  });

  it('a documentação antiga cita erro booleano: os dois valores valem', async () => {
    expect(await new ViaCepProvider(fetcherOf(200, { erro: true })).lookup('99999999', signal)).toBe('NOT_FOUND');
  });

  it('CEP malformado: HTTP 400 em HTML é falha do provedor, não CEP inexistente', async () => {
    await expect(new ViaCepProvider(fetcherOf(400, '<html><title>ViaCEP 400</title></html>', true)).lookup('01001000', signal)).rejects.toThrow('provider_status');
  });

  it.each([[500], [502], [503], [429], [404]])('HTTP %s é falha do provedor', async (status) => {
    await expect(new ViaCepProvider(fetcherOf(status, {})).lookup('01001000', signal)).rejects.toThrow('provider_status');
  });

  it('exceção de rede (ou tempo esgotado) sobe para o manipulador', async () => {
    const quebrado: FetchLike = async () => { throw new Error('network'); };
    await expect(new ViaCepProvider(quebrado).lookup('01001000', signal)).rejects.toThrow('network');
  });
});

describe('ViaCepProvider: resposta suspeita ou incompleta', () => {
  it.each([
    ['JSON inválido', 'isto não é json', true],
    ['lista em vez de objeto', [REAL_FOUND], false],
    ['sem cidade', { ...REAL_FOUND, localidade: '' }, false],
    ['UF fora das 27', { ...REAL_FOUND, uf: 'XX' }, false],
    ['UF ausente', { ...REAL_FOUND, uf: undefined }, false],
    ['corpo nulo', null, false],
  ])('%s é falha do provedor', async (_nome, corpo, texto) => {
    await expect(new ViaCepProvider(fetcherOf(200, corpo, texto)).lookup('01001000', signal)).rejects.toThrow();
  });

  it('CEP genérico (de cidade inteira) vem sem logradouro e bairro, e isso é aceito', async () => {
    const result = await new ViaCepProvider(fetcherOf(200, { ...REAL_FOUND, logradouro: '', bairro: '' })).lookup('13000000', signal);
    expect(result).toMatchObject({ street: '', district: '', city: 'São Paulo', state: 'SP' });
  });

  it('limita o tamanho dos textos e descarta IBGE fora do formato', async () => {
    const result = await new ViaCepProvider(fetcherOf(200, { ...REAL_FOUND, logradouro: 'R'.repeat(300), bairro: 'B'.repeat(200), localidade: 'C'.repeat(200), ibge: 'abc' })).lookup('01001000', signal);
    expect(result).toMatchObject({ ibge_code: null });
    if (result !== 'NOT_FOUND') {
      expect(result.street).toHaveLength(120);
      expect(result.district).toHaveLength(80);
      expect(result.city).toHaveLength(80);
    }
  });

  it('UF em minúsculas é normalizada', async () => {
    expect(await new ViaCepProvider(fetcherOf(200, { ...REAL_FOUND, uf: 'sp' })).lookup('01001000', signal)).toMatchObject({ state: 'SP' });
  });
});

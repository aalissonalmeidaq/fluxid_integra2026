import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Providers } from './providers';
import { useConnectivity } from './connectivity-context';
import { createValidEnv } from '@/test/fixtures/environment';
import { MOCK_URLS } from '@/test/fixtures/connectivity';

type HostBehavior = 'ok' | 'down' | 'incompatible' | 'unauthorized';

// Simula health e compatibilidade por destino; a versão esperada vem de createValidEnv.
function serveHosts(hosts: Partial<Record<keyof typeof MOCK_URLS, HostBehavior>>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const kind = (Object.keys(MOCK_URLS) as Array<keyof typeof MOCK_URLS>).find((key) => url.startsWith(MOCK_URLS[key]));
    const behavior = (kind && hosts[kind]) ?? 'down';
    if (behavior === 'down') throw new TypeError('network');
    if (behavior === 'unauthorized' && url.endsWith('/auth/v1/health')) return new Response(null, { status: 401 });
    if (url.endsWith('/functions/v1/public-compatibility')) {
      return Response.json({ contractVersion: behavior === 'incompatible' ? '0.0' : '002.1' });
    }
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  }) as unknown as typeof fetch;
}

function TestConsumer(): React.JSX.Element {
  const { result, client, reconnect, reportOperationalError } = useConnectivity();
  return (
    <div>
      <span data-testid="state">{result.state}</span>
      <span data-testid="endpoint">{result.selectedEndpoint ?? 'none'}</span>
      <span data-testid="client">{client ? 'active' : 'none'}</span>
      <span data-testid="outcome">{result.attempts.at(-1)?.outcome ?? 'none'}</span>
      <button
        type="button"
        onClick={() => reportOperationalError({ statusCode: 401, code: 'PGRST301' } as never)}
      >
        Simular Erro Operacional
      </button>
      <button type="button" onClick={() => void reconnect()}>
        Reconectar
      </button>
      <button type="button" onClick={() => reportOperationalError({ networkError: true })}>
        Simular Falha de Rede
      </button>
    </div>
  );
}

describe('Providers & Estabilidade de Sessão (História 3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = serveHosts({ local: 'ok', lan: 'ok', cloud: 'ok' });
  });

  it('mantém a sessão estável e transita para blocked ao receber erro operacional, sem fallback automático', async () => {
    const validEnv = createValidEnv('local');

    render(
      <Providers customEnv={validEnv}>
        <TestConsumer />
      </Providers>
    );

    // Aguarda o término da resolução
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByTestId('state')).toHaveTextContent('connected');
    expect(screen.getByTestId('endpoint')).toHaveTextContent('local');
    expect(screen.getByTestId('client')).toHaveTextContent('active');

    // Simula erro operacional (ex: 401)
    act(() => {
      screen.getByText('Simular Erro Operacional').click();
    });

    expect(screen.getByTestId('state')).toHaveTextContent('blocked');
    expect(screen.getByTestId('endpoint')).toHaveTextContent('local'); // Preservado para diagnóstico
    expect(screen.getByTestId('outcome')).toHaveTextContent('authentication');
    expect(screen.getByTestId('client')).toHaveTextContent('none');
  });

  it('permite reiniciar a sondagem exclusivamente por ação explícita de reconexão', async () => {
    const validEnv = createValidEnv('local');

    render(
      <Providers customEnv={validEnv}>
        <TestConsumer />
      </Providers>
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    act(() => {
      screen.getByText('Simular Erro Operacional').click();
    });
    expect(screen.getByTestId('state')).toHaveTextContent('blocked');

    // Aciona reconexão explícita
    await act(async () => {
      screen.getByText('Reconectar').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByTestId('state')).toHaveTextContent('connected');
    expect(screen.getByTestId('client')).toHaveTextContent('active');
  });

  it('descarta o cliente em offline e durante uma nova sondagem', async () => {
    const validEnv = createValidEnv('local');

    render(
      <Providers customEnv={validEnv}>
        <TestConsumer />
      </Providers>
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.getByTestId('client')).toHaveTextContent('active');

    act(() => {
      screen.getByText('Simular Falha de Rede').click();
    });
    expect(screen.getByTestId('state')).toHaveTextContent('offline');
    expect(screen.getByTestId('client')).toHaveTextContent('none');

    global.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
    act(() => {
      screen.getByText('Reconectar').click();
    });
    expect(screen.getByTestId('state')).toHaveTextContent('probing');
    expect(screen.getByTestId('client')).toHaveTextContent('none');
  });

  async function renderAuto(hosts: Parameters<typeof serveHosts>[0]) {
    global.fetch = serveHosts(hosts);
    render(
      <Providers customEnv={createValidEnv('auto')}>
        <TestConsumer />
      </Providers>
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  }

  it('prioriza a cloud no modo automático e não sonda LAN nem local', async () => {
    await renderAuto({ cloud: 'ok', lan: 'ok', local: 'ok' });
    expect(screen.getByTestId('state')).toHaveTextContent('connected');
    expect(screen.getByTestId('endpoint')).toHaveTextContent('cloud');
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.startsWith(MOCK_URLS.lan) || url.startsWith(MOCK_URLS.local))).toBe(false);
  });

  it('usa LAN em modo degradado quando a cloud está tecnicamente indisponível', async () => {
    await renderAuto({ cloud: 'down', lan: 'ok', local: 'ok' });
    expect(screen.getByTestId('state')).toHaveTextContent('degraded');
    expect(screen.getByTestId('endpoint')).toHaveTextContent('lan');
    expect(screen.getByTestId('client')).toHaveTextContent('active');
  });

  it('usa local somente depois de cloud e LAN indisponíveis', async () => {
    await renderAuto({ cloud: 'down', lan: 'down', local: 'ok' });
    expect(screen.getByTestId('state')).toHaveTextContent('degraded');
    expect(screen.getByTestId('endpoint')).toHaveTextContent('local');
  });

  it('fica offline quando nenhum destino está disponível', async () => {
    await renderAuto({});
    expect(screen.getByTestId('state')).toHaveTextContent('offline');
    expect(screen.getByTestId('client')).toHaveTextContent('none');
  });

  it('bloqueia sem fallback quando o contrato da cloud é incompatível', async () => {
    await renderAuto({ cloud: 'incompatible', lan: 'ok', local: 'ok' });
    expect(screen.getByTestId('state')).toHaveTextContent('blocked');
    expect(screen.getByTestId('client')).toHaveTextContent('none');
  });

  it('bloqueia sem fallback quando a cloud recusa por autorização', async () => {
    await renderAuto({ cloud: 'unauthorized', lan: 'ok', local: 'ok' });
    expect(screen.getByTestId('state')).toHaveTextContent('blocked');
    expect(screen.getByTestId('endpoint')).toHaveTextContent('none');
  });

  it('mantém modo explícito como conectado, sem sinalizar degradação', async () => {
    global.fetch = serveHosts({ local: 'ok' });
    render(
      <Providers customEnv={createValidEnv('local')}>
        <TestConsumer />
      </Providers>
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.getByTestId('state')).toHaveTextContent('connected');
    expect(screen.getByTestId('endpoint')).toHaveTextContent('local');
  });

  // Celular na mesma rede: o loopback do Supabase local apontaria para o próprio celular (só em desenvolvimento).
  it('em desenvolvimento, sonda o Supabase local pelo servidor da própria página, quando aberta de outro aparelho', async () => {
    const fetchSpy = serveHosts({});
    global.fetch = fetchSpy;
    vi.stubGlobal('location', { ...window.location, hostname: '10.113.14.8', origin: 'http://10.113.14.8:3000' });
    try {
      render(
        <Providers customEnv={createValidEnv('local')}>
          <TestConsumer />
        </Providers>
      );
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
    } finally {
      vi.unstubAllGlobals();
    }
    const urls = (fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([input]) => String(input));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url.startsWith('http://10.113.14.8:3000/supabase-local'))).toBe(true);
  });
});

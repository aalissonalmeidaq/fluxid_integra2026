import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConnectivityContext, initialResult, type ConnectivityContextValue } from '@/app/connectivity-context';
import type { AppConfig } from '@/config/environment';
import { RecoveryConfirmPage } from './recovery-confirm-page';
import { RecoveryRequestPage } from './recovery-request-page';

const config = {
  endpoints: [{ kind: 'local', url: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_sintetica' }],
} as unknown as AppConfig;

function renderWithConnectivity(ui: React.ReactElement, over: Partial<ConnectivityContextValue> = {}) {
  const value: ConnectivityContextValue = {
    result: { ...initialResult, state: 'connected', selectedEndpoint: 'local' } as ConnectivityContextValue['result'],
    client: null,
    config,
    reconnect: async () => {},
    reportOperationalError: () => {},
    ...over,
  };
  return render(<ConnectivityContext.Provider value={value}>{ui}</ConnectivityContext.Provider>);
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('RecoveryRequestPage', () => {
  const fillEmail = (value: string) => fireEvent.change(screen.getByLabelText('E-mail'), { target: { value } });
  const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Enviar instruções' }));

  it('envia o e-mail normalizado ao servidor e mostra a mesma mensagem, sem revelar se a conta existe', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 'RECOVERY_REQUEST_ACCEPTED' }), { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    renderWithConnectivity(<RecoveryRequestPage onBack={() => {}} />);
    fillEmail('  Ana@Example.Invalid ');
    submit();

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('Se existir uma conta para este e-mail, enviaremos as instruções de recuperação.');
    await waitFor(() => expect(notice).toHaveFocus());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:54321/functions/v1/password-recovery');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'ana@example.invalid' });
    expect((init.headers as Record<string, string>).apikey).toBe('sb_publishable_sintetica');
  });

  it('recusa e-mail inválido sem chamar o servidor', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderWithConnectivity(<RecoveryRequestPage onBack={() => {}} />);
    fillEmail('isto-nao-e-email');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe um e-mail válido.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('informa indisponibilidade quando o servidor não aceita ou a rede falha', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('rede'); }));
    renderWithConnectivity(<RecoveryRequestPage onBack={() => {}} />);
    fillEmail('ana@example.invalid');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível solicitar agora.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('trata resposta sem JSON como indisponibilidade', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('erro', { status: 502 })));
    renderWithConnectivity(<RecoveryRequestPage onBack={() => {}} />);
    fillEmail('ana@example.invalid');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível solicitar agora.');
  });

  it('sem destino de conexão selecionado não há envio e a orientação aparece', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderWithConnectivity(<RecoveryRequestPage onBack={() => {}} />, { config: null });
    fillEmail('ana@example.invalid');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Verifique a conexão e tente novamente.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bloqueia envio duplicado enquanto aguarda e permite voltar para entrar', async () => {
    let release!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const onBack = vi.fn();
    renderWithConnectivity(<RecoveryRequestPage onBack={onBack} />);
    fillEmail('ana@example.invalid');
    submit();
    const pending = await screen.findByRole('button', { name: 'Enviando…' });
    expect(pending).toBeDisabled();
    release(new Response(JSON.stringify({ code: 'RECOVERY_REQUEST_ACCEPTED' }), { status: 202 }));
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para entrar' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('RecoveryConfirmPage', () => {
  const fill = (password: string, confirmation: string) => {
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: confirmation } });
  };
  const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Definir nova senha' }));
  const clientWith = (error: unknown) => ({ auth: { updateUser: vi.fn(async () => ({ error })) } }) as unknown as ConnectivityContextValue['client'];

  it('atualiza a senha e confirma com mensagem acessível', async () => {
    const client = clientWith(null);
    renderWithConnectivity(<RecoveryConfirmPage />, { client });
    fill('Senha-Forte-123', 'Senha-Forte-123');
    submit();
    expect(await screen.findByRole('status')).toHaveTextContent('Senha atualizada.');
    expect((client as unknown as { auth: { updateUser: ReturnType<typeof vi.fn> } }).auth.updateUser).toHaveBeenCalledWith({ password: 'Senha-Forte-123' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['senha curta', 'curta', 'curta'],
    ['confirmação diferente', 'Senha-Forte-123', 'Senha-Forte-124'],
  ])('recusa %s sem chamar o servidor e devolve o foco ao erro', async (_name, password, confirmation) => {
    const client = clientWith(null);
    renderWithConnectivity(<RecoveryConfirmPage />, { client });
    fill(password, confirmation);
    submit();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Use ao menos 12 caracteres e confirme a mesma senha.');
    await waitFor(() => expect(alert).toHaveFocus());
    expect((client as unknown as { auth: { updateUser: ReturnType<typeof vi.fn> } }).auth.updateUser).not.toHaveBeenCalled();
  });

  it('link inválido ou expirado oferece solicitar um novo link', async () => {
    renderWithConnectivity(<RecoveryConfirmPage />, { client: clientWith({ message: 'expired' }) });
    fill('Senha-Forte-123', 'Senha-Forte-123');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Link inválido ou expirado. Solicite um novo link.');
    expect(screen.getByRole('button', { name: 'Solicitar novo link' })).toBeInTheDocument();
  });

  it('sem cliente conectado trata como link inválido, sem afirmar sucesso', async () => {
    renderWithConnectivity(<RecoveryConfirmPage />, { client: null });
    fill('Senha-Forte-123', 'Senha-Forte-123');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Link inválido ou expirado.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

// Spec 003: apresentação no padrão do design system, sem mudar mensagens nem comportamento.
describe('Recuperação de acesso: apresentação (Spec 003)', () => {
  it('a confirmação da solicitação usa o alerta de sucesso do padrão, com foco e a mensagem genérica', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'RECOVERY_REQUEST_ACCEPTED' }), { status: 202 })));
    renderWithConnectivity(<RecoveryRequestPage onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@example.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instruções' }));
    const notice = await screen.findByRole('status');
    expect(notice).toHaveAttribute('data-variant', 'sucesso');
    expect(notice.querySelector('svg')).not.toBeNull();
    await waitFor(() => expect(notice).toHaveFocus());
  });

  it('o erro da solicitação usa o alerta de erro do padrão', async () => {
    renderWithConnectivity(<RecoveryRequestPage onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'isto-nao-e-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instruções' }));
    expect(await screen.findByRole('alert')).toHaveAttribute('data-variant', 'erro');
  });

  it('durante o envio o botão informa o andamento, fica bloqueado e nenhum status é anunciado antes do resultado', async () => {
    let release!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    renderWithConnectivity(<RecoveryRequestPage onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@example.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instruções' }));
    expect(await screen.findByRole('button', { name: /enviando/i })).toBeDisabled();
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    release(new Response(JSON.stringify({ code: 'RECOVERY_REQUEST_ACCEPTED' }), { status: 202 }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'sucesso'));
  });

  it('o erro da nova senha usa o alerta de erro do padrão e leva o foco até ele', async () => {
    renderWithConnectivity(<RecoveryConfirmPage />, { client: null });
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'curta' } });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'curta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Definir nova senha' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('data-variant', 'erro');
    await waitFor(() => expect(alert).toHaveFocus());
  });
});

// Spec 005 (RF-001, RF-007): as telas públicas de recuperação usam a mesma moldura de marca, com um só h1 e sem menu.
describe('Recuperação de senha: moldura renovada', () => {
  it('a tela de nova senha tem o painel de marca e um só h1', () => {
    renderWithConnectivity(<RecoveryConfirmPage />);
    expect(screen.getByText('Controle seus ativos.')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProfileOutcome, ProfileService, ProfileView } from '@/application/identity/profile-service';
import { ProfileView as ProfileScreen } from './profile-page';

const view: ProfileView = { displayName: 'Ana Souza', locale: 'pt-BR', avatarUrl: 'https://storage.example.invalid/sign/abc' };
const ok = (over: Partial<ProfileView> = {}): ProfileOutcome => ({ kind: 'success', value: { ...view, ...over } });

const text = (value: string) => Uint8Array.from([...value].map((char) => char.charCodeAt(0)));
const chunk = (type: string, length: number) => [0, 0, 0, length, ...text(type), ...new Array<number>(length).fill(0), 0, 0, 0, 0];
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', 13), ...chunk('IDAT', 8), ...chunk('IEND', 0)]);

function fakeService(overrides: Record<string, unknown> = {}) {
  return {
    load: vi.fn(async () => ok()),
    save: vi.fn(async () => ok({ displayName: 'Ana Maria' })),
    uploadAvatar: vi.fn(async () => ok()),
    removeAvatar: vi.fn(async () => ok({ avatarUrl: null })),
    ...overrides,
  } as unknown as ProfileService & Record<'load' | 'save' | 'uploadAvatar' | 'removeAvatar', ReturnType<typeof vi.fn>>;
}

const renderScreen = (service: ReturnType<typeof fakeService> | null = fakeService()) => {
  render(<ProfileScreen service={service} />);
  return service;
};

const fileOf = (content: Uint8Array, name = 'foto.png', type = 'image/png') => new File([content as unknown as BlobPart], name, { type });
const choose = (file: File) => fireEvent.change(screen.getByLabelText('Escolher nova foto'), { target: { files: [file] } });

describe('ProfilePage: leitura', () => {
  it('apresenta carregamento e depois nome, locale em texto e o avatar com texto alternativo', async () => {
    renderScreen();
    expect(screen.getByRole('status')).toHaveTextContent(/carregando/i);
    expect(await screen.findByLabelText('Nome de exibição')).toHaveValue('Ana Souza');
    expect(screen.getByText(/português \(brasil\)/i)).toBeInTheDocument();
    const image = screen.getByRole('img', { name: /foto de perfil de ana souza/i });
    expect(image).toHaveAttribute('src', view.avatarUrl);
  });

  it('sem avatar mostra as iniciais como alternativa e não renderiza imagem', async () => {
    renderScreen(fakeService({ load: vi.fn(async () => ok({ avatarUrl: null })) }));
    await screen.findByLabelText('Nome de exibição');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('AS')).toBeInTheDocument();
    expect(screen.getByText(/nenhuma foto/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remover foto/i })).not.toBeInTheDocument();
  });

  it.each([
    ['unavailable', /não foi possível carregar/i],
    ['access_denied', /acesso negado/i],
  ] as const)('anuncia %s como alerta sem exibir dados', async (kind, message) => {
    renderScreen(fakeService({ load: vi.fn(async () => ({ kind })) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByLabelText('Nome de exibição')).not.toBeInTheDocument();
  });

  it('sem conexão informa a indisponibilidade', async () => {
    renderScreen(null);
    expect(await screen.findByRole('alert')).toHaveTextContent(/conexão indisponível/i);
  });

  it('não exibe campos de identidade, tenant, papel ou permissão como editáveis', async () => {
    renderScreen();
    await screen.findByLabelText('Nome de exibição');
    expect(screen.queryByLabelText(/e-mail|papel|permiss|organiza|tenant|status/i)).not.toBeInTheDocument();
  });
});

describe('ProfilePage: nome', () => {
  it('salva o nome informado e anuncia o resultado', async () => {
    const service = renderScreen()!;
    const input = await screen.findByLabelText('Nome de exibição');
    fireEvent.change(input, { target: { value: '  Ana   Maria ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
    await waitFor(() => expect(service.save).toHaveBeenCalledWith({ displayName: '  Ana   Maria ' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/perfil atualizado/i);
    expect(screen.getByLabelText('Nome de exibição')).toHaveValue('Ana Maria');
  });

  it('valida o nome no cliente, associa o erro ao campo e não chama o servidor', async () => {
    const service = renderScreen()!;
    fireEvent.change(await screen.findByLabelText('Nome de exibição'), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(service.save).not.toHaveBeenCalled();
    const input = screen.getByLabelText('Nome de exibição');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(input.getAttribute('aria-describedby')!.split(' ')[0]!)).toHaveTextContent(/entre 2 e 100 caracteres/i);
  });

  it.each([
    ['invalid_name', /entre 2 e 100 caracteres/i],
    ['access_denied', /acesso negado/i],
    ['unavailable', /não foi possível salvar/i],
  ] as const)('traduz %s ao salvar sem informar sucesso', async (kind, message) => {
    renderScreen(fakeService({ save: vi.fn(async () => ({ kind })) }));
    await screen.findByLabelText('Nome de exibição');
    fireEvent.change(screen.getByLabelText('Nome de exibição'), { target: { value: 'Ana Maria' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText(/perfil atualizado/i)).not.toBeInTheDocument();
  });

  it('impede envio duplo enquanto salva', async () => {
    let release!: (value: ProfileOutcome) => void;
    const service = renderScreen(fakeService({ save: vi.fn(() => new Promise<ProfileOutcome>((resolve) => { release = resolve; })) }))!;
    await screen.findByLabelText('Nome de exibição');
    fireEvent.change(screen.getByLabelText('Nome de exibição'), { target: { value: 'Ana Maria' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
    fireEvent.click(screen.getByRole('button', { name: /salvando/i }));
    expect(service.save).toHaveBeenCalledTimes(1);
    release(ok());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar nome' })).toBeEnabled());
  });
});

describe('ProfilePage: avatar', () => {
  it('só oferece os formatos JPEG, PNG e WebP e informa o limite de 2 MB em texto', async () => {
    renderScreen();
    const input = await screen.findByLabelText('Escolher nova foto');
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(input).toHaveAttribute('type', 'file');
    expect(screen.getByText(/jpeg, png ou webp, até 2 mb/i)).toBeInTheDocument();
  });

  it('envia o arquivo escolhido com os bytes, o tipo e o nome, e atualiza a imagem', async () => {
    const service = fakeService({ uploadAvatar: vi.fn(async () => ok({ avatarUrl: 'https://storage.example.invalid/sign/nova' })) });
    renderScreen(service);
    await screen.findByLabelText('Escolher nova foto');
    choose(fileOf(png()));
    await waitFor(() => expect(service.uploadAvatar).toHaveBeenCalledTimes(1));
    const [file] = service.uploadAvatar.mock.calls[0] as [{ bytes: Uint8Array; type: string; name: string }];
    expect(file.type).toBe('image/png');
    expect(file.name).toBe('foto.png');
    expect(file.bytes).toBeInstanceOf(Uint8Array);
    expect(file.bytes.length).toBe(png().length);
    expect(await screen.findByRole('status')).toHaveTextContent(/foto atualizada/i);
    expect(screen.getByRole('img', { name: /foto de perfil/i })).toHaveAttribute('src', 'https://storage.example.invalid/sign/nova');
  });

  it.each([
    ['file_type', /formato não aceito/i],
    ['file_too_large', /maior que 2 mb/i],
    ['file_content', /não parece uma imagem válida/i],
    ['rate_limited', /muitas trocas/i],
    ['access_denied', /acesso negado/i],
    ['upload_failed', /não foi possível enviar/i],
    ['unavailable', /não foi possível enviar/i],
  ] as const)('anuncia %s com mensagem acessível e mantém a foto atual', async (kind, message) => {
    renderScreen(fakeService({ uploadAvatar: vi.fn(async () => ({ kind })) }));
    await screen.findByLabelText('Escolher nova foto');
    choose(fileOf(png()));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('img', { name: /foto de perfil/i })).toHaveAttribute('src', view.avatarUrl);
    expect(screen.queryByText(/foto atualizada/i)).not.toBeInTheDocument();
  });

  it('limpa a seleção do campo de arquivo para permitir escolher o mesmo arquivo novamente', async () => {
    renderScreen();
    const input = await screen.findByLabelText('Escolher nova foto') as HTMLInputElement;
    choose(fileOf(png()));
    await screen.findByRole('status');
    expect(input.value).toBe('');
  });

  it('remove a foto e volta às iniciais', async () => {
    const service = renderScreen()!;
    fireEvent.click(await screen.findByRole('button', { name: 'Remover foto' }));
    await waitFor(() => expect(service.removeAvatar).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status')).toHaveTextContent(/foto removida/i);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('não informa sucesso quando a remoção falha', async () => {
    renderScreen(fakeService({ removeAvatar: vi.fn(async () => ({ kind: 'upload_failed' })) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover foto' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível remover/i);
    expect(screen.getByRole('img', { name: /foto de perfil/i })).toBeInTheDocument();
  });

  it('se a imagem assinada não carregar, cai para as iniciais e pede nova URL', async () => {
    const service = fakeService();
    renderScreen(service);
    fireEvent.error(await screen.findByRole('img', { name: /foto de perfil/i }));
    await waitFor(() => expect(service.load).toHaveBeenCalledTimes(2));
  });

  it('usa alvos de toque de 44 px e rótulos visíveis', async () => {
    renderScreen();
    await screen.findByLabelText('Nome de exibição');
    for (const name of ['Salvar nome', 'Remover foto']) expect(screen.getByRole('button', { name }).className).toMatch(/min-h-(11|alvo)/);
    expect(screen.getByLabelText('Nome de exibição').className).toMatch(/min-h-(11|alvo)/);
  });
});

// Spec 003: apresentação no padrão do design system, sem mudar validações nem o fluxo de envio do avatar.
describe('ProfilePage: apresentação (Spec 003)', () => {
  it('o carregamento usa o indicador do padrão', () => {
    renderScreen();
    expect(screen.getByRole('status')).toHaveAttribute('data-variant', 'secao');
  });

  it('a falha de carregamento usa o alerta de erro do padrão', async () => {
    renderScreen(null);
    expect(await screen.findByRole('alert')).toHaveAttribute('data-variant', 'erro');
  });

  it('agrupa os dados pessoais em uma seção de formulário com legenda', async () => {
    renderScreen();
    expect(await screen.findByRole('group', { name: 'Dados pessoais' })).toBeInTheDocument();
  });

  it('o sucesso usa o alerta de sucesso do padrão e o foco vai até ele', async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar nome' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveAttribute('data-variant', 'sucesso');
    expect(status).toHaveFocus();
  });
});

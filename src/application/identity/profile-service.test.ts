import { describe, expect, it, vi } from 'vitest';
import { AVATAR_MAX_BYTES } from '@/domain/identity/profile';
import { AVATAR_URL_TTL_SECONDS, ProfileService, type ProfilePorts } from './profile-service';

const USER = '10000000-0000-0000-0000-000000000002';
const PATH = `${USER}/90000000-0000-0000-0000-0000000000aa.png`;

const text = (value: string) => Uint8Array.from([...value].map((char) => char.charCodeAt(0)));
const chunk = (type: string, length: number) => [0, 0, 0, length, ...text(type), ...new Array<number>(length).fill(0), 0, 0, 0, 0];
const png = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', 13), ...chunk('IDAT', 8), ...chunk('IEND', 0)]);

const row = { display_name: 'Ana Souza', locale: 'pt-BR', avatar_path: PATH as string | null };

function ports(overrides: Partial<ProfilePorts> = {}) {
  const value: ProfilePorts = {
    load: vi.fn(async () => ({ ...row })),
    update: vi.fn(async () => true),
    uploadAvatar: vi.fn(async () => ({ status: 200, body: { code: 'AVATAR_UPDATED' } })),
    removeAvatar: vi.fn(async () => ({ status: 200, body: { code: 'AVATAR_REMOVED' } })),
    signedUrl: vi.fn(async () => 'https://storage.example.invalid/sign/token'),
    ...overrides,
  };
  return { value, service: new ProfileService(value) };
}

describe('ProfileService.load', () => {
  it('devolve nome, locale e uma URL assinada de curta duração do avatar', async () => {
    const { service, value } = ports();
    expect(await service.load()).toEqual({ kind: 'success', value: { displayName: 'Ana Souza', locale: 'pt-BR', avatarUrl: 'https://storage.example.invalid/sign/token' } });
    expect(value.signedUrl).toHaveBeenCalledWith(PATH, AVATAR_URL_TTL_SECONDS);
  });

  it('a URL assinada dura no máximo cinco minutos e não é reutilizada entre leituras', async () => {
    expect(AVATAR_URL_TTL_SECONDS).toBeLessThanOrEqual(300);
    const { service, value } = ports();
    await service.load();
    await service.load();
    expect(value.signedUrl).toHaveBeenCalledTimes(2);
  });

  it('sem avatar não pede URL', async () => {
    const { service, value } = ports({ load: vi.fn(async () => ({ ...row, avatar_path: null })) });
    expect(await service.load()).toEqual({ kind: 'success', value: { displayName: 'Ana Souza', locale: 'pt-BR', avatarUrl: null } });
    expect(value.signedUrl).not.toHaveBeenCalled();
  });

  it('mantém o perfil utilizável quando a URL assinada não pode ser obtida', async () => {
    const { service } = ports({ signedUrl: vi.fn(async () => null) });
    expect(await service.load()).toEqual({ kind: 'success', value: { displayName: 'Ana Souza', locale: 'pt-BR', avatarUrl: null } });
  });

  it('não concede sucesso sem perfil nem em falha de rede', async () => {
    expect((await ports({ load: vi.fn(async () => null) }).service.load()).kind).toBe('unavailable');
    expect((await ports({ load: vi.fn(async () => { throw new Error('offline'); }) }).service.load()).kind).toBe('unavailable');
  });
});

describe('ProfileService.save', () => {
  it('envia somente os campos editáveis, com o nome normalizado', async () => {
    const { service, value } = ports();
    await service.save({ displayName: '  Ana   Souza ', locale: 'pt-BR' });
    expect(value.update).toHaveBeenCalledWith({ displayName: 'Ana Souza', locale: 'pt-BR' });
  });

  it.each([[''], ['A'], ['x'.repeat(101)]])('recusa o nome %j sem chamar o servidor', async (displayName) => {
    const { service, value } = ports();
    expect(await service.save({ displayName })).toEqual({ kind: 'invalid_name' });
    expect(value.update).not.toHaveBeenCalled();
  });

  it('recusa locale diferente de pt-BR', async () => {
    const { service, value } = ports();
    expect(await service.save({ displayName: 'Ana', locale: 'en-US' as never })).toEqual({ kind: 'invalid_locale' });
    expect(value.update).not.toHaveBeenCalled();
  });

  it('ignora qualquer campo de identidade ou autorização que o chamador tente incluir', async () => {
    const { service, value } = ports();
    await service.save({ displayName: 'Ana', role: 'master_fluxid', organization_id: 'x', status: 'active', email: 'a@b.co', avatar_path: '../x' } as never);
    expect(value.update).toHaveBeenCalledWith({ displayName: 'Ana' });
  });

  it('recarrega o perfil confirmado pelo servidor depois de salvar', async () => {
    const load = vi.fn().mockResolvedValueOnce({ ...row, display_name: 'Ana Souza' }).mockResolvedValueOnce({ ...row, display_name: 'Ana Maria' });
    const { service } = ports({ load });
    await service.load();
    const outcome = await service.save({ displayName: 'Ana Maria' });
    expect(outcome).toEqual({ kind: 'success', value: expect.objectContaining({ displayName: 'Ana Maria' }) });
  });

  it('não simula sucesso quando o servidor recusa ou a rede falha', async () => {
    expect((await ports({ update: vi.fn(async () => false) }).service.save({ displayName: 'Ana' })).kind).toBe('access_denied');
    expect((await ports({ update: vi.fn(async () => { throw new Error('offline'); }) }).service.save({ displayName: 'Ana' })).kind).toBe('unavailable');
  });
});

describe('ProfileService.uploadAvatar', () => {
  it('valida o arquivo no cliente e envia os bytes com o tipo real', async () => {
    const { service, value } = ports();
    const outcome = await service.uploadAvatar({ bytes: png(), type: 'image/png', name: 'foto.png' });
    expect(outcome.kind).toBe('success');
    expect(value.uploadAvatar).toHaveBeenCalledWith(expect.any(Uint8Array), 'image/png');
  });

  it.each([
    ['SVG', { bytes: text('<svg/>'), type: 'image/svg+xml', name: 'x.svg' }, 'file_type'],
    ['extensão enganosa', { bytes: png(), type: 'image/png', name: 'foto.svg' }, 'file_type'],
    ['SVG disfarçado de PNG', { bytes: text('<svg onload="x()"/>'), type: 'image/png', name: 'x.png' }, 'file_content'],
    ['acima de 2 MB', { bytes: new Uint8Array(AVATAR_MAX_BYTES + 1), type: 'image/png', name: 'x.png' }, 'file_too_large'],
    ['vazio', { bytes: new Uint8Array(), type: 'image/png', name: 'x.png' }, 'file_content'],
  ] as const)('recusa %s antes de enviar', async (_name, file, kind) => {
    const { service, value } = ports();
    expect(await service.uploadAvatar(file)).toEqual({ kind });
    expect(value.uploadAvatar).not.toHaveBeenCalled();
  });

  it.each([
    [400, 'INVALID_FILE_TYPE', 'file_type'],
    [400, 'INVALID_FILE_CONTENT', 'file_content'],
    [413, 'FILE_TOO_LARGE', 'file_too_large'],
    [429, 'RATE_LIMITED', 'rate_limited'],
    [403, 'ACCESS_DENIED', 'access_denied'],
    [401, 'AUTH_REQUIRED', 'access_denied'],
    [500, 'UPLOAD_FAILED', 'upload_failed'],
    [503, 'SERVICE_UNAVAILABLE', 'unavailable'],
  ] as const)('traduz %s/%s para %s sem simular sucesso', async (status, code, kind) => {
    const { service } = ports({ uploadAvatar: vi.fn(async () => ({ status, body: { code } })) });
    expect((await service.uploadAvatar({ bytes: png(), type: 'image/png', name: 'a.png' })).kind).toBe(kind);
  });

  it('trata 2xx com corpo inesperado e exceção de rede como indisponível', async () => {
    expect((await ports({ uploadAvatar: vi.fn(async () => ({ status: 200, body: { code: 'OUTRO' } })) }).service.uploadAvatar({ bytes: png(), type: 'image/png', name: 'a.png' })).kind).toBe('unavailable');
    expect((await ports({ uploadAvatar: vi.fn(async () => { throw new Error('offline'); }) }).service.uploadAvatar({ bytes: png(), type: 'image/png', name: 'a.png' })).kind).toBe('unavailable');
  });

  it('depois de enviar devolve o perfil com uma URL assinada nova', async () => {
    const signedUrl = vi.fn().mockResolvedValueOnce('https://x/antiga').mockResolvedValueOnce('https://x/nova');
    const { service } = ports({ signedUrl });
    await service.load();
    const outcome = await service.uploadAvatar({ bytes: png(), type: 'image/png', name: 'a.png' });
    expect(outcome).toEqual({ kind: 'success', value: expect.objectContaining({ avatarUrl: 'https://x/nova' }) });
  });
});

describe('ProfileService.removeAvatar', () => {
  it('remove e devolve o perfil sem avatar', async () => {
    const load = vi.fn().mockResolvedValueOnce({ ...row }).mockResolvedValueOnce({ ...row, avatar_path: null });
    const { service, value } = ports({ load });
    await service.load();
    expect(await service.removeAvatar()).toEqual({ kind: 'success', value: { displayName: 'Ana Souza', locale: 'pt-BR', avatarUrl: null } });
    expect(value.removeAvatar).toHaveBeenCalledTimes(1);
  });

  it('não concede sucesso quando a remoção falha', async () => {
    expect((await ports({ removeAvatar: vi.fn(async () => ({ status: 500, body: { code: 'UPLOAD_FAILED' } })) }).service.removeAvatar()).kind).toBe('upload_failed');
    expect((await ports({ removeAvatar: vi.fn(async () => { throw new Error('offline'); }) }).service.removeAvatar()).kind).toBe('unavailable');
  });
});

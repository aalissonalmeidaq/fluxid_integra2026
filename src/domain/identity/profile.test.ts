import { describe, expect, it } from 'vitest';
import {
  AVATAR_MAX_BYTES,
  avatarObjectPath,
  detectImage,
  isCanonicalAvatarPath,
  normalizeDisplayName,
  validateAvatar,
  validateProfileUpdate,
} from './profile';

const USER = '10000000-0000-0000-0000-000000000002';
const OBJECT = '90000000-0000-0000-0000-000000000001';

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => Uint8Array.from([...value].map((char) => char.charCodeAt(0)));
const chunk = (type: string, length: number) => [0, 0, 0, length, ...text(type), ...new Array<number>(length).fill(0), 0, 0, 0, 0];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const jpeg = () => bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, ...text('JFIF'), 0, ...new Array<number>(32).fill(1), 0xff, 0xd9);
const png = () => Uint8Array.from([...PNG_SIGNATURE, ...chunk('IHDR', 13), ...chunk('IDAT', 8), ...chunk('IEND', 0)]);
const apng = () => Uint8Array.from([...PNG_SIGNATURE, ...chunk('IHDR', 13), ...chunk('acTL', 8), ...chunk('IDAT', 8), ...chunk('IEND', 0)]);
const webp = (animated = false) => Uint8Array.from([...text('RIFF'), 30, 0, 0, 0, ...text('WEBP'), ...text('VP8X'), 10, 0, 0, 0, animated ? 0x02 : 0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe('normalizeDisplayName', () => {
  it('remove espaços nas pontas e colapsa espaços internos', () => {
    expect(normalizeDisplayName('  Ana   Maria \t Souza  ')).toBe('Ana Maria Souza');
  });
});

describe('validateProfileUpdate', () => {
  it('aceita nome e locale dentro do contrato, com o nome normalizado', () => {
    expect(validateProfileUpdate({ display_name: '  Ana   Souza ', locale: 'pt-BR' })).toEqual({ ok: true, value: { displayName: 'Ana Souza', locale: 'pt-BR' } });
  });

  it('aceita atualização parcial', () => {
    expect(validateProfileUpdate({ display_name: 'Ana' })).toEqual({ ok: true, value: { displayName: 'Ana' } });
    expect(validateProfileUpdate({ locale: 'pt-BR' })).toEqual({ ok: true, value: { locale: 'pt-BR' } });
  });

  it.each([['A'], ['   '], [' B '], ['x'.repeat(101)], [42], [null]])('recusa nome fora de 2 a 100 caracteres ou inválido (%j)', (name) => {
    expect(validateProfileUpdate({ display_name: name })).toEqual({ ok: false, reason: 'invalid_display_name' });
  });

  it('mede o limite de 100 caracteres após a normalização', () => {
    expect(validateProfileUpdate({ display_name: `${'a'.repeat(100)}   ` }).ok).toBe(true);
    expect(validateProfileUpdate({ display_name: 'a'.repeat(101) }).ok).toBe(false);
  });

  it.each(['en-US', 'pt', '', 'PT-BR', 5])('só aceita o locale pt-BR nesta Spec (%j)', (locale) => {
    expect(validateProfileUpdate({ display_name: 'Ana', locale })).toEqual({ ok: false, reason: 'invalid_locale' });
  });

  it.each(['role', 'roles', 'permissions', 'organization_id', 'status', 'email', 'user_id', 'avatar_path', 'membership_id', 'is_admin'])('recusa o campo de identidade ou autorização %s', (field) => {
    expect(validateProfileUpdate({ display_name: 'Ana', [field]: 'x' })).toEqual({ ok: false, reason: 'forbidden_field' });
  });

  it('recusa atualização vazia', () => {
    expect(validateProfileUpdate({})).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('detectImage', () => {
  it('reconhece JPEG, PNG e WebP estáticos pelos bytes', () => {
    expect(detectImage(jpeg())).toEqual({ type: 'image/jpeg', animated: false });
    expect(detectImage(png())).toEqual({ type: 'image/png', animated: false });
    expect(detectImage(webp())).toEqual({ type: 'image/webp', animated: false });
  });

  it('identifica PNG animado (APNG) e WebP animado', () => {
    expect(detectImage(apng())).toEqual({ type: 'image/png', animated: true });
    expect(detectImage(webp(true))).toEqual({ type: 'image/webp', animated: true });
  });

  it('WebP simples (VP8) sem cabeçalho estendido não é animado', () => {
    const simple = Uint8Array.from([...text('RIFF'), 20, 0, 0, 0, ...text('WEBP'), ...text('VP8 '), 4, 0, 0, 0, 1, 2, 3, 4]);
    expect(detectImage(simple)).toEqual({ type: 'image/webp', animated: false });
  });

  it.each([
    ['SVG', text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['HTML', text('<html><script>alert(1)</script></html>')],
    ['GIF', text('GIF89a......')],
    ['vazio', new Uint8Array()],
    ['aleatório', bytes(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)],
    ['PNG truncado', bytes(0x89, 0x50, 0x4e)],
    ['RIFF que não é WebP', Uint8Array.from([...text('RIFF'), 4, 0, 0, 0, ...text('WAVE')])],
  ])('não reconhece %s como imagem aceita', (_name, content) => {
    expect(detectImage(content)).toBeNull();
  });

  it('PNG com estrutura de blocos truncada não é tratado como animado nem quebra', () => {
    expect(detectImage(Uint8Array.from([...PNG_SIGNATURE, 0, 0, 0, 200, ...text('IHDR')]))).toEqual({ type: 'image/png', animated: false });
  });
});

describe('validateAvatar', () => {
  it.each([
    ['image/jpeg', 'foto.jpg', jpeg(), 'jpg'],
    ['image/jpeg', 'foto.JPEG', jpeg(), 'jpg'],
    ['image/png', 'foto.png', png(), 'png'],
    ['image/webp', 'foto.webp', webp(), 'webp'],
  ] as const)('aceita %s (%s) e devolve a extensão normalizada', (declaredType, fileName, content, extension) => {
    expect(validateAvatar({ declaredType, fileName, bytes: content })).toEqual({ ok: true, type: declaredType, extension });
  });

  it('aceita sem nome de arquivo (envio binário direto)', () => {
    expect(validateAvatar({ declaredType: 'image/png', bytes: png() }).ok).toBe(true);
  });

  it('aceita exatamente 2 MB e recusa 1 byte a mais', () => {
    const exact = new Uint8Array(AVATAR_MAX_BYTES);
    exact.set(jpeg());
    expect(validateAvatar({ declaredType: 'image/jpeg', bytes: exact }).ok).toBe(true);
    const over = new Uint8Array(AVATAR_MAX_BYTES + 1);
    over.set(jpeg());
    expect(validateAvatar({ declaredType: 'image/jpeg', bytes: over })).toEqual({ ok: false, code: 'FILE_TOO_LARGE' });
  });

  it.each(['image/svg+xml', 'image/gif', 'image/bmp', 'application/pdf', 'text/html', '', 'image/*', 'IMAGE/PNG '])('recusa o tipo declarado %j', (declaredType) => {
    expect(validateAvatar({ declaredType, bytes: png() })).toEqual({ ok: false, code: 'INVALID_FILE_TYPE' });
  });

  it('recusa extensão enganosa: nome de outro formato mesmo com o tipo e os bytes corretos', () => {
    expect(validateAvatar({ declaredType: 'image/png', fileName: 'foto.svg', bytes: png() })).toEqual({ ok: false, code: 'INVALID_FILE_TYPE' });
    expect(validateAvatar({ declaredType: 'image/png', fileName: 'foto.jpg', bytes: png() })).toEqual({ ok: false, code: 'INVALID_FILE_TYPE' });
    expect(validateAvatar({ declaredType: 'image/png', fileName: 'foto', bytes: png() }).ok).toBe(false);
  });

  it('recusa SVG ou HTML disfarçados de imagem permitida (bytes não conferem)', () => {
    expect(validateAvatar({ declaredType: 'image/png', fileName: 'x.png', bytes: text('<svg onload="alert(1)"></svg>') })).toEqual({ ok: false, code: 'INVALID_FILE_CONTENT' });
    expect(validateAvatar({ declaredType: 'image/jpeg', bytes: text('<html></html>') })).toEqual({ ok: false, code: 'INVALID_FILE_CONTENT' });
  });

  it('recusa bytes de um formato com tipo declarado de outro', () => {
    expect(validateAvatar({ declaredType: 'image/jpeg', bytes: png() })).toEqual({ ok: false, code: 'INVALID_FILE_CONTENT' });
    expect(validateAvatar({ declaredType: 'image/webp', bytes: jpeg() })).toEqual({ ok: false, code: 'INVALID_FILE_CONTENT' });
  });

  it('recusa arquivo vazio e conteúdo corrompido', () => {
    expect(validateAvatar({ declaredType: 'image/png', bytes: new Uint8Array() })).toEqual({ ok: false, code: 'INVALID_FILE_CONTENT' });
    expect(validateAvatar({ declaredType: 'image/png', bytes: bytes(0x89, 0x50) })).toEqual({ ok: false, code: 'INVALID_FILE_CONTENT' });
  });

  it('recusa imagens animadas não homologadas (APNG e WebP animado)', () => {
    expect(validateAvatar({ declaredType: 'image/png', bytes: apng() })).toEqual({ ok: false, code: 'INVALID_FILE_CONTENT' });
    expect(validateAvatar({ declaredType: 'image/webp', bytes: webp(true) })).toEqual({ ok: false, code: 'INVALID_FILE_CONTENT' });
  });

  it('o tamanho é avaliado antes do conteúdo (não inspeciona arquivo enorme)', () => {
    expect(validateAvatar({ declaredType: 'image/svg+xml', bytes: new Uint8Array(AVATAR_MAX_BYTES + 10) })).toEqual({ ok: false, code: 'FILE_TOO_LARGE' });
  });
});

describe('caminho canônico do avatar', () => {
  it('é derivado do usuário e de um objeto gerado, nunca escolhido livremente', () => {
    expect(avatarObjectPath(USER, OBJECT, 'webp')).toBe(`${USER}/${OBJECT}.webp`);
  });

  it.each([
    ['identificador de usuário inválido', () => avatarObjectPath('../outro', OBJECT, 'png')],
    ['identificador de objeto inválido', () => avatarObjectPath(USER, '../../x', 'png')],
    ['extensão fora da lista', () => avatarObjectPath(USER, OBJECT, 'svg' as never)],
  ])('recusa %s', (_name, build) => {
    expect(build).toThrow();
  });

  it('reconhece somente o caminho do próprio usuário na forma canônica', () => {
    expect(isCanonicalAvatarPath(`${USER}/${OBJECT}.png`, USER)).toBe(true);
    expect(isCanonicalAvatarPath(`${USER}/${OBJECT}.jpg`, USER)).toBe(true);
    expect(isCanonicalAvatarPath(`${USER}/${OBJECT}.webp`, USER)).toBe(true);
  });

  it.each([
    `20000000-0000-0000-0000-00000000000a/${OBJECT}.png`,
    `${USER}/../${OBJECT}.png`,
    `${USER}/${OBJECT}.svg`,
    `${USER}/${OBJECT}.png/extra`,
    `/${USER}/${OBJECT}.png`,
    `${USER}/nao-e-uuid.png`,
    '',
  ])('recusa o caminho %j', (path) => {
    expect(isCanonicalAvatarPath(path, USER)).toBe(false);
  });
});

// Fonte única das regras de perfil e avatar: usada pelo app (via src/domain/identity/profile.ts) e pela Edge Function
// profile-avatar. Fica em _shared porque o runtime local das funções só enxerga supabase/functions/.
// Regras de perfil e avatar fora dos componentes React. A validação do conteúdo usa os bytes reais do arquivo,
// nunca só a extensão ou o tipo declarado pelo cliente (RF-028, RF-029, RS-011).
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 100;
export const SUPPORTED_LOCALE = 'pt-BR';

export type AvatarType = 'image/jpeg' | 'image/png' | 'image/webp';
export type AvatarExtension = 'jpg' | 'png' | 'webp';
export type AvatarErrorCode = 'INVALID_FILE_TYPE' | 'FILE_TOO_LARGE' | 'INVALID_FILE_CONTENT';

const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID = new RegExp(`^${UUID_SOURCE}$`, 'i');
const EXTENSIONS: Record<AvatarType, { canonical: AvatarExtension; accepted: readonly string[] }> = {
  'image/jpeg': { canonical: 'jpg', accepted: ['jpg', 'jpeg'] },
  'image/png': { canonical: 'png', accepted: ['png'] },
  'image/webp': { canonical: 'webp', accepted: ['webp'] },
};
const PROFILE_FIELDS = ['display_name', 'locale'] as const;

export const normalizeDisplayName = (raw: string): string => raw.replace(/\s+/g, ' ').trim();

export type ProfileUpdateValidation =
  | { ok: true; value: { displayName?: string; locale?: typeof SUPPORTED_LOCALE } }
  | { ok: false; reason: 'invalid_display_name' | 'invalid_locale' | 'forbidden_field' | 'empty' };

// O titular edita somente nome e locale. Identidade, estado, tenant, papéis e permissões nunca passam por aqui (RS-004).
export function validateProfileUpdate(input: Record<string, unknown>): ProfileUpdateValidation {
  const keys = Object.keys(input);
  if (keys.some((key) => !(PROFILE_FIELDS as readonly string[]).includes(key))) return { ok: false, reason: 'forbidden_field' };
  if (keys.length === 0) return { ok: false, reason: 'empty' };

  const value: { displayName?: string; locale?: typeof SUPPORTED_LOCALE } = {};
  if ('display_name' in input) {
    const name = typeof input.display_name === 'string' ? normalizeDisplayName(input.display_name) : '';
    if (name.length < DISPLAY_NAME_MIN || name.length > DISPLAY_NAME_MAX) return { ok: false, reason: 'invalid_display_name' };
    value.displayName = name;
  }
  if ('locale' in input) {
    if (input.locale !== SUPPORTED_LOCALE) return { ok: false, reason: 'invalid_locale' };
    value.locale = SUPPORTED_LOCALE;
  }
  return { ok: true, value };
}

const ascii = (bytes: Uint8Array, start: number, end: number): string => String.fromCharCode(...bytes.subarray(start, end));
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// APNG declara o bloco `acTL` antes dos dados da imagem (`IDAT`). Os limites já são garantidos pelo laço.
function isAnimatedPng(view: DataView): boolean {
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= view.byteLength) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7));
    if (type === 'acTL') return true;
    if (type === 'IDAT') return false;
    offset += 12 + length;
  }
  return false;
}
export function detectImage(bytes: Uint8Array): { type: AvatarType; animated: boolean } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: 'image/jpeg', animated: false };
  if (bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    return { type: 'image/png', animated: isAnimatedPng(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)) };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    // O WebP animado usa o cabeçalho estendido (VP8X) com o bit de animação ligado.
    const animated = bytes.length >= 21 && ascii(bytes, 12, 16) === 'VP8X' && (new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint8(20) & 0x02) !== 0;
    return { type: 'image/webp', animated };
  }
  return null;
}

export type AvatarValidation =
  | { ok: true; type: AvatarType; extension: AvatarExtension }
  | { ok: false; code: AvatarErrorCode };

const isAvatarType = (value: string): value is AvatarType => Object.hasOwn(EXTENSIONS, value);

export function validateAvatar(file: { declaredType: string; fileName?: string; bytes: Uint8Array }): AvatarValidation {
  const fail = (code: AvatarErrorCode): AvatarValidation => ({ ok: false, code });
  // O tamanho vem primeiro: arquivo acima do limite nem é inspecionado.
  if (file.bytes.length > AVATAR_MAX_BYTES) return fail('FILE_TOO_LARGE');
  if (!isAvatarType(file.declaredType)) return fail('INVALID_FILE_TYPE');
  const { canonical, accepted } = EXTENSIONS[file.declaredType];

  if (file.fileName !== undefined) {
    const dot = file.fileName.lastIndexOf('.');
    if (dot === -1 || !accepted.includes(file.fileName.slice(dot + 1).toLowerCase())) return fail('INVALID_FILE_TYPE');
  }

  const detected = detectImage(file.bytes);
  if (!detected || detected.type !== file.declaredType || detected.animated) return fail('INVALID_FILE_CONTENT');
  return { ok: true, type: file.declaredType, extension: canonical };
}

// O caminho é derivado do usuário e de um objeto gerado pelo sistema; o cliente nunca o escolhe (RS-011).
export function avatarObjectPath(userId: string, objectId: string, extension: AvatarExtension): string {
  if (!UUID.test(userId) || !UUID.test(objectId)) throw new Error('avatar_path_invalid');
  if (!(['jpg', 'png', 'webp'] as readonly string[]).includes(extension)) throw new Error('avatar_path_invalid');
  return `${userId}/${objectId}.${extension}`;
}

export function isCanonicalAvatarPath(path: string, userId: string): boolean {
  // O identificador do usuário já é validado como UUID antes de entrar no padrão.
  return UUID.test(userId) && new RegExp(`^${userId}/${UUID_SOURCE}\\.(jpg|png|webp)$`, 'i').test(path);
}
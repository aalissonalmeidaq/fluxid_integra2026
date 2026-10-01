import { validateAvatar, validateProfileUpdate, type AvatarErrorCode } from '@/domain/identity/profile';

// URLs assinadas do avatar duram pouco e são pedidas a cada leitura; nunca há URL pública ou permanente (RF-030).
export const AVATAR_URL_TTL_SECONDS = 60;

export interface ProfileRow { display_name: string; locale: string; avatar_path: string | null }

export interface ProfilePorts {
  load(): Promise<ProfileRow | null>;
  update(input: { displayName?: string; locale?: 'pt-BR' }): Promise<boolean>;
  uploadAvatar(bytes: Uint8Array, contentType: string): Promise<{ status: number; body: unknown }>;
  removeAvatar(): Promise<{ status: number; body: unknown }>;
  signedUrl(path: string, ttlSeconds: number): Promise<string | null>;
}

export interface ProfileView { displayName: string; locale: string; avatarUrl: string | null }

export type ProfileFailure =
  | 'invalid_name' | 'invalid_locale' | 'file_type' | 'file_too_large' | 'file_content'
  | 'rate_limited' | 'access_denied' | 'upload_failed' | 'unavailable';
export type ProfileOutcome = { kind: 'success'; value: ProfileView } | { kind: ProfileFailure };

const FILE_FAILURES: Record<AvatarErrorCode, ProfileFailure> = {
  INVALID_FILE_TYPE: 'file_type',
  FILE_TOO_LARGE: 'file_too_large',
  INVALID_FILE_CONTENT: 'file_content',
};

const SERVER_FAILURES: Record<string, ProfileFailure> = {
  ...FILE_FAILURES,
  RATE_LIMITED: 'rate_limited',
  ACCESS_DENIED: 'access_denied',
  AUTH_REQUIRED: 'access_denied',
  UPLOAD_FAILED: 'upload_failed',
  SERVICE_UNAVAILABLE: 'unavailable',
};

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

// Casos de uso do perfil fora do React. A validação do arquivo aqui é conforto de uso; a fronteira servidor repete tudo.
export class ProfileService {
  constructor(private readonly ports: ProfilePorts) {}

  async load(): Promise<ProfileOutcome> {
    try {
      const row = await this.ports.load();
      if (!row) return { kind: 'unavailable' };
      return { kind: 'success', value: { displayName: row.display_name, locale: row.locale, avatarUrl: await this.avatarUrl(row.avatar_path) } };
    } catch {
      return { kind: 'unavailable' };
    }
  }

  // Envia somente nome e locale; qualquer outro campo do chamador é descartado (o titular não altera identidade nem acesso).
  async save(input: { displayName: string; locale?: string }): Promise<ProfileOutcome> {
    const checked = validateProfileUpdate({ display_name: input.displayName, ...(input.locale !== undefined ? { locale: input.locale } : {}) });
    if (!checked.ok) return { kind: checked.reason === 'invalid_locale' ? 'invalid_locale' : 'invalid_name' };
    try {
      if (!(await this.ports.update(checked.value))) return { kind: 'access_denied' };
    } catch {
      return { kind: 'unavailable' };
    }
    return this.load();
  }

  async uploadAvatar(file: { bytes: Uint8Array; type: string; name?: string }): Promise<ProfileOutcome> {
    const checked = validateAvatar({ declaredType: file.type, ...(file.name !== undefined ? { fileName: file.name } : {}), bytes: file.bytes });
    if (!checked.ok) return { kind: FILE_FAILURES[checked.code] };
    return this.change(() => this.ports.uploadAvatar(file.bytes, checked.type), 'AVATAR_UPDATED');
  }

  removeAvatar(): Promise<ProfileOutcome> {
    return this.change(() => this.ports.removeAvatar(), 'AVATAR_REMOVED');
  }

  private async change(send: () => Promise<{ status: number; body: unknown }>, expected: string): Promise<ProfileOutcome> {
    let response: { status: number; body: unknown };
    try {
      response = await send();
    } catch {
      return { kind: 'unavailable' };
    }
    const code = isObject(response.body) && typeof response.body.code === 'string' ? response.body.code : '';
    if (response.status >= 200 && response.status < 300) return code === expected ? this.load() : { kind: 'unavailable' };
    return { kind: SERVER_FAILURES[code] ?? 'unavailable' };
  }

  private async avatarUrl(path: string | null): Promise<string | null> {
    if (!path) return null;
    try {
      return await this.ports.signedUrl(path, AVATAR_URL_TTL_SECONDS);
    } catch {
      return null;
    }
  }
}

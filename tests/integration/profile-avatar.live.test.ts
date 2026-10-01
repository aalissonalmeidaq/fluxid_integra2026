// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { endAllSessions, login, logout, publishableKey, restGet, supabaseUrl, USERS } from '../support/auth-harness';

// Perfil e avatar com Edge Function, Storage privado e RLS reais (RF-029, RF-030, RS-011, ISO-007).
// Exige o Supabase local em execução: `npm run test:live`.
const text = (value: string) => Uint8Array.from([...value].map((char) => char.charCodeAt(0)));
const chunk = (type: string, length: number) => [0, 0, 0, length, ...text(type), ...new Array<number>(length).fill(0), 0, 0, 0, 0];
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (marker = 0) => Uint8Array.from([...SIGNATURE, ...chunk('IHDR', 13), ...chunk('IDAT', 8 + marker), ...chunk('IEND', 0)]);
const apng = () => Uint8Array.from([...SIGNATURE, ...chunk('IHDR', 13), ...chunk('acTL', 8), ...chunk('IDAT', 8), ...chunk('IEND', 0)]);

const claims = (token: string) => JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { sub: string };

async function avatarCall(method: 'POST' | 'DELETE', token: string | null, body?: Uint8Array, contentType?: string) {
  const response = await fetch(`${supabaseUrl}/functions/v1/profile-avatar`, {
    method,
    headers: { apikey: publishableKey, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(contentType ? { 'content-type': contentType } : {}) },
    ...(body ? { body: body as unknown as BodyInit } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => null) as { code?: string } | null };
}

const upload = (token: string | null, bytes: Uint8Array, type = 'image/png') => avatarCall('POST', token, bytes, type);

async function sign(token: string, path: string) {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/sign/avatars/${path}`, {
    method: 'POST',
    headers: { apikey: publishableKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  const body = await response.json().catch(() => null) as { signedURL?: string } | null;
  return { status: response.status, signedURL: body?.signedURL ?? null };
}

async function avatarPath(token: string): Promise<string | null> {
  const profile = await restGet(`profiles?select=avatar_path&user_id=eq.${claims(token).sub}`, token);
  return (profile.body as Array<{ avatar_path: string | null }>)[0]?.avatar_path ?? null;
}

describe('Perfil e avatar ao vivo', () => {
  let owner = '';
  let colleague = '';
  let otherTenant = '';

  beforeAll(async () => {
    for (const user of [USERS.avatarA, USERS.avatarB, USERS.tenantBAdmin]) await endAllSessions(user);
    const [a, b, c] = await Promise.all([login(USERS.avatarA), login(USERS.avatarB), login(USERS.tenantBAdmin)]);
    expect([a.status, b.status, c.status]).toEqual([200, 200, 200]);
    owner = a.body.session.access_token;
    colleague = b.body.session.access_token;
    otherTenant = c.body.session.access_token;
    // Estado inicial garantido: nenhum avatar de execuções anteriores.
    await avatarCall('DELETE', owner);
  });

  afterAll(async () => {
    await avatarCall('DELETE', owner);
    for (const token of [owner, colleague, otherTenant]) await logout(token);
    for (const user of [USERS.avatarA, USERS.avatarB, USERS.tenantBAdmin]) await endAllSessions(user);
  });

  it('exige sessão autenticada', async () => {
    expect((await upload(null, png())).status).toBe(401);
    expect((await avatarCall('DELETE', null)).status).toBe(401);
  });

  it('recusa arquivos inválidos pelo conteúdo real, sem gravar nada', async () => {
    expect(await upload(owner, text('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml')).toMatchObject({ status: 400, body: { code: 'INVALID_FILE_TYPE' } });
    expect(await upload(owner, text('<svg onload="alert(1)"></svg>'))).toMatchObject({ status: 400, body: { code: 'INVALID_FILE_CONTENT' } });
    expect(await upload(owner, apng())).toMatchObject({ status: 400, body: { code: 'INVALID_FILE_CONTENT' } });
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(png());
    expect(await upload(owner, big)).toMatchObject({ status: 413, body: { code: 'FILE_TOO_LARGE' } });
    expect(await avatarPath(owner)).toBeNull();
  });

  it('grava no caminho canônico do titular e o entrega somente por URL assinada e curta', async () => {
    expect(await upload(owner, png(1))).toEqual({ status: 200, body: { code: 'AVATAR_UPDATED' } });
    const path = await avatarPath(owner);
    expect(path).toMatch(new RegExp(`^${claims(owner).sub}/[0-9a-f-]{36}\\.png$`));

    const signed = await sign(owner, path!);
    expect(signed.status).toBe(200);
    const fetched = await fetch(`${supabaseUrl}/storage/v1${signed.signedURL}`);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await fetched.arrayBuffer())).toEqual(png(1));
  });

  it('o bucket é privado: URL pública e leitura anônima falham', async () => {
    const path = (await avatarPath(owner))!;
    expect((await fetch(`${supabaseUrl}/storage/v1/object/public/avatars/${path}`)).status).toBeGreaterThanOrEqual(400);
    const anonymous = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/avatars/${path}`, { headers: { apikey: publishableKey } });
    expect(anonymous.status).toBeGreaterThanOrEqual(400);
  });

  it('colega do mesmo tenant sem profile.read e ator de outro tenant não leem o avatar', async () => {
    const path = (await avatarPath(owner))!;
    expect((await sign(colleague, path)).status).toBeGreaterThanOrEqual(400);
    expect((await sign(otherTenant, path)).status).toBeGreaterThanOrEqual(400);
    const profile = await restGet(`profiles?select=display_name&user_id=eq.${claims(owner).sub}`, colleague);
    expect(profile.body).toEqual([]);
  });

  it('o cliente não grava direto no bucket nem altera o caminho do próprio avatar', async () => {
    const sub = claims(owner).sub;
    const direct = await fetch(`${supabaseUrl}/storage/v1/object/avatars/${sub}/90000000-0000-0000-0000-0000000000ff.png`, {
      method: 'POST',
      headers: { apikey: publishableKey, authorization: `Bearer ${owner}`, 'content-type': 'image/png' },
      body: png(2) as unknown as BodyInit,
    });
    expect(direct.status).toBeGreaterThanOrEqual(400);
    const patch = await fetch(`${supabaseUrl}/rest/v1/profiles?user_id=eq.${sub}`, {
      method: 'PATCH',
      headers: { apikey: publishableKey, authorization: `Bearer ${owner}`, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({ avatar_path: `${sub}/90000000-0000-0000-0000-0000000000ff.png` }),
    });
    expect(patch.status).toBeGreaterThanOrEqual(400);
  });

  it('o titular edita o nome, mas não o perfil de outra pessoa', async () => {
    const sub = claims(owner).sub;
    const own = await fetch(`${supabaseUrl}/rest/v1/profiles?user_id=eq.${sub}`, {
      method: 'PATCH',
      headers: { apikey: publishableKey, authorization: `Bearer ${owner}`, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({ display_name: 'Avatar A Editado' }),
    });
    expect(own.status).toBe(200);
    expect(await own.json()).toEqual([expect.objectContaining({ display_name: 'Avatar A Editado' })]);
    const foreign = await fetch(`${supabaseUrl}/rest/v1/profiles?user_id=eq.${claims(colleague).sub}`, {
      method: 'PATCH',
      headers: { apikey: publishableKey, authorization: `Bearer ${owner}`, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({ display_name: 'Invasão' }),
    });
    expect(await foreign.json()).toEqual([]);
  });

  it('substituir troca a referência e remove o objeto anterior', async () => {
    const previous = (await avatarPath(owner))!;
    expect(await upload(owner, png(3))).toEqual({ status: 200, body: { code: 'AVATAR_UPDATED' } });
    const current = (await avatarPath(owner))!;
    expect(current).not.toBe(previous);
    expect((await sign(owner, previous)).status).toBeGreaterThanOrEqual(400);
    expect((await sign(owner, current)).status).toBe(200);
  });

  it('remover apaga a referência e o objeto e é idempotente', async () => {
    const path = (await avatarPath(owner))!;
    expect(await avatarCall('DELETE', owner)).toEqual({ status: 200, body: { code: 'AVATAR_REMOVED' } });
    expect(await avatarPath(owner)).toBeNull();
    expect((await sign(owner, path)).status).toBeGreaterThanOrEqual(400);
    expect(await avatarCall('DELETE', owner)).toEqual({ status: 200, body: { code: 'AVATAR_REMOVED' } });
  });

  it('a sessão encerrada perde o direito de alterar o avatar: o Auth já não reconhece o token', async () => {
    const extra = await login(USERS.avatarA);
    expect(extra.status).toBe(200);
    const token = extra.body.session.access_token as string;
    expect((await upload(token, png(4))).status).toBe(200);
    await logout(token);
    // O logout revoga a sessão no Auth; a sessão de governança inativa (403) é coberta nos testes unitários e SQL.
    expect(await upload(token, png(5))).toMatchObject({ status: 401, body: { code: 'AUTH_REQUIRED' } });
  });
});

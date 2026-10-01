import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ProfileService,
  type ProfileFailure,
  type ProfileOutcome,
  type ProfileView as ProfileData,
} from '@/application/identity/profile-service';
import { useConnectivity } from '@/app/connectivity-context';
import { createProfilePorts } from '@/infrastructure/supabase/profile-adapter';
import { validateProfileUpdate } from '@/domain/identity/profile';
import { Alert, Button, Card, FormSection, Loading, TextField } from '@/design-system';

type Feedback = { kind: 'success' | 'error'; message: string };

const FAILURES: Record<ProfileFailure, string> = {
  invalid_name: 'O nome deve ter entre 2 e 100 caracteres.',
  invalid_locale: 'O idioma informado não é aceito.',
  file_type: 'Formato não aceito. Use JPEG, PNG ou WebP.',
  file_too_large: 'A foto é maior que 2 MB. Escolha um arquivo menor.',
  file_content: 'O arquivo não parece uma imagem válida (ou é uma imagem animada). Escolha outro.',
  rate_limited: 'Muitas trocas de foto em pouco tempo. Tente novamente mais tarde.',
  access_denied: 'Acesso negado. Entre novamente para alterar seu perfil.',
  upload_failed: 'Não foi possível enviar a foto agora. Tente novamente.',
  unavailable: 'Não foi possível concluir a ação agora. Tente novamente.',
};

const initials = (name: string): string =>
  name.split(' ').filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');

function readBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export interface ProfileViewProps { service: ProfileService | null }

export function ProfileView({ service }: ProfileViewProps): React.JSX.Element {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const imageRetried = useRef(false);

  const apply = useCallback((outcome: ProfileOutcome): boolean => {
    if (outcome.kind !== 'success') return false;
    setProfile(outcome.value);
    setName(outcome.value.displayName);
    setImageFailed(false);
    imageRetried.current = false;
    return true;
  }, []);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      if (!service) {
        if (active) { setLoading(false); setLoadFailure('Conexão indisponível.'); }
        return;
      }
      const outcome = await service.load();
      if (!active) return;
      if (!apply(outcome)) {
        setLoadFailure(outcome.kind === 'access_denied' ? 'Acesso negado. Entre novamente para ver seu perfil.' : 'Não foi possível carregar seu perfil agora.');
      }
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [service, apply]);

  useEffect(() => { if (feedback) feedbackRef.current?.focus(); }, [feedback]);

  const run = async (action: () => Promise<ProfileOutcome>, success: string, failure?: (kind: ProfileFailure) => string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    const outcome = await action();
    setBusy(false);
    if (apply(outcome)) setFeedback({ kind: 'success', message: success });
    else if (outcome.kind !== 'success') setFeedback({ kind: 'error', message: failure?.(outcome.kind) ?? FAILURES[outcome.kind] });
  };

  const saveName = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!service) return;
    const checked = validateProfileUpdate({ display_name: name });
    if (!checked.ok) return setNameError(FAILURES.invalid_name);
    setNameError(null);
    await run(() => service.save({ displayName: name }), 'Perfil atualizado.', (kind) => kind === 'unavailable' ? 'Não foi possível salvar agora. Tente novamente.' : FAILURES[kind]);
  };

  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = event.target;
    const file = input.files?.[0];
    // Limpa o campo para permitir escolher o mesmo arquivo de novo depois de uma recusa.
    input.value = '';
    if (!file || !service) return;
    let bytes: Uint8Array;
    try { bytes = await readBytes(file); }
    catch { return setFeedback({ kind: 'error', message: FAILURES.file_content }); }
    await run(() => service.uploadAvatar({ bytes, type: file.type, name: file.name }), 'Foto atualizada.', (kind) => kind === 'unavailable' ? FAILURES.upload_failed : FAILURES[kind]);
  };

  const removeAvatar = async (): Promise<void> => {
    if (!service) return;
    await run(() => service.removeAvatar(), 'Foto removida.', (kind) => kind === 'access_denied' ? FAILURES.access_denied : 'Não foi possível remover a foto agora. Tente novamente.');
  };

  // A URL assinada dura pouco: se a imagem não carregar, pede uma nova uma única vez e depois cai para as iniciais.
  const imageError = async (): Promise<void> => {
    if (imageRetried.current || !service) { setImageFailed(true); return; }
    imageRetried.current = true;
    const outcome = await service.load();
    if (outcome.kind === 'success') setProfile(outcome.value); else setImageFailed(true);
  };

  if (loading) return <Loading variant="secao" label="Carregando perfil…" />;
  if (!profile) return <Alert variant="erro">{loadFailure}</Alert>;

  const showImage = profile.avatarUrl !== null && !imageFailed;
  return (
    <section aria-labelledby="profile-title" className="mx-auto flex w-full max-w-padrao flex-col gap-6">
      <div>
        <p className="text-legenda font-semibold uppercase text-azul-profundo">Minha conta</p>
        <h2 id="profile-title" className="mt-1 text-h2 font-bold text-navy">Meu perfil</h2>
        <p className="mt-1 text-corpo">Atualize seu nome e sua foto. E-mail, organizações e permissões são administrados pela sua organização.</p>
      </div>

      {feedback && (
        <Alert ref={feedbackRef} tabIndex={-1} variant={feedback.kind === 'error' ? 'erro' : 'sucesso'}>
          {feedback.message}
        </Alert>
      )}

      <Card>
        <h3 className="text-h3 font-semibold text-navy">Foto</h3>
        <div className="mt-4 flex flex-col gap-4 tablet:flex-row tablet:items-center">
          {showImage ? (
            <img src={profile.avatarUrl ?? undefined} alt={`Foto de perfil de ${profile.displayName}`} width={64} height={64} onError={() => void imageError()} className="size-16 shrink-0 rounded-full border border-borda-suave object-cover" />
          ) : (
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-navy text-h3 font-bold text-branco" aria-hidden="true">{initials(profile.displayName)}</div>
          )}
          <div className="flex min-w-0 flex-col gap-4">
            {!showImage && <p className="text-corpo">Nenhuma foto definida.</p>}
            <TextField label="Escolher nova foto" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !service} onChange={(event) => void chooseFile(event)} />
            <p className="text-corpo">JPEG, PNG ou WebP, até 2 MB.</p>
            {showImage && <Button variant="secundario" disabled={busy} onClick={() => void removeAvatar()} className="self-start">Remover foto</Button>}
          </div>
        </div>
      </Card>

      <Card>
        <form noValidate onSubmit={(event) => void saveName(event)} className="flex flex-col gap-4">
          <FormSection legend="Dados pessoais">
            <TextField label="Nome de exibição" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoComplete="name" error={nameError ?? undefined} />
            <p className="text-corpo"><span className="font-medium">Idioma:</span> Português (Brasil)</p>
          </FormSection>
          <Button type="submit" disabled={busy} className="self-start">{busy ? 'Salvando…' : 'Salvar nome'}</Button>
        </form>
      </Card>
    </section>
  );
}

export function ProfilePage(): React.JSX.Element {
  const { client, config, result } = useConnectivity();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const service = useMemo(
    () => endpoint && client ? new ProfileService(createProfilePorts(endpoint, client)) : null,
    [client, endpoint],
  );
  return <ProfileView service={service} />;
}

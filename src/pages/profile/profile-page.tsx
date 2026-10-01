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
import { FormField } from '@/components/identity/form-field';
import { fieldClass, primaryButtonClass, secondaryButtonClass } from '@/components/identity/confirmation-dialog';

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

  if (loading) return <p role="status" aria-live="polite">Carregando perfil…</p>;
  if (!profile) return <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-950">{loadFailure}</div>;

  const showImage = profile.avatarUrl !== null && !imageFailed;
  return (
    <section aria-labelledby="profile-title" className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#1766D9]">Minha conta</p>
        <h2 id="profile-title" className="mt-1 text-2xl font-bold text-[#163B72]">Meu perfil</h2>
        <p className="mt-1 text-sm">Atualize seu nome e sua foto. E-mail, organizações e permissões são administrados pela sua organização.</p>
      </div>

      {feedback && (
        <div ref={feedbackRef} tabIndex={-1} role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border p-3 text-sm outline-none focus-visible:ring-2 ${feedback.kind === 'error' ? 'border-rose-300 bg-rose-50 text-rose-950 focus-visible:ring-rose-800' : 'border-green-300 bg-green-50 text-green-950 focus-visible:ring-green-800'}`}>
          {feedback.message}
        </div>
      )}

      <div className="rounded-xl border border-[#D7E2EE] bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold text-[#163B72]">Foto</h3>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
          {showImage ? (
            <img src={profile.avatarUrl ?? undefined} alt={`Foto de perfil de ${profile.displayName}`} onError={() => void imageError()} className="h-24 w-24 shrink-0 rounded-full border border-[#D7E2EE] object-cover" />
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-[#163B72] text-2xl font-bold text-white" aria-hidden="true">{initials(profile.displayName)}</div>
          )}
          <div className="min-w-0 space-y-3">
            {!showImage && <p className="text-sm">Nenhuma foto definida.</p>}
            <FormField label="Escolher nova foto">
              {(control) => <input {...control} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !service} onChange={(event) => void chooseFile(event)} className="mt-1 block min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-[#1766D9] file:px-4 file:font-semibold file:text-white" />}
            </FormField>
            <p className="text-sm">JPEG, PNG ou WebP, até 2 MB.</p>
            {showImage && <button type="button" disabled={busy} onClick={() => void removeAvatar()} className={`${secondaryButtonClass} disabled:opacity-60`}>Remover foto</button>}
          </div>
        </div>
      </div>

      <form noValidate onSubmit={(event) => void saveName(event)} className="rounded-xl border border-[#D7E2EE] bg-white p-4 shadow-sm sm:p-6">
        <h3 className="text-lg font-semibold text-[#163B72]">Dados pessoais</h3>
        <div className="mt-3 space-y-4">
          <FormField label="Nome de exibição" error={nameError ?? undefined}>
            {(control) => <input {...control} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoComplete="name" className={fieldClass} />}
          </FormField>
          <p className="text-sm"><span className="font-medium">Idioma:</span> Português (Brasil)</p>
        </div>
        <button disabled={busy} className={`mt-4 ${primaryButtonClass} disabled:cursor-wait disabled:opacity-60`}>{busy ? 'Salvando…' : 'Salvar nome'}</button>
      </form>
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

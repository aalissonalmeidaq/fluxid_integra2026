import React, { useMemo } from 'react';
import { Card, Dialog } from '@/design-system';
import { FormModalContext, type FormModalValue, useFormModal } from './form-modal-context';

export interface RegistryFormModalProps {
  title: string;
  onClose: () => void;
  onNavigate: (path: string) => void;
  children: React.ReactNode;
}

export function RegistryFormModal({ title, onClose, onNavigate, children }: RegistryFormModalProps): React.JSX.Element {
  const value = useMemo<FormModalValue>(() => ({ embedded: true, close: onClose, navigate: onNavigate }), [onClose, onNavigate]);
  return (
    <FormModalContext.Provider value={value}>
      <Dialog title={title} onClose={onClose} size="padrao">{children}</Dialog>
    </FormModalContext.Provider>
  );
}

export interface FormHeaderProps {
  titleId: string;
  eyebrow: string;
  title: string;
  description: string;
}

// Cabeçalho do formulário. No modal, o título já está no diálogo e fica só a descrição.
export function FormHeader({ titleId, eyebrow, title, description }: FormHeaderProps): React.JSX.Element {
  const modal = useFormModal();
  if (modal?.embedded) return <p className="text-corpo">{description}</p>;
  return (
    <div>
      <p className="text-legenda font-semibold uppercase text-azul-profundo">{eyebrow}</p>
      <h2 id={titleId} className="mt-1 text-h2 font-bold text-navy">{title}</h2>
      <p className="mt-1 text-corpo">{description}</p>
    </div>
  );
}

// Moldura do formulário: cartão na página; sem moldura no modal, que já é uma superfície.
export function FormCard({ children }: { children: React.ReactNode }): React.JSX.Element {
  const modal = useFormModal();
  return modal?.embedded ? <>{children}</> : <Card>{children}</Card>;
}

// Linha de ações: no modal fica fixa ao pé, para o botão de salvar nunca sumir em formulário longo.
export function FormActions({ children }: { children: React.ReactNode }): React.JSX.Element {
  const modal = useFormModal();
  return <div className={modal?.embedded ? 'sticky -bottom-6 flex flex-wrap gap-2 bg-branco pb-6 pt-4' : 'flex flex-wrap gap-2'}>{children}</div>;
}

const cancelClass = 'inline-flex min-h-alvo items-center px-4 text-corpo font-semibold text-azul-profundo underline';

// "Cancelar": no modal, fecha sem recarregar; na página, volta pelo endereço.
export function FormCancel({ href }: { href: string }): React.JSX.Element {
  const modal = useFormModal();
  if (modal?.embedded) return <button type="button" className={cancelClass} onClick={modal.close}>Cancelar</button>;
  return <a className={cancelClass} href={href}>Cancelar</a>;
}

import { createContext, useContext } from 'react';

// Contexto do formulário em modal (Spec 007). Fora do contexto, o formulário é uma página inteira.
export interface FormModalValue {
  embedded: boolean;
  // Fecha o modal sem salvar.
  close: () => void;
  // Vai para o endereço depois de salvar.
  navigate: (path: string) => void;
}

export const FormModalContext = createContext<FormModalValue | null>(null);

export const useFormModal = (): FormModalValue | null => useContext(FormModalContext);

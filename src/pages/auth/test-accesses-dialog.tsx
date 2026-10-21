import React, { useState } from 'react';
import { DEMO_ACCESS, DEMO_ROLE_NAMES } from '@/domain/demo/demo-access';
import { Alert, Button, Dialog, List, ListItem, VisuallyHidden } from '@/design-system';

export interface TestAccessesProps {
  // Recebe as credenciais escolhidas; quem chama preenche o formulário e decide o foco. Nada é enviado daqui.
  onUse: (email: string, password: string) => void;
}

// Spec 014 (RF-006 a RF-010; contracts/acessos-de-teste.md): botão "Acessos de teste" e o modal com os perfis de demonstração.
// Carregado sob demanda pela tela de login, para as credenciais nem entrarem no pacote quando `VITE_DEMO_ACCESS=false`.
export default function TestAccesses({ onUse }: TestAccessesProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  // O foco volta ao botão ao fechar mesmo nos navegadores que não focam o botão no clique (Safari).
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);

  return (
    <>
      <Button
        variant="secundario"
        className="w-full"
        onClick={(event) => {
          setTrigger(event.currentTarget);
          setOpen(true);
        }}
      >
        Acessos de teste
      </Button>

      {open && (
        <Dialog
          title="Acessos de teste"
          size="padrao"
          closeOnBackdrop
          returnFocusTo={trigger}
          onClose={() => setOpen(false)}
          footer={
            <Button variant="secundario" onClick={() => setOpen(false)}>
              Fechar
            </Button>
          }
        >
          <p className="m-0 text-corpo">
            Use um destes acessos para conhecer o FluxID como cada perfil da empresa {DEMO_ACCESS.tenant.display_name}.
          </p>
          <Alert variant="informacao">
            Estes acessos são públicos e valem só para a empresa da demonstração. Os dados podem ser alterados por outros
            visitantes: não cadastre dados reais.
          </Alert>

          <List variant="cartoes" aria-label="Perfis de demonstração">
            {DEMO_ACCESS.accounts.map((conta) => {
              const papel = DEMO_ROLE_NAMES[conta.role_code];
              return (
                <ListItem key={conta.user_id} className="flex flex-col gap-4 tablet:flex-row tablet:items-end tablet:justify-between">
                  <div className="flex min-w-0 flex-col gap-2">
                    <h3 className="m-0 text-corpo font-semibold text-navy">{papel}</h3>
                    <p className="m-0 text-corpo text-texto-secundario">{conta.description}</p>
                    <dl className="m-0 flex flex-col gap-1 text-corpo">
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium">E-mail</dt>
                        <dd className="m-0 min-w-0 break-all select-all">{conta.email}</dd>
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium">Senha</dt>
                        <dd className="m-0 min-w-0 break-all select-all">{conta.password}</dd>
                      </div>
                    </dl>
                  </div>
                  <Button
                    variant="secundario"
                    className="w-full shrink-0 tablet:w-auto"
                    onClick={() => {
                      onUse(conta.email, conta.password);
                      setOpen(false);
                    }}
                  >
                    Usar este acesso{' '}<VisuallyHidden>de {papel}</VisuallyHidden>
                  </Button>
                </ListItem>
              );
            })}
          </List>
        </Dialog>
      )}
    </>
  );
}

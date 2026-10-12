import React from 'react';
import { Alert, Button, Dialog, Loading } from '@/design-system';
import type { IdentifierReaderDialogProps } from './identifier-reader-dialog';

// O leitor só é baixado quando alguém o abre (RNF-005): a maioria das visitas não usa câmera nem NFC. Sem conexão e sem o arquivo em cache o
// carregamento falha; então a tela mostra o motivo em texto e deixa fechar, sem cair (RF-022). `React.lazy` guarda o resultado, inclusive a
// falha, por isso a falha refaz o carregador. O navegador também guarda a falha do arquivo até a página recarregar; por isso o aviso pede recarregar.
const load = (): Promise<{ default: React.ComponentType<IdentifierReaderDialogProps> }> =>
  import('./identifier-reader-dialog').then((module) => ({ default: module.IdentifierReaderDialog }));
let Loaded = React.lazy(load);

class LoadBoundary extends React.Component<{ onClose: () => void; children: React.ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    Loaded = React.lazy(load);
    return { failed: true };
  }

  override render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <Dialog title="Ler cilindro" onClose={this.props.onClose} footer={<Button variant="secundario" onClick={this.props.onClose}>Fechar</Button>}>
        <Alert variant="erro">
          Não foi possível abrir a leitura agora. Sem conexão, recarregue a tela quando a conexão voltar e tente de novo. Digite o código no campo da tela.
        </Alert>
      </Dialog>
    );
  }
}

export function LazyIdentifierReaderDialog(props: IdentifierReaderDialogProps): React.JSX.Element {
  return (
    <LoadBoundary onClose={props.onClose}>
      <React.Suspense fallback={<Loading label="Abrindo a leitura…" />}>
        <Loaded {...props} />
      </React.Suspense>
    </LoadBoundary>
  );
}

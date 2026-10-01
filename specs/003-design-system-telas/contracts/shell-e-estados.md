# Contrato: shell e estados de interface

**Atende**: RF-012 a RF-015, RF-021 a RF-023, RA-002, RA-003, RA-006, RA-007

## Shell (`src/app/shell/`)

Envolve toda tela, autenticada ou não.

| Região | Conteúdo | Regra |
|---|---|---|
| Link de pular | "Pular para o conteúdo principal" | primeiro item da ordem de Tab; leva o foco ao `main` |
| Barra de conexão | estado de conexão e de sincronização | `role="status"`; offline mostra o aviso e o botão de reconectar, inclusive na entrada |
| Cabeçalho | logotipo secundário, instalar PWA (quando disponível), organização ativa, perfil, sair | organização, perfil e sair só autenticada; deslogada não exibe dado de tenant |
| `main` | conteúdo da rota | único landmark principal, `id="main-content"`, `tabIndex=-1`, um único `h1` por tela |
| Rodapé | texto institucional | |

Em 360 px o cabeçalho quebra em linhas sem rolagem horizontal, e organização ativa, perfil e sair continuam acessíveis. O botão de instalar PWA usa o `Button` do padrão (contraste e 44 px).

O shell não altera a tabela de rotas, os `requireAal2`, o `TenantGate`, o `ProtectedRoute` nem o provedor de autenticação.

## Estados

| Estado | Componente | Anúncio | Observação |
|---|---|---|---|
| Carregando | `Loading` | `role="status"`, uma vez | não bloqueia o teclado; sem animação com movimento reduzido |
| Vazio | `EmptyState` | texto na página | orientação e ação possível |
| Erro | `ErrorState` ou `Alert` | `role="alert"` | associado ao campo quando for de formulário |
| Offline | `SyncStatus` no estado `offline`, na barra de conexão | `role="status"` | operação sensível sem rede mostra erro de conexão e nenhuma confirmação |
| Sincronizando | `SyncStatus` | `role="status"` | na volta da rede, retorna ao normal sem apagar o que a pessoa digitava |

Regras: nenhuma tela mostra sucesso que o servidor não confirmou (RF-022); `prefers-reduced-motion: reduce` desativa toda animação contínua, definido uma vez no CSS global (RF-023); nada pisca mais de três vezes por segundo.

## Foco

Mudança de tela leva o foco ao título; seleção de organização inicia no título; diálogo prende o foco e o devolve ao acionador; troca de organização remove o conteúdo anterior antes de exibir o novo.

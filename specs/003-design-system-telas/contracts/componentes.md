# Contrato: componentes base

**Atende**: RF-007 a RF-011, RF-020, RN-003, CA-003, CA-010

Todos ficam em `src/design-system/components/`, sem regra de negócio, sem acesso a Supabase, tenant ou permissão. Todo componente interativo tem alvo de 44 por 44 px, anel de foco de 3 px em `azul-royal` com 3:1 ou mais, estado desabilitado perceptível por mais que a cor, estado carregando (`aria-busy`) e estado de erro quando aplicável.

| Componente | Variantes | Contrato de acessibilidade |
|---|---|---|
| `Button` | primário, secundário, perigoso | `button` nativo; carregando desabilita o clique e mantém o nome; perigoso exibe texto explícito |
| `TextField` | texto, e-mail, senha, arquivo | rótulo visível por `label`; ajuda e erro ligados por `aria-describedby`; `aria-invalid`; erro com texto e ícone |
| `Select` | padrão | mesmo contrato do campo de texto; seletor nativo |
| `StatusBadge` | ativo, conectado, pendente, bloqueado, erro | texto sempre presente; ícone decorativo com `aria-hidden` |
| `Alert` | informação, sucesso, alerta, erro | `role="alert"` para erro e `role="status"` para o restante; ícone e texto |
| `Dialog` | confirmação, formulário | `role="dialog"`, `aria-modal`, `aria-labelledby`; prende o foco; Escape fecha; devolve o foco ao acionador; conteúdo longo rola dentro do diálogo |
| `Card` | informativo, indicador, alerta | raio 12 px, padding 24 px, borda de 1 px, sombra suave |
| `List` | simples, de cartões | `ul` e `li`; nomes longos quebram sem estourar |
| `DataTable` | tabela, cartões em largura estreita | `table` com `th scope`; `data-label` por célula; mesma árvore DOM; ações de 44 px |
| `Loading` | página, seção, botão | anuncia uma vez por `role="status"`; respeita `prefers-reduced-motion` |
| `EmptyState` | com ação, sem ação | título, orientação e ação possível |
| `ErrorState` | recuperável, sem permissão | mensagem com ação de tentar de novo; "acesso negado" mantém o texto da Spec 002 |
| `SyncStatus` | sincronizado, sincronizando, offline, conflito | texto e ícone; anuncia mudança de estado sem mover o foco |
| `FormSection` | padrão | agrupa campos em `fieldset` e `legend` nos formulários longos (sem etapas) |
| `VisuallyHidden` e `SkipLink` | | utilitários de acessibilidade do shell |

Os componentes atuais `FormField`, `ConfirmationDialog` e `ConnectivityStatus` migram para o design system preservando suas propriedades públicas, para que os testes existentes continuem válidos.

## Documentação (catálogo)

Cada componente tem em `src/design-system/docs/` os campos `descricao`, `variantes`, `estados`, `orientacaoDeUso` e `acessibilidade`, e um exemplo para cada variante e estado. O teste `catalogo-completo` compara os componentes exportados com a documentação e falha se um faltar ou estiver incompleto.

## Regras de uso

Telas novas ou refeitas só usam componentes e tokens do padrão (RN-003). Exceção exige uma entrada na página "Exceções" do catálogo, com motivo e responsável.

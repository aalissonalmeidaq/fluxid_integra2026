# Modelo de dados: Landing page institucional

A landing **não tem banco de dados, API nem estado persistente**. Os "dados" são conteúdo estático tipado, compilado junto com o aplicativo (`src/pages/landing/landing-content.ts`). Nada vai a Supabase, `localStorage` ou cookies.

## Entidades de conteúdo

### Material (`MaterialDoProjeto`)

Um destino externo da seção "Materiais do projeto".

| Campo | Tipo | Regra |
|---|---|---|
| `id` | texto | Único e estável (`documentos`, `repositorio-sistema`, `repositorio-api`, `evidencias`, `canal-youtube`, `video-pitch`, `video-prototipo-fisico`, `video-prototipo-sistema`) |
| `titulo` | texto | Curto, em português |
| `descricao` | texto | Uma frase; para pastas do Drive, avisa que o acesso pode exigir permissão |
| `url` | texto | Obrigatoriamente `https://`; só os domínios `drive.google.com`, `github.com`, `www.youtube.com`, `youtu.be` |
| `tipo` | `pasta` \| `repositorio` \| `canal` \| `video` | Define o ícone e o rótulo "abre no ..." |
| `miniatura` | indicador de arte | Só para `video`; cartão de marca desenhado em CSS/SVG, sem arquivo binário |

Regra: a lista tem **exatamente 8 itens**, sem repetição de `id` nem de `url` (teste de contrato).

### Funcionalidade (`FuncionalidadeDestaque`)

| Campo | Tipo | Regra |
|---|---|---|
| `id` | texto | Único |
| `titulo` | texto | Curto |
| `texto` | texto | 1 a 2 frases, no presente, sem número inventado |
| `icone` | nome de ícone do design system | Deve existir no registro de ícones |
| `origem` | `'002'` a `'010'` | Spec que sustenta a afirmação (usado só em teste e documentação) |

### Etapa da solução (`EtapaDaSolucao`)

`ordem` (1 a 5), `titulo`, `texto`, `icone`. Representa o caminho do cilindro: cadastrar e identificar, estocar, carregar e conferir, entregar com prova, acompanhar e auditar.

### Seção (`SecaoDaLanding`)

`id` (âncora), `titulo` (nível 2), `tema` (`escuro` \| `claro`), `ordem`. A abertura é sempre `escuro` (decisão de 13/10/2026). O `id` é a âncora do menu do cabeçalho (`#materiais`, `#funcionalidades`, etc.).

## Estados da interface (não persistidos)

| Estado | Origem | Efeito |
|---|---|---|
| `sessao` | `useAuth().state.status` | `authenticated` mostra "Abrir o sistema"; os demais mostram "Entrar no sistema" |
| `online` | `navigator.onLine` e eventos | Offline: links externos exibem "precisa de conexão" |
| `movimentoReduzido` | `prefers-reduced-motion` | Desliga toda animação; as seções nascem visíveis |
| `imagemFalhou` | evento `error` da imagem | Troca o mascote pelo logotipo, sem quebrar o layout |

Não há transições de estado de domínio.

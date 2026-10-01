# Modelo de dados: Telas e design system do FluxID

**Spec**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md)

Esta spec não cria nem altera tabelas, políticas RLS, funções ou migrações do banco. As entidades abaixo são **estruturas de código e de documentação**, versionadas no repositório.

## Token de design

| Campo | Tipo | Regra |
|---|---|---|
| `nome` | texto | único, minúsculo com hífen; papel e não aparência quando for semântico (`erro`, `alerta-texto`) |
| `categoria` | `cor`, `tipografia`, `espaçamento`, `raio`, `sombra`, `gradiente`, `grid`, `container` | obrigatória |
| `valor` | texto | hexadecimal para cor; px para medidas; para gradiente, duas cores que são tokens |
| `usos` (só cor) | lista de `{fundo, finalidade}` | `finalidade` é `texto-normal`, `texto-grande`, `componente` ou `decorativo`; cada par declarado é testado |
| `razaoMinima` | calculado | 4,5 para `texto-normal`; 3 para `texto-grande` e `componente`; sem mínimo para `decorativo` |

Regras de validade:

- toda cor usada em texto ou componente tem ao menos um `uso` declarado;
- um par `{cor, fundo, finalidade}` que não atenda `razaoMinima` faz o teste falhar;
- `decorativo` não pode ser usado para texto nem para ícone de significado (verde vivo, ciano e gradientes);
- espaçamento só aceita 4, 8, 16, 24, 32, 48 e 64; tamanho de fonte só 12, 16, 24, 36, 48 e 64; peso só 300, 400, 500, 600, 700 e 800; entrelinha 100%, 125% e 150%.

Tokens de layout:

| Faixa | Colunas | Margem | Calha | Container |
|---|---:|---:|---:|---|
| mobile (até 767 px) | 4 | 16 px | 16 px | fluido |
| tablet (768 a 1023 px) | 8 | 24 px | 16 px | fluido |
| desktop (1024 px ou mais) | 12 | 32 px | 16 px | 720 (compacto), 960 (padrão) ou 1200 (largo) |

## Componente

| Campo | Tipo | Regra |
|---|---|---|
| `nome` | texto | único |
| `descricao` | texto | obrigatória |
| `variantes` | lista | ao menos uma |
| `estados` | lista | inclui padrão, foco, desabilitado, carregando e erro quando interativo |
| `orientacaoDeUso` | texto | obrigatória |
| `acessibilidade` | lista | papel, nome acessível, teclado, foco e anúncio |
| `alvoMinimo` | 44 px | para todo componente interativo |

Um teste compara o registro de componentes exportados com `src/design-system/docs/`; componente sem documentação completa falha (CA-010).

## Tela

| Campo | Tipo | Regra |
|---|---|---|
| `rota` | texto | a mesma da Spec 002 |
| `exigencias` | `requireAal2`, `tenantScoped` | as mesmas da Spec 002 |
| `estados` | `carregando`, `vazio`, `erro`, `offline`, `sincronizando` | todos tratados com os componentes de estado |

Telas e rotas (inalteradas, com a mesma forma de exibição de hoje): entrada e diálogo de limite de sessões (exibidos pelo `ProtectedRoute` em qualquer rota protegida), solicitação de recuperação (visão interna da entrada), definição de nova senha (`/recuperar-senha/confirmar`), verificação em duas etapas (exibida pelo `ProtectedRoute` quando exigida), seleção de organização (`TenantGate`), perfil (`/perfil`), organizações (`/admin/tenants`), membros (`/admin/membros`), papéis (`/admin/papeis`), auditoria do tenant (`/admin/auditoria`) e da plataforma (`/admin/auditoria-global`).

## Ativo de marca

| Campo | Tipo | Regra |
|---|---|---|
| `tipo` | `logotipo`, `simbolo`, `icone` | |
| `variacao` | texto | logotipo: principal, secundária, vertical, wordmark, monocromática azul, monocromática preta, escala de cinza, negativa branca; símbolo: 256, 64, 32 e 16 px |
| `formato` | SVG inline | hospedado no aplicativo; nenhum arquivo externo |
| `usadoNoApp` | booleano | verdadeiro para secundária, vertical, símbolo e negativa branca |

Ícone: `nome` (um dos 30), `grupo` (rastreabilidade, segurança, conectividade, ativos e logística, sistema), `tamanho` (16, 24, 32, 48), `estado` (padrão, ativo, desabilitado, erro), `variante` (contorno, duotone, monocromática, negativa) e `rotulo` (nome acessível, ou ausente quando decorativo, caso em que o SVG recebe `aria-hidden`).

## Linha de base visual

| Campo | Tipo | Regra |
|---|---|---|
| `tela` | texto | uma das telas acima ou uma página do catálogo |
| `largura` | 360, 768 ou 1920 px | |
| `estado` | texto | principal, erro, vazio, carregando, offline |
| `arquivo` | PNG | em `tests/e2e/visual/` |
| `aprovadoPor` | texto | Alisson Almeida, registrado na revisão do PR |

Transições: uma captura nova só substitui a de referência por commit explícito, com a aprovação registrada; sem essa aprovação, diferença acima de 0,1% dos pixels falha a verificação.

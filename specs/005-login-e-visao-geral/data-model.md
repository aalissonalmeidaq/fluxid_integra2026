# Modelo de dados: Entrada renovada e Visão geral

Nenhuma tabela, coluna, política RLS, migração ou função de banco. Os tipos abaixo existem só no cliente e descrevem o que a Visão geral exibe. Todo valor é **dado de exemplo** (RN-001) e nunca é lido de tenant, pessoa ou operação real (RF-032).

## Bloco da Visão geral

| Campo | Tipo | Regra |
|---|---|---|
| `id` | `'indicadores' \| 'mapa' \| 'movimentacao' \| 'situacao' \| 'alertas' \| 'cilindros' \| 'desempenho'` | Estável; identifica o bloco na fonte e nos testes |
| `title` | texto | Obrigatório; vira o nome acessível da região (RF-016, RA-002) |
| `state` | `loading \| ready \| empty \| error` | Tipo discriminado por bloco; independente dos demais (história 4) |
| marca | texto "Exemplo" | Sempre visível; o componente do bloco a exige (RF-016) |

Sem estado persistido: nada vai para `localStorage`, `sessionStorage`, IndexedDB nem para o cache do service worker (RF-030).

## Dados de exemplo (fonte única)

Valores em português brasileiro e formatados com `Intl.NumberFormat('pt-BR')` (RNF-004). A fonte é a única a conter números e textos de exemplo (RF-017).

| Bloco | Conteúdo | Regras |
|---|---|---|
| `indicadores` | 4 cartões: Cilindros cadastrados, Em viagem, Alertas críticos, Lacres conectados | Cada um com ícone do catálogo, valor, rótulo e nota de contexto; sem texto que afirme estado físico (RN-004) |
| `mapa` | Sem dados | Espaço reservado; texto de que o rastreamento chega em fase futura; sem imagem nem marcador (RF-011) |
| `movimentacao` | Série diária de entradas e saídas de cilindros (7 a 30 pontos) | Duas séries com rótulos; tabela equivalente; valores inteiros não negativos |
| `situacao` | 4 categorias: cheios, com clientes, vazios, em manutenção | Valor e percentual em texto; soma dos percentuais igual a 100% (arredondamento tratado); legenda e tabela |
| `alertas` | Lista curta de eventos de exemplo (por exemplo, lacre violado, saída da geocerca, teste hidrostático a vencer) | Cada item com texto, tipo e momento relativo; sem "Ver todos" (RF-014) |
| `cilindros` | Lista curta: identificador fictício, tipo de gás, situação | Identificadores claramente fictícios; sem "Ver todos" |
| `desempenho` | 3 medidas: cilindros com teste hidrostático em dia, tempo médio de retorno de cilindros, alertas tratados | Rótulo, valor e unidade; sem afirmar que entrega, comando ou trava aconteceu (RN-004) |

## Porta da fonte

| Elemento | Regra |
|---|---|
| `OverviewSource.load(blockId)` | Devolve uma promessa do conteúdo do bloco (`ready` com dados, `empty` sem itens) ou rejeita (`error`) |
| Implementação padrão | `sampleOverviewSource`: resolve em memória, sem rede, funciona offline |
| Substituição | A spec dos cilindros troca a implementação pelo contexto `OverviewSourceProvider`, sem mudar blocos nem gráficos |

## Painel de marca (entrada)

| Campo | Tipo | Regra |
|---|---|---|
| Logotipo | `Logo` oficial | Com nome acessível; é o `h1` da tela pública |
| Assinatura | "Rastreabilidade que protege. Inteligência que conecta." | Texto oficial, sem alteração |
| Destaques | 3 itens de texto com ícone decorativo | Identificação individual de cilindros; custódia e rastreabilidade; auditoria e alertas |
| Imagens | Nenhuma fotografia nem recurso de terceiros | Premissa da spec |

## Menu da pessoa

| Campo | Origem | Regra |
|---|---|---|
| Nome de exibição | `ProfileService.load()`, lido só ao abrir | Falha ou demora: mostra "Minha conta"; nunca bloqueia "Meu perfil" e "Sair" |
| Organização ativa | `TenantProvider` existente | Ausente para perfil global sem tenant ativo |
| Ações | "Meu perfil" (âncora para `/perfil`), "Sair" (`logout` existente) | Sem item novo |

## Transições de estado de um bloco

`loading` → `ready` | `empty` | `error`; `error` → `loading` por "Tentar de novo". Não há outra transição; o anúncio acontece uma vez por mudança e o foco não se move.

# Direção de design: Landing page institucional (Spec 011)

Decisões da skill `ui-ux-pro-max` (padrão "Hero + Features + CTA") aplicadas **dentro da identidade da Spec 005**: tokens, Montserrat, logotipo e componentes existentes. O estilo "glassmorphism" e a fonte/cor de acento sugeridos pela busca (Plus Jakarta Sans e laranja) foram **descartados** por conflitarem com a marca. A direção é a decidida na clarificação de 13/10/2026: **abertura escura e vibrante** e seções alternando claro e escuro.

## Princípios

1. **Uma ideia por tela**: cada seção diz uma coisa, com um título, um parágrafo curto e um elemento visual.
2. **Marca primeiro**: azul-marinho, azul-profundo e verde-vivo como acento; o mascote é o único personagem.
3. **Texto sempre em superfície sólida**: brilhos e degradês ficam em camadas decorativas (`aria-hidden`) atrás.
4. **Movimento com propósito**: entrada suave das seções e leve flutuação do mascote; tudo desligado em `prefers-reduced-motion`.
5. **Conteúdo em toda a largura**: sem container máximo (decisão da Spec 005); o texto corrido limita a medida por `ch` de leitura.

## Paleta e pares de contraste (só tokens existentes)

| Uso | Token | Hex |
|---|---|---|
| Fundo da abertura e seções escuras | `navy` / gradiente `--gradiente-profundidade` | #163B72 / #163B72 → #1249B8 |
| Superfície de cartão sobre escuro | `azul-profundo` | #1249B8 |
| Acento principal (botão, destaque) | `verde-vivo` | #37D20A |
| Detalhes e linhas | `azul-ciano`, `azul-royal` | #23AFE5, #1766D9 |
| Fundo de seção clara | `cinza-gelo` e `branco` | #F3F7FA, #FFFFFF |
| Texto sobre claro | `grafite`; secundário `texto-secundario` | #26384A, #5B6F84 |
| Acento sobre claro | `azul-profundo`, `verde-acessivel` | #1249B8, #0F7A14 |

Razões medidas (fórmula da WCAG 2.2, igual a `src/design-system/contrast.ts`):

| Par (texto sobre fundo) | Razão | Uso permitido |
|---|---|---|
| branco sobre navy | 11,04 | texto de qualquer tamanho |
| branco sobre azul-profundo | 7,86 | texto de qualquer tamanho |
| gelo sobre navy | 10,25 | texto de qualquer tamanho |
| verde-vivo sobre navy | 5,46 | texto, ícones e títulos de destaque |
| navy sobre verde-vivo | 5,46 | **texto do botão principal** |
| branco sobre azul-royal | 5,33 | texto |
| verde-vivo sobre azul-profundo | 3,89 | **proibido para texto** (só ícones e formas grandes, 3:1); no cartão de destaque o rótulo usa branco |
| azul-ciano sobre azul-profundo | 3,12 | só ícones e linhas decorativas (3:1); nunca texto |
| azul-ciano sobre navy | 4,38 | **só texto grande (24 px ou 18,7 px em negrito), ícones e linhas (3:1)**; nunca em texto corrido |
| grafite sobre branco / gelo | 12,02 / 11,16 | texto de qualquer tamanho |
| azul-profundo sobre branco / gelo | 7,86 / 7,30 | texto e links |
| verde-acessivel sobre branco / gelo | 5,51 / 5,11 | texto e links |
| texto-secundario sobre branco / gelo | 5,18 / 4,81 | texto de apoio |

Regra: nenhum par fora desta tabela é usado para texto. Estes pares entram no teste `tests/contract/landing-contraste.test.ts` (T045).

## Tipografia

Montserrat variável (já carregada). Escala por tokens: `display` (64 px) só na abertura e em telas largas; `h1` (48 px); `h2` (36 px) nos títulos de seção; `h3` (24 px); `corpo` (16 px); `legenda` (12 px, só selos e notas). No celular os títulos reduzem por classes responsivas dos mesmos tokens. Texto corrido com medida de leitura (até ~65 caracteres) e entrelinha do token `corpo`.

## Grade e ritmo das seções

Espaçamento só por `spacing-*` (4, 8, 16, 24, 32, 48, 64 px). Coluna única até 767 px; a partir de 768 px, grades de 2 a 4 colunas. Seções alternam o tema:

| # | Seção (âncora) | Tema | Conteúdo visual |
|---|---|---|---|
| 0 | Cabeçalho | escuro (sobre a abertura) | logotipo negativo, âncoras, botão |
| 1 | Abertura (`#inicio`) | **escuro, vibrante** | chamada, subtítulo, 2 botões, mascote, brilhos e cadeia de custódia decorativa |
| 1b | Em ação (`#em-acao`) | claro (branco) | dois vídeos em destaque (pitch e protótipo do sistema) como palco grande, botão de reprodução no canto e link para todos os materiais |
| 2 | Proposta (`#proposta`) | claro | 3 pilares curtos (rastreabilidade, prova de entrega, segurança) |
| 3 | O problema (`#problema`) | escuro | frase forte e 3 pontos sobre o que se perde sem rastreio |
| 4 | Solução em etapas (`#solucao`) | claro | linha do cilindro em 5 etapas, ícones do design system |
| 5 | Funcionalidades (`#funcionalidades`) | claro-gelo | palco azul-marinho com as capturas reais (viagem no computador e paradas no celular de campo, "Exemplo"), seguido dos cartões |
| 6 | Offline (`#offline`) | escuro | prévia da fila offline e do envio, mascote (2º uso) |
| 7 | Segurança (`#seguranca`) | claro | isolamento por organização, perfis, auditoria |
| 8 | Materiais (`#materiais`) | claro-gelo | destaque "Documentos", grade de repositórios/evidências, cartões de vídeo |
| 9 | Chamada final | escuro, vibrante | mascote (3º uso), frase e botão principal |
| 10 | Rodapé | escuro | logotipo, links internos e identificação do projeto |

## Componentes e padrões

- **Botão principal**: texto `navy` sobre `verde-vivo` (5,46:1), alvo mínimo `--spacing-alvo` (44 px), anel de foco do design system, largura mínima fixa para não deslocar na troca "Entrar"/"Abrir".
- **Botão secundário**: contorno branco sobre escuro; `azul-profundo` com borda sobre claro.
- **Cartões**: `card` do design system, raio `--radius-card`, sombra `--shadow-card`; no escuro, superfície `azul-profundo` com borda sutil.
- **Ícones**: só os do design system (`Icon`), decorativos com `aria-hidden`, informativos com rótulo.
- **Selo "Exemplo"**: em toda prévia ilustrada, no canto, com texto legível (não só cor).
- **Cartão de vídeo**: bloco de marca em CSS/SVG (símbolo do FluxID, ícone de reprodução e título), rótulo "abre no YouTube" e ícone de link externo; sem imagem de terceiros.
- **Cadeia de custódia decorativa**: reaproveita a geometria do painel de marca do login (`brand-panel.tsx`), estática, `aria-hidden`.

## Movimento (atrás de `prefers-reduced-motion: no-preference`)

| Efeito | Propriedades | Duração e curva |
|---|---|---|
| Revelação de seção ao entrar na tela | `opacity`, `transform: translateY` | 400 ms, ease-out; escalonada em até 3 itens |
| Flutuação do mascote | `transform: translateY` | 6 s, ease-in-out, infinita, amplitude pequena |
| Brilho do fundo da abertura | `opacity` | 8 s, alternada |

Nada anima largura, altura, `top` ou `left`. Nenhuma transição atrasa o anel de foco. Em movimento reduzido: sem animação e seções já visíveis. Sem parallax e sem rolagem animada.

## Mascote (3 usos)

1. **Abertura**: à direita no desktop e abaixo do texto no celular, com brilho verde/azul atrás; imagem com `fetchpriority="high"` e dimensões fixas.
2. **Seção offline**: menor, ao lado da prévia da fila.
3. **Chamada final**: acompanhando o botão principal.

Texto alternativo no 1º uso: "Mascote do FluxID ao lado de um cilindro azul equipado com o dispositivo inteligente de rastreio". Nos demais usos é decorativo (`alt=""`). Se a imagem falhar, entra o logotipo.

## Responsividade

Alvos verificados: 360, 768, 1440 e 1920 px. Sem rolagem horizontal. O cabeçalho no celular tem logotipo e botão (as âncoras vão para um menu simples ou ficam ocultas, sem perder o acesso às seções por rolagem). Conteúdo em toda a largura.

## Rastreabilidade do texto (texto → spec de origem)

| Afirmação na página | Spec |
|---|---|
| Identificação e rastreio de cilindros, estoque e histórico | 006 |
| Cadastro de clientes, unidades, geocercas, veículos e motoristas | 007 |
| Viagens com paradas, carga conferida e entrega | 008 |
| Leitura de códigos e posição (GPS) no aplicativo de campo | 009 |
| Funcionamento sem conexão, fila e sincronização, fotos e assinatura | 010 |
| Isolamento por organização, perfis e permissões, auditoria, sessão segura | 002 e 004 |

Nada fora desta tabela entra na página. Quando um texto for escrito (T012), a coluna "Spec" vira o campo `origem` da funcionalidade.

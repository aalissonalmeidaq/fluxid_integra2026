# Contrato: tokens e escalas

**Atende**: RF-001 a RF-006A, RNF-006, CA-002, CA-013

## Fonte única

`src/design-system/tokens.ts` exporta os tokens tipados. `src/design-system/tokens.css` é gerado por `npm run tokens:gerar` e nunca editado à mão. O teste `tokens-sincronizados` falha se o CSS divergir.

## Cores

| Token | Valor | Observação |
|---|---|---|
| `azul-profundo` | `#1249B8` | oficial |
| `azul-royal` | `#1766D9` | interação e foco |
| `azul-ciano` | `#23AFE5` | decorativo e grande dimensão |
| `ciano-acessivel` | `#08709C` | texto e ícone sobre fundo claro |
| `verde-vivo` | `#37D20A` | decorativo, logotipo, texto sobre navy |
| `verde-escuro` | `#159B19` | ícones e estado ativo (3:1) |
| `verde-acessivel` | `#0F7A14` | texto e botão de confirmação |
| `navy` | `#163B72` | títulos e superfícies institucionais |
| `grafite` | `#26384A` | texto de corpo |
| `branco` | `#FFFFFF` | superfície |
| `cinza-gelo` | `#F3F7FA` | fundo da aplicação |
| `texto-secundario` | `#5B6F84` | legendas e ajudas |
| `borda-controle` | `#6B7F94` | borda de campo, seletor e cartão interativo |
| `borda-suave` | `#D7E2EE` | divisor decorativo (sem exigência de contraste, nunca único indicador) |
| `erro`, `erro-fundo` | `#B42318`, `#FDECEA` | |
| `alerta-texto`, `alerta-fundo`, `alerta-faixa` | `#7A4B00`, `#FFF4D6`, `#F5B301` | faixa sempre com texto grafite |

Gradientes (decorativos): azul digital (`azul-profundo` para `azul-ciano`), conexão segura (`verde-vivo` para `azul-royal`) e profundidade (`navy` para `azul-profundo`). Texto sobre gradiente só é permitido se o par com o ponto mais claro atender 4,5:1; o teste calcula esse par.

## Combinações permitidas (resumo; a lista completa fica em `tokens.ts`)

| Texto/elemento | Fundos permitidos | Finalidade |
|---|---|---|
| `grafite`, `navy`, `azul-profundo`, `azul-royal` | branco, cinza-gelo | texto normal |
| `ciano-acessivel`, `verde-acessivel`, `erro` | branco, cinza-gelo | texto normal |
| `texto-secundario` | branco, cinza-gelo | texto normal |
| `branco` | azul-profundo, azul-royal, navy, verde-acessivel, erro, ciano-acessivel | texto normal |
| `verde-vivo` | navy | texto normal |
| `azul-ciano` | navy | texto grande, ícone e gráfico |
| `verde-vivo`, `azul-ciano` | azul-profundo | texto grande, ícone e gráfico |
| `verde-vivo` | cinza-gelo | só decorativo e logotipo |
| `verde-escuro`, `borda-controle` | branco, cinza-gelo | componente e ícone (3:1) |

Qualquer par fora da lista não pode ser usado; a varredura de código impede cores fora dos tokens.

## Tipografia

Montserrat variável, pesos 300, 400, 500, 600, 700 e 800; display 64, H1 48, H2 36, H3 24, corpo 16 e legenda 12 px; entrelinha 100% (display e títulos), 125% (subtítulos) e 150% (corpo). Abaixo de 768 px: display 36, H1 36, H2 24 e H3 24 px (todos pertencem à escala). Reserva: Arial e `sans-serif`.

## Espaçamento, raios e sombras

Espaçamento: 4, 8, 16, 24, 32, 48 e 64 px, nomeados `1`, `2`, `4`, `6`, `8`, `12` e `16` (múltiplos de 4 px). Raio: 12 px em cartões, 8 px em controles. Sombra suave única para cartão e uma para diálogo.

## Grade e containers

Pontos de quebra definidos pelo plano: mobile até 767 px, tablet de 768 a 1023 px e desktop a partir de 1024 px.

Ver as faixas em [data-model.md](../data-model.md#token-de-design). Containers 720, 960 e 1200 px, centralizados, com a margem da faixa.

## Verificações

- `tokens-sincronizados`: CSS gerado igual ao esperado.
- `contraste-dos-tokens`: percorre todo par permitido; um par abaixo do mínimo falha; um par decorativo usado como texto falha.
- `escalas-no-codigo`: falha com hexadecimal, `[Npx]`, `[#...]`, espaçamento, fonte, peso ou raio fora das escalas em `src/**`.
- `escalas-no-navegador`: lê estilos computados de cada tela em três larguras.

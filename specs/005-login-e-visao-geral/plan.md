# Plano de implementação: Entrada renovada e Visão geral

**Feature**: `005-login-e-visao-geral` | **Data**: 01/10/2026 | **Spec**: [spec.md](./spec.md)

**Entrada**: especificação esclarecida em `specs/005-login-e-visao-geral/spec.md`

## Resumo

Dar identidade de produto às duas primeiras telas: a **entrada** (duas colunas com painel de marca no desktop, faixa de marca no celular) e a **Visão geral** (página inicial autenticada, com blocos no domínio de cilindros de gases do FluxID). É uma mudança **somente de interface**: nenhuma migração, função, política RLS, permissão ou dependência nova. A entrada reaproveita `LoginPage` e todo o comportamento da Spec 002, trocando só a moldura e acrescentando mostrar/ocultar senha. A Visão geral lê os blocos de uma **fonte única substituível** (`OverviewSource`), cuja implementação inicial entrega dados de exemplo em português, sempre marcados "Exemplo". Os gráficos (linha e rosca) são SVG próprio com os tokens da Spec 003, com tabela como alternativa textual. O shell autenticado ganha barra superior e menu da pessoa; o menu lateral continua sendo o da Spec 004, com "Início" renomeado para "Visão geral".

## Contexto técnico

**Linguagem/versão**: TypeScript 7.0.2 sobre Node.js 24.21.0; React 19.3.0; CSS com Tailwind CSS 4.3.3

**Dependências principais**: as já existentes. **Nenhuma dependência nova** (RNF-002): sem biblioteca de gráficos, de ícones, de menu ou de roteamento. A navegação continua por âncoras (`window.location.pathname`)

**Armazenamento**: nenhum. Sem tabela, coluna, migração, função, política RLS nem uso de `localStorage`, `sessionStorage` ou IndexedDB para a Visão geral (RF-030, RF-032). O nome de exibição do menu da pessoa vem do `ProfileService` existente, lido só quando o menu abre

**Testes**: Vitest 5.0.2 + React Testing Library (dados de exemplo, fonte, blocos, gráficos, menu da pessoa, entrada, painel de marca, shell); Playwright com axe e o backend simulado existente (`tests/e2e/support/mock-backend.ts`) para três larguras, 320 px, zoom de 200%, teclado, cores forçadas e offline; regressão visual só em Chromium no Linux (`tests/e2e/visual/`)

**Plataforma alvo**: navegadores modernos, PWA responsiva de 360 px a desktop amplo (até 1920 px), retrato e paisagem; sem tema escuro

**Tipo de projeto**: aplicação web cliente única; nenhuma função de servidor muda

**Metas de desempenho**: shell autenticado com a Visão geral no máximo 20% pior que a linha de base da Spec 004 (mediana de 89 ms; limite de 107 ms) e shell da entrada no máximo 20% pior (127 ms; limite de 152 ms), com `tests/e2e/medicao-shell.spec.ts` na mesma máquina (RNF-001, MS-006); pacote de produção até 5% maior (RNF-003), medido por `npm run build` antes e depois

**Restrições**: WCAG 2.2 AA; só tokens, componentes, ícones e fonte da Spec 003; nenhum dado real, de tenant ou de pessoa na Visão geral (RF-032); sem escrita, sem auditoria nova, sem alteração de permissão (RF-031); nada da Visão geral no cache do service worker (RF-030); movimento reduzido sem animação (RF-029)

**Escala/escopo**: 2 telas renovadas (entrada e Visão geral) mais as 2 telas públicas de recuperação de senha com a mesma moldura; 4 cartões, 5 blocos de conteúdo e 1 bloco de medidas; 2 gráficos; 3 larguras de referência (360, 768 e 1920 px)

## Verificação da constituição

*GATE inicial: aprovado. Reavaliado após o desenho da Fase 1: aprovado.*

| Princípio | Como o plano atende | Resultado |
|---|---|---|
| I Especificação antes do código | Spec esclarecida (2 decisões, na seção Clarifications) antes deste plano | Aprovado |
| II TDD obrigatório | Fonte de dados, hook de bloco, gráficos, menu da pessoa, painel de marca e campo de senha nascem com testes RED antes do código | Aprovado |
| III Multitenancy e segurança | Nada de tenant ou pessoa na Visão geral; sem mudança de permissão; senha nunca registrada nem enviada fora do login existente; teste prova que a página não faz leitura de dados reais (CA-009) | Aprovado |
| IV Estados explícitos | Cada bloco tem estado discriminado `loading`, `ready`, `empty`, `error`; nenhum texto de exemplo afirma que comando, trava ou entrega aconteceu (RN-004) | Aprovado |
| V Experiência e acessibilidade | Design system, Tailwind, WCAG 2.2 AA, 360 px a desktop amplo, PWA offline preservada | Aprovado |
| VI Rastreabilidade | Branch `feat/005-login-e-visao-geral`, spec 005, issue #13 e RIA de encerramento | Aprovado |
| VII Qualidade verificável | Lint, tipagem, testes, cobertura, E2E, axe, build PWA, regressão visual e revisão humana (Alisson Almeida) | Aprovado (sem RLS nem banco novos) |
| VIII Documentação viva | Contratos desta spec; `docs/prd.md`, `README.md` e o catálogo da Spec 003 recebem a entrada, a Visão geral e os gráficos na convergência | Aprovado |

Nenhuma violação a justificar.

## Decisões de arquitetura

- **Estrutura de títulos preservada**: a convenção atual do shell é um só `h1` (o logotipo, nome do produto) e `h2` para o título de cada tela. A Visão geral e a entrada seguem a convenção: o logotipo é o `h1`, "Visão geral" e "Bem-vindo de volta" (entrada) são `h2`, e cada bloco é `h3`. Assim nenhuma tela existente muda de nível (CA-001) e RF-027 ("um só `h1`") continua verdadeira. O logotipo é renderizado em **um** lugar por vez (barra superior abaixo de 768 px, topo do menu lateral a partir de 768 px), pelo `use-min-width` existente, para não haver dois `h1` na árvore.
- **Fonte única de exemplo** (RF-017, RN-001): o domínio define só **tipos** (`OverviewData` e os blocos) em `src/domain/overview/`; a porta `OverviewSource` (`load(block)` devolve uma promessa do bloco) fica em `src/application/overview/`; a implementação `sampleOverviewSource` fica em `src/infrastructure/overview/` e é a única a conhecer os números e os textos de exemplo, em pt-BR, formatados por `Intl.NumberFormat('pt-BR')` (RNF-004). Um contexto `OverviewSourceProvider` injeta a fonte; o padrão é a de exemplo. A spec dos cilindros troca a fonte sem mudar os blocos. Os testes injetam fontes que falham, demoram ou voltam vazias para provar os estados sem ganchos de teste no código de produção.
- **Estado por bloco**: o hook `useOverviewBlock(id)` devolve um tipo discriminado (`loading | ready | empty | error`) com `retry`. Cada bloco consulta a fonte de forma independente, então a falha de um não afeta os outros (história 4). O anúncio de estado usa uma região `role="status"` por bloco, anunciada uma vez, sem mover o foco (RF-028). Como a fonte de exemplo está no pacote, a estrutura abre offline sem rede (RF-030).
- **Marca "Exemplo" obrigatória** (RF-016, CA-009): um componente `ExampleBadge` (reaproveita `StatusBadge`) e um componente `OverviewBlock` que **exige** o título e renderiza a marca; nenhum bloco existe fora dele. O teste percorre todas as regiões da página e reprova qualquer uma sem a marca. Um segundo teste monta a página para duas pessoas e dois tenants e confirma conteúdo idêntico, sem chamada de rede nem de `ProfileService` na página.
- **Gráficos em SVG próprio** (RF-018, RNF-002): `LineChart` e `DonutChart` em `src/design-system/charts/`, sem biblioteca. Cores só de tokens, com 3:1 ou mais contra o fundo (`navy`, `azul-royal`, `ciano-acessivel`, `verde-acessivel`; o `alerta-faixa`, de baixo contraste, não é usado). A informação nunca depende de cor: a rosca usa legenda com valor e percentual em texto e traçados distintos por fatia; o gráfico de linha rotula os eixos e os pontos extremos. Cada gráfico tem `role="img"`, título, descrição e uma `<table>` com os mesmos dados (visualmente oculta só se a tabela visível não couber; em 360 px a tabela é visível e rolável dentro do próprio bloco). Sem animação; com `prefers-reduced-motion` nada muda.
- **Disposição responsiva**: a grade segue as referências só em estrutura. 360 px: uma coluna; 768 px: cartões em duas colunas e menu fixo; 1024 px a 1920 px: quatro cartões na linha, mapa e movimentação lado a lado, depois rosca, alertas e cilindros recentes, e medidas; largura máxima de leitura do shell (`containers.largo`, 1200 px) mantida (história 3). Todos os espaçamentos e tamanhos vêm de tokens (RF-024, CA-010).
- **Shell autenticado** (RF-021): `AppShell` passa a ter, a partir de 768 px, uma grade de duas colunas: lateral (logotipo e menu da Spec 004) e a coluna principal (barra superior, barra de conexão e `main`). Abaixo de 768 px, a barra superior leva o botão do menu, o logotipo, a organização ativa e o menu da pessoa, e o menu continua sendo o painel da Spec 004. O `Header` atual é substituído por `TopBar`; o `NavigationMenu` ganha somente o que o novo layout exige (largura da coluna), sem mudar regras, estados, cache nem foco.
- **Shell público** (RF-001, RF-007): sem sessão plena (`signed_out` e `mfa_required`), o shell não mostra a barra superior nem o menu; as telas públicas (entrada, as duas de recuperação de senha e a verificação em duas etapas exibida por `ProtectedRoute` em `mfa_required`) ficam dentro de um `AuthLayout` com o painel de marca. A verificação pedida a uma pessoa já autenticada em uma rota que exige AAL2 continua dentro do shell autenticado. O `h1` dessas telas é o logotipo do painel. O botão "Instalar App", hoje no cabeçalho, passa para o rodapé do `AuthLayout` (público) e para a barra superior (autenticado), sem mudar o comportamento do `use-pwa-install`.
- **Entrada** (RF-001 a RF-007): `LoginPage` mantém toda a lógica (estados, mensagens, foco, limite de sessões, expiração, bloqueio, segundo fator); só a moldura muda para o `AuthLayout` e o campo de senha vira `PasswordField` (RF-005), que acrescenta o botão mostrar/ocultar com `aria-pressed` e nome acessível "Mostrar senha"/"Ocultar senha". A senha nunca é exibida por padrão, o botão não entra em log nem em gravação e o foco permanece no campo ao alternar. O rótulo atual do link de recuperação ("Esqueci minha senha") é **preservado**, para não alterar a Spec 002 nem seus testes; a spec trata o texto como existente (RF-003).
- **Painel de marca** (RF-002): `BrandPanel` com logotipo oficial (`Logo`), assinatura oficial, título e três destaques de texto no vocabulário do PRD (identificação individual de cilindros; custódia e rastreabilidade; auditoria e alertas), com ícones do catálogo (`cilindro`, `rota`, `escudo`) decorativos (`aria-hidden`), sem fotografia. Em 1024 px ou mais fica ao lado do formulário; abaixo, vira a faixa do topo (RA-007).
- **Menu da pessoa** (RF-022): `UserMenu` no padrão de botão de divulgação (`aria-expanded`, `aria-controls`), não `role="menu"`, para manter Tab natural: o painel mostra nome de exibição, organização ativa, "Meu perfil" (âncora) e "Sair". O nome vem do `ProfileService.load()` **somente ao abrir**; se a leitura falha ou demora, o painel mostra a organização e "Minha conta", sem erro bloqueante. Escape ou clique fora fecham e devolvem o foco ao botão. Nome longo trunca com reticências e mantém o nome acessível.
- **"Início" vira "Visão geral"** (RF-020): só o `label` no catálogo `src/domain/navigation/screens.ts` e os testes da Spec 004 que citam "Início". O id interno (`inicio`) e o caminho `/` não mudam, para o cache e as chaves existentes continuarem válidos.
- **Página inicial** (RF-008): em `App.tsx`, a rota `/` passa a renderizar `OverviewPage` (dentro de `ProtectedRoute`) no lugar do cartão "Fundação Técnica Ativa". Sem sessão, `ProtectedRoute` continua mostrando a entrada.
- **Impacto na PWA** (RF-030): nenhuma rota nem recurso externo novo; a fonte de exemplo fica no pacote JavaScript e nenhum dado vai ao cache do service worker. `src/app/pwa-config.test.ts` continua reprovando `runtimeCaching` de dados.
- **Desempenho**: a página e os gráficos são código do cliente sem dependência nova; se a medição passar de 20%, a Visão geral passa a `React.lazy` (carregada só em `/`) antes de qualquer outra ação, e o resultado vai a `validation.md`.

## Estrutura do projeto

### Documentação (esta funcionalidade)

```text
specs/005-login-e-visao-geral/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── entrada-e-marca.md
│   ├── visao-geral.md
│   ├── fonte-de-dados-de-exemplo.md
│   └── verificacoes-automaticas.md
├── checklists/
├── baseline.md          # linha de base de carregamento e de tamanho do pacote (antes da mudança)
├── validation.md        # medições e validação humana
└── tasks.md             # gerado por /speckit-tasks
```

### Código-fonte (raiz do repositório)

```text
src/
├── domain/overview/
│   ├── overview-types.ts           # tipos dos blocos (sem números)
│   └── *.test.ts
├── application/overview/
│   ├── overview-source.ts          # porta OverviewSource
│   └── *.test.ts
├── infrastructure/overview/
│   ├── sample-overview-source.ts   # única fonte dos números e textos de exemplo (pt-BR)
│   └── *.test.ts
├── design-system/
│   ├── charts/{line-chart.tsx,donut-chart.tsx,chart-table.tsx,index.ts} (+ testes)
│   ├── components/{example-badge.tsx} (+ teste)   # reaproveita StatusBadge
│   └── docs/{graficos.ts,shell.ts}                # documenta gráficos, barra superior e menu da pessoa
├── components/identity/password-field.tsx         # mostrar/ocultar senha
├── pages/
│   ├── auth/{auth-layout.tsx,brand-panel.tsx,login-page.tsx,recovery-*.tsx} (+ testes)
│   └── overview/{overview-page.tsx,overview-block.tsx,use-overview-block.ts,blocks/*} (+ testes)
├── app/
│   ├── overview/overview-source-context.tsx
│   ├── shell/{app-shell.tsx,top-bar.tsx,user-menu.tsx,navigation-menu.tsx} (+ testes)   # header.tsx sai
│   └── App.tsx                                    # "/" renderiza OverviewPage
└── domain/navigation/screens.ts                   # label "Início" → "Visão geral"

tests/
├── e2e/{visao-geral.spec.ts,entrada-renovada.spec.ts} (+ ajustes de seletores)
└── e2e/visual/{entrada.visual.spec.ts,visao-geral.visual.spec.ts}  # capturas só no Linux
```

**Decisão de estrutura**: manter o projeto único e as camadas existentes (`domain/`, `application/`, `infrastructure/`, `app/`, `pages/`, `design-system/`). Nenhum pacote novo.

## Estratégia de testes (TDD)

1. **Domínio e fonte**: o tipo de cada bloco e a fonte de exemplo (`sampleOverviewSource`) por bloco: números e textos em pt-BR, soma da rosca igual ao total, todo valor com rótulo, nenhuma afirmação de estado físico (RN-004), nenhum identificador de tenant ou de pessoa (CA-009, RF-032).
2. **Hook e blocos**: `useOverviewBlock` com fonte falsa para `loading`, `ready`, `empty`, `error` e `retry`; falha de um bloco não afeta os demais; anúncio único e foco intacto (CA-006, RF-028).
3. **Gráficos**: papéis ARIA, título, descrição, tabela com os mesmos dados, legenda com valor e percentual em texto, cores só de tokens e contraste de 3:1 calculado com `src/design-system/contrast.ts` (RF-018, CA-004).
4. **Página**: os blocos de RF-010 a RF-015, cada região com nome e a marca "Exemplo"; sem texto "Fundação Técnica Ativa"; sem "Ver todos"; nenhuma chamada de rede da página; conteúdo igual para pessoas e tenants diferentes (CA-003, CA-009).
5. **Entrada**: `LoginPage` com todos os cenários da Spec 002 repetidos na nova moldura (inválida, expirada, limite de sessões, bloqueio, segundo fator, rede lenta); sem login social nem "Lembrar de mim"; mostrar/ocultar senha com estado informado e senha oculta por padrão; ordem de Tab com o link de pular primeiro (CA-002, RF-005).
6. **Shell**: barra superior (logotipo no celular, botão do menu abaixo de 768 px, organização, estado de conexão, menu da pessoa), menu da pessoa por teclado e mouse (Escape, clique fora, foco de volta), nome longo, perfil global sem organização ativa, um só `h1` e um só `main` (RF-021, RF-022, CA-007).
7. **Regressão das Specs 001 a 004**: suítes inteiras; só mudam o rótulo "Início", o título da página inicial e a posição de "Meu perfil" e "Sair" (CA-001).
8. **E2E com backend simulado**: entrada e Visão geral em 360, 768 e 1920 px mais 320 px e zoom de 200% sem rolagem horizontal; axe sem violação crítica ou grave; teclado completo incluindo o menu da pessoa; cores forçadas; offline com a estrutura aberta e o aviso da Spec 003 (CA-004, CA-005, CA-007).
9. **Escalas e tokens**: os testes de escalas da Spec 003 passam sobre as telas novas, sem cor, tamanho ou espaçamento fora dos tokens (CA-010).
10. **Visual**: capturas da entrada (principal, erro, offline) e da Visão geral (principal) em três larguras, geradas no Linux por `npm run test:visual:atualizar` (CA-008).
11. **Medição**: `medicao-shell.spec.ts` contra a linha de base de `validation.md` da Spec 004, e tamanho do pacote antes e depois (MS-006, RNF-003).

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Dado de exemplo parecer dado real | Marca "Exemplo" em cada bloco (componente obrigatório), subtítulo da página, teste que reprova região sem a marca e fonte única rotulada |
| Texto de exemplo afirmar estado físico (RN-004) | Medidas e alertas redigidos como indicadores e eventos, nunca como "entrega feita" ou "lacre travado"; teste procura termos proibidos nos textos de exemplo |
| Dois `h1` ou nenhum com o novo shell | Convenção mantida (logotipo é o `h1`); logotipo renderizado em um só lugar por vez; teste de landmarks e de títulos em cada largura |
| Regressão da autenticação ao trocar a moldura | A lógica de `LoginPage` não muda; testes da Spec 002 rodam sem alteração de comportamento; só a moldura e o campo de senha são novos |
| Mostrar senha vazar a senha | Senha oculta por padrão, botão com estado, nenhuma gravação, log ou cache; teste confirma que o valor não vai para atributos além de `value` do campo |
| Menu da pessoa depender de rede | Nome só ao abrir e com texto alternativo; falha não bloqueia "Meu perfil" nem "Sair" |
| Gráficos inacessíveis ou dependentes de cor | Tabela equivalente, legenda em texto, formas e traçados distintos, `role="img"` com descrição, contraste de 3:1 em teste |
| Pacote ou carregamento do shell piorarem além do limite | Sem dependência nova; medição antes e depois; contingência `React.lazy` da Visão geral |
| Capturas variarem por sistema | Geradas e comparadas só no Linux, como na Spec 003; nunca versionar capturas do Windows |
| Rolagem horizontal em 320 px ou com zoom | Grade com `min-w-0`, quebra de texto, tabelas rolando dentro do bloco; teste dedicado de 320 a 1920 px |
| Layout em duas colunas alterar o foco do menu (Spec 004) | O menu mantém seu código de foco; testes da Spec 004 permanecem; só a largura da coluna muda |

## Rastreabilidade

**Issue**: [#13 — Spec 005: entrada renovada e Visão geral](https://github.com/aalissonalmeidaq/fluxid_integra2026/issues/13) em `aalissonalmeidaq/fluxid_integra2026`; o número também entra na descrição do PR e no RIA.

| Requisito | Onde é atendido |
|---|---|
| RF-001 a RF-007 | `auth-layout.tsx`, `brand-panel.tsx`, `login-page.tsx`, `password-field.tsx`, telas de recuperação |
| RF-008 a RF-018, RF-015a | `overview-page.tsx`, blocos, `OverviewSource`, `sample-overview-source.ts`, gráficos |
| RF-019 a RF-023 | `navigation-menu.tsx` (Spec 004), `screens.ts`, `top-bar.tsx`, `user-menu.tsx` |
| RF-024 a RF-030 | design system, testes de escalas, estados, PWA sem cache de dados |
| RF-031 a RF-033, RN-001 a RN-004 | nenhuma mudança de acesso; fonte de exemplo isolada; teste de ausência de dado real |
| CA-001 a CA-010 | contrato de verificações automáticas |
| MS-007 | validação humana de Alisson Almeida registrada no RIA |

## Encerramento do ciclo

Ao concluir implementação e convergência, seguir o gate de registro de IA do `AGENTS.md`: testes, `git add`, `npm run ia:registro -- --spec 005 --ciclo NN --titulo "..."`, validação humana, `npm run ia:validar` e commit único. O link do RIA aponta para a branch até o PR existir; a troca pelo link do PR é pendência obrigatória antes do merge. Depois do merge, entregar o DOCX do RIA em PR de documentação.

## Acompanhamento de complexidade

Sem violações da constituição a justificar. Nenhuma dependência nova.

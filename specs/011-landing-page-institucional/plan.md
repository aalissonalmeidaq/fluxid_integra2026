# Plano de implementação: Landing page institucional do FluxID

**Branch**: `feat/011-landing-page-institucional` | **Data**: 13/10/2026 | **Spec**: [spec.md](spec.md)

**Entrada**: especificação em `specs/011-landing-page-institucional/spec.md`, com os esclarecimentos de 13/10/2026.

## Resumo

Uma página pública e de apresentação passa a ser a rota `/`. Ela fica **fora do `AppShell`** (que é pensado para a área autenticada) e tem cabeçalho, rodapé e "pular para o conteúdo" próprios. É carregada **sob demanda** (`lazy`), como as demais telas pesadas, para o pacote de entrada não crescer. O conteúdo vem de **uma fonte de dados tipada** (textos, links, ordem das seções), separada dos componentes. A Visão geral muda para `/visao-geral`, e o PWA instalado passa a iniciar nela. Nada muda no servidor: não há migration, Edge Function, RLS nem chamada de rede para renderizar a landing.

A abertura é escura e vibrante (azul-marinho da marca, brilhos verdes), com o mascote. As seções seguintes alternam claro e escuro. As prévias do sistema são ilustrações montadas com os componentes e tokens existentes, marcadas "Exemplo".

## Contexto técnico

**Linguagem/versão**: TypeScript 5, React 19.3, Vite 8.3, Tailwind 4.3 (tema estrito por tokens), Montserrat variável (`@fontsource-variable/montserrat`).

**Dependências principais**: as já existentes (design system da Spec 003, ícones do próprio design system). **Nenhuma dependência nova** (sem biblioteca de animação nem de carrossel): movimento só com CSS e `IntersectionObserver`.

**Armazenamento**: nenhum. Sem cookies, sem `localStorage`, sem analytics.

**Testes**: Vitest + Testing Library (componentes e dados), contrato (`tests/contract`), Playwright (E2E em 360, 768, 1440 e 1920 px; Chromium e WebKit; axe), capturas visuais no Linux (Docker).

**Plataforma alvo**: navegadores modernos (Chrome, Safari, Firefox, Edge) em celular, tablet e desktop; PWA instalável preservado.

**Tipo de projeto**: aplicação web de página única, com roteamento próprio por `pathname` (sem biblioteca de rotas), em `src/app/App.tsx`.

**Metas de desempenho**: pacote de entrada +2% no máximo sobre 597.791 bytes (limite 609.747); LCP ≤ 2,5 s e CLS < 0,1 em 4G simulado; imagens da primeira dobra ≤ 250 KB.

**Restrições**: só tokens (teste `tests/contract/escalas-no-codigo.test.ts`); `prefers-reduced-motion`; nenhum recurso de terceiros na abertura; conteúdo sem dado inventado; português do Brasil.

**Escala/escopo**: 1 página, ~9 seções, 8 links externos, 1 imagem de mascote (3 usos), ~12 componentes pequenos.

## Verificação da constituição

| Princípio | Situação |
|---|---|
| I. Especificação antes do código | Cumprido: spec e esclarecimentos prontos. |
| II. TDD | A fonte de dados, o seletor de rota e o botão por sessão nascem com testes antes do código. |
| III. Multitenancy e segurança | Sem dado de tenant, sem credencial, sem chamada ao servidor; links externos com `rel="noopener noreferrer"`. |
| IV. Estados explícitos | Não se aplica a estados de domínio; estados de página (carregando, erro da imagem, offline) são definidos. |
| V. Experiência e acessibilidade | WCAG 2.2 AA, 360 px a desktop amplo, UI UX Pro Max e skill `impeccable`; PWA preservado. |
| VI. Rastreabilidade | Branch `feat/011-…`, PR, RIA no encerramento. |
| VII. Qualidade verificável | Lint, tipagem, testes, E2E, axe, build PWA e validação humana. |
| VIII. Documentação viva | Spec, plano, contratos e `docs/` (publicação) atualizados. |

Sem violações. Reavaliado após o desenho: sem violações.

## Decisões principais (detalhes em [research.md](research.md))

1. **Roteamento**: `App.tsx` ganha o caso `pathname === '/'` → `LandingPage` (lazy), **antes** de qualquer `ProtectedRoute`. A Visão geral (`OverviewPage`) passa a responder em `/visao-geral`; o desvio final (rota desconhecida → Visão geral protegida) continua, o que mantém `/login` funcionando como hoje. Quem autentica em `/login` tem a URL trocada para `/visao-geral` (`replaceState`), para o endereço e o menu refletirem a tela exibida.
2. **Fora do `AppShell`**: a landing monta seu próprio cabeçalho, `main`, rodapé e `SkipLink`. Assim, quem está autenticado não vê menu lateral nem barra superior do sistema sobre a página de apresentação.
3. **Botão por sessão**: lê só `useAuth().state.status`. Enquanto a sessão é verificada, mostra "Entrar no sistema" sem trocar de tamanho. `authenticated` → "Abrir o sistema" (`/visao-geral`). A landing nunca bloqueia nem espera a rede.
4. **Fonte de dados** única em `src/pages/landing/landing-content.ts` (tipada): seções, textos, itens de funcionalidade e os 8 links (`MATERIAIS`). Um teste de contrato fixa os 8 destinos e proíbe dados fora da lista.
5. **Vídeos**: cartão de marca com miniatura desenhada em CSS/SVG com tokens (sem baixar `i.ytimg.com`) que abre o YouTube em nova aba. Nenhum `iframe`, nenhum script de terceiros.
6. **Mascote**: arte original em `specs/011-…/assets/`; versões otimizadas (WebP e AVIF, 3 larguras, mais PNG de reserva) geradas por script para `public/landing/`. Usa `<picture>` com `width`/`height`, `fetchpriority` na abertura e carregamento tardio nos outros dois usos.
7. **Movimento**: revelação de seções por `IntersectionObserver` + classes CSS, e leve flutuação do mascote; tudo desligado por `prefers-reduced-motion` (as seções já nascem visíveis). Sem parallax, sem rolagem animada, transições só com tokens e sem atrasar o anel de foco.
8. **Tema**: a abertura usa um conjunto de tokens "sobre escuro" já existentes (`navy`, `azul-profundo`, `verde-vivo`, `branco`); novos tokens só se um valor faltar e **por `tokens.ts`** (gera `tokens.css`), nunca cor literal.
9. **PWA**: `start_url` do manifesto vira `/visao-geral`; instalações antigas (`start_url` `/`) são cobertas por um redirecionamento de `/` para `/visao-geral` quando a página abre em modo instalado (`display-mode: standalone`); o `navigateFallback` continua servindo `/index.html` para `/`, então a landing abre offline com o app já instalado. Os chunks e imagens leves entram no precache; as imagens grandes (AVIF/WebP da abertura) entram, e o PNG de reserva fica de fora.
10. **Migração de `/`**: `screens.ts` (`inicio` → `/visao-geral`), `logo-link.tsx`, o botão "Solicitar novo link" (`/?recovery=1` → `/login?recovery=1`), os testes unitários (15 ocorrências) e os E2E (89 `goto('/')` em 53 arquivos). Em E2E, troca mecânica por um helper `paginaInicial()`/constante `VISAO_GERAL`. Há um teste de contrato que impede voltar a usar `/` como Visão geral.

## Estrutura do projeto

### Documentação (esta funcionalidade)

```text
specs/011-landing-page-institucional/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
├── assets/mascote-original.png
└── contracts/
    ├── conteudo-e-links.md
    └── rotas-e-pwa.md
```

### Código-fonte (previsto)

```text
src/
├── app/
│   ├── App.tsx                       # caso "/" → LandingPage (lazy); Visão geral em /visao-geral
│   └── shell/logo-link.tsx           # aponta para /visao-geral
├── domain/navigation/screens.ts      # 'inicio' → /visao-geral
├── pages/
│   ├── auth/recovery-confirm-page.tsx # "Solicitar novo link" → /login?recovery=1
│   └── landing/
│       ├── landing-page.tsx          # monta cabeçalho, seções e rodapé
│       ├── landing-content.ts        # fonte única de textos e links
│       ├── landing-cta.tsx           # botão por sessão
│       ├── use-reveal.ts             # IntersectionObserver + reduced motion
│       ├── landing.css               # só classes com tokens
│       └── sections/                 # hero, proposta, problema, solucao, funcionalidades,
│                                     # offline, seguranca, materiais, chamada-final
public/landing/                       # mascote e miniaturas otimizados
scripts/landing/otimizar-imagens.mjs  # gera as imagens a partir do original
tests/
├── contract/landing-links.test.ts, landing-sem-terceiros.test.ts, rota-raiz.test.ts
└── e2e/landing.spec.ts, landing-acessibilidade.spec.ts, landing-pwa.spec.ts
```

**Decisão de estrutura**: segue o padrão das áreas existentes (`pages/<área>/`), sem criar camada nova. As regras (qual botão mostrar, quais links existem) ficam em `landing-content.ts` e `landing-cta.tsx`, não espalhadas pelos componentes.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Migrar `/` quebra dezenas de E2E e atalhos | Troca mecânica com helper único; teste de contrato; rodar a suíte inteira antes do PR. |
| Landing pesa o pacote de entrada | `lazy` + medição no T de baseline; limite de +2% em teste. |
| Brilhos e degradês reprovam contraste AA | Texto só sobre áreas de cor sólida (painéis), brilho em camadas decorativas atrás; medição com o verificador de contraste do design system e axe. |
| Mascote com direito de uso incerto | Pendência humana explícita antes da publicação (gate na validação). |
| Drive privado | Descrição do link avisa que pode exigir permissão. |
| "Reduzir movimento" esquecido | Teste E2E com `reducedMotion: 'reduce'` e teste de CSS. |

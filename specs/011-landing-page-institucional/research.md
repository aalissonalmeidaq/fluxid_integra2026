# Pesquisa e decisões: Landing page institucional

Cada decisão segue o formato **Decisão / Justificativa / Alternativas**. Não restou nenhum ponto "a esclarecer".

## 1. Onde a landing se encaixa no roteamento

- **Decisão**: caso `pathname === '/'` em `App.tsx`, antes dos `ProtectedRoute`, renderizando `LandingPage` por `lazy`. A Visão geral passa a `/visao-geral`; o desvio final (qualquer rota desconhecida cai na Visão geral protegida, que mostra o login a quem não tem sessão) é mantido.
- **Justificativa**: o app já roteia por `pathname` sem biblioteca. Manter o desvio final preserva `/login` (que hoje funciona por cair no login) e os links antigos para telas internas.
- **Alternativas**: adotar biblioteca de rotas (muda o app inteiro, fora de escopo); criar `/login` explícito (útil, mas muda o fluxo da Spec 005 sem necessidade).

## 2. Landing dentro ou fora do `AppShell`

- **Decisão**: **fora**. A landing tem cabeçalho, `main`, rodapé e `SkipLink` próprios.
- **Justificativa**: o shell autenticado desenha menu lateral e barra superior do sistema; sobre uma página de apresentação isso confunde. A regra da Spec 005 ("telas públicas usam a moldura de marca, sem barra superior nem menu") continua valendo: a landing tem sua própria moldura, também sem menu do sistema.
- **Alternativas**: reaproveitar o shell público (só serve a `signed_out`/`mfa_required`, e não cobre o autenticado).

## 3. Como decidir "Entrar" ou "Abrir o sistema"

- **Decisão**: ler `useAuth().state.status` (`authenticated` → "Abrir o sistema" para `/visao-geral`; qualquer outro → "Entrar no sistema" para `/login`). Sem chamada extra.
- **Justificativa**: o provedor de autenticação já existe no topo da árvore. A landing não espera a verificação da sessão: o botão nasce como "Entrar" e troca, com a mesma largura mínima, para não deslocar o layout.
- **Alternativas**: redirecionar automaticamente quem tem sessão (a spec pede que a pessoa **possa** ir direto, não que perca a página).

## 4. Fonte de conteúdo

- **Decisão**: um módulo tipado `landing-content.ts` com seções, funcionalidades e os 8 links; cada funcionalidade traz a referência da spec que a sustenta (`origem: '008'`), usada só em teste.
- **Justificativa**: a equipe troca texto e link sem tocar na apresentação (RF-007) e o teste de contrato garante a lista fechada de destinos e a rastreabilidade do conteúdo (spec, História 2).
- **Alternativas**: JSON em `public/` (permitiria mudar sem build, mas abriria um canal sem tipagem e sem teste de compilação); CMS (fora de escopo).

## 5. Vídeos sem player de terceiros

- **Decisão**: cartão de marca com miniatura desenhada em CSS/SVG e `<a target="_blank" rel="noopener noreferrer">` para o YouTube; rótulo "abre no YouTube".
- **Justificativa**: carregar `iframe` do YouTube baixa scripts de terceiros, pesa e rastreia (RNF-007). Miniatura desenhada em CSS/SVG com tokens evita requisição a `i.ytimg.com` na abertura e dispensa arquivo binário.
- **Alternativas**: `youtube-nocookie` sob demanda ao clicar (continua carregando terceiros e complica o foco); miniatura remota (requisição de terceiro na abertura).

## 6. Imagens do mascote

- **Decisão**: script `scripts/landing/otimizar-imagens.mjs` gera AVIF, WebP e PNG de reserva em 480, 768 e 1200 px de largura, com recorte do fundo escuro integrado ao degradê da abertura. `<picture>` com `width`/`height`, `fetchpriority="high"` só na abertura, `loading="lazy"` e `decoding="async"` nos demais.
- **Justificativa**: o original tem ~1,9 MB. Meta: ≤ 250 KB de imagens na primeira dobra (RNF-005) e sem CLS.
- **Alternativas**: servir o PNG original (estoura a meta); redesenhar em SVG (perderia a arte aprovada).
- **Ferramenta**: usar ferramenta já disponível no ambiente, sem dependência nova; se não houver, converter uma única vez fora do repositório e versionar as saídas, com o procedimento documentado no cabeçalho do script.

## 7. Movimento e `prefers-reduced-motion`

- **Decisão**: CSS com tokens de movimento existentes + `IntersectionObserver` (`use-reveal.ts`). Em `prefers-reduced-motion: reduce`, nenhuma animação, e as seções já nascem visíveis. Flutuação do mascote por CSS, parada em reduzir movimento.
- **Justificativa**: sem biblioteca, sem custo de pacote, comportamento previsível e testável (`page.emulateMedia({ reducedMotion: 'reduce' })`).
- **Alternativas**: GSAP/Framer Motion (pesam e exigem tratamento próprio de movimento reduzido).

## 8. Contraste sobre fundo escuro com brilhos

- **Decisão**: texto sempre sobre superfície de cor sólida (`navy`, `grafite`, `branco`); brilhos e degradês ficam em camadas decorativas atrás, com `aria-hidden`. Medição com `src/design-system/verificar-contraste.ts` para os pares usados e com axe nas três larguras e nos dois temas.
- **Justificativa**: degradê sob texto torna o contraste imprevisível; separar camadas mantém o efeito e a conformidade AA.
- **Alternativas**: texto sobre imagem com escurecimento (difícil de provar em todas as larguras).

## 9. PWA e offline

- **Decisão**: `start_url` do manifesto → `/visao-geral`. O `navigateFallback` já serve `/index.html` offline para `/`, então a landing abre com o app instalado. Links externos, offline, ganham a dica "precisa de conexão" (leitura de `navigator.onLine` e do evento `online`/`offline`, sem fila).
- **Justificativa**: preserva a promessa da Spec 010 (abrir sem conexão) e cumpre o que foi decidido (app instalado abre no sistema).
- **Alternativas**: manter `start_url: '/'` (abriria a landing no app instalado, rejeitado).

## 10. Migração do endereço `/`

- **Decisão**: constante única `VISAO_GERAL = '/visao-geral'` em `src/domain/navigation/screens.ts`, usada por `screens.ts`, `logo-link.tsx`, landing e testes. O botão "Solicitar novo link" da recuperação de senha passa de `/?recovery=1` para `/login?recovery=1` (o login já lê `recovery=1`). Os 89 `goto('/')` dos E2E viram `goto(VISAO_GERAL)` num único commit mecânico, com revisão por busca.
- **Justificativa**: evita string mágica e impede regressão com teste de contrato (`rota-raiz.test.ts`).
- **Alternativas**: manter `/` como Visão geral para autenticados e landing para anônimos (comportamento diferente por sessão no mesmo endereço, difícil de testar e de cachear no service worker).

## 11. Metadados de compartilhamento

- **Decisão**: o app é uma página única; título e descrição próprios entram em `index.html` e a landing atualiza `document.title` ao montar. A imagem de compartilhamento (`og:image`) é um PNG estático 1200×630 em `public/landing/`. Raspadores de link não executam JavaScript, então as metatags **ficam no `index.html`** (valem para todo o site, o que é aceitável: o endereço público é a landing).
- **Justificativa**: simples e sem pré-renderização. Telas internas exigem login e não são compartilhadas.
- **Alternativas**: pré-renderização/SSR (fora de escopo).

## 12. Conteúdo fiel ao produto

- **Decisão**: cada bloco de funcionalidade cita a spec de origem (Spec 006 cilindros e estoque; 007 cadastros; 008 viagens; 009 leitura e GPS; 010 fila offline, fotos e assinatura; 002 e 004 segurança, perfis, auditoria). Nenhum número de clientes, preço ou métrica de mercado.
- **Justificativa**: exigência da spec ("sem dados inventados").
- **Alternativas**: textos de marketing genéricos (risco de prometer o que não existe).

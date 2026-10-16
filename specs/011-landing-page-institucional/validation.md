# Validação: Spec 011 — Landing page institucional

**Data**: 14/10/2026 (UTC) | **Branch**: `feat/011-landing-page-institucional` | Medido no Windows 11, com o aplicativo compilado (`npm run build`) servido pelo Playwright em `localhost:4173`.

> Este registro traz **só o que foi medido ou conferido**. A validação humana (entrevista) e os testes com pessoas ficam registrados na parte final, como pendência, e nada nela foi preenchido em nome de ninguém.

## 1. Pacote de entrada e desempenho (RNF-003, RNF-004, RNF-005)

Medido com o `tests/e2e/medicao-landing.spec.ts`, em "Slow 4G" (1,6 Mbps e 150 ms de latência), no servidor de preview do Vite, que **não comprime** as respostas (a Vercel serve com compressão, então o resultado real tende a ser melhor).

| Medida | Resultado | Limite | Situação |
|---|---|---|---|
| Pacote de entrada (`dist/assets/index-*.js`) | 598.871 bytes (+0,18% sobre 597.791) | 609.747 (+2%) | dentro |
| Chunk da landing (carregado sob demanda) | 26.932 bytes de JS e 1.465 de CSS | fora do pacote de entrada | dentro |
| LCP, desktop (Chromium, 1280 x 720) | 2.384 ms | 2.500 ms | dentro, com pouca folga |
| LCP, celular (360 px) | 1.676 ms | 2.500 ms | dentro |
| CLS, desktop e celular | 0,0000 e 0,0179 | menor que 0,1 | dentro |
| Imagens da primeira dobra (mascote em WebP + logotipos) | 187.316 bytes | 250 KB | dentro |

Imagens geradas por `scripts/landing/otimizar-imagens.mjs`: `mascote-480.webp` (65 KB), `mascote-768.webp` (131 KB), `mascote-1200.webp` (222 KB) e a imagem de compartilhamento `og-fluxid.png` (523 KB, fora do precache do service worker). O navegador escolhe a largura por `srcset` e `sizes`; só a abertura carrega com prioridade, e as demais usam `loading="lazy"`.

## 2. Acessibilidade (RNF-001, RNF-002)

Automatizada, em `tests/e2e/landing-acessibilidade.spec.ts` (Chromium em 360, 768, 1280 e 1920 px; WebKit no iPad), com `emulateMedia` nos temas claro e escuro:
- axe (WCAG 2.0, 2.1 e 2.2 A e AA): **nenhuma violação séria ou crítica**.
- Sem rolagem horizontal em nenhuma largura (um estouro a 768 px, causado pela grade de 5 colunas da seção "Como funciona", foi encontrado e corrigido).
- "Pular para o conteúdo" é o primeiro foco, e o teclado percorre a página na ordem do documento, com anel de foco visível em todos os controles.
- Todo link e botão visível tem alvo de pelo menos 24 x 24 px (o botão principal tem 44 px de altura).
- Com "reduzir movimento": nenhuma animação em curso e nenhum conteúdo escondido (`document.getAnimations()` vazio).
- Contraste: todos os pares texto e fundo estão na tabela oficial `usosDeCor` e passam em 4,5:1 (`tests/contract/landing-contraste.test.ts`). Dois pares passaram a constar da tabela (navy sobre verde-vivo, 5,46:1; cinza-gelo sobre navy e azul-profundo, 10,25:1 e 7,30:1). Um par reprovado foi corrigido: o rótulo do cartão de documentos era verde-vivo sobre azul-profundo (3,89:1) e passou a branco.
- No WebKit (iPad), os testes de Tab por links são pulados: o Safari só passa por links com Option+Tab. O foco por teclado é validado no Chromium.

**Pendente (T050)**: leitura com leitor de tela real (NVDA no Windows ou VoiceOver) da abertura, das seções, dos links externos e do botão por sessão. Não foi feita aqui; entra na validação humana.

## 3. Links dos materiais (T036)

Os 8 destinos responderam `200` a uma requisição sem credenciais (conferido em 14/10/2026): Documentos (Drive), Repositório do sistema, Repositório da API, Evidências (Drive), Canal do YouTube e os três vídeos. As duas pastas do Drive respondem sem login, mas o acesso ao conteúdo depende do compartilhamento configurado no Drive. Os testes garantem `target="_blank"`, `rel="noopener noreferrer"` e o texto "abre em nova aba" em todos.

## 4. PWA e offline (RNF-008)

`tests/e2e/landing-pwa.spec.ts`: o manifesto inicia em `/visao-geral`; em modo instalado (`display-mode: standalone`), abrir `/` leva ao sistema sem passar pela landing; no navegador comum `/` é a landing; com o service worker ativo e sem rede, a landing abre e os 8 links externos mostram "Precisa de conexão" (e o aviso some ao voltar a rede). O chunk da landing e o CSS entram no precache; as imagens WebP e a imagem de compartilhamento não entram (sem rede, o mascote pode faltar, e a página continua legível).

## 5. Migração de `/` para `/visao-geral`

- 15 pontos de teste unitário e 89 `goto('/')` em 53 arquivos de E2E e scripts passaram a usar `/visao-geral`; `/?recovery=1` passou a `/login?recovery=1`.
- `tests/contract/rota-raiz.test.ts` impede que `/` volte a ser usado como Visão geral.
- Quem autentica em `/login` tem a URL trocada para `/visao-geral` (sem recarregar).

## 6. Revisão de segurança e privacidade (T059)

- Nenhum segredo, token ou credencial no código, nos dados da landing nem nas imagens (`tests/contract/landing-links.test.ts`, regra de segredos; varredura do repositório por `client-secrets.test.ts`).
- Nenhuma chamada de rede para renderizar a landing: o código não usa `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket` nem `EventSource` (`landing-sem-terceiros.test.ts`).
- Nenhum recurso de terceiros na abertura: sem `iframe`, `script`, `embed`, `video`, fonte, folha de estilo ou imagem remota; os únicos endereços externos estão em `landing-content.ts` e só são acessados quando a pessoa ativa o link. O pacote gerado só cita os hosts permitidos (Drive, GitHub, YouTube e o namespace do SVG).
- Sem cookies, `localStorage`, analytics, formulário ou rastreador; o HTML base não carrega nada de terceiros.
- A landing é a única rota pública nova e não expõe dado de nenhum tenant; `ProtectedRoute` e `TenantGate` não foram alterados.
- Dados das prévias: todos fictícios e marcados "Exemplo" (códigos `EX-000101`, "Unidade Exemplo A"); nenhum nome, documento, placa ou coordenada reais.

## 7. Regressão completa (T058)

| Etapa | Resultado |
|---|---|
| `npm run lint` e `npx tsc -b` | sem avisos e sem erros |
| `npx vitest run` | 348 arquivos, 5.345 testes. A primeira rodada acusou 3 falhas, todas de testes de contrato e já corrigidas: o contrato `no-external-assets` ganhou duas exceções escritas e limitadas (o domínio público do projeto nos metadados do HTML base e, só no módulo de conteúdo da landing, os 8 links de materiais); o `landing-sem-terceiros` passou a ignorar o `rel="canonical"`; e o `rota-raiz` ganhou o limite de 30 s das varreduras. Reexecutados, os 3 passam |
| E2E (`desktop-chromium`, `tablet-webkit`, `tablet-768`, `desktop-1920`, `mobile-360-chromium`) | 1.964 testes: 1.870 passaram, 93 foram pulados por projeto e 1 falhou: `campo-acessibilidade-fila.spec.ts` ("Ver conflito", Spec 010), que passou 30 de 30 quando repetido isolado: intermitência sob carga, sem relação com a landing |
| Regressão visual no Linux (Docker, `visual-chromium`) | as 6 capturas novas da landing foram geradas e reproduzidas (12 de 12 na comparação repetida). Nas demais specs, 258 passaram; `menu carregando 768` e `painel do conflito 360/768` oscilam: a `main` sem nenhuma mudança desta spec dá o mesmo resultado no mesmo ambiente local (`painel do conflito 768` falha, os outros oscilam), então são anteriores a esta spec. A CI do GitHub (Linux) continua sendo a referência desses três |

## 9. Crítica de design e ajuste (14/10/2026)

A crítica `impeccable critique` da landing (20/28, 2 itens P1, 2 P2 e 1 P3; snapshot em `.impeccable/critique/`) apontou que os vídeos, a prova mais forte para quem ainda não tem conta, estavam no fim da página. Por decisão sua, só os dois P1 foram tratados: foi criada a faixa "Veja o FluxID em ação" logo depois da abertura, com o vídeo do pitch e o do protótipo do sistema como palco grande (sem player nem imagem de terceiros), e a segunda ação da abertura passou a levar a ela ("Ver o sistema em ação"). A seção de materiais continua com os 8 destinos. Consequências: a página passou a ter 10 links externos para 8 destinos distintos; as 6 capturas visuais foram regeneradas no Linux; os testes de contrato, unitários e E2E da landing foram atualizados e passam. **Não tratados por escolha:** costura entre o cabeçalho e a abertura, abertura a 768 px, menu de seções no celular e no tablet (P2), raio `9999px` e ícones dos materiais (P3). **O ajuste de estrutura anterior à entrevista de validação humana não vale como validação: ela deve ser feita sobre esta versão.**

## 10. Telas reais do sistema (pedido de 14/10/2026)

Por pedido da pessoa responsável, a seção "O que o sistema entrega" passou a abrir com um palco de **capturas reais do aplicativo**, no lugar das prévias ilustradas de viagem e de leitura: a viagem em andamento no computador (1120 x 760, 63 KB) e as paradas e a carga no celular de campo (780 x 1688, 73 KB), ambas em WebP, locais, com dimensões fixas, carregadas sob demanda e descritas em texto. Os dados são os do backend simulado (cliente "Cliente Exemplo 01", motorista "Ana Condutora", placa "ABC-1234", cilindro "CIL-006"): fictícios, e a página os marca "Exemplo". As capturas saem de `tests/e2e/landing-telas.gerar.spec.ts` (sob demanda, fora da suíte), então podem ser refeitas quando a interface mudar. A captura mostra a barra "Conectado: Dispositivo local" do modo de desenvolvimento do aplicativo, por ser a interface real. Os testes (unitários, de contrato, E2E com axe e as 6 capturas visuais no Linux) foram atualizados e passam.

## 11. Adaptação ao pitch (pedido de 14/10/2026)

Medido com o aplicativo compilado, no mesmo ambiente das seções anteriores.

| Medida | Resultado | Limite | Situação |
|---|---|---|---|
| Pacote de entrada (`dist/assets/index-*.js`) | 598.886 bytes | 609.747 | dentro |
| Chunk da landing (sob demanda) | 60 KB de JS (16 KB comprimido) e 6 KB de CSS | fora do pacote de entrada | dentro |
| LCP, desktop (Chromium, 1280 x 720, Slow 4G) | 2.236 a 2.256 ms | 2.500 ms | dentro (era 3.104 ms antes do ajuste de `sizes` e do pré-carregamento) |
| LCP, celular (360 px, Slow 4G) | 2.200 a 2.208 ms | 2.500 ms | dentro |
| CLS, desktop e celular | 0,0500 e 0,0481 | menor que 0,1 | dentro |
| Imagens da primeira dobra | 240.994 bytes | 250 KB | dentro, com pouca folga |
| Altura da abertura | igual à da tela (900 de 900 px a 1440 x 900) | tela inteira | dentro |

- Poses do mascote (WebP com transparência): corpo inteiro 480/768/1200 (72, 142 e 247 KB), espiando 480/768 (46 e 91 KB), rosto 160/320 (10 e 26 KB).
- Testes: Vitest completo (352 arquivos, 5.403 testes), lint e typecheck sem erro; E2E da landing (Chromium e WebKit) com 96 aprovados e 14 pulados por projeto; o teste novo confirma que nada do YouTube é pedido antes do clique em "Assistir".
- axe sem violação séria ou crítica depois de trocar os numerais decorativos das frentes para azul-royal (o cinza-claro anterior não tinha contraste).
- Um teste de rolagem do WebKit ficou instável com a página mais longa; o percurso passou a esperar dois quadros a cada passo, e a suíte passou três vezes seguidas.

## 12. Plano de ação da crítica de design (14/10/2026)

| Medida | Resultado | Limite | Situação |
|---|---|---|---|
| Altura da página (1440 px / 390 px) | 12.486 px / 20.732 px (antes 14.460 / 24.614) | — | menor |
| LCP desktop / celular (Slow 4G) | 2.356 ms / 2.268 ms | 2.500 ms | dentro |
| CLS desktop / celular | 0,0500 / 0,0558 | menor que 0,1 | dentro |
| Pacote de entrada | 598.886 bytes | 609.747 | dentro |
| Imagens da primeira dobra | 240.994 bytes | 250 KB | dentro |
| Cartão do C-262 no celular (390 x 844) | termina em 792 px | dentro da primeira tela | dentro |
| Detector de design (`impeccable detect`) | 0 achados (antes 6) | — | limpo |

- Testes: Vitest completo (352 arquivos, 5.399 testes), lint e typecheck sem erro; E2E da landing (Chromium e WebKit) com 96 aprovados; teste novo da gaveta do celular (abrir, Escape, foco devolvido, escolha fecha).
- Crítica registrada em `.impeccable/critique/2026-10-14T14-09-30Z__src-pages-landing.md` (23/36, antes das correções).

## 13. Apresentação do FluxID e logo em destaque (14/10/2026)

- Origem das poses: apresentação "Apresentação_FluxID - IntegraSENAI (2).pdf" (8 páginas), com as poses já em PNG com transparência; recortadas ao contorno e convertidas em WebP por `scripts/landing/otimizar-imagens.mjs` (entre 17 KB e 96 KB cada).
- A apresentação traz valores diferentes dos do pitch (R$ 3.767 por cilindro e R$ 497.244 por ano, contra R$ 3.766 e R$ 489.666): 497.244 é 132 vezes 3.767, e não 130; a página mantém os valores do pitch, calculados, até a decisão da pessoa responsável.
- Equipe (nomes, funções e fotos), linha do tempo 2026–2032 e fotos de cena não foram incluídas: são dados de pessoas e metas que precisam de decisão e consentimento.

- Medição final desta rodada (aplicativo compilado, Slow 4G): LCP desktop 2.360 a 2.388 ms (a logo maior pesa; folga de cerca de 110 ms sobre 2.500 ms), LCP celular 2.256 ms, CLS 0,0453 e 0,0531, imagens da primeira dobra 217 KB e 204 KB, pacote de entrada 598.886 bytes. Altura da página 13.604 px (computador) e 21.020 px (celular).
- Testes: Vitest completo (352 arquivos, 5.410 testes), lint e typecheck sem erro, detector de design com 0 achados, E2E da landing (Chromium e WebKit) com os 96 passando, incluindo o teste offline, que passou a esperar 11 avisos "Precisa de conexão" (5 links externos, 3 linhas de vídeo e 3 botões do player).

## 8. Pendências (não presumidas)

- Autorização de cada integrante para publicar nome e foto (T089). Não presumida.
- O bloco "Marcos já cumpridos" traz a validação do protótipo em 20 a 22 out. 2026 (data informada pela pessoa responsável em 14/10/2026), ainda futura nesta data: o título do bloco ou a data precisam ser revistos até lá.

- Publicação do nome da Oxigênio Cariri e dos valores de perda (R$ 489.666 por ano) na página pública: confirmar com a pessoa responsável (T075).


| Item | Situação |
|---|---|
| T002: issue da Spec 011 | não existe; abrir é ação visível no GitHub e depende de confirmação |
| T050: leitor de tela real | não executado |
| Foto do protótipo físico e símbolo enviados em 14/10/2026 | as imagens não ficaram salvas como arquivo na sessão; pendente enviar o caminho do arquivo (ou colocá-lo na pasta da spec) para usar a foto como miniatura do vídeo do protótipo físico |
| T059a: teste de compreensão com 5 pessoas (SC-001 e SC-002) | não executado |
| T060: direito de uso da arte do mascote e aprovação do texto final | aguardando a pessoa responsável |
| T062: entrevista de validação humana | aguardando a pessoa responsável |

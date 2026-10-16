# Registro do uso de inteligência artificial e validação humana

**FluxID | RIA-031 | Landing page institucional do FluxID**

> Ponto de atenção: a IA apoia a equipe, mas a responsabilidade final é humana.

## Registro da interação

- Ferramenta de IA utilizada: Claude Code (Anthropic), modelos Claude Opus 5.5 e Claude Sonnet 5.5; outras sessões de IA também editaram a landing durante o ciclo
- Objetivo do uso: Criar a landing page pública do FluxID na raiz do aplicativo (a Visão geral passou a /visao-geral) e adaptá-la ao pitch "O cilindro que desapareceu" e à apresentação do projeto no Integra SENAI, sem prejudicar o PWA, o desempenho e a acessibilidade.
- Prompt utilizado, em síntese sanitizada: Síntese dos pedidos da pessoa responsável no ciclo: criar a landing institucional com os materiais do projeto; adaptá-la ao roteiro do pitch preservando a essência; abertura ocupando a tela inteira; mascote nítido, sem desfoque, com outras poses; vídeos tocando na própria página, sem abrir o YouTube; cartões de prejuízo em vermelho; executar os planos de ação de duas críticas de design (impeccable); incorporar a apresentação do FluxID (poses do mascote, equipe e marcos); dar mais destaque à logo no topo; trocar a data da validação do protótipo para 20 a 22 out. 2026; fechar a spec com tudo aprovado e utilizado, dispensando a entrevista de validação e os testes de fechamento.
- Resposta gerada pela IA: A IA gerou a landing em React com seções da história do C-047, prejuízo calculado de fonte única, causa, solução com a jornada, trava interativa, vídeos incorporados após o clique (youtube-nocookie), o que já funciona com telas reais regeneradas, piloto com simulação marcada como estimativa, equipe, materiais e chamada final; poses do mascote recortadas sem fundo; testes unitários, de contrato, E2E e visuais; e a atualização da spec, das tarefas e da validação.

Link para validação da equipe: https://github.com/aalissonalmeidaq/fluxid_integra2026/pull/39
- Análise crítica da equipe: Riscos: as alterações de 15/10/2026 (apresentação em slides, planos, contato e outros ajustes feitos em outras sessões) não passaram pela suíte local no fechamento; o LCP do computador tem folga pequena (cerca de 100 ms); a página publica o nome da Oxigênio Cariri, valores de perda e nomes e fotos da equipe, o que depende de autorização.
- Validação humana realizada: A pessoa responsável acompanhou as versões da landing ao longo do ciclo (capturas, críticas e demonstrações) e, em 16/10/2026, aprovou o resultado e pediu o fechamento sem sessão formal de validação.
- Decisão final: utilizado
- Justificativa: Aprovado como está para fechar a Spec 011 e iniciar a Spec 012; a pessoa responsável considerou desnecessária, neste momento, uma validação formal mais criteriosa, porque as muitas alterações do ciclo já foram acompanhadas por ela.
- Fontes verificadas: Roteiro do pitch e apresentação do FluxID (Integra SENAI, PDF) fornecidos pela pessoa responsável; PRD e Specs 002 a 010 do repositório. Nenhuma fonte externa da web.
- Identificador do registro: RIA-031
- Data e hora da interação: 16/10/2026, 15:39:34 - America/Fortaleza

## Rastreabilidade técnica do ciclo

- Repositório: fluxid
- Branch: feat/011-landing-page-institucional
- Spec: 011
- Ciclo: 01
- Commit-base: 6e3173dae3762e7235d8b005f1671c5f7d252226
- Hash do diff funcional preparado: 5cc6b0417667d5c52beaf42366369062dd6f73a69f46c44ecc87e6ea3278e208
- Arquivos e áreas afetadas:

- `.gitignore`
- `DESIGN.md`
- `docs/prd.md`
- `docs/publicacao-em-nuvem.md`
- `index.html`
- `playwright.config.ts`
- `public/landing/dispositivo-no-cilindro-240.webp`
- `public/landing/dispositivo-no-cilindro-373.webp`
- `public/landing/equipe/carlos-augusto-192.webp`
- `public/landing/equipe/carlos-augusto.webp`
- `public/landing/equipe/john-walter-192.webp`
- `public/landing/equipe/john-walter.webp`
- `public/landing/equipe/kauan-evangelista-192.webp`
- `public/landing/equipe/kauan-evangelista.webp`
- `public/landing/equipe/nata-baracho-192.webp`
- `public/landing/equipe/nata-baracho.webp`
- `public/landing/equipe/simao-bastos-192.webp`
- `public/landing/equipe/simao-bastos.webp`
- `public/landing/instituicoes/integra-senai.webp`
- `public/landing/instituicoes/oxigenio-cariri.webp`
- `public/landing/instituicoes/saga-senai-inovacao.webp`
- `public/landing/instituicoes/senai-ceara.webp`
- `public/landing/mascote-1200.webp`
- `public/landing/mascote-480.webp`
- `public/landing/mascote-768.webp`
- `public/landing/mascote-cilindro-400.webp`
- `public/landing/mascote-cilindro-749.webp`
- `public/landing/mascote-indicando-240.webp`
- `public/landing/mascote-indicando-464.webp`
- `public/landing/mascote-preocupado-240.webp`
- `public/landing/mascote-preocupado-303.webp`
- `public/landing/mascote-procurando-240.webp`
- `public/landing/mascote-procurando-323.webp`
- `public/landing/mascote-rosto-160.webp`
- `public/landing/mascote-rosto-320.webp`
- `public/landing/mascote-tablet-320.webp`
- `public/landing/mascote-tablet-588.webp`
- `public/landing/og-fluxid.png`
- `public/landing/telas/tela-campo-celular.webp`
- `public/landing/telas/tela-viagem-desktop.webp`
- `scripts/landing/gerar-imagem-compartilhamento.mjs`
- `scripts/landing/otimizar-imagens.mjs`
- `scripts/landing/padronizar-fotos-equipe.mjs`
- `scripts/landing/poses-do-mascote.py`
- `scripts/landing/recortar-logos-senai.mjs`
- `scripts/video/montar-video-demonstracao.mjs`
- `specs/011-landing-page-institucional/assets/dispositivo-no-cilindro.png`
- `specs/011-landing-page-institucional/assets/equipe/carlos-augusto.png`
- `specs/011-landing-page-institucional/assets/equipe/john-walter.png`
- `specs/011-landing-page-institucional/assets/equipe/kauan-evangelista.png`
- `specs/011-landing-page-institucional/assets/equipe/nata-baracho.png`
- `specs/011-landing-page-institucional/assets/equipe/simao-bastos.png`
- `specs/011-landing-page-institucional/assets/logos-senai-original.png`
- `specs/011-landing-page-institucional/assets/mascote-cilindro.png`
- `specs/011-landing-page-institucional/assets/mascote-indicando.png`
- `specs/011-landing-page-institucional/assets/mascote-original.png`
- `specs/011-landing-page-institucional/assets/mascote-preocupado.png`
- `specs/011-landing-page-institucional/assets/mascote-procurando.png`
- `specs/011-landing-page-institucional/assets/mascote-recorte.png`
- `specs/011-landing-page-institucional/assets/mascote-rosto.png`
- `specs/011-landing-page-institucional/assets/mascote-tablet.png`
- `specs/011-landing-page-institucional/baseline.md`
- `specs/011-landing-page-institucional/checklists/requirements.md`
- `specs/011-landing-page-institucional/contracts/conteudo-e-links.md`
- `specs/011-landing-page-institucional/contracts/rotas-e-pwa.md`
- `specs/011-landing-page-institucional/data-model.md`
- `specs/011-landing-page-institucional/design.md`
- `specs/011-landing-page-institucional/plan.md`
- `specs/011-landing-page-institucional/quickstart.md`
- `specs/011-landing-page-institucional/research.md`
- `specs/011-landing-page-institucional/spec.md`
- `specs/011-landing-page-institucional/tasks.md`
- `specs/011-landing-page-institucional/validation.md`
- `src/app/App.landing.test.tsx`
- `src/app/App.lazy.test.tsx`
- `src/app/App.test.tsx`
- `src/app/App.tsx`
- `src/app/admin-routes.test.ts`
- `src/app/shell/app-shell.test.tsx`
- `src/app/shell/logo-link.tsx`
- `src/app/shell/navigation-menu.test.tsx`
- `src/app/use-effective-path.ts`
- `src/design-system/tokens.ts`
- `src/domain/navigation/screens.test.ts`
- `src/domain/navigation/screens.ts`
- `src/domain/navigation/visible-screens.test.ts`
- `src/pages/auth/recovery-confirm-page.tsx`
- `src/pages/landing/apresentacao.test.tsx`
- `src/pages/landing/apresentacao.tsx`
- `src/pages/landing/contato.ts`
- `src/pages/landing/landing-content.ts`
- `src/pages/landing/landing-cta.test.tsx`
- `src/pages/landing/landing-cta.tsx`
- `src/pages/landing/landing-footer.tsx`
- `src/pages/landing/landing-header.test.tsx`
- `src/pages/landing/landing-header.tsx`
- `src/pages/landing/landing-page.test.tsx`
- `src/pages/landing/landing-page.tsx`
- `src/pages/landing/landing.css`
- `src/pages/landing/mascote.test.tsx`
- `src/pages/landing/mascote.tsx`
- `src/pages/landing/prejuizo.test.ts`
- `src/pages/landing/prejuizo.ts`
- `src/pages/landing/previews/previa-base.tsx`
- `src/pages/landing/previews/previa-de-fila.tsx`
- `src/pages/landing/previews/previews.test.tsx`
- `src/pages/landing/secao-atual.test.ts`
- `src/pages/landing/secao-atual.ts`
- `src/pages/landing/sections/cadeia-decorativa.tsx`
- `src/pages/landing/sections/cartao-c262.tsx`
- `src/pages/landing/sections/causa.tsx`
- `src/pages/landing/sections/chamada-final.tsx`
- `src/pages/landing/sections/contador.tsx`
- `src/pages/landing/sections/contato-piloto.tsx`
- `src/pages/landing/sections/equipe.tsx`
- `src/pages/landing/sections/funcionalidades.tsx`
- `src/pages/landing/sections/hero.test.tsx`
- `src/pages/landing/sections/hero.tsx`
- `src/pages/landing/sections/historia.tsx`
- `src/pages/landing/sections/icone-do-material.tsx`
- `src/pages/landing/sections/icone-externo.tsx`
- `src/pages/landing/sections/materiais.test.tsx`
- `src/pages/landing/sections/materiais.tsx`
- `src/pages/landing/sections/material-card.tsx`
- `src/pages/landing/sections/piloto.tsx`
- `src/pages/landing/sections/pitch.tsx`
- `src/pages/landing/sections/planos.tsx`
- `src/pages/landing/sections/prejuizo.tsx`
- `src/pages/landing/sections/secao.tsx`
- `src/pages/landing/sections/sections.test.tsx`
- `src/pages/landing/sections/selo-situacao.tsx`
- `src/pages/landing/sections/solucao.tsx`
- `src/pages/landing/sections/tela-do-sistema.test.tsx`
- `src/pages/landing/sections/tela-do-sistema.tsx`
- `src/pages/landing/sections/trava.test.tsx`
- `src/pages/landing/sections/trava.tsx`
- `src/pages/landing/sections/video-destaque.test.tsx`
- `src/pages/landing/sections/video-destaque.tsx`
- `src/pages/landing/slides.test.ts`
- `src/pages/landing/slides.ts`
- `src/pages/landing/tom-do-fundo.test.ts`
- `src/pages/landing/tom-do-fundo.ts`
- `src/pages/landing/use-contagem.ts`
- `src/pages/landing/use-online.ts`
- `src/pages/landing/use-reveal.test.tsx`
- `src/pages/landing/use-reveal.ts`
- `src/pages/landing/use-rolagem-da-secao.test.tsx`
- `src/pages/landing/use-rolagem-da-secao.ts`
- `src/pages/landing/use-troca-automatica.ts`
- `src/pages/landing/video-incorporado.test.ts`
- `src/pages/landing/video-incorporado.ts`
- `src/styles/base.css`
- `tests/contract/landing-contraste.test.ts`
- `tests/contract/landing-links.test.ts`
- `tests/contract/landing-metadados.test.ts`
- `tests/contract/landing-movimento.test.ts`
- `tests/contract/landing-sem-terceiros.test.ts`
- `tests/contract/no-external-assets.test.ts`
- `tests/contract/rota-raiz.test.ts`
- `tests/e2e/accessibility.spec.ts`
- `tests/e2e/app-initialization.spec.ts`
- `tests/e2e/app-shell.spec.ts`
- `tests/e2e/audit-log.spec.ts`
- `tests/e2e/auth-session.spec.ts`
- `tests/e2e/campo-consulta.spec.ts`
- `tests/e2e/campo-gps.spec.ts`
- `tests/e2e/campo-leitura.spec.ts`
- `tests/e2e/campo-pwa-instalado.spec.ts`
- `tests/e2e/cilindros.spec.ts`
- `tests/e2e/conectividade-offline.spec.ts`
- `tests/e2e/desempenho-campo-leitura.spec.ts`
- `tests/e2e/desempenho-lista-cilindros.spec.ts`
- `tests/e2e/desempenho-lista-registro.spec.ts`
- `tests/e2e/desempenho-lista-viagens.spec.ts`
- `tests/e2e/dispositivos.spec.ts`
- `tests/e2e/entrada-estoque.spec.ts`
- `tests/e2e/entrada-renovada.spec.ts`
- `tests/e2e/estados.spec.ts`
- `tests/e2e/landing-acessibilidade.spec.ts`
- `tests/e2e/landing-pwa.spec.ts`
- `tests/e2e/landing-telas.gerar.spec.ts`
- `tests/e2e/landing.spec.ts`
- `tests/e2e/medicao-landing.spec.ts`
- `tests/e2e/medicao-shell.spec.ts`
- `tests/e2e/navegacao-menu.spec.ts`
- `tests/e2e/organizations.spec.ts`
- `tests/e2e/password-recovery.spec.ts`
- `tests/e2e/performance.spec.ts`
- `tests/e2e/profile.spec.ts`
- `tests/e2e/pwa.spec.ts`
- `tests/e2e/rbac.spec.ts`
- `tests/e2e/registro-clientes.spec.ts`
- `tests/e2e/registro-frota.spec.ts`
- `tests/e2e/registro-geocercas.spec.ts`
- `tests/e2e/registro-modal.spec.ts`
- `tests/e2e/registro-transversal.spec.ts`
- `tests/e2e/responsive.spec.ts`
- `tests/e2e/support/massa-apresentavel.ts`
- `tests/e2e/support/telas.ts`
- `tests/e2e/support/trips-scenario.ts`
- `tests/e2e/support/video-estudio.ts`
- `tests/e2e/teclado-e-contraste-de-foco.spec.ts`
- `tests/e2e/tenant-members.spec.ts`
- `tests/e2e/tenant-selection.spec.ts`
- `tests/e2e/viagens-carregamento.spec.ts`
- `tests/e2e/viagens-desbloqueio.spec.ts`
- `tests/e2e/viagens-encerramento.spec.ts`
- `tests/e2e/viagens-entrega.spec.ts`
- `tests/e2e/viagens-planejamento.spec.ts`
- `tests/e2e/video-demonstracao.gerar.spec.ts`
- `tests/e2e/visao-geral.spec.ts`
- `tests/e2e/visual/campo.visual.spec.ts`
- `tests/e2e/visual/cilindros.visual.spec.ts`
- `tests/e2e/visual/entrada.visual.spec.ts`
- `tests/e2e/visual/landing.visual.spec.ts`
- `tests/e2e/visual/landing.visual.spec.ts-snapshots/landing-abertura-1440-visual-chromium-linux.png`
- `tests/e2e/visual/landing.visual.spec.ts-snapshots/landing-abertura-360-visual-chromium-linux.png`
- `tests/e2e/visual/landing.visual.spec.ts-snapshots/landing-abertura-768-visual-chromium-linux.png`
- `tests/e2e/visual/landing.visual.spec.ts-snapshots/landing-pagina-1440-visual-chromium-linux.png`
- `tests/e2e/visual/landing.visual.spec.ts-snapshots/landing-pagina-360-visual-chromium-linux.png`
- `tests/e2e/visual/landing.visual.spec.ts-snapshots/landing-pagina-768-visual-chromium-linux.png`
- `tests/e2e/visual/menu.visual.spec.ts`
- `tests/e2e/visual/registro.visual.spec.ts`
- `tests/e2e/visual/sincronizacao.visual.spec.ts`
- `tests/e2e/visual/telas.visual.spec.ts`
- `tests/e2e/visual/viagens.visual.spec.ts`
- `tests/e2e/visual/visao-geral.visual.spec.ts`
- `vite.config.ts`

## Testes e evidências

- Comando(s): npm run lint; npm run typecheck; npx vitest run; npx playwright test tests/e2e/landing.spec.ts tests/e2e/landing-acessibilidade.spec.ts tests/e2e/landing-pwa.spec.ts tests/e2e/medicao-landing.spec.ts; npm run test:visual:atualizar; impeccable detect src/pages/landing
- Resultado: aprovado (última execução completa em 14/10/2026; as alterações feitas depois, em 15/10/2026, não foram testadas no fechamento, por decisão da pessoa responsável; o GitHub Actions repete a suíte no pull request)
- Evidência: Em 14/10/2026: lint e typecheck sem erros; Vitest com 352 arquivos e 5.411 testes aprovados; E2E da landing com 93 aprovados (Chromium e WebKit); 261 testes visuais aprovados no Linux; LCP em 4G simulada de 2,40 s (computador) e 2,28 s (celular), CLS 0,05; detector de design sem achados. Detalhes em specs/011-landing-page-institucional/validation.md.

## Decisões e dados pendentes

Registrar a autorização de cada integrante da equipe para publicar nome e foto (T089). Confirmar a publicação do nome da Oxigênio Cariri e dos valores de perda (T075). O marco de 20 a 22 out. 2026 aparece em "Marcos já cumpridos" antes de acontecer. Conferir no CI os testes das alterações de 15/10/2026. Gerar o DOCX do RIA após o merge.

## Validação humana

- Responsável pela revisão da equipe: Alisson Almeida
- Data da validação humana: 16/10/2026
- Amostra validada: Sem sessão formal de validação: a pessoa responsável dispensou a entrevista e aprovou com base no acompanhamento das versões durante o ciclo.
- Ambiente da validação: Não informado: não houve sessão formal de validação.
- Duração da validação: Não houve sessão dedicada de validação.
- Resultado da validação humana: aprovado
- Itens a corrigir apontados pela pessoa responsável: nenhum
- Confirmação do responsável: sim, confirmado por Alisson Almeida em 16/10/2026 (autorizou gravar a aprovação em seu nome e dispensou a entrevista e os testes de fechamento)
- Observações: Ciclo com várias sessões de IA em paralelo sobre os mesmos arquivos; o fechamento consolidou o trabalho delas. A pasta da Spec 012 ficou fora deste commit.

## Regras de preenchimento

- A validação humana é obrigatória para encerrar a spec. As respostas da seção acima vêm da pessoa responsável, em entrevista conduzida pelo agente de IA, e nunca são inventadas nem presumidas.
- Registrar apenas interações relevantes para o projeto.
- Escrever de forma natural, como uma pessoa explicaria o trabalho para outra. Preservar o sentido original, retirar palavras robóticas, frases repetitivas e formalidade excessiva, sem inventar fatos nem esconder riscos.
- Quando o resultado incluir código, preencher “Resposta gerada pela IA” com um resumo objetivo do que foi produzido e um link para validação pela equipe. Preferir o pull request; se ele ainda não existir, usar o repositório ou a branch e registrar como pendência a inclusão do link do PR antes do merge.
- Não apresentar conteúdo da IA como autoria exclusiva da equipe sem revisão.
- Registrar a decisão como decisão da equipe, mas identificar a pessoa responsável pela revisão. Não atribuir aprovação a uma pessoa sem sua confirmação explícita.
- Validar informações técnicas, legais, financeiras ou científicas em fontes confiáveis.
- Evitar dados pessoais, sigilosos ou sensíveis.
- Explicar como a equipe decidiu utilizar, adaptar ou descartar o resultado.

## Checklist final

- [x] Ferramentas de IA identificadas.
- [x] Prompts relevantes registrados por síntese sanitizada.
- [x] Respostas ou resultados documentados.
- [x] Texto revisado para soar natural, claro e autêntico, sem alterar o sentido original.
- [x] Quando houve geração de código, a resposta contém resumo e link para o repositório, branch ou, preferencialmente, pull request.
- [x] Validação humana explicada.
- [x] Fontes verificadas quando necessário.
- [x] Decisão ou pendência registrada.
- [x] O registro não contém segredos, credenciais ou tokens.
- [x] Dados pessoais foram removidos ou minimizados.

## Atualização de 16/10/2026

Atualização do RIA-031: em 16/10/2026, a pedido da pessoa responsável, foram corrigidos os checks do PR #39: um tipo `any` no prejuízo (lint) e o teste visual da landing, que esperava as cópias recortadas da faixa de logos das instituições; as capturas da landing foram regeneradas no Linux. Localmente, lint, typecheck e 5.462 testes unitários passaram, e os 261 testes visuais também (um teste da fila offline foi instável).

Atualização do RIA-031: em 16/10/2026, segunda rodada de correções do PR #39: contraste dos numerais e selos do piloto e da chamada final; faixa de logos parada com movimento reduzido (axe); cartões do piloto sem estouro horizontal a 360 px; LCP com captura própria da abertura (10,5 KB) e mascote de 320 px pré-carregados (mediana local de 2,45 s no computador e 2,48 s no celular; no CI o LCP passa a ser só anotado, como nas Specs 003 e 004); testes instáveis sob carga estabilizados (login antes da raiz, recuperação de acesso e conflito da fila). Capturas da landing regeneradas no Linux.

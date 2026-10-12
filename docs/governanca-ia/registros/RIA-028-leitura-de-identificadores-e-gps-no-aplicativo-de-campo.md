# Registro do uso de inteligência artificial e validação humana

**FluxID | RIA-028 | Leitura de identificadores e GPS no aplicativo de campo**

> Ponto de atenção: a IA apoia a equipe, mas a responsabilidade final é humana.

## Registro da interação

- Ferramenta de IA utilizada: Claude Code — Claude Sonnet 5.5
- Objetivo do uso: Implementar a Spec 009: leitura de QR Code, Data Matrix e NFC e posição do GPS na conferência da carga, na entrega e na consulta de cilindros, com o método de leitura registrado e sem guardar coordenadas nem valores lidos em auditoria, log ou aparelho.
- Prompt utilizado, em síntese sanitizada: Execução do /speckit-implement sobre as tarefas da Spec 009: domínio e adaptadores de câmera, NFC e GPS, consulta resolve, método de leitura em check_item e register_delivery, posição na chegada e na entrega, consulta lendo o código, testes (unidade, contrato, pgTAP, live, E2E, visuais), medição em 4G, roteiro em aparelho Android e correção do convite de instalação do PWA.
- Resposta gerada pela IA: Código em src/domain/field, src/infrastructure/field, src/application/field e src/pages/field; três migrations (20261013100000, 20261013100100 e 20261013100200); ajustes em manage-trips e query-cylinders; testes de unidade, contrato, pgTAP, live, E2E e capturas visuais; roteiro e validação da spec; correção do convite de instalação do PWA em use-pwa-install.ts.

Link para validação da equipe: https://github.com/aalissonalmeidaq/fluxid_integra2026/pull/32
- Análise crítica da equipe: A suíte completa passou e o roteiro em aparelho Android deu dentro das metas (MS-001 em 2 min 47 s, MS-002 até 1 min 10 s, MS-007 em 10 s). O roteiro mostrou que o PWA não pedia instalação; a causa provável era o convite do navegador se perder ao trocar de tela, e foi corrigida com teste, mas a instalação ainda não foi confirmada no aparelho.
- Validação humana realizada: Alisson Almeida executou o roteiro em aparelho Android em 12/10/2026 e aprovou, com as lacunas indicadas nas pendências.
- Decisão final: utilizado
- Justificativa: funcional (resposta da pessoa responsável)
- Fontes verificadas: Nenhuma fonte externa.
- Identificador do registro: RIA-028
- Data e hora da interação: 12/10/2026, 20:55:57 - America/Fortaleza

## Rastreabilidade técnica do ciclo

- Repositório: fluxid
- Branch: feat/009-leitura-gps-campo
- Spec: 009
- Ciclo: 01
- Commit-base: a39aa6c08a7c5cec4d9277dd5291933722c4efce
- Hash do diff funcional preparado: 6853f9aa919ad9964db01a52a9a1e523f1a9fcd4e40dc8a3b6832b6d6915fd57
- Arquivos e áreas afetadas:

- `.gitignore`
- `README.md`
- `docs/prd.md`
- `package.json`
- `playwright.config.ts`
- `scripts/campo/medir-desempenho-4g.mjs`
- `scripts/campo/semear-roteiro.mjs`
- `specs/009-leitura-gps-campo/baseline.md`
- `specs/009-leitura-gps-campo/checklists/requirements.md`
- `specs/009-leitura-gps-campo/contracts/operacoes-servidor.md`
- `specs/009-leitura-gps-campo/contracts/telas-e-fluxos.md`
- `specs/009-leitura-gps-campo/data-model.md`
- `specs/009-leitura-gps-campo/plan.md`
- `specs/009-leitura-gps-campo/quickstart.md`
- `specs/009-leitura-gps-campo/research.md`
- `specs/009-leitura-gps-campo/roteiro-android.md`
- `specs/009-leitura-gps-campo/spec.md`
- `specs/009-leitura-gps-campo/tasks.md`
- `specs/009-leitura-gps-campo/validation.md`
- `src/app/use-pwa-install.test.ts`
- `src/app/use-pwa-install.ts`
- `src/application/field/field-service.test.ts`
- `src/application/field/field-service.ts`
- `src/application/trips/trip-service.test.ts`
- `src/application/trips/trip-service.ts`
- `src/application/trips/trip-views.test.ts`
- `src/application/trips/trip-views.ts`
- `src/domain/field/identifier-candidates.test.ts`
- `src/domain/field/identifier-candidates.ts`
- `src/domain/field/position-draft.test.ts`
- `src/domain/field/position-draft.ts`
- `src/domain/field/position-quality.test.ts`
- `src/domain/field/position-quality.ts`
- `src/domain/field/position-summary.test.ts`
- `src/domain/field/position-summary.ts`
- `src/domain/field/reading-result.test.ts`
- `src/domain/field/reading-result.ts`
- `src/domain/field/reading-source.test.ts`
- `src/domain/field/reading-source.ts`
- `src/domain/field/scan-debounce.test.ts`
- `src/domain/field/scan-debounce.ts`
- `src/domain/trips/trip-history-format.test.ts`
- `src/domain/trips/trip-history-format.ts`
- `src/domain/trips/trip-validation.test.ts`
- `src/domain/trips/trip-validation.ts`
- `src/domain/trips/trip-vocabulary.test.ts`
- `src/domain/trips/trip-vocabulary.ts`
- `src/infrastructure/field/barcode-reader.test.ts`
- `src/infrastructure/field/barcode-reader.ts`
- `src/infrastructure/field/geolocation-reader.test.ts`
- `src/infrastructure/field/geolocation-reader.ts`
- `src/infrastructure/field/nfc-reader.test.ts`
- `src/infrastructure/field/nfc-reader.ts`
- `src/infrastructure/field/reader-error.ts`
- `src/pages/cylinders/components/camera-scan-button.tsx`
- `src/pages/cylinders/cylinder-detail-page.test.tsx`
- `src/pages/cylinders/cylinder-detail-page.tsx`
- `src/pages/cylinders/cylinder-list-page.test.tsx`
- `src/pages/cylinders/cylinder-list-page.tsx`
- `src/pages/field/identifier-reader-dialog.test.tsx`
- `src/pages/field/identifier-reader-dialog.tsx`
- `src/pages/field/lazy-identifier-reader.test.tsx`
- `src/pages/field/lazy-identifier-reader.tsx`
- `src/pages/field/position-field.test.tsx`
- `src/pages/field/position-field.tsx`
- `src/pages/field/read-cylinder-button.test.tsx`
- `src/pages/field/read-cylinder-button.tsx`
- `src/pages/field/read-cylinder-control.test.tsx`
- `src/pages/field/read-cylinder-control.tsx`
- `src/pages/field/reader-controls.test.tsx`
- `src/pages/field/reader-controls.tsx`
- `src/pages/field/use-field-service.ts`
- `src/pages/field/use-position-reader.ts`
- `src/pages/trips/components/arrive-position-action.test.tsx`
- `src/pages/trips/components/arrive-position-action.tsx`
- `src/pages/trips/components/delivery-dialog.test.tsx`
- `src/pages/trips/components/delivery-dialog.tsx`
- `src/pages/trips/components/loading-panel.test.tsx`
- `src/pages/trips/components/loading-panel.tsx`
- `src/pages/trips/components/stop-card.test.tsx`
- `src/pages/trips/components/stop-card.tsx`
- `src/pages/trips/trip-detail-page.tsx`
- `src/pages/trips/trip-detail-reading.test.tsx`
- `src/pages/trips/trip-list-page.test.tsx`
- `src/pages/trips/trip-list-page.tsx`
- `supabase/functions/_shared/operations.ts`
- `supabase/functions/manage-trips/handler.ts`
- `supabase/functions/query-cylinders/handler.ts`
- `supabase/migrations/20261013100000_field_reading_source.sql`
- `supabase/migrations/20261013100100_field_position.sql`
- `supabase/migrations/20261013100200_resolve_identifier.sql`
- `supabase/tests/009_position.test.sql`
- `supabase/tests/009_reading_source.test.sql`
- `supabase/tests/009_resolve_identifier.test.sql`
- `tests/contract/cylinders-permissions.test.ts`
- `tests/contract/field-no-camera-frames-sent.test.ts`
- `tests/contract/field-no-coordinates-in-logs.test.ts`
- `tests/contract/field-reading-privacy.test.ts`
- `tests/contract/manage-trips-position.test.ts`
- `tests/contract/manage-trips-reading-source.test.ts`
- `tests/contract/query-cylinders-resolve.test.ts`
- `tests/contract/query-trips-handler.test.ts`
- `tests/contract/trips-no-delete.test.ts`
- `tests/e2e/campo-acessibilidade.spec.ts`
- `tests/e2e/campo-consulta.spec.ts`
- `tests/e2e/campo-gps.spec.ts`
- `tests/e2e/campo-leitura.spec.ts`
- `tests/e2e/campo-offline.spec.ts`
- `tests/e2e/desempenho-campo-leitura.spec.ts`
- `tests/e2e/support/mock-cylinders.ts`
- `tests/e2e/support/mock-field-reading.ts`
- `tests/e2e/support/mock-geolocation.ts`
- `tests/e2e/support/mock-trips-delivery.ts`
- `tests/e2e/support/mock-trips-loading.ts`
- `tests/e2e/support/mock-trips-plan.ts`
- `tests/e2e/support/mock-trips.ts`
- `tests/e2e/visual/campo.visual.spec.ts`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-leitor-aberto-1920-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-leitor-aberto-360-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-leitor-aberto-768-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-leitor-negado-1920-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-leitor-negado-360-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-leitor-negado-768-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-ler-cilindro-1920-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-ler-cilindro-360-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-ler-cilindro-768-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-posicao-erro-1920-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-posicao-erro-360-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-posicao-erro-768-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-posicao-fora-da-cerca-1920-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-posicao-fora-da-cerca-360-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-posicao-fora-da-cerca-768-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-posicao-lida-1920-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-posicao-lida-360-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-posicao-lida-768-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-posicao-precisao-ruim-1920-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-posicao-precisao-ruim-360-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-posicao-precisao-ruim-768-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-posicao-vazia-1920-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-posicao-vazia-360-visual-chromium-linux.png`
- `tests/e2e/visual/campo.visual.spec.ts-snapshots/campo-posicao-vazia-768-visual-chromium-linux.png`
- `tests/e2e/visual/cilindros.visual.spec.ts-snapshots/cilindros-lista-360-visual-chromium-linux.png`
- `tests/e2e/visual/cilindros.visual.spec.ts-snapshots/cilindros-lista-768-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/lista-de-cilindros-principal-360-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/lista-de-cilindros-principal-768-visual-chromium-linux.png`
- `tests/e2e/visual/viagens.visual.spec.ts-snapshots/viagens-detalhe-andamento-360-visual-chromium-linux.png`
- `tests/e2e/visual/viagens.visual.spec.ts-snapshots/viagens-detalhe-carregando-1920-visual-chromium-linux.png`
- `tests/e2e/visual/viagens.visual.spec.ts-snapshots/viagens-detalhe-carregando-360-visual-chromium-linux.png`
- `tests/e2e/visual/viagens.visual.spec.ts-snapshots/viagens-detalhe-carregando-768-visual-chromium-linux.png`
- `tests/e2e/visual/viagens.visual.spec.ts-snapshots/viagens-detalhe-concluida-360-visual-chromium-linux.png`
- `tests/e2e/visual/viagens.visual.spec.ts-snapshots/viagens-dialogo-entrega-1920-visual-chromium-linux.png`
- `tests/e2e/visual/viagens.visual.spec.ts-snapshots/viagens-dialogo-entrega-360-visual-chromium-linux.png`
- `tests/e2e/visual/viagens.visual.spec.ts-snapshots/viagens-dialogo-entrega-768-visual-chromium-linux.png`
- `tests/e2e/visual/viagens.visual.spec.ts-snapshots/viagens-lista-360-visual-chromium-linux.png`
- `tests/e2e/visual/viagens.visual.spec.ts-snapshots/viagens-lista-768-visual-chromium-linux.png`
- `tests/e2e/visual/viagens.visual.spec.ts-snapshots/viagens-lista-todas-360-visual-chromium-linux.png`
- `tests/e2e/visual/viagens.visual.spec.ts-snapshots/viagens-lista-todas-768-visual-chromium-linux.png`
- `tests/integration/medicao-campo-semear.live.test.ts`
- `tests/integration/roteiro-campo-semear.live.test.ts`

## Testes e evidências

- Comando(s): npm run lint; npm run typecheck; npm run test:coverage; npx vitest run; npx supabase db reset e npx supabase test db; npm run test:live; npm run build; npm run catalogo:build; npm run test:e2e; npm run test:visual:atualizar; npm run test:desempenho:campo
- Resultado: aprovado
- Evidência: 282 arquivos e 4409 testes unitários; cobertura de 92,04% (instruções), 87,13% (ramos), 91,46% (funções) e 94,52% (linhas); pgTAP com 89 arquivos e 2514 testes; live com 18 arquivos e 115 testes; E2E com 1718 aprovados e 58 ignorados; capturas visuais regeneradas no Linux; 4G com mediana de 855 ms e p95 de 873 ms; pacote de entrada de 577133 bytes (linha de base: 577148).

## Decisões e dados pendentes

O PWA não foi instalado no aparelho, nem depois da correção; falta confirmar a instalação no Android. Versão do Chrome, larguras e fluxos detalhados e justificativa da decisão além de 'funcional' não foram informados. Entregar o DOCX do RIA depois do merge.

## Validação humana

- Responsável pela revisão da equipe: Alisson Almeida
- Data da validação humana: 12/10/2026
- Amostra validada: Conta reg-g-admin@example.invalid; telas de viagens e de cilindros; larguras e fluxos não detalhados além do roteiro (a pessoa informou que executou os fluxos 1 a 13).
- Ambiente da validação: Moto Edge 50 Pro, Android 16, Chrome (versão não informada).
- Duração da validação: 4 minutos, como informado.
- Resultado da validação humana: aprovado
- Itens a corrigir apontados pela pessoa responsável: nenhum informado
- Confirmação do responsável: sim, confirmado por Alisson Almeida em 12/10/2026
- Observações: Roteiro em aparelho Android conduzido pela pessoa responsável; a medição em 4G usou câmera e GPS simulados. Detalhes em specs/009-leitura-gps-campo/validation.md.

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

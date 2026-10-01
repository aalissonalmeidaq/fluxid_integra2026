# Registro do uso de inteligência artificial e validação humana

**FluxID | RIA-020 | Navegação por permissão**

> Ponto de atenção: a IA apoia a equipe, mas a responsabilidade final é humana.

## Registro da interação

- Ferramenta de IA utilizada: Claude Code — Claude Sonnet 5.5
- Objetivo do uso: dar ao FluxID um menu de navegação que mostra só as telas que a pessoa pode abrir, de acordo com as permissões dela no tenant ativo, e encerrar a Spec 004 seguindo o fluxo do projeto.
- Prompt utilizado, em síntese sanitizada: pedi para finalizar a Spec 004 conforme o fluxo, gerar o RIA e fazer o commit; durante o ciclo, a IA seguiu o plano e as tarefas da spec (specify, plan, tasks, implement e converge) com TDD.
- Resposta gerada pela IA: código e testes do menu por permissão. No domínio, a regra de quais telas ficam visíveis (`src/domain/navigation`); na aplicação, o serviço e o cache de permissões e o provedor de permissões; na interface, o menu lateral/em gaveta, o botão de abrir e o gerenciamento de foco; no Supabase, a consulta de permissões do ator (migração, função de borda e teste SQL). Também gerou os testes unitários, de contrato, ao vivo e E2E, as capturas visuais do menu (geradas no Linux) e a documentação da spec.

Link para validação da equipe: https://github.com/aalissonalmeidaq/fluxid_integra2026/tree/feat/004-navegacao-por-permissao
- Análise crítica da equipe: a equipe conferiu os resultados dos testes automáticos e executou o roteiro manual do menu com os três perfis previstos. As capturas do Windows não foram versionadas, só as do Linux.
- Validação humana realizada: Alisson Almeida executou o roteiro 6 do quickstart em Chrome no Windows, em 360 px e em desktop, com administrador de tenant, operador técnico e Master local, durante cerca de 15 minutos, e aprovou sem ressalvas.
- Decisão final: utilizado
- Justificativa: o menu passou nos testes e na validação manual sem ressalvas, então o resultado foi aceito como entregue.
- Fontes verificadas: não houve fonte externa; a base foram a spec, o plano e os contratos do próprio repositório.
- Identificador do registro: RIA-020
- Data e hora da interação: 01/10/2026, 19:48:14 - America/Fortaleza

## Rastreabilidade técnica do ciclo

- Repositório: fluxid
- Branch: feat/004-navegacao-por-permissao
- Spec: 004
- Ciclo: 01
- Commit-base: af0ff6906781400f118ade61b3e2046dfba1a465
- Hash do diff funcional preparado: 9d39c703701a3b8d5b197969a0f8474c1c781569e28874894930dbeab5a67cc3
- Arquivos e áreas afetadas:

- `README.md`
- `docs/prd.md`
- `playwright.config.ts`
- `specs/004-navegacao-por-permissao/baseline.md`
- `specs/004-navegacao-por-permissao/checklists/requirements.md`
- `specs/004-navegacao-por-permissao/contracts/consulta-de-permissoes.md`
- `specs/004-navegacao-por-permissao/contracts/menu-e-navegacao.md`
- `specs/004-navegacao-por-permissao/contracts/verificacoes-automaticas.md`
- `specs/004-navegacao-por-permissao/data-model.md`
- `specs/004-navegacao-por-permissao/plan.md`
- `specs/004-navegacao-por-permissao/quickstart.md`
- `specs/004-navegacao-por-permissao/research.md`
- `specs/004-navegacao-por-permissao/spec.md`
- `specs/004-navegacao-por-permissao/tasks.md`
- `specs/004-navegacao-por-permissao/validation.md`
- `src/app/App.tsx`
- `src/app/admin-routes.test.ts`
- `src/app/admin-routes.ts`
- `src/app/navigation/permissions-cache.test.ts`
- `src/app/navigation/permissions-cache.ts`
- `src/app/navigation/permissions-context.ts`
- `src/app/navigation/permissions-provider.test.tsx`
- `src/app/navigation/permissions-provider.tsx`
- `src/app/shell/app-shell.test.tsx`
- `src/app/shell/app-shell.tsx`
- `src/app/shell/header.tsx`
- `src/app/shell/menu-navigation-focus.ts`
- `src/app/shell/menu-toggle.test.tsx`
- `src/app/shell/menu-toggle.tsx`
- `src/app/shell/navigation-menu.test.tsx`
- `src/app/shell/navigation-menu.tsx`
- `src/app/use-min-width.ts`
- `src/application/identity/permissions-service.test.ts`
- `src/application/identity/permissions-service.ts`
- `src/design-system/docs/shell.ts`
- `src/domain/navigation/screens.test.ts`
- `src/domain/navigation/screens.ts`
- `src/domain/navigation/visible-screens.test.ts`
- `src/domain/navigation/visible-screens.ts`
- `src/main.tsx`
- `supabase/functions/query-permissions/deno.json`
- `supabase/functions/query-permissions/handler.ts`
- `supabase/functions/query-permissions/index.ts`
- `supabase/migrations/20261001211238_actor_permissions_query.sql`
- `supabase/seed.sql`
- `supabase/tests/004_actor_permissions.test.sql`
- `tests/contract/navigation-permissions.test.ts`
- `tests/e2e/app-shell.spec.ts`
- `tests/e2e/audit-log.spec.ts`
- `tests/e2e/medicao-shell.spec.ts`
- `tests/e2e/navegacao-menu.spec.ts`
- `tests/e2e/support/mock-backend.ts`
- `tests/e2e/visual/menu.visual.spec.ts`
- `tests/e2e/visual/menu.visual.spec.ts-snapshots/menu-carregando-1920-visual-chromium-linux.png`
- `tests/e2e/visual/menu.visual.spec.ts-snapshots/menu-carregando-360-visual-chromium-linux.png`
- `tests/e2e/visual/menu.visual.spec.ts-snapshots/menu-carregando-768-visual-chromium-linux.png`
- `tests/e2e/visual/menu.visual.spec.ts-snapshots/menu-erro-1920-visual-chromium-linux.png`
- `tests/e2e/visual/menu.visual.spec.ts-snapshots/menu-erro-360-visual-chromium-linux.png`
- `tests/e2e/visual/menu.visual.spec.ts-snapshots/menu-erro-768-visual-chromium-linux.png`
- `tests/e2e/visual/menu.visual.spec.ts-snapshots/menu-global-1920-visual-chromium-linux.png`
- `tests/e2e/visual/menu.visual.spec.ts-snapshots/menu-global-360-visual-chromium-linux.png`
- `tests/e2e/visual/menu.visual.spec.ts-snapshots/menu-global-768-visual-chromium-linux.png`
- `tests/e2e/visual/menu.visual.spec.ts-snapshots/menu-offline-1920-visual-chromium-linux.png`
- `tests/e2e/visual/menu.visual.spec.ts-snapshots/menu-offline-360-visual-chromium-linux.png`
- `tests/e2e/visual/menu.visual.spec.ts-snapshots/menu-offline-768-visual-chromium-linux.png`
- `tests/e2e/visual/menu.visual.spec.ts-snapshots/menu-pronto-1920-visual-chromium-linux.png`
- `tests/e2e/visual/menu.visual.spec.ts-snapshots/menu-pronto-360-visual-chromium-linux.png`
- `tests/e2e/visual/menu.visual.spec.ts-snapshots/menu-pronto-768-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/auditoria-da-plataforma-principal-1920-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/auditoria-da-plataforma-principal-360-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/auditoria-da-plataforma-principal-768-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/auditoria-do-tenant-principal-1920-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/auditoria-do-tenant-principal-360-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/auditoria-do-tenant-principal-768-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/auditoria-erro-1920-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/auditoria-erro-768-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/auditoria-vazio-1920-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/auditoria-vazio-360-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/auditoria-vazio-768-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/escolha-da-organizacao-principal-1920-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/escolha-da-organizacao-principal-360-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/escolha-da-organizacao-principal-768-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/inicio-autenticado-principal-1920-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/inicio-autenticado-principal-360-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/inicio-autenticado-principal-768-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/organizacoes-principal-1920-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/organizacoes-principal-360-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/organizacoes-principal-768-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/papeis-e-permissoes-principal-1920-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/papeis-e-permissoes-principal-360-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/papeis-e-permissoes-principal-768-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/perfil-carregando-1920-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/perfil-carregando-360-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/perfil-carregando-768-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/perfil-principal-1920-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/perfil-principal-360-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/perfil-principal-768-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/pessoas-do-tenant-principal-1920-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/pessoas-do-tenant-principal-360-visual-chromium-linux.png`
- `tests/e2e/visual/telas.visual.spec.ts-snapshots/pessoas-do-tenant-principal-768-visual-chromium-linux.png`
- `tests/integration/navigation-permissions.live.test.ts`
- `tests/support/auth-harness.ts`

## Testes e evidências

- Comando(s): `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e` e `npm run test:live -- tests/integration/navigation-permissions.live.test.ts`.
- Resultado: aprovado
- Evidência: typecheck e lint sem erros; 112 arquivos e 1513 testes unitários aprovados; 885 testes E2E aprovados (27 ignorados por regra dos projetos); 14 testes ao vivo de permissões aprovados. As medições de desempenho ficaram em `specs/004-navegacao-por-permissao/validation.md`.

## Decisões e dados pendentes

- Obrigatória antes do merge: trocar o link da branch pelo link do pull request neste registro.
- Herdada, fora do escopo da spec: teste em aparelho real. O leitor de tela foi dispensado por decisão do responsável.

## Validação humana

- Responsável pela revisão da equipe: Alisson Almeida
- Data da validação humana: 01/10/2026
- Observações: amostra de três perfis (administrador de tenant, operador técnico e Master local), Chrome no Windows, 360 px e desktop, cerca de 15 minutos; resultado aprovado, sem ressalvas.

## Regras de preenchimento

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

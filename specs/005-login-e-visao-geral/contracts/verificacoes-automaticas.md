# Contrato: verificações automáticas

Cada critério de aceitação da spec e a prova que o comprova.

| Critério | Prova | Camada |
|---|---|---|
| CA-001 Specs 001 a 004 seguem verdes | `npm test` e `npm run test:e2e` sem mudar comportamento; só o rótulo "Início", o título da página inicial e a posição de "Meu perfil" e "Sair" mudam | Vitest, Playwright |
| CA-002 Entrada mantém a Spec 002 e não tem login social nem "Lembrar de mim" | `login-page.test.tsx` (todos os desfechos) e `entrada-renovada.spec.ts` em 360, 768 e 1920 px | Vitest, Playwright |
| CA-003 Blocos de RF-010 a RF-015 com marca "Exemplo" | `overview-page.test.tsx` percorre as regiões | Vitest |
| CA-004 Sem violação crítica ou grave (axe) e gráficos com alternativa textual | axe nas duas telas em três larguras; testes dos gráficos (tabela, descrição, legenda) | Playwright, Vitest |
| CA-005 Sem rolagem horizontal de 320 a 1920 px nem com zoom de 200% | `visao-geral.spec.ts` e `entrada-renovada.spec.ts` (padrão de `escalas-no-navegador.spec.ts`) | Playwright |
| CA-006 Carregamento, vazio, erro e offline sem mover o foco | `use-overview-block.test.ts` e testes dos blocos (fonte falsa); offline em Playwright | Vitest, Playwright |
| CA-007 Só teclado, foco de 3:1 e alvo de 44 px, incluindo o menu da pessoa | `user-menu.test.tsx`, `visao-geral.spec.ts` com Tab e Escape; verificação de contraste do foco | Vitest, Playwright |
| CA-008 Capturas em três larguras e estados principais, no Linux | `entrada.visual.spec.ts` e `visao-geral.visual.spec.ts` via `npm run test:visual:atualizar` | Playwright (visual) |
| CA-009 Sem valor de exemplo sem marca e sem dado real | teste da página: toda região tem "Exemplo"; sem `fetch`; conteúdo idêntico para duas pessoas e dois tenants | Vitest |
| CA-010 Nada fora dos tokens | testes de escalas da Spec 003 sobre as telas novas | Vitest, Playwright |
| RNF-001, MS-006 Carregamento do shell | `medicao-shell.spec.ts` contra 89 ms (limite de 107 ms) e 127 ms (limite de 152 ms) | Playwright |
| RNF-003 Pacote até 5% maior | `npm run build` antes (`baseline.md`) e depois (`validation.md`) | Build |
| RNF-002 Sem dependência nova | `git diff` de `package.json` e `package-lock.json` vazio | Revisão |
| MS-007 Validação humana | Registro em `validation.md` e no RIA, executado por Alisson Almeida | Humana |

## Portões do ciclo

`npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run test:visual` (no Linux), `npm run build` e `npm run ia:validar`. Não há migração nem política RLS nesta spec, então pgTAP e testes ao vivo não mudam, mas a suíte existente continua rodando no CI.

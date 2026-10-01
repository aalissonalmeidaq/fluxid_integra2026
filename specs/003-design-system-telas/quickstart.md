# Guia de validação: Telas e design system do FluxID

**Spec**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md)

Passos para provar a funcionalidade de ponta a ponta. Detalhes de tokens, componentes e verificações estão nos [contratos](./contracts/).

## Pré-requisitos

- Node.js 24 e dependências instaladas com `npm ci`.
- Supabase local em execução para as suítes ao vivo (ver `specs/002-autenticacao-multitenancy-rbac/quickstart.md`); os E2E usam backend simulado.
- Navegadores do Playwright: `npx playwright install chromium webkit`.

## 0. Linha de base (antes de qualquer mudança visual)

1. Rodar `npx playwright test tests/e2e/performance.spec.ts` e registrar tamanho de JS, CSS e fontes e o tempo de carregamento do shell em `baseline-desempenho.md`.
2. Registrar os tempos de entrada e de confirmação de recuperação da Spec 002 (RNF-003 e RNF-004 daquela spec).

## 1. Tokens e contraste (história 1)

- `npm run tokens:gerar` e `npm run test -- tokens contraste escalas`.
- **Esperado**: todos os pares permitidos atendem 4,5:1 ou 3:1; alterar um valor para um par reprovado faz o teste falhar.

## 2. Catálogo (história 1)

- `npm run catalogo:dev`, abrir cada componente, o sistema de ícones e as versões do logotipo.
- **Esperado**: descrição, variantes, estados, orientação de uso e acessibilidade em todos os componentes; 30 ícones em quatro tamanhos e quatro estados; logotipo com área de proteção, redução mínima e usos incorretos.
- `npm run catalogo:build` e confirmar que `dist/` (build de produção) não contém o catálogo.

## 3. Shell e teclado (história 2)

- `npm run build && npm run preview`, abrir deslogado em 360 px e em 1920 px.
- **Esperado**: Tab leva ao "Pular para o conteúdo principal"; offline mostra o aviso e o botão de reconectar na entrada; autenticada, organização ativa, perfil e sair continuam acessíveis em 360 px.

## 4. Telas de identidade (histórias 3 a 6)

- Rodar os fluxos da Spec 002 (entrada com credencial inválida, recuperação, segundo fator, limite de três sessões, seleção e troca de organização, perfil com foto válida e inválida, convidar, bloquear e reativar vínculo, criar e desativar papel, criar organização e filtros da auditoria).
- **Esperado**: resultado idêntico ao anterior; entrada só com e-mail, senha, entrar e recuperar acesso; mensagens contra enumeração iguais nos dois casos; em 360 px, listas e tabelas viram cartões sem rolagem horizontal e com ações de 44 px.

## 5. Estados (história 7)

- Forçar carregamento, vazio, erro, offline e sincronização em cada tela.
- **Esperado**: mesmo vocabulário visual e anúncio único; operação sensível sem rede mostra erro e nunca sucesso; com movimento reduzido, nenhuma animação contínua.

## 6. Verificações automáticas

```text
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run test:e2e
npm run test:visual
npm run test:live
npm run build
```

- **Esperado**: tudo aprovado; sem violações críticas ou graves de acessibilidade; zero requisições de terceiros; sem rolagem horizontal em 360, 768 e 1920 px nem com zoom de 200%.
- Atualizar capturas de referência só com o comando documentado abaixo, no Linux, e com aprovação no PR.

### Capturas de referência da regressão visual (CA-008)

As capturas ficam em `tests/e2e/visual/*-snapshots/` e são **sempre geradas no Linux**, porque a renderização da fonte difere por sistema operacional. Nunca gere nem versione capturas feitas no Windows ou no macOS.

- **Comparar** (qualquer sistema com o ambiente de CI, ou no Linux): `npm run test:visual`.
- **Gerar ou atualizar** (precisa do Docker em execução): `npm run test:visual:atualizar`. O comando roda o contêiner oficial do Playwright (`mcr.microsoft.com/playwright:v<versão do @playwright/test>-noble`) com uma cópia do repositório, instala as dependências com `npm ci`, roda só o projeto `visual-chromium` com `--update-snapshots` e devolve as imagens para `tests/e2e/visual/`.
- Depois de gerar, **revise as imagens** (telas e catálogo, em 360, 768 e 1920 px, e os estados principais: principal, erro, vazio, carregando e offline) e inclua a aprovação de Alisson Almeida na revisão do pull request. A linha de base atual foi aprovada em 01/10/2026 e o job `visual` do CI bloqueia regressões; ao atualizar as capturas, registre a nova aprovação no pull request.
- Alternativa sem Docker local: o job `visual` do CI guarda o relatório e as capturas geradas no artefato `regressao-visual`.

## 7. Validação humana (MS-008)

Alisson Almeida revisa o catálogo e as telas contra as pranchas em [referencias/](./referencias/), confere o símbolo de 16 px e a leitura das tabelas em cartão com leitor de tela, e aprova a linha de base. Registrar amostra, ambiente, duração e resultado no RIA.

## 8. Encerramento do ciclo

Seguir o gate de registro de IA do `AGENTS.md` (testes, `git add`, `npm run ia:registro -- --spec 003 --ciclo NN --titulo "..."`, validação humana, `npm run ia:validar`, commit). Trocar o link do RIA pelo do PR antes do merge.

# Compatibilidade do TypeScript com o ESLint

`scripts/ts6-hook.cjs` é usado por `eslint.config.js` antes de carregar `typescript-eslint`. Ele redireciona apenas as importações de `typescript` feitas pelo analisador para `@typescript/typescript6`.

O motivo é compatibilizar o ESLint com a versão 7 do compilador usada pelo projeto, enquanto o ecossistema do analisador declara compatibilidade com a distribuição `@typescript/typescript6` na versão 6.0.2. O `tsc` do projeto continua vindo da dependência `typescript` 7.0.2; o hook não é aplicado ao build, Vitest ou runtime.

O mecanismo de ativação é explícito: `eslint.config.js` importa o hook na primeira linha. Ele é necessário enquanto existirem as substituições de `typescript-eslint` em `package.json`.

Plano de remoção: reavaliar quando `typescript-eslint` suportar diretamente a versão de TypeScript adotada. Nessa atualização, remover as entradas de `overrides`, `@typescript/typescript6` e o hook em uma mesma alteração, executar `npm ci`, lint, tipagem e testes e registrar a decisão na PR.

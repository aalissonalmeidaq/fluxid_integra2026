# Guia de validação: Entrada renovada e Visão geral

Roteiro para provar que a funcionalidade funciona de ponta a ponta. Detalhes em [contracts/](./contracts/) e [data-model.md](./data-model.md).

## Pré-requisitos

- Node.js 24.21.0 e dependências instaladas (`npm ci`).
- Supabase local em execução só para a validação manual com contas reais (`npx supabase start`); os testes automáticos usam o backend simulado.
- Para as capturas visuais: Linux do CI ou o contêiner oficial do Playwright (ver quickstart da Spec 003). Nunca versionar capturas do Windows.

## 1. Verificação rápida (sem Supabase)

```bash
npm run lint
npm run typecheck
npm test
```

Esperado: tudo verde, incluindo fonte de exemplo, blocos, gráficos, menu da pessoa, entrada e shell.

## 2. Linha de base antes de mudar (T inicial)

```bash
npm run build                                   # anote o tamanho do pacote
npx playwright test tests/e2e/medicao-shell.spec.ts --project=desktop-chromium
```

Registrar em `baseline.md`: tamanho do pacote e as medianas do shell (referência da Spec 004: 89 ms autenticado e 127 ms na entrada).

## 3. E2E com backend simulado

```bash
npm run test:e2e
```

Esperado: entrada e Visão geral em 360, 768 e 1920 px, 320 px e zoom de 200% sem rolagem horizontal; axe sem violação crítica ou grave; teclado completo; offline com a estrutura aberta.

## 4. Regressão visual (Linux)

```bash
npm run test:visual:atualizar   # Docker, imagem oficial do Playwright; gera as capturas
npm run test:visual
```

## 5. Medição depois da mudança

Repetir os comandos do passo 2 e registrar em `validation.md` as medianas e o tamanho do pacote, com os limites (107 ms, 152 ms e +5%).

## 6. Validação manual (Alisson Almeida, MS-007)

1. `npm run dev`; abrir a entrada em 360 px e em desktop e conferir o painel de marca, a ausência de login social e de "Lembrar de mim" e o botão mostrar/ocultar senha.
2. Entrar com um administrador de tenant, um operador técnico e o Master do ambiente local.
3. Na Visão geral, conferir a disposição em 360, 768 e 1920 px, a marca "Exemplo" em todos os blocos e as tabelas dos gráficos.
4. Abrir o menu da pessoa por mouse e por teclado (Escape e clique fora) e acionar "Meu perfil" e "Sair".
5. Trocar de organização com uma pessoa de dois tenants.
6. Desligar a rede e abrir a Visão geral: estrutura aberta com o aviso de offline.
7. Registrar amostra, ambiente, duração e resultado no RIA de encerramento, sem inventar.

Teste com leitor de tela e em aparelho real seguem como pendência herdada (leitor de tela dispensado pelo responsável).

## Critério de pronto

Passos 1 a 5 verdes, passo 6 registrado e o gate de registro de IA do `AGENTS.md` cumprido antes do commit de encerramento; depois do merge, o DOCX do RIA entregue em PR de documentação.

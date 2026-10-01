# Guia de validação: Navegação por permissão

Roteiro para provar que a funcionalidade funciona de ponta a ponta. Detalhes de contrato em [contracts/](./contracts/) e de dados em [data-model.md](./data-model.md).

## Pré-requisitos

- Node.js 24.21.0 e dependências instaladas (`npm ci`).
- Supabase local em execução (`npx supabase start`). Funções e migrações novas exigem `supabase stop` e `supabase start` para serem recarregadas.
- Para as capturas visuais: Linux do CI ou o contêiner oficial do Playwright (ver quickstart da Spec 003).

## 1. Verificação rápida (sem Supabase)

```bash
npm run lint
npm run typecheck
npm test
```

Esperado: tudo verde, incluindo o catálogo de telas, o provedor, o menu e o handler da Edge Function.

## 2. Banco e função (dois tenants)

```bash
npx supabase db reset
npx supabase test db
```

Esperado: `004_actor_permissions.test.sql` passa; o conjunto de cada perfil é exato, tenant alheio devolve `[]`, e `anon` e `authenticated` não executam a função.

## 3. Ponta a ponta com o Supabase local

```bash
npm run test:live
```

Esperado: a consulta devolve só o tenant ativo, a leitura não cria evento de auditoria e a **paridade** passa: o item aparece se e somente se o servidor abre a tela.

## 4. Interface (backend simulado)

```bash
npm run test:e2e
```

Esperado: menu correto por perfil em 360, 768 e 1920 px; sem rolagem horizontal de 320 a 1920 px e com zoom de 200%; teclado completo (Tab, Enter, Escape); estados de carregamento, falha e offline sem item restrito e sem mover o foco; acesso por URL sem permissão mostra "Acesso negado"; axe sem violação crítica ou grave.

## 5. Regressão visual e desempenho

```bash
npm run test:visual
```

Esperado: capturas do menu iguais às de referência (geradas no Linux do CI). A medição do shell com o menu fica em até 158 ms e a consulta no p95 em até 1 s.

## 6. Validação manual (Alisson Almeida, MS-007)

1. `npm run dev`; entrar com um administrador de tenant, um operador técnico e o Master do ambiente local.
2. Em 360 px (ferramentas do navegador): abrir o menu pelo botão, percorrer com Tab, fechar com Escape e conferir o foco.
3. Em desktop: conferir o menu fixo e o item atual.
4. Trocar de organização com uma pessoa de dois tenants e conferir que o menu muda antes da tela.
5. Desligar a rede e abrir o menu: conferir o aviso de possível desatualização.
6. Registrar amostra, ambiente, duração e resultado no RIA de encerramento.

Teste com leitor de tela e em aparelho real seguem como pendência herdada (fora do escopo da spec).

## Critério de pronto

Passos 1 a 5 verdes, passo 6 registrado e o gate de registro de IA do `AGENTS.md` cumprido antes do commit de encerramento.

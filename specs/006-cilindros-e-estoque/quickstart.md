# Guia de validação: Cilindros, identificadores, estoque e histórico

**Feature**: `006-cilindros-e-estoque` | Contratos: [operacoes-servidor](./contracts/operacoes-servidor.md), [permissoes-e-papeis](./contracts/permissoes-e-papeis.md), [telas-e-rotas](./contracts/telas-e-rotas.md), [verificacoes-automaticas](./contracts/verificacoes-automaticas.md). Modelo em [data-model.md](./data-model.md).

## Pré-requisitos

- Node.js 24.21.0 e dependências instaladas (`npm ci`).
- Supabase local em execução com as migrations aplicadas. Funções novas exigem `supabase stop` e `supabase start` para serem carregadas (ver memória de armadilhas do Supabase local).
- Usuários e organizações de seed (Tenants A e B, e-mails `@example.invalid`). Nenhum dado real.

## 1. Linha de base (antes de mexer)

```powershell
npm run build          # anote o tamanho do pacote de entrada em baseline.md (limite: 593,95 kB)
npm run lint; npm run typecheck; npm test
```

## 2. Banco: isolamento, regras e imutabilidade

```powershell
supabase db reset
supabase test db       # suítes 006_*: RLS com dois tenants, unicidade, imutabilidade, idempotência, auditoria, ordem do histórico, limites do teste
```

Esperado: todas as asserções passam; `update`/`delete` em eventos e testes e `delete` em cilindros falham mesmo para `service_role`.

## 3. Domínio, serviço e telas

```powershell
npm test -- src/domain/cylinders src/application/cylinders src/pages/cylinders src/app/cylinders
npm test -- tests/contract
npm run test:live      # idempotência (10 repetições), corridas de série e identificador, edição simultânea, volume de 50 mil
```

Esperado: situação do teste correta nos limites (30, 31 e 0 dias); 10 repetições da mesma entrada = 1 evento e resposta igual; busca por identificador p95 ≤ 1 s e primeira página p95 ≤ 2 s com 50 mil cilindros.

## 4. Fluxo de ponta a ponta (E2E com backend simulado)

```powershell
npm run build          # o Playwright reaproveita a porta 4173: reconstrua o dist antes
npm run test:e2e -- tests/e2e/cilindros.spec.ts tests/e2e/entrada-estoque.spec.ts
```

Percurso coberto: cadastrar cilindro com identificador → ver na lista → abrir o detalhe → registrar teste → entrada no estoque (inclusive repetida) → inativar → ler o histórico. Em 360, 768 e 1920 px, 320 px e zoom de 200%, só com teclado, sem violação crítica ou grave de acessibilidade.

## 5. Validação manual guiada (celular e desktop)

1. Entrar como administrador do Tenant A; cadastrar um cilindro em até 90 s (MS-001).
2. No celular (360 px), buscar por parte do número de série e filtrar por "Fora do estoque".
3. Em "Entrada no estoque", ler 20 identificadores com um leitor-teclado (ou colar um a um) sem tocar no mouse (MS-002); repetir um e confirmar que nada duplica.
4. Registrar um teste aprovado com próxima data em 20 dias e conferir "A vencer"; registrar um reprovado e conferir "Reprovado".
5. Desativar o identificador NFC, vincular outro e tentar reutilizar o antigo em outro cilindro: só a transferência com justificativa funciona.
6. Inativar o cilindro: sai do estoque, identificadores continuam ativos e a leitura informa "cilindro inativo".
7. Entrar como auditor: vê tudo, não encontra nenhuma ação de alteração.
8. Entrar como administrador do Tenant B: nada do Tenant A aparece, nem em busca por identificador.
9. Desligar a rede: a estrutura abre, o aviso offline aparece e as ações de escrita informam que exigem conexão.

## 6. Qualidade final

```powershell
npm run lint; npm run typecheck; npm run test:coverage
npm run build          # pacote de entrada ≤ 593,95 kB
npm run test:visual:atualizar   # Linux; nunca versionar *-win32.png
```

Depois, o gate de IA do AGENTS.md: `git add`, `npm run ia:registro`, **entrevista de validação humana** (Alisson Almeida), `npm run ia:validar`, commit com código, testes, índice e RIA.

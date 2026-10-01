# FluxID

Plataforma de Identidade e Rastreabilidade de cilindros de gases medicinais e industriais.

Este pacote reúne a constituição, metodologia, visão, especificações e fundação técnica do FluxID.

---

## Pré-requisitos

- **Node.js**: `24.21.0` (ou LTS equivalente)
- **NPM**: `12.1.0`
- **Docker**: instalado e em execução (para instância local do Supabase via CLI)
- **Supabase CLI**: `2.117.0` (gerenciado como dependência e instalado localmente)

---

## Instalação e Execução

### 1. Clonar e instalar dependências
```bash
git clone <url-do-repositorio>
cd fluxid
npm ci
```
> O comando `npm ci` garante a instalação reproduzível e determinística a partir do `package-lock.json`. O projeto utiliza TypeScript 7 com compatibilidade do parser `@typescript-eslint` mantida via `overrides` declarados no `package.json`.

### 2. Configurar variáveis de ambiente
Copie o modelo de variáveis públicas:
```bash
cp .env.example .env.local
```
Edite `.env.local` conforme o modo desejado (`auto`, `local`, `lan` ou `cloud`). Nunca versione segredos nem chaves privadas.

As variáveis sem o prefixo `VITE_` (`INVITATION_REDIRECT_URL`, `AVATAR_UPLOADS_PER_HOUR`, `RETENTION_JOB_SECRET`, credenciais de SMTP) são exclusivas das Edge Functions: configure-as nos segredos do Supabase, nunca no cliente. O `.env.example` traz apenas os nomes, sem valores.

### 3. Iniciar Supabase local (opcional/desenvolvimento)
```bash
supabase start
supabase status
```

### 4. Executar em desenvolvimento
```bash
npm run dev
```
Acesse a aplicação no navegador em `http://localhost:3000`.

---

## Validação e Qualidade

Todos os comandos de verificação de qualidade do projeto:

```bash
# Verificação de tipos TypeScript estrita
npm run typecheck

# Análise estática com ESLint
npm run lint

# Execução dos testes unitários e de contrato
npm run test

# Relatório de cobertura de testes (mínimo 85% linhas/funções, 80% branches)
npm run test:coverage

# Testes end-to-end com Playwright (desktop, tablet, mobile 360px)
npm run test:e2e

# Build de produção e geração PWA
npm run build
```

---

## Navegação por permissão (Spec 004)

O shell tem um menu de navegação que mostra só as telas que a pessoa autenticada pode usar: Início e Meu perfil para todos; Pessoas do tenant, Papéis e permissões e Auditoria do tenant conforme as permissões no tenant ativo; Organizações e Auditoria da plataforma conforme as permissões globais. O menu é conveniência de interface: esconder um item não protege nada, e o servidor decide o acesso a cada tela.

Para isso o servidor ganhou uma consulta somente leitura das próprias permissões: a Edge Function `query-permissions` (`supabase/functions/query-permissions/`), que chama a função de banco `public.get_actor_permissions` (só `service_role`) e devolve apenas códigos de permissão (`tenant` e `global`), sem auditoria e sem dados de outros tenants. Nenhuma regra de acesso, papel ou permissão mudou.

Como a lista de funções servidas é fixada na inicialização, depois de atualizar a branch rode `npx supabase stop` e `npx supabase start` para a função nova ser servida. O catálogo de telas e as regras do menu estão em `src/domain/navigation/`, e o estado do menu em `src/app/navigation/`.

---

## Governança de IA por ciclo

Ao final de cada ciclo Spec Kit, depois dos testes e antes do commit, gere e valide o Registro de Uso de IA:

```bash
node scripts/governanca-ia/instalar-hooks.mjs
npm run ia:registro -- --spec 001 --ciclo 01 --titulo "Fundação técnica do FluxID"
npm run ia:validar
```

Os registros ficam em `docs/governanca-ia/registros/` e são versionados junto com a implementação e os testes do ciclo.
Interações que não encerram um ciclo Spec Kit não geram RIA automaticamente.

---

## Conectividade do Supabase

O sistema possui modos `local`, `lan`, `cloud` e `auto`. No modo automático, a ordem de prioridade vigente é nuvem, rede local e dispositivo local. As restrições de fallback, autenticação, promoção e sincronização estão documentadas em `docs/arquitetura-conectividade-supabase.md`.

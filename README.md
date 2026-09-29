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

O sistema possui modos `local`, `lan`, `cloud` e `auto`. No modo automático, a ordem de prioridade é local, rede local e nuvem. As restrições de segurança, autenticação e consistência estão documentadas em `docs/arquitetura-conectividade-supabase.md`.

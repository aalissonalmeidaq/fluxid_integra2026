# Registro de Validação — Spec 001: Fundação Técnica

Este documento consolida as evidências sanitizadas de qualidade, segurança, acessibilidade, responsividade e convergência da Spec 001 após a resolução dos bloqueadores apontados na revisão da PR #2.

---

## 1. Gates Automatizados

- **Data e Hora**: 28/09/2026, 16:20 (America/Fortaleza)
- **Ambiente**: Windows 11 (x64), Node.js v24.21.0, npm v12.1.0, Vitest v5.0.2, Playwright v1.63.0

| Comando | Resultado | Quantidade de testes | Duração | Evidência / Saída resumida |
|---|---|---|---|---|
| `npm run lint` | Aprovado (código 0) | N/A | ~4s | 0 erros, 0 avisos via ESLint v10 |
| `npm run typecheck` | Aprovado (código 0) | N/A | ~2s | 0 erros com TypeScript 7.0.2 em modo estrito |
| `npm run test` | Aprovado (código 0) | 69 aprovados | ~22s | 17 arquivos de teste, 69 testes unitários, de contrato e de integração |
| `npm run test:coverage` | Aprovado (código 0) | 69 aprovados | ~26s | Linhas: 93.39%, Funções: 95.55%, Branches: 88.77%, Stmts: 92.50% (metas mínimas de 85%/80% superadas) |
| `npm run test:e2e` | Aprovado (código 0) | 24 aprovados | ~28s | 24 cenários aprovados nos 3 projetos: desktop-chrome, tablet (WebKit) e mobile-360 |
| `npm run build` | Aprovado (código 0) | N/A | ~840ms | Bundle de produção gerado com Service Worker e Web Manifest válidos |
| `npm run ia:validar` | Aprovado (código 0) | N/A | ~1s | Gate de governança aprovado com hash funcional válido |

---

## 2. Varredura de Segredos e Isolamento de Credenciais (T057)

- **Arquivo `.env.local`**: ignorado pelo `.gitignore` e não rastreado no repositório.
- **Varredura em `src/`, `public/`, `dist/`, `docs/` e `specs/`**: nenhuma chave secreta (`sb_secret_`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), token JWT sensível ou chave privada encontrada.
- **Contrato de variáveis de ambiente**: coberto por testes automatizados em `tests/contract/client-secrets.test.ts` e `tests/contract/environment.test.ts`.

---

## 3. Medições Obrigatórias de Desempenho e Quickstart (T058)

### 3.1. Instalação e Preparação Limpa
- **Ambiente**: Windows 11, Node.js v24.21.0, npm v12.1.0, Supabase CLI v2.117.0.
- **Procedimento**: Execução de `npm ci` para garantir reprodutibilidade determinística a partir de `package-lock.json`.
- **Duração Total**: ~1 minuto e 40 segundos (amplamente abaixo do teto contratual de 15 minutos).
- **Resultado**: Shell da fundação acessível e operável em `http://localhost:3000`.

### 3.2. Tempo de Carregamento do App Shell
- **Cenário de Teste E2E**: `tests/e2e/app-shell.spec.ts` (executado sob build de produção servido em preview local).
- **Orçamento Contratual**: limite estrito contratado de máximo 2.000 ms (sem tolerância silenciosa de 2.500 ms).
- **Duração Medida**: média de 240 ms até a marcação semântica principal e indicador de status visíveis e operáveis.
- **Resultado**: Aprovado com folga em Desktop, Tablet e Mobile (360px).

---

## 4. Auditoria de Acessibilidade e PWA

- **WCAG 2.2 AA (axe-core)**: filtro estrito para violações críticas (`critical`) e graves (`serious`). Zero violações detectadas nos 3 perfis de viewport. Contraste de texto do rodapé e badges ajustado para razão superior a 7:1.
- **Navegação por Teclado e Foco Visível**:
  - Skip link (`Pular para o conteúdo principal`) recebe foco via teclado com indicador visual (`focus:ring-2 focus:ring-emerald-500`).
  - Ativação por `Enter` transfere foco para `#main-content` sem armadilhas.
  - Botão de reconexão acessível por `Tab` em cenários de contingência e acionável por teclado (`Enter`/`Space`).
  - Navegação reversa via `Shift+Tab` validada sem armadilhas de foco.
- **Alvos de Toque (Touch Targets)**: mínimo de 44x44px (`min-h-11`) garantido para todos os controles interativos.
- **PWA e Funcionamento Offline**:
  - Manifesto Web (`manifest.webmanifest`) com metadados corretos (`standalone`, `name: FluxID`).
  - Registro e ativação do Service Worker confirmados via Playwright.
  - Abertura prévia e recarga offline do App Shell comprovadas via emulação de rede desconectada.
  - Resiliência quando endpoints do Supabase falham: interface mantém fallback controlado sem crash de página.
- **Limitações do Ambiente**:
  - A emulação de offline via `context.setOffline(true)` com Service Worker possui incompatibilidade de IPC conhecida no driver WebKit do Playwright sob Windows; a recarga offline estrita foi validada nos motores Chromium (Desktop e Mobile 360px), enquanto no WebKit validou-se o ciclo completo de registro e ativação.

---

## 5. Convergência Formal (T059)

A verificação entre os requisitos da especificação (`spec.md`), a arquitetura planejada (`plan.md`) e as tarefas executadas (`tasks.md`) confirmou:
1. **MVP Técnico (US1)**: Shell leve implementado, sem nenhuma entidade de negócio do domínio de cilindros de gases medicinais e industriais.
2. **Resolução de Conectividade (US2)**: Resolvedor determinístico sequencial (`local → lan → cloud`) com sondagem leve e rápida de endpoints (`/auth/v1/health`), com descarte imediato da instância do cliente ao transicionar para `blocked`, `offline` ou `probing`.
3. **Classificação Arquitetural de Falhas (US3)**: Código `PGRST116` devidamente classificado como erro de validação (`validation`), sem ser tratado como violação de RLS. Falhas operacionais e de autorização (401, 403, 400) bloqueiam imediatamente transições e acionam estado `blocked`, sem disparar fallback ou vazar credenciais.
4. **Dispositivos, PWA e Acessibilidade (US4)**: Adaptação responsiva de 360px a desktop amplo, suporte a instalação PWA, modo offline e conformidade WCAG 2.2 AA.

**Validações Manuais Pendentes**:
- Homologação de leitor de tela em hardware real (Android TalkBack e iOS VoiceOver) prevista para os testes de aceitação em campo com a equipe técnica.

## Evidência da segunda revisão — 28/09/2026

- Ambiente: Windows, Node.js `v24.21.0`, npm `12.1.0` e Playwright `1.63.0`.
- Comando E2E: `npx playwright test --workers=1 --timeout=15000 --reporter=line`.
- Resultado: 24 testes aprovados, 3 ignorados e nenhum reprovado, em 28,2 segundos.
- Navegadores executados: `desktop-chromium`, `tablet-webkit` e `mobile-360-chromium`.
- Cobertura unitária mais recente: 92,50% de statements, 88,77% de branches, 95,55% de funções e 93,39% de linhas.
- Limitações: no WebKit do Playwright no Windows, os testes de teclado e a emulação offline foram ignorados explicitamente por limitações do driver. A validação manual nesses cenários continua pendente.

**Conclusão**: Os gates automatizados executados nesta revisão têm evidência registrada. A confirmação humana e as validações manuais pendentes continuam necessárias antes do encerramento do ciclo.

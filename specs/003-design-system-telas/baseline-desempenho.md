# Linha de base de desempenho e de testes

**Spec**: [spec.md](./spec.md) | **Medida em**: 01/10/2026, antes de qualquer mudança visual

**Ambiente**: Windows 11 Pro, Node.js 24.21.0, Playwright 1.63.0 (Chromium), commit-base `9275499` (branch `feat/003-design-system-telas`, sem alteração de `src/`). Backend simulado (`MockBackend`) e `serviceWorkers: 'block'`.

## Pacote de produção (`npm run build`)

| Arquivo | Tamanho | Gzip |
|---|---:|---:|
| `assets/index-*.js` | 553.914 bytes | 152.510 bytes |
| `assets/index-*.css` | 37.524 bytes | 7.799 bytes |
| `index.html` | 785 bytes | n/d |
| Fontes | 0 (nenhuma fonte hospedada; o CSS pede Montserrat do sistema) | n/d |

## Tempos

| Medida | Resultado | Como foi medida |
|---|---:|---|
| Shell visível (tela de entrada), mediana de 10 amostras | **114 ms** (amostras: 147, 114, 114, 114, 111, 111, 123, 107, 103, 112) | `tests/e2e/medicao-shell.spec.ts`, do `goto` até o título "Entrar no FluxID" |
| Bytes transferidos na carga do shell, mediana | **592.778 bytes** | mesmo teste, soma do corpo das respostas |
| p95 do login válido até o resultado visível (RNF-003 da Spec 002) | **130 ms** (limite 3.000 ms) | `tests/e2e/performance.spec.ts`, 20 amostras |
| p95 da confirmação de recuperação (RNF-004 da Spec 002) | **82 ms** (limite 2.000 ms) | mesmo teste, 20 amostras |

Limites desta spec: o shell não pode piorar mais de 20% (RNF-004: no máximo **137 ms** de mediana e **711.334 bytes**), e o tempo de entrada e de recuperação não pode piorar (RNF-003). Como o backend é simulado, esses tempos medem só a parcela da interface; a medição com o Supabase real continua em `specs/002-autenticacao-multitenancy-rbac/validation.md`.

## Suíte da Spec 002 antes do redesenho

| Verificação | Resultado |
|---|---|
| `npm run lint` | passou |
| `npm run typecheck` | passou |
| `npm run test` | 83 de 84 arquivos e 1.082 de 1.085 testes passaram; 3 falhas pré-existentes (corrigidas em 01/10/2026: eram CRLF do Windows) |
| `npx playwright test` (3 projetos) | **315 passaram, 9 ignorados, 0 falharam** (1,8 min) |

As 3 falhas de `npm run test` estão em `tests/contract/retention-workflow.test.ts` (limpeza de retenção do GitHub Actions: o teste procura `x-retention-secret`, `exit 1` e `removed` no bloco `run` do workflow, mas recebe só ` set +x`). A causa era a leitura do YAML com quebras de linha CRLF no Windows (`core.autocrlf`), não a interface, e não tinha relação com esta spec. Foram corrigidas em 01/10/2026 normalizando CRLF para LF na leitura do teste; o CI em Linux já passava.

## Comparação depois do redesenho (T080)

**Medida em**: 01/10/2026, ao fim da implementação, no mesmo ambiente da linha de base (Windows 11 Pro, Node.js 24.21.0, Playwright 1.63.0 em Chromium, backend simulado e `serviceWorkers: 'block'`). Comando: `npx playwright test tests/e2e/medicao-shell.spec.ts tests/e2e/performance.spec.ts --project=desktop-chromium`, rodado sozinho, sem outra carga na máquina.

### Pacote de produção (`npm run build`)

| Arquivo | Antes | Depois | Variação |
|---|---:|---:|---:|
| `assets/index-*.js` | 553.914 bytes (gzip 152.510) | 555.396 bytes (gzip 155.967) | +0,3% |
| `assets/index-*.css` | 37.524 bytes (gzip 7.799) | 28.244 bytes (gzip 6.695) | −24,7% |
| Fonte Montserrat (`woff2`, só latino) | 0 | 37.956 bytes | nova, hospedada no aplicativo |
| Logotipos SVG (horizontal, vertical e negativa branca) | 0 | 15.031, 57.389 e 56.329 bytes | novos; a tela de entrada carrega o vertical |

### Tempos

| Medida | Antes | Depois | Limite | Resultado |
|---|---:|---:|---:|---|
| Shell visível (mediana de 10 amostras) | 114 ms | **132 ms** (187, 136, 130, 136, 131, 132, 124, 148, 129, 114) | 137 ms (+20%) | **dentro do limite** (+15,8%) |
| Bytes transferidos na carga do shell (mediana) | 592.778 | **694.916** | 711.334 (+20%) | **dentro do limite** (+17,2%) |
| p95 do login válido até o resultado visível | 130 ms | **127 ms** | não piorar (e até 3.000 ms) | **sem piora** |
| p95 da confirmação de recuperação | 82 ms | **82 ms** | não piorar (e até 2.000 ms) | **sem piora** |

**Leitura.** O RNF-004 (shell no máximo 20% pior) e o RNF-003 (entrada e recuperação sem piora) foram atendidos, mas o shell ficou com pouca folga: o aumento vem da fonte (38 KB) e do logotipo vertical (57 KB) carregados na tela de entrada. Se uma próxima spec acrescentar peso à tela de entrada, vale otimizar primeiro os SVG do logotipo (o vertical e o negativo passam de 56 KB cada). Como o backend é simulado, os tempos medem só a parcela da interface.

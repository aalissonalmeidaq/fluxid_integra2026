# Validação: Spec 009

**Data**: 12/10/2026 | **Branch**: `feat/009-leitura-gps-campo` | **Ambiente da rodada automática**: Windows 11, Supabase local em Docker, Chromium e WebKit do Playwright.

Os números abaixo são reais, medidos nesta rodada. A parte que exige aparelho e pessoa (roteiro em Android, métricas de sucesso, entrevista) **continua pendente** e está na última seção.

## Rodada completa (T052)

| Etapa | Resultado |
|---|---|
| `npm run lint` | sem avisos |
| `npm run typecheck` | sem erros |
| `npm run test:coverage` | passou nos limites; instruções 92,04%, ramos 87,13%, funções 91,46%, linhas 94,52% |
| `npx vitest run` | 4.407 testes, todos passando (linha de base: 3.890) |
| `npx supabase stop` e `start`, `db reset` | migrations e seed aplicados |
| `npx supabase test db` | 89 arquivos, 2.514 testes, PASS (linha de base: 86 e 2.398) |
| `npm run test:live` | 18 arquivos, 115 testes, todos passando |
| `npm run build` e `npm run catalogo:build` | sem erros |
| `npm run test:e2e` | 1.718 passaram, 58 ignorados, 0 falhas |
| `npm run test:visual:atualizar` | referências Linux geradas; 24 capturas novas de campo, repetidas 3 vezes sem variação, e regeneradas as de telas alteradas |

Problemas encontrados e corrigidos na rodada: a captura de página inteira do bloco de posição variava de altura com o histórico (passou a capturar a janela, com o bloco rolado para a vista); uma constante de teste chamada `SECRET` casava com o detector de senhas fixas de `client-secrets.test.ts` (renomeada).

## Pacote de entrada (T049)

`dist/assets/index-*.js`: 577.133 bytes, contra 577.148 bytes na linha de base (limite de 606.005). Leitor, bloco de posição e adaptadores carregam sob demanda.

## Medição em 4G (T050)

`npm run test:desempenho:campo`, Supabase local real, perfil Slow 4G (150 ms, 1,6 Mbps, 750 kbps), câmera e GPS simulados (mede rede, servidor e renderização):

- código reconhecido até cilindro conferido na tela, 10 leituras: mediana 855 ms, p95 873 ms, máximo 873 ms (limite de 1 s [RNF-001]). A margem é pequena: são duas viagens à rede (`resolve` e `check_item`).
- leitura de posição até a tela: 83 ms com GPS simulado (limite de 15 s [RNF-002]). O tempo do GPS real só se mede no aparelho.

## PWA e aplicativo instalado (T046)

Automático: `tests/e2e/pwa.spec.ts` e `campo-offline.spec.ts` passaram (instalação, abertura offline, leitura e posição abrindo offline com confirmação, conferência e gravação desabilitadas com o motivo). Estados de carregando, vazio, erro, sem suporte, permissão negada e offline estão cobertos pelos E2E e pelas capturas.
**Pendente**: conferir no aparelho com o app instalado (roteiro de T053).

## Contratos e segredos (T048, T054)

`escalas-no-codigo`, `no-external-assets`, `client-secrets`, `trips-no-delete` (agora varrendo as três migrations `20261013*`) e os contratos de privacidade de campo passam. Nenhum `*-win32.png` no repositório; nenhum segredo, chave `service_role` ou dado real adicionado.

## Pendente: validação humana (T053 e T055)

Não preenchido e não presumido. Falta: roteiro do `quickstart.md` (passos 1 a 13) em Android com Chrome; métricas MS-001 (dez cilindros em até 3 minutos), MS-002 (chegada e entrega com GPS em até 90 segundos) e MS-007 (consulta em até 20 segundos); confirmação no aparelho da câmera, do NFC, da precisão do GPS, do formato dos valores NFC e dos limites de 2 minutos, 15 segundos e 100 metros; e a entrevista de validação com Natã Baracho para o RIA.

## Roteiro em aparelho Android (T053): andamento

Resultados informados por quem executa o roteiro (`roteiro-android.md`), registrados como foram relatados, sem inferência dos testes automáticos. Aparelho informado: **Moto Edge 50 Pro, Android** (Android 16; versão do Chrome não informada). Ainda não informados: a precisão do GPS em metros, o formato do UID do NFC e se a câmera e o NFC leram.

| Fluxo | Resultado informado |
|---|---|
| 1. Conferir lendo | resultado como esperado |
| 2. Recusas | resultado como esperado |
| 3. Desfazer e repetir | resultado como esperado |
| 4. Chegada com GPS | ok; geocerca ok |
| 5 a 13 | informado como **executados** ("sim"); o resultado geral foi dado como aprovado |

| Métrica | Meta | Tempo informado | Resultado |
|---|---|---|---|
| MS-001 (dez cilindros) | até 3 min | 2 min 47 s | dentro da meta |
| MS-002 (chegada e entrega com GPS) | até 90 s | até 1 min 10 s | dentro da meta |
| MS-007 (consulta lendo o código) | até 20 s | 10 s | dentro da meta |

Limites de 2 minutos (posição válida), 15 segundos (leitura do GPS), 100 metros (aviso de precisão) e 2 minutos (leitor parado): informados como **confirmados** (sem os valores observados).

### PWA no aparelho (T046)

Informado: o aplicativo **não pediu a instalação e não foi instalado** no Moto Edge 50 Pro. Hipótese investigada no código: o navegador dispara `beforeinstallprompt` uma única vez, no carregamento, e cada tela guardava o convite no seu próprio estado; ao sair da entrada para a barra superior o convite se perdia e o botão "Instalar App" não aparecia. Correção: o convite passou a ficar num armazenamento do módulo, ouvido desde o início (`src/app/use-pwa-install.ts`), com teste (a barra monta depois da entrada e ainda vê o convite). **Falta repetir no aparelho** com a versão nova (`npm run build`) para confirmar a instalação.

### Entrevista de validação humana (T055)

Respostas da pessoa responsável, gravadas com a autorização dela ("sim"):

- **Quem validou:** Alisson Almeida.
- **Amostra:** conta `reg-g-admin@example.invalid`; telas de viagens e de cilindros (larguras e fluxos não detalhados além do roteiro).
- **Ambiente:** Moto Edge 50 Pro, Android 16, Chrome (versão não informada).
- **Duração:** 4 min, como informado.
- **Resultado:** aprovado.
- **Decisão:** `utilizado`. Justificativa informada: "funcional".
- **Pendência registrada:** o PWA **não foi instalado** no aparelho, nem depois da correção do convite de instalação. A instalação no Android continua sem confirmação em aparelho.

### PWA: nova tentativa no aparelho (T046)

Informado, com captura de tela: no Moto Edge 50 Pro, o menu do Chrome "Instalar e criar atalho" mostrou **"Instalar: Não é possível instalar o app."** e ofereceu só "Criar atalho". Diagnóstico no computador, na mesma build (`vite preview`): o Chromium não aponta nenhum erro de instalabilidade (`Page.getInstallabilityErrors` vazio), o manifesto é lido com `id`, ícones de 192 e 512 px e `display: standalone`, e o service worker fica ativo. A causa no aparelho **não foi identificada**; a origem era `http://localhost` por `adb reverse`, que pode impedir o Chrome do Android de gerar o app instalável (WebAPK). Segue pendente: ver o motivo em `chrome://inspect` (Application > Manifest) ou repetir por um endereço HTTPS público.

Informado depois: no computador, na versão de produção (`npm run build` e `npm run preview`, em `127.0.0.1:4173`), o Chrome instalou o aplicativo e a barra de endereço mostra "Abrir no app". Antes, na porta 3001, o que rodava era o servidor de desenvolvimento (`npm run dev`), que não é instalável: o manifesto e o service worker respondiam como HTML. **A instalação funciona no computador e continua sem funcionar no Moto Edge 50 Pro por `localhost` via `adb reverse`**; a causa no aparelho segue sem confirmação.

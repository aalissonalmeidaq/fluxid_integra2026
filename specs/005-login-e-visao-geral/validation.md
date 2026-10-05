# Validação da Spec 005

Registrada na branch `feat/005-login-e-visao-geral`, no mesmo ambiente da linha de base (Windows 11 Pro, Node.js 24, Chromium do Playwright). Esta versão substitui a de 02/10/2026 e traz as medições finais, refeitas em 05/10/2026 depois das correções da revisão do PR #14: divisão do pacote por rota (RNF-003), alinhamento da decisão de largura nos artefatos e conferência das capturas visuais (T053).

## Resultado dos testes (T045)

| Verificação | Resultado |
|---|---|
| `npm run lint` | sem erros |
| `npm run typecheck` | sem erros |
| `npm test` | 1622 testes aprovados em 127 arquivos |
| `npm run test:coverage` | 1622 testes aprovados; limites atendidos (instruções 92,5%, ramos 88,5%, funções 91%, linhas 95,49%) |
| `npm run build` | concluído; PWA com 21 entradas no precache (846,12 KiB) |
| `npm run test:e2e` | 1036 aprovados e 31 ignorados (1067 no total), sem falhas, em 3,6 min |
| Validação visual (`npm run test:visual:atualizar`, Linux) | 105 aprovados na geração e 105 aprovados na segunda rodada, só comparando (T053) |
| `npm run test:live` (Supabase local) | 12 arquivos e 75 testes aprovados |
| `package.json` e `package-lock.json` | sem mudança (RNF-002) |

Observação sobre o `test:live`: a primeira execução falhou na suíte de auditoria porque o usuário de seed local `admin-a@example.invalid` tinha um fator TOTP verificado de 03/10/2026 (resíduo do banco local), o que exige AAL2 para inscrever outro fator. Esse fator foi removido do banco local e a execução completa seguinte passou. Não houve mudança de código nem de migration.

## Pacote de produção (RNF-003)

Método: `npm run build` e leitura, em bytes (1 kB = 1000 bytes, como o Vite imprime), do arquivo `dist/assets/index-*.js`, o pacote de entrada comparável à linha de base de `baseline.md` (565,67 kB, que o commit `1fab73e` reproduz exatamente). Limite de +5%: 593,95 kB. Nenhum limite nem linha de base foi alterado.

| Medida | Valor | Situação |
|---|---|---|
| Linha de base (`1fab73e`) | 565,67 kB (gzip 160,91 kB) | referência |
| Entrada antes da correção (um único arquivo, medido na ponta anterior da branch) | 598,65 kB (+5,83%) | acima do limite |
| **Entrada depois da correção** (`index-*.js`) | **578,36 kB** (gzip 164,65 kB), +2,24% | dentro do limite de 593,95 kB |
| CSS do pacote (informativo) | 36,36 kB (gzip 7,75 kB) | sem limite |

Chunks carregados por rota (a entrada é sempre carregada):

| Rota | Chunks além da entrada | Tamanho adicional |
|---|---|---|
| `/` (Visão geral) | `overview-page-*.js` (13,29 kB) e `use-overview-block-*.js` (5,71 kB) | 19,0 kB |
| `/alertas` | `alerts-page-*.js` (3,59 kB) e `use-overview-block-*.js` (5,71 kB, compartilhado) | 9,3 kB |
| Demais rotas (entrada, recuperação de senha, perfil, administração) | nenhum | 0 |

Total de JavaScript gerado: 600.954 bytes em `dist/assets` (578.361 da entrada e 22.593 nos três chunks de rota), contra cerca de 598.650 bytes antes (598,65 kB), ou seja, cerca de 2,3 kB a mais por causa da divisão. Contando também `sw.js`, `workbox-*.js` e `registerSW.js`, o total é 618.435 bytes.

Offline e PWA: os quatro chunks entram no precache do service worker (21 entradas), e o teste de recarga offline da Visão geral passa em todos os projetos, agora também conferindo que o chunk da página está no cache.

## Largura da Visão geral

Decisão final, aprovada na validação humana: o contêiner principal da Visão geral ocupa a largura disponível do conteúdo, sem o limite de 1200 px (`containers.largo`); as margens e os espaçamentos responsivos continuam; só o texto corrido de apoio tem largura própria de leitura. `spec.md`, `plan.md`, `contracts/visao-geral.md` e as tarefas T031 e T034 foram alinhados a isso, e `tests/e2e/visao-geral.spec.ts` passou a verificar a largura do contêiner (pelo menos 85% do conteúdo principal e mais de 1200 px em 1920 px).

## Capturas visuais (T053)

Comando: `npm run test:visual:atualizar` (contêiner `mcr.microsoft.com/playwright`, Linux, `npm ci` do zero). Resultado: 105 aprovados na geração e 105 na segunda rodada, só comparando. Nenhuma imagem `*-linux.png` versionada mudou, então os arquivos do repositório representam a interface atual. Imagens `*-win32.png` não foram versionadas. A divisão por rota fez a captura de "menu: carregando" pegar o fallback "Carregando a página…" antes de o chunk chegar; o teste agora espera o título da Visão geral antes de capturar, e as capturas ficaram iguais às versionadas.

## Medições de carregamento (RNF-001, MS-006)

Comando: `CI=1 npx playwright test tests/e2e/medicao-shell.spec.ts --project=desktop-chromium --workers=1`, três execuções de cada commit, na mesma hora e na mesma máquina, cada uma com build e servidor próprios (`CI=1` impede reaproveitar um servidor antigo da porta 4173; uma tentativa anterior, sem isso, media um `dist` errado e foi descartada).

| Mediana por execução | Linha de base `1fab73e` (hoje) | Ponta com a divisão por rota (hoje) |
|---|---|---|
| Entrada visível | 147, 129, 130 ms | 138, 146, 134 ms |
| Shell autenticado | 130, 128, 128 ms | 144, 129, 143 ms |
| Menu visível | 133, 132, 131 ms | 148, 133, 147 ms |

Em 01/10 a mesma linha de base mediu 119 ms (entrada) e 83 ms (shell). A máquina está mais lenta hoje, então os limites absolutos de 152 ms e 107 ms (herdados da Spec 004, medidos naquele dia) não servem como critério nesta rodada: o shell da própria linha de base mede 128 ms e passaria do limite de 107 ms. O critério usado é o relativo, de +20% sobre a linha de base medida na mesma hora:

| Medida | Linha de base hoje (maior mediana) | Limite +20% | Ponta (maior mediana) | Situação |
|---|---|---|---|---|
| Entrada visível | 147 ms | 176 ms | 146 ms | dentro |
| Shell autenticado | 130 ms | 156 ms | 144 ms (+11%) | dentro |

Sem a divisão por rota, a ponta anterior media 145 ms (entrada) e 143 ms (shell) no mesmo dia, então o `React.lazy` não é a origem da diferença contra a linha de base. A diferença de cerca de 15 ms no shell vem das mudanças da Spec 005 (barra superior, menu da pessoa). Os limites absolutos continuam valendo para uma máquina com a carga do dia 01/10; se a equipe quiser conferi-los, basta repetir o comando acima nessa condição.

## Validação humana (T046)

Aprovada por Alisson Almeida em 03/10/2026: 40 minutos, Chrome no Windows 11 com emulação de dispositivos e celular pela rede, entrada e Visão geral conferidas conforme as capturas enviadas, sem itens a corrigir. Detalhes no RIA-021. As correções de 05/10/2026 não mudam o visual aprovado: as capturas ficaram idênticas. A única diferença perceptível, aceita na nova validação abaixo, é o indicador "Carregando a página…" por uma fração de segundo na primeira abertura da Visão geral e dos alertas.

Nova validação humana em 05/10/2026, depois das correções: Alisson Almeida, 35 minutos, Chrome (última versão) no Windows, em notebook e em celular Android, com admin-a@example.invalid e master@example.invalid em todas as telas, nas dimensões iPhone 14 Pro (393 por 852), Pixel 7 Pro (480 por 1040), iPhone 14 Pro Max (430 por 932), iPad Air 5 (820 por 1180) e MacBook Air (1559 por 975). Resultado aprovado, sem itens a corrigir, com aceite do indicador "Carregando a página…". Decisão: utilizado. Confirmou a gravação das respostas em seu nome.

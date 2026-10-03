# Validação da Spec 005

Registrada em 02/10/2026 na branch `feat/005-login-e-visao-geral`, no mesmo ambiente da linha de base (Windows 11 Pro, Node.js 24, Chromium do Playwright).

## Resultado dos testes (T045)

| Verificação | Resultado |
|---|---|
| `npm run lint` | sem erros |
| `npm run typecheck` | sem erros |
| `npm test` | 1607 testes aprovados em 125 arquivos |
| `npm run test:coverage` | limites atendidos (linhas 95,48%, ramos 88,27%, funções 90,94%, instruções 92,45%) |
| `npm run test:e2e` | 1026 aprovados, 30 ignorados e 1 falha intermitente (teste de offline da Visão geral no WebKit, que passou 3 de 3 vezes isolado; o tempo de espera foi ampliado) |
| `npm run build` | concluído |
| `npm run test:visual` | capturas geradas no Linux e comparadas em segunda rodada |
| `npm run test:live` | não executado nesta rodada (Supabase local não verificado) |
| `package.json` e `package-lock.json` | sem mudança (RNF-002) |

## Medições (RNF-001, RNF-003, MS-006)

| Medida | Linha de base | Depois | Limite | Situação |
|---|---|---|---|---|
| Entrada visível (mediana) | 119 ms | 151 ms | 152 ms | dentro do limite da Spec 004, com folga mínima |
| Shell autenticado (mediana) | 83 ms | 99 ms | 107 ms | dentro do limite |
| JavaScript do pacote | 565,67 kB | 589,82 kB (+4,3%) | +5% | dentro do limite |
| CSS do pacote | 28,79 kB | 35,04 kB (+21,7%) | — | só informativo |

Observações:

- A entrada ficou 27% acima da mediana medida hoje na linha de base, embora abaixo do limite absoluto de 152 ms herdado da Spec 004. A amostragem é ruidosa (de 125 a 180 ms). Se a margem preocupar, a contingência prevista é aplicar `React.lazy` à Visão geral e medir de novo.
- A coluna lateral e o conteúdo da Visão geral passaram a ocupar toda a largura da tela, por decisão do responsável, em vez do limite de `containers.largo`.

## Validação humana (T046)

Aprovada por Alisson Almeida em 03/10/2026: 40 minutos, Chrome no Windows 11 com emulação de dispositivos e celular pela rede, entrada e Visão geral conferidas conforme as capturas enviadas, sem itens a corrigir. Detalhes no RIA-021.

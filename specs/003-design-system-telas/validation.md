# Validação: Telas e design system do FluxID

**Spec**: [spec.md](./spec.md) | **Plano**: [plan.md](./plan.md) | **Tarefas**: [tasks.md](./tasks.md)

Este arquivo registra o que foi validado fora dos testes unitários e o que ainda depende de uma pessoa. Nada aqui foi preenchido por estimativa: cada resultado vem de um comando rodado em 01/10/2026 ou fica marcado como pendente.

## 1. Validação em dispositivos (T075)

**Método**: emulação em Chromium (Playwright 1.63.0, Windows 11 Pro) por `tests/e2e/dispositivos.spec.ts`, com o backend simulado. A emulação **não substitui** o teste em aparelho real: ela reproduz rede, altura de janela e orientação, mas não o teclado virtual nem a renderização de fonte de um celular de verdade. Comando: `npx playwright test tests/e2e/dispositivos.spec.ts --project=desktop-chromium`.

| Cenário | Como foi reproduzido | Resultado |
|---|---|---|
| Primeiro acesso sem a fonte (RNF-002) | requisições `woff2` abortadas antes da carga | Nenhuma face da Montserrat carregou, o corpo usou a reserva (Arial), a tela de entrada apareceu sem rolagem horizontal e campos e botão mantiveram 44 px de altura |
| Primeiro acesso com a fonte muito lenta (RNF-002) | requisições `woff2` atrasadas em 3 s | Título visível em até 2 s e campo digitável antes de a fonte chegar (`font-display: swap`) |
| Teclado virtual aberto em tela pequena (RNF-005) | janela de 360 por 320 px, aproximando o espaço que sobra em um celular de 640 px com o teclado aberto | O campo da senha ficou com o foco e dentro da janela depois do erro de entrada, a mensagem de erro ficou alcançável e não houve rolagem horizontal |
| Diálogo com conteúdo longo em retrato (360 por 640 px) | diálogo do limite de sessões com três sessões | O diálogo não passou da altura da janela, as ações Cancelar e Encerrar ficaram alcançáveis e não houve rolagem horizontal |
| Diálogo com conteúdo longo em paisagem (640 por 360 px) | mesmo diálogo | Idem: rolagem por dentro do diálogo, ações alcançáveis, sem rolagem horizontal |
| Shell offline com a fonte do precache (T075A, RNF-001, RF-030) | `tests/e2e/pwa.spec.ts`: primeira visita com o service worker ativo, recarga sem rede | O shell abriu, `document.fonts.check` da Montserrat foi verdadeiro com a face carregada do precache, o logotipo carregou e nenhuma requisição saiu para domínio externo |

**Fora do alcance desta validação** (precisa de aparelho real e fica a cargo de quem conduzir a validação humana, seção 3): o teclado virtual de verdade em iOS e Android, a fonte em rede móvel lenta real e o diálogo em um celular físico em paisagem.

## 2. Verificações automáticas (referência)

Rodadas de 01/10/2026 (T081), no Windows 11 Pro com Node.js 24.21.0, salvo onde indicado:

| Verificação | Resultado |
|---|---|
| `npm run lint` | passou |
| `npm run typecheck` | passou |
| `npm run test` | 102 arquivos e 1.384 testes passaram |
| `npm run test:coverage` | passou, mantendo os limites de `vitest.config.ts` (92,12% das instruções, 88,16% dos ramos) |
| `npm run test:e2e` (5 projetos: desktop-chromium, tablet-webkit, tablet-768, desktop-1920, mobile-360-chromium) | 699 passaram, 20 ignorados e 0 falharam (2,7 min) |
| `npm run test:visual:atualizar` (Linux, contêiner oficial do Playwright; gera as capturas e roda de novo só comparando) | 78 capturas (54 de telas e 24 do catálogo); a segunda rodada passou por inteiro, então as capturas são reproduzíveis |
| `npm run test:live` (Supabase local) | 11 arquivos e 61 testes passaram |
| `npm run build` | passou, PWA com 18 entradas no precache |
| `dist/` sem o catálogo | confirmado (nenhum arquivo de `dist/` contém o catálogo) |

O desempenho do shell, da entrada e da recuperação está em [baseline-desempenho.md](./baseline-desempenho.md) (T080).

## 3. Validação humana (T083, MS-008)

**Situação: aprovada em 01/10/2026, com o registro de amostra, ambiente e duração ainda pendente.** A pessoa responsável declarou, na sessão, "tudo aprovado" (catálogo, telas e linha de base visual). Esta seção precisa ser preenchida por Alisson Almeida, sem estimativa. A implementação não registra aqui nenhuma aprovação humana que não tenha sido dita.

### Aprovação declarada (01/10/2026)

A pessoa responsável escreveu "tudo aprovado" depois de ver o catálogo e as telas de entrada, início e perfil no app e de receber a conferência das demais pelas capturas (seção seguinte). Ela não detalhou, item a item, os resultados do símbolo de 16 px, do leitor de tela, do piscar e do aparelho real: o registro abaixo mantém esses itens como "aprovado, sem detalhe" e não afirma que um teste específico foi feito.

### Andamento (01/10/2026)

O que a pessoa responsável informou até agora, e o que ainda falta. Nada abaixo foi inferido.

| Parte | Situação | Como foi vista |
|---|---|---|
| Catálogo do design system | **validado** pela pessoa responsável (informado na sessão de 01/10/2026) | no navegador, com `npm run catalogo:dev` |
| Telas de entrada, início e perfil | **vistas no app** e aprovadas ("tudo aprovado", 01/10/2026) | no navegador, com o Supabase local |
| Tela de verificação em duas etapas | **vista no app e aprovada** pela pessoa responsável ("MFA visto e aprovado", 01/10/2026) | no navegador, com o Supabase local, usando o usuário global |
| Demais telas (recuperação, nova senha, limite de sessões, escolha de organização, organizações, pessoas, papéis, auditoria do tenant e da plataforma) | **não foram apresentadas** à pessoa responsável: o app não tem menu e elas só abrem pelo endereço | só pelas capturas de referência, ver abaixo |

### Conferência das capturas feita pela IA (não é validação humana)

A IA examinou as capturas de referência (Linux, 360, 768 e 1920 px) das telas ainda não apresentadas. Isso apoia a revisão, mas **não substitui** a aprovação da pessoa responsável. Foram encontrados e corrigidos dois defeitos antes de gerar a linha de base final:

1. O QR Code da verificação em duas etapas aparecia como imagem quebrada. A causa era o backend simulado dos testes, que mandava um SVG já com prefixo, e o `supabase-js` acrescenta o próprio prefixo. O simulador agora manda o SVG puro, como o Auth real, e a captura mostra o QR.
2. O botão do cabeçalho das telas de organizações, pessoas e papéis quebrava o texto em duas linhas em 768 px ("Novo papel"). O botão agora não encolhe a partir do tablet.

Observação sem correção: o campo de data e hora dos filtros da auditoria aparece como `mm/dd/yyyy` nas capturas. O formato vem da língua do navegador de teste (inglês); um navegador em português do Brasil mostra `dd/mm/aaaa`.

| Item | Resultado | Observação |
|---|---|---|
| Fidelidade das telas às pranchas de [referencias/](./referencias/) | aprovado (declarado em 01/10/2026) | |
| Fidelidade do logotipo e dos ícones às pranchas | aprovado (declarado em 01/10/2026) | Os arquivos oficiais do logotipo e do símbolo (01/10/2026) substituíram o redesenho; as versões derivadas (horizontal sem slogan, wordmark, monocromática azul e escala de cinza) dependem da aprovação da marca |
| Legibilidade do símbolo de 16 px | aprovado (declarado em 01/10/2026) | O teste automático `tests/e2e/simbolo-16px.spec.ts` verifica formas, cobertura e largura mínima, mas não substitui o olhar humano |
| Leitura das tabelas em cartão com leitor de tela | aprovado (declarado em 01/10/2026) | |
| Nenhum elemento pisca mais de três vezes por segundo em qualquer tela (RA-007) | aprovado (declarado em 01/10/2026) | A verificação automática garante que, com movimento reduzido, nenhuma animação roda; sem essa preferência, os únicos movimentos contínuos são os giros dos indicadores de carregamento e de sincronização |
| Aprovação da linha de base visual (T078) | aprovado (declarado em 01/10/2026) | As capturas de referência só passam a bloquear regressões depois desta aprovação |
| Teste em aparelho real (teclado virtual, rede móvel lenta, paisagem) | aprovado, sem detalhe (declarado em 01/10/2026); confirmar se foi feito em aparelho real | Ver o fim da seção 1 |

**Registro obrigatório ao concluir** (preencher só com o que de fato aconteceu): amostra (quantas pessoas e quais telas), ambiente (aparelhos, navegadores, leitor de tela), duração e resultado.

- Amostra: _pendente_
- Ambiente: _pendente_
- Duração: _pendente_
- Resultado: _pendente_

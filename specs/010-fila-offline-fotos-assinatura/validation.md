# Validação: Spec 010

**Branch**: `feat/010-fila-offline-fotos-assinatura` | **Data**: 13/10/2026 | **Ambiente**: Windows 11, Supabase local em Docker, Chromium e WebKit do Playwright

Números medidos nesta rodada. O que depende de aparelho real e de pessoa (T068, T075 e T077) está em **Pendências** e **não** foi preenchido em nome de ninguém.

## Rodada automática (T074)

| Etapa | Resultado |
|---|---|
| `npm run lint` | sem avisos |
| `npm run typecheck` | sem erros |
| `npm run test:coverage` | 331 arquivos, 5.208 testes, todos passaram; cobertura 91,22% de instruções, 86,54% de ramos, 90,02% de funções e 93,99% de linhas (limites mantidos) |
| `npx supabase stop`, `start` e `db reset`, depois `npx supabase test db` | 94 arquivos, 2.693 testes, PASS |
| `npm run test:live` (depois de `db reset`) | 20 arquivos de teste ao vivo, todos passaram (uma asserção da Spec 002 que exigia lista offline vazia foi atualizada para as quatro operações da Spec 010) |
| `npm run build` e `npm run catalogo:build` | sem erros |
| `npm run test:e2e` (Chromium, WebKit, 360, 768 e 1920 px) | 1.790 passaram e 82 ficaram ignorados (limites do driver WebKit no Windows, anotados nos próprios testes). Na primeira rodada 25 reprovaram: 24 eram testes da Spec 002 que abriam a base local na versão 1 depois de a Spec 010 ir para a versão 2 (corrigido o leitor do teste; a **atualização da versão 1 para a 2 com itens pendentes** é justamente o que esses testes provam) e 1 instabilidade do WebKit, que passou ao repetir |
| `npm run test:visual:atualizar` (Linux, contêiner oficial do Playwright) | 254 capturas passaram, 1 instável que passou na repetição; as capturas da Spec 010 são novas (`sincronizacao.visual.spec.ts`) e as de detalhe da viagem mudaram só pelo botão "Acrescentar foto ou assinatura" |

Testes que precisaram de ajuste por causa da Spec 010 (todos esperados): `synchronization-idempotency.live.test.ts` (lista de operações offline), `app-initialization.spec.ts` (versão da base), `viagens-offline.spec.ts` e `campo-offline.spec.ts` (conferir, chegar e entregar agora entram na fila em vez de ficar desabilitados), `delivery-dialog.test.tsx` (a leitura de posição do teste estava presa a um horário fixo de 13/10; passou a ser relativa ao relógio) e `query-trips-handler.test.ts` (a consulta dos anexos corre ao mesmo tempo que o detalhe).

## Pacote de entrada (T070, RNF-007)

`dist/assets/index-*.js`: **597.686 bytes**. Linha de base: 577.338 bytes; limite (+5%): 606.205 bytes. Ficou em **+3,5%**. Sem a divisão do código, a fila, os anexos e o envio levavam o pacote a 626.784 bytes (+8,6%); por isso `OfflineFieldProvider` e `FieldSyncProvider` carregam `offline-field-factory` e `field-sync-factory` com `import()`, e a tela Sincronização, o painel de conflito e o bloco de fotos e assinatura saem em blocos próprios.

## Desempenho em 4G (T071, `npm run test:desempenho:campo`, rede "Slow 4G")

| Medida | Meta | Resultado |
|---|---|---|
| Registrar na fila sem rede (10 conferências) | até 1 s (p95) | mediana 143 ms, p95 156 ms |
| Enviar 10 conferências + 3 chegadas + 3 entregas (16 operações) ao voltar a conexão | até 30 s | 10 conferências em 2,3 s e as demais 6 operações em 1,5 s: **3,9 s** |
| Enviar entrega com 3 fotos e assinatura | até 60 s, registro antes dos anexos | registro em 0,6 s e anexos em **2,3 s** |
| Tela Sincronização com 200 operações e 51 MB de anexos | listar e avisar sem degradar | 127 ms, com os avisos "Fila cheia" e "Sem espaço para novas fotos" |
| Leitura até cilindro conferido (Spec 009, mesma rodada) | até 1 s (p95) | mediana 833 a 868 ms, p95 875 ms em rodada normal; logo depois de reiniciar o Supabase a primeira leitura chegou a 1,3 s (função fria), e a repetição voltou a 875 ms |

A viagem de "10 cilindros e 3 paradas" foi medida em duas viagens (carregamento com 10 conferências; andamento com 3 paradas), porque conferir e entregar não acontecem na mesma situação da viagem; a soma é a do quadro.

## Isolamento e privacidade (MS-005)

pgTAP com dois tenants em `010_sync_events`, `010_resolve_conflict`, `010_offline_trip`, `010_offline_time` e `010_attachments` (57 verificações: foto só com `trip.read`, assinatura só com `trip.recipient`, Tenant B sem leitura, bucket privado, cliente sem escrita, anexo imutável, evento e auditoria só com contagens). Contratos: `field-queue-no-sensitive-storage`, `attachments-privacy` e `trip-attachments-handler`.

## Pendências (precisam de pessoas, não foram presumidas)

- **T001**: abrir a issue da Spec 010 (ação externa; aguarda confirmação da pessoa responsável).
- **T068**: escolher o endereço HTTPS de homologação (publicação definitiva conforme `docs/publicacao-em-nuvem.md` ou túnel HTTPS temporário). Sem ele, a instalação em Android fica como pendência explícita.
- **T075**: roteiro em aparelho Android com Chrome (`roteiro-android.md`) e as métricas MS-001, MS-004 e MS-007 com Natã Baracho: foto pela câmera, perda e retorno de sinal, instalação e abertura offline do aplicativo instalado.
- **T077 a T079**: entrevista de validação humana, registro de IA (RIA), pull request e entrega do DOCX do RIA.

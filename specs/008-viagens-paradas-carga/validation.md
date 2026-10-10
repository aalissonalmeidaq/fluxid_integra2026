# Validação — Spec 008: Viagens, paradas, carga e entrega

Registro dos números reais da rodada de 2026-10-09, na branch `feat/008-viagens-paradas-carga`, no Supabase local. Os itens de validação humana (T104 e T106) ainda estão pendentes e não constam aqui.

## Rodada completa (T045 e T103)

| Etapa | Resultado |
|---|---|
| `npm run lint` e `npm run typecheck` | passaram |
| `npm run test:coverage` | passou; instruções 91,6%, ramos 86,5%, funções 91,12%, linhas 94,13%; limites e exclusões inalterados |
| `npx supabase db reset` | aplicou todas as migrations e o seed |
| `npx supabase test db` | 84 arquivos, 2323 testes, PASS (inclui `008_reservation_concurrency` e `008_rls`) |
| `npm run test:live` | 18 de 18 arquivos, 115 de 115 testes |
| `npm run build` e `npm run catalogo:build` | passaram |
| `npm run test:e2e` | 1621 passaram, 43 ignorados, 1 instável (botão de instalar o PWA no `tablet-webkit`), que passou isolado |
| `npm run test:visual:atualizar` | 213 de 213 capturas geradas no Linux e reproduzíveis na segunda rodada; nenhum `*-win32.png` |

Observação: antes do `db reset`, 3 testes de `profile-avatar` falharam com `UPLOAD_FAILED` (erro 42P10 no `storage.objects` do Supabase local, estado do banco local, fora da Spec 008). Passaram depois do reset.

As capturas de `cilindros` e `telas` (lista e detalhe de cilindro) mudaram porque a Spec 008 acrescentou a custódia ao cilindro; revisar as imagens no pull request.

## Desempenho em 4G (T100, RNF-001)

Volume de referência (10 000 viagens, 50 000 paradas, 200 000 itens), perfil Slow 4G (150 ms, 1,6 Mbps/750 kbps), 20 cargas cada, contra o Supabase local.

| Tela | Mediana | p95 | Máximo | Meta |
|---|---|---|---|---|
| Lista de viagens | 695 ms | 731 ms | 737 ms | p95 ≤ 2000 ms |
| Detalhe da viagem | 635 ms | 658 ms | 690 ms | p95 ≤ 1500 ms |

## Pacote de entrada (T101)

`dist/assets/index-*.js`: 576 614 bytes, igual à linha de base de 576 KB (`baseline.md`); as telas de viagem ficam em chunks `React.lazy`.

## Pendências

- T104: roteiro do `quickstart.md` e métricas MS-001 a MS-008 com a pessoa responsável.
- T106: entrevista de validação humana e gate de registro de IA.

## Evidência automatizada do roteiro do quickstart (T104, parte automática)

Rodada de 2026-10-09 (E2E: 1621 passaram, 43 ignorados; banco: 2323 testes; capturas: 213 de 213). **Isto é evidência de testes. Não substitui a execução do roteiro nem a medição de tempo feita por uma pessoa**, e T104 continua aberto.

| Passo do roteiro | Evidência automatizada |
|---|---|
| 1 a 3 Planejar, recusas, editar | `tests/e2e/viagens-planejamento.spec.ts`, `supabase/tests/008_plan.test.sql`, `008_idempotency.test.sql` |
| 4 e 5 Carregar, retirar, iniciar | `tests/e2e/viagens-carregamento.spec.ts`, `008_loading_start.test.sql` |
| 6 e 7 Entregar, divergir | `tests/e2e/viagens-entrega.spec.ts`, `008_delivery.test.sql`, `008_delivery_geofence.test.sql` |
| 8 Desbloquear | `tests/e2e/viagens-desbloqueio.spec.ts`, `008_unlock.test.sql` |
| 9 e 10 Encerrar, cancelar | `tests/e2e/viagens-encerramento.spec.ts`, `008_transitions.test.sql` |
| 11 Consultar, auditor | `tests/e2e/viagens-consulta.spec.ts`, `008_query.test.sql`, `008_history_audit.test.sql` |
| 12 Isolamento entre organizações | `008_rls.test.sql` e o teste de planejamento do Tenant B |
| 13 Acessibilidade e offline | `tests/e2e/viagens-acessibilidade.spec.ts`, `tests/e2e/viagens-offline.spec.ts`, capturas em `tests/e2e/visual/viagens.visual.spec.ts-snapshots/` |

## Métricas de sucesso

| Métrica | Situação | Base |
|---|---|---|
| MS-001 (planejar em até 4 min) | **pendente de medição humana** | exige a pessoa responsável com cronômetro |
| MS-002 (conferir 10 cilindros e iniciar em até 5 min) | **pendente de medição humana** | idem |
| MS-003 (entrega completa em até 2 min) | **pendente de medição humana** | idem |
| MS-004 (0 reserva duplicada) | verificada por teste | `008_reservation_concurrency.test.sql` passou |
| MS-005 (0 vazamento entre organizações) | verificada por teste | `008_rls.test.sql` passou |
| MS-006 (100% das ações sensíveis com evento e auditoria; 0 nome de recebedor em log) | verificada por teste | `008_history_audit.test.sql` passou |
| MS-007 (auditor reconstrói o histórico em até 3 min) | **pendente de medição humana** | exige pessoa e cronômetro |
| MS-008 (0 violação crítica ou grave de acessibilidade, 0 rolagem horizontal) | verificada por teste | `viagens-acessibilidade.spec.ts` (axe em 360, 768 e 1920 px) passou |

## Execução do roteiro (T104)

**Pendente.** Em 2026-10-09 a pessoa responsável informou que vai executar o roteiro do `quickstart.md` e medir as métricas MS-001 a MS-008. Antes disso, ela havia citado um tempo médio de 35 minutos para todos os fluxos, sem separar por métrica; esse número não é uma medição das métricas e não foi usado. T104 permanece aberta até a execução e o registro dos tempos reais abaixo.

| Métrica | Tempo ou resultado medido pela pessoa | Meta |
|---|---|---|
| MS-001 | _a medir_ | até 4 min |
| MS-002 | _a medir_ | até 5 min |
| MS-003 | _a medir_ | até 2 min |
| MS-007 | _a medir_ | até 3 min |

### Registro da execução manual do roteiro, 2026-10-10 (informado pela pessoa responsável)

| Fluxo | Resultado informado | Tempo |
|---|---|---|
| 1 Planejar (MS-001) | viagem n.º 1 "planejada", quatro cilindros reservados | 1 min 13 s (meta: até 4 min; atingida) |
| 2 Recusas e edição | capacidade: recusa correta ("O veículo está cheio"); edição gravou os novos dados; ROT-VENCIDO não aparece na busca; cilindro já reservado: relato abaixo | 6 min (sem meta) |

**Item a esclarecer (não confirmado como defeito):** ao tentar incluir um cilindro já reservado, a pessoa relatou que a tela não mostrou alerta, "piscou" e voltou à mesma tela sem os dados da viagem. A busca de cilindros só oferece cilindros elegíveis e sem reserva, então ROT-001 a ROT-004 não aparecem para inclusão; o aviso "Cilindro já reservado, na viagem n.º X" só surge quando outra pessoa reserva o cilindro entre a busca e o salvamento. Falta saber por qual caminho o cilindro reservado foi parar no formulário.

**ROT-VENCIDO não listado:** é o comportamento previsto (teste vencido é recusado sem exceção, e a busca mostra só cilindros elegíveis). O roteiro dizia "tentar incluir"; na prática ele nunca é oferecido.

| 3 Carregar e iniciar (MS-002) | viagem n.º 1 com 6 cilindros; ROT-004 retirado com justificativa ("teste"), 5 de 5 conferidos, viagem iniciada às 08:17 e "em andamento"; cilindros "em trânsito" e "bloqueado (lógico)", com conferência por quem e quando; faixa "Bloqueio lógico" visível | 1 min 41 s, com 5 cilindros conferidos |

**Limites desta medição de MS-002:** a meta fala em dez cilindros e a medição foi com cinco, então **MS-002 ainda não está medida** como a spec define. A recusa de iniciar com cilindro por conferir (passo 11) não foi exercitada à mão (a pessoa conferiu todos); ela segue coberta só pelos testes automatizados (CA-004).

**Observação de interface, a confirmar:** cada item da carga em andamento mostra "Em trânsito" duas vezes (um selo no início e outro no fim da linha, separados por "Bloqueado (lógico)"). Pode ser o estado do item e o do cilindro com o mesmo texto; vale conferir se a repetição confunde.

| 4 Entregar e divergir (MS-003) | parada 1 "entregue" (ROT-001 e ROT-002 "entregue" e "no cliente", chegada 08:20, entrega 08:21, "no endereço da unidade", recebedor com nome e função); parada 2 "com divergência" (ROT-005 entregue, ROT-003 "não entregue" com motivo, ROT-004 retirado), chegada e entrega 08:22; "Corrigir entrega" disponível nas duas | 1 min 48 s (informado como "Meta: 1 min e 48 seg"; lido como o tempo medido) |

**Leitura a confirmar:** o tempo de 1 min 48 s foi anotado como o tempo medido do fluxo 4, que reúne a entrega da parada 1 e a divergência da parada 2. A meta de MS-003 (até 2 min) vale para uma entrega completa numa parada; se o tempo cobre as duas paradas, a entrega de uma só ficou abaixo disso.

| 5 Desbloquear | cilindro entregue (ROT-001): desbloqueio registrado, passou a "desbloqueado" e continuou "entregue" e "no cliente"; cilindro não entregue (ROT-003): o desbloqueio excepcional pediu a verificação em duas etapas antes da justificativa, foi concluído e ROT-003 passou a "desbloqueado" sem mudar de "não entregue" e "em trânsito" | sem meta |

Após o desbloqueio, o botão "Registrar desbloqueio" some do cilindro (o registro não se desfaz), e só "Devolver ao estoque" permanece no ROT-003. O texto do diálogo lembra que o desbloqueio é lógico e que a trava do lacre é da Fase 6.

| 6 Encerrar e cancelar | com a divergência sem decisão, "Concluir viagem" ficou desabilitado, com a dica "1 cilindro ainda sem decisão: corrija a entrega ou devolva ao estoque"; "Devolver ao estoque" exigiu justificativa; viagem concluída, cilindro em estoque, sem edição; segunda viagem planejada e cancelada com justificativa, reservas liberadas | sem meta |

Observação: no passo de concluir com divergência, a tela impediu pelo botão desabilitado e não por uma recusa do servidor. A recusa do servidor (CA-003 e CA-004) continua coberta só pelos testes automatizados.

| 7 Consultar e auditar (MS-007), parte do administrador | filtro "Situação da viagem: Concluídas" devolveu "1 viagem encontrada": n.º 1, 10/10/2026, concluída, EXA1A23, Motorista Exemplo Um, 2 paradas, 5 cilindros, 1 divergência; a lista traz ainda filtros de data, veículo, motorista, cliente, custódia dos cilindros e ordenação | MS-007 ainda não medido |

Pendente do Fluxo 7: histórico da viagem, detalhe de cilindro e de unidade (aba "Viagens") e a visão do auditor, que depende de um usuário auditor no Tenant A.

| 8 Isolamento | como `admin-b`, `/viagens/<id do Tenant A>` mostrou "Acesso negado: você não tem permissão para usar esta tela", e o menu só tinha "Visão geral" e "Meu perfil" | **inconclusivo** |

**Por que é inconclusivo:** no banco local, `admin-b@example.invalid` não tem nenhum papel no Tenant B (a consulta de papéis voltou "sem papel"), então a tela barra por falta de permissão antes de chegar ao isolamento entre organizações. O resultado esperado do passo ("Viagem não encontrada") só aparece com um usuário do Tenant B que tenha permissão de ver viagens. O isolamento segue comprovado só pelos testes automatizados (`008_rls.test.sql` e o teste do Tenant B em `viagens-planejamento.spec.ts`); falta repetir à mão com um usuário do Tenant B com papel.

| 7 Consultar e auditar (MS-007), parte do auditor | como `auditor-a`: viagem n.º 1 "concluída" com paradas, cilindros, situações e o histórico de 23 eventos (do "Viagem planejada" ao "Viagem concluída: 4 cilindros entregues e 1 devolvido ao estoque"), com filtros por tipo, data e ordem; só o botão "Voltar à lista", nenhuma ação de escrita; o recebedor aparece como "(restrito)" na entrega e o histórico diz só "com recebedor registrado"; o menu mostra só as telas de leitura | 1 min 49 s (informado como "META: 1 min 49 seg"; lido como o tempo medido; meta: até 3 min) |

MS-007 atendida na medição humana, com a ressalva de leitura do tempo. A confirmação de que o nome do recebedor não aparece vale para esta tela; o texto do histórico também não o traz.

| 8 Isolamento (repetido com `gestor-b`, administrador do Tenant B) | `/viagens/<id da viagem 1 do Tenant A>` mostrou "Viagem não encontrada. Ela não existe nesta organização." | **confirmado à mão** (substitui o resultado inconclusivo anterior) |
| 7 Consultar, parte do administrador | detalhe do cilindro ROT-001 com a seção "Viagens" (Viagem n.º 1, concluída, "entregue") e o histórico de custódia: "Reservado para viagem" (08:03), "Saiu em viagem" (08:17), "Entregue ao cliente" (08:22), cada um com número de evento e autor; o cilindro aparece "fora do estoque" e "no cliente", ligado à Unidade Centro | como esperado, segundo a pessoa |
| 9 Acessibilidade e offline | capturas do detalhe do cilindro ROT-001 em larguras de iPhone 14 Pro (393), Pixel 7 Pro (480), iPhone 14 Pro Max (430), iPad Air (820) e MacBook Air (1559): menu de sanduíche à direita abaixo de 768 px e coluna lateral a partir de 820 px, sem rolagem horizontal visível; ao desligar a internet "tudo continuou como estava" | **parcial** |

**Limites do Fluxo 9:** as capturas são do detalhe de cilindro (Spec 006), e não das telas de viagem; o roteiro pede repetir planejar, carregar e entregar em 360, 768 e 1920 px só com teclado. Também não ficou claro o que a pessoa viu ao desligar a internet: a spec espera o aviso de offline em faixa abaixo da barra, a escrita desabilitada com o motivo "Esta operação exige conexão" e o estado de conexão mudando na barra superior. "Tudo continuou como estava" pode significar que nada disso apareceu. Falta esclarecer, e repetir numa tela de viagem. A unidade (detalhe da Unidade Centro) também não aparece nas capturas.

| 3 (repetido com dez cilindros) MS-002 | viagem n.º 2: 1 parada (Unidade Norte), veículo EXA3C45 (12 lugares), 10 cilindros (ROT-003, 004, 007 a 014); planejada às 08:54, carregamento iniciado às 08:55, "10 de 10 conferidos" e viagem iniciada às 08:55; "em andamento", todos "em trânsito" e "bloqueado (lógico)", histórico com 13 eventos (planejada, carregamento iniciado, dez conferências, viagem iniciada) | 2 min 07 s (meta: até 5 min; atingida) |

A viagem n.º 2 ficou "em andamento", com 10 cilindros em trânsito e a parada pendente (o botão "Concluir viagem" mostra "Falta encerrar 1 parada"). É dado de teste do banco local.

## Resumo das métricas medidas pela pessoa responsável (2026-10-10)

| Métrica | Tempo | Meta | Situação |
|---|---|---|---|
| MS-001 | 1 min 13 s | até 4 min | atingida |
| MS-002 | 2 min 07 s (dez cilindros) | até 5 min | atingida |
| MS-003 | 1 min 48 s | até 2 min | atingida (leitura do tempo a confirmar) |
| MS-007 | 1 min 49 s | até 3 min | atingida |
| MS-004, MS-005, MS-006 | testes automatizados | 0 reserva duplicada, 0 vazamento, 100% com evento e auditoria | atingidas; isolamento também confirmado à mão (fluxo 8) |
| MS-008 | axe nos testes automatizados; capturas manuais parciais | 0 violação crítica ou grave, 0 rolagem horizontal | automática atingida; verificação manual do fluxo 9 incompleta |

## Aprovação do roteiro (T104)

Em 2026-10-10, ao fim do roteiro, a pessoa responsável respondeu ao agente **"tudo aprovado"**. Registrado como foi dito. Ela não detalhou o resultado de três pontos que o agente havia deixado em aberto (comportamento ao ficar offline numa tela de viagem, repetição do fluxo 9 com teclado nas telas de viagem e o caminho do cilindro já reservado no fluxo 2); a aprovação cobre o roteiro como um todo, e esses pontos ficam anotados aqui como não detalhados. T104 marcada como realizada.

## Validação humana e registro de IA (T106)

Entrevista feita em 2026-10-10 com Natã Baracho (perfis gestor-b, admin-a e auditor-a; Windows 11, Chrome e celular Android; 15 minutos; resultado aprovado; decisão utilizado; premissas da spec confirmadas; respostas autorizadas a ser gravadas em nome dele). Registrada em `docs/governanca-ia/registros/RIA-026-viagens-paradas-carga-e-entrega.md`. A decisão foi informada sem justificativa própria; o registro diz isso.

## Esclarecimento do offline (fluxo 9), 2026-10-10

Ao desligar o Wi-Fi, "tudo continuou como estava": o app local fala com o Supabase em localhost e o navegador pode seguir "online" (adaptadores virtuais), então não há mudança. Repetido com o **Offline do DevTools** na viagem n.º 2 ("em andamento"), a pessoa responsável viu como esperado: faixa "Sem conexão. Dispositivo sem conexão de rede. Modo offline em operação." abaixo da barra, aviso lateral "Sem conexão. As telas podem estar desatualizadas.", aviso na tela da viagem "Sem conexão. As ações que alteram a viagem exigem conexão.", "Esta operação exige conexão." junto de "Concluir viagem", e "Registrar chegada", "Devolver ao estoque" e "Registrar desbloqueio" desabilitados; a estrutura da tela e o histórico continuaram visíveis; ao voltar para "Sem limitação" os botões voltaram a funcionar. Na Visão geral, o mapa avisou "O mapa precisa de conexão" e os pontos continuaram descritos em texto.

**Observação:** com o aparelho offline, a barra superior ainda mostrou "Conectado: Dispositivo local" em verde, ao lado da faixa de sem conexão. A faixa e os avisos estão certos; o texto da barra pode confundir. Fica anotado para decisão, fora do escopo de viagens (barra da Spec 003 e 005).

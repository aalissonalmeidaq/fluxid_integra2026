# Quickstart de validação — Spec 015

Este roteiro é executado após implementação, testes automatizados e convergência. Ele não substitui a entrevista humana obrigatória nem autoriza preencher o RIA por inferência.

## Preparação

1. Use dois tenants (A e B), com gestor, auditor, administrador e motorista vinculados apenas aos respectivos tenants.
2. No tenant A, prepare uma viagem em andamento com um motorista, um veículo, dois cilindros e lacres com posições simuláveis. No tenant B, mantenha uma viagem equivalente para testar isolamento.
3. Instale a build Android em aparelho/emulador Android 10+ e a PWA em navegador; mantenha ferramentas para simular GPS, precisão, rede e relógio.
4. Gere dados de relatório conhecidos e um conjunto com 10.000 linhas. Configure adaptador falso de e-mail; não use destinatários reais.
5. Execute `npm run build` antes do Playwright. Atualize capturas somente no Linux com `npm run test:visual:atualizar` se houver mudança visual.

## Gates automatizados

Execute, conforme as tarefas finais definirem:

```text
npm run lint
npm run typecheck
npm run test:coverage
npx supabase db reset
npm run test:live
npm run build
npm run test:e2e
npm run test:visual
```

Também execute testes Android unitários/instrumentados e o ensaio de desempenho da Spec 015. RLS deve comprovar acesso permitido e bloqueado com dois tenants.

## Roteiro humano

### 1. Acompanhamento do gestor

- Em 1920 e 768 px, abra `/rastreamento`, filtre e entre na viagem A.
- Confirme mapa full-width, lista equivalente, origem, instante, precisão e estado de cada ponto.
- Selecione no mapa e na lista; a seleção deve se corresponder sem roubar foco.
- Simule lacuna e confirme que a linha do trajeto é interrompida e existe item textual.
- Desligue rede/tiles: a lista conhecida permanece com horário e aviso de informação anterior.
- Tente acessar identificador do tenant B: nada deve revelar existência ou posição.
- Meça dez tentativas independentes de um gestor localizar a viagem e explicar corretamente a condição de cada origem, sem ajuda. Registre duração e acerto de cada tentativa; CS-004 passa somente com pelo menos 9 de 10 conclusões corretas em até 30 segundos.

### 2. Coleta do motorista

- Em 360 px, inicie a viagem e conceda localização. Confirme indicação contínua no app e notificação Android.
- No Android 13+, negue `POST_NOTIFICATIONS`: a viagem deve continuar, o FGS deve permanecer conforme o sistema permitir e o app deve informar visibilidade reduzida/degradada com orientação para habilitar notificações; ao conceder, a indicação normal deve reaparecer.
- Coloque o app em segundo plano por alguns minutos; retorne e confira posições próximas da cadência de 1 minuto, sem prometer intervalos exatos.
- Negue localização/reduza precisão: a viagem continua, motorista e gestor veem estado degradado (o gestor com motivo e horário de início na lista de ativas, no acompanhamento e na cronologia) e nenhum afastamento é confirmado.
- Fique offline, gere posições e confira contador/fim da janela. Reconecte na mesma conta/tenant e confirme ordem, horários e ausência de duplicatas.
- Simule 480 itens e expiração de oito horas: a fila permanece e novas coletas pausam até autenticação online.
- Troque conta/tenant/endpoint: itens antigos não podem ser enviados ao novo contexto.

### 3. Proximidade

- Gere duas comparações válidas acima de 100 m e uma dentro: nenhum alerta e sequência reiniciada.
- Gere três válidas consecutivas acima do limite: uma ocorrência e um alerta apenas, com evidências/regra.
- Intercale posição vencida ou precisão acima de 50 m: resultado inconclusivo, sem confirmar nem desfazer.
- Registre uma leitura presencial válida sem GPS contínuo: ela deve aparecer como presença pontual naquele instante, sem ponto móvel inventado, alegação de proximidade contínua ou alteração da sequência `outside_streak`.
- Altere a regra durante uma viagem ativa com justificativa: comparações anteriores mantêm a versão antiga, as seguintes usam a nova, a auditoria registra valores anterior e novo, e uma pessoa sem `proximity_rule.manage` é negada.
- Na entrega, confirme um item por marcação `manual`: ela não deve gerar presença pontual; uma leitura por câmera, NFC ou digitação deve gerar.
- Entregue um dos cilindros: novas comparações desse par devem parar e a vigilância da geocerca de destino deve continuar.
- Sincronize atraso com viagem ativa e depois encerrada: no primeiro caso alerta retrospectivo; no segundo, somente histórico.
- Reconheça e encerre com observação; confirme auditoria imutável e sanitizada para abertura, reconhecimento e encerramento, e que custódia/trava não mudaram.

### 4. Histórico e relatórios

- Consulte por viagem e cilindro; confirme ordem, cursores, lacunas, eventos e alternativa textual.
- Para cada tipo de relatório, compare critérios, geração, totais e linhas.
- Aplique filtros pela URL e recarregue; o recorte deve permanecer.
- Sem resultado, confirme estado vazio e ausência de download enganoso.
- Com `tracking.read` sem `report.export`, consulte e confirme que exportar é negado.
- Exporte CSV e compare recorte/totais. Abra arquivo com textos começando por `=`, `+`, `-`, `@`, tab e CR; nenhum deve executar fórmula.
- Em job demorado, confira `queued`, `processing`, `ready`, `failed` e `expired`; arquivo parcial nunca baixa.

### 5. E-mail e administração

- Com tudo desligado, abra eventos elegíveis: nenhum e-mail.
- Administrador libera uma categoria e a pessoa faz opt-in: abertura gera uma mensagem; retries não duplicam.
- Retire opt-in/permissão/liberação e confirme ausência de novos envios.
- Confirme recuperação quando aplicável; eventos médios/informativos e retrospectivos encerrados não enviam.
- Inspecione fake/log: não deve haver coordenada ou conteúdo excessivo; falha aparece sem alterar alerta.
- Abra o detalhe autorizado do alerta/ocorrência e confirme que uma falha de entrega aparece com estado, instante e código sanitizado, sem encerrar nem duplicar o evento.

### 6. Acessibilidade e responsividade

- Percorra 360, 768 e 1920 px apenas com teclado; foco é visível e não salta durante atualização.
- Confirme nomes acessíveis, títulos, tabela/lista, filtros, diálogo e estados com leitor de tela.
- Verifique que nenhum estado depende só de cor, alvos têm tamanho adequado e movimento reduzido é respeitado.
- Execute axe e confirme ausência de violações críticas/graves.

## Evidências para a validação humana

Registre somente síntese sanitizada: perfis, telas, larguras, fluxos, navegador/SO/dispositivo, duração, resultado e correções. Não copie coordenadas reais, e-mails, tokens ou dados pessoais.

Ao final, o agente deve entrevistar a pessoa responsável e obter: nome; amostra; ambiente; duração; resultado; itens a corrigir; decisão `utilizado`, `adaptado` ou `descartado` e justificativa; autorização explícita para gravar as respostas. Se houver correções, corrigir/testar e entrevistar novamente. Sem resposta ou confirmação, não gerar RIA nem commit de encerramento.

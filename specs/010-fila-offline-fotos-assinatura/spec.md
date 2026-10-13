# Especificação da funcionalidade: Fila offline, fotos e assinatura de entrega no aplicativo de campo

**Branch da funcionalidade**: `feat/010-fila-offline-fotos-assinatura` (criada depois da integração das Specs 008 e 009, PRs #28 a #33)

**Criada em**: 12/10/2026

**Status**: Rascunho (esclarecimentos de 12/10/2026 incorporados)

**Entrada**: Fase 5 do plano de implementação do PRD (`docs/prd.md`, seção 15), segunda parte: operar sem conexão no aplicativo de campo (fila offline com sincronização idempotente), fotos de comprovação e assinatura de quem recebe a entrega, e a confirmação da instalação do aplicativo (PWA) em Android com HTTPS real, pendente da Spec 009. A trava física do lacre e a integração com dispositivos (Fase 6) e o rastreamento contínuo, a proximidade, os alertas e os relatórios (Fase 7) ficam fora.

## Contexto

Com as Specs 008 e 009 a pessoa que está na rua conferiu a carga, registrou a chegada e a entrega lendo os cilindros e usando o GPS do aparelho. Mas **toda escrita exige conexão**: sem sinal, as ações de salvar ficam desabilitadas com o motivo e nada é guardado (Spec 008, RF-027; Spec 009, RF-022). Em pátio, galpão, subsolo de hospital e estrada, o sinal falha justamente na hora de entregar.

Esta spec cumpre a promessa feita nas duas anteriores. Sem sinal, a pessoa continua conferindo, chegando e entregando; o aparelho guarda cada operação numa **fila** e, quando a conexão volta, envia tudo ao servidor, em ordem, sem duplicar e sem perder nada. A entrega também ganha **evidência**: fotos do cilindro entregue e a **assinatura de quem recebeu**. Com isso o princípio V da constituição ("tolerante a operação offline") passa a valer para o aplicativo de campo.

Cinco pontos tornam a spec delicada. **O servidor continua sendo a autoridade**: o que a pessoa fez offline é um **pedido pendente**, validado quando chega, e pode ser recusado (a viagem foi cancelada, o cilindro mudou de situação). **O mesmo pedido pode chegar duas vezes** (queda no meio do envio), e isso nunca pode duplicar registro. **Dado sensível passa a ficar no aparelho**: coordenadas, nome do recebedor, fotos e assinatura esperam a conexão, o que contraria a regra da Spec 009 de não guardar posição no aparelho e precisa de limites explícitos. **Fotos e assinatura são pesadas** e não podem travar o envio do registro principal em 4G. **O relógio do aparelho não é prova**: ele só orienta, e a ordem e a hora de recebimento valem no servidor.

Estas regras continuam valendo: a fila nunca envia a mesma operação a dois destinos Supabase ao mesmo tempo (`docs/arquitetura-conectividade-supabase.md`), toda ação sensível exige permissão conferida no banco e gera auditoria, e nada é excluído fisicamente.

## Clarifications

### Session 2026-10-12

- Q: O que entra na fila offline? → A: **Só as operações de campo de uma viagem já aberta no aparelho**: conferir e desfazer a conferência de um cilindro, registrar a chegada e registrar a entrega (a correção de entrega fica de fora). Planejar, iniciar o carregamento, **iniciar a viagem**, cancelar, concluir, desbloquear e devolver ao estoque continuam exigindo conexão, porque dependem de revalidações do servidor (teste hidrostático, CNH, veículo).
- Q: Como a leitura de um código funciona offline? → A: **Só contra a viagem guardada no aparelho**: o código é comparado aos identificadores dos cilindros daquela viagem. Código que não é da viagem não pode ser classificado como "outra organização" ou "inexistente" sem o servidor; a tela diz "não confirmado sem conexão" e não confere nada. A consulta "Ler cilindro" de cilindros em geral continua exigindo conexão.
- Q: Conflito entre o que foi feito offline e o servidor (viagem cancelada, cilindro retirado, item já conferido por outra pessoa)? → A: **O servidor vence e nada se perde em silêncio**: a operação em conflito fica guardada com os dados originais, marcada como conflito e visível, e uma pessoa autorizada decide descartá-la (com justificativa, auditada) ou reenviá-la depois de corrigir a causa (Spec 002, `docs/arquitetura-conectividade-supabase.md`).
- Q: Com que frequência o aparelho tenta enviar? → A: **Com o aplicativo aberto e conexão disponível, automaticamente**, e também por botão "Enviar agora". Não há promessa de envio com o aplicativo fechado, porque o navegador não garante isso em todos os aparelhos.
- Q: Foto e assinatura entram na fila como parte da entrega? → A: **O registro da entrega é enviado primeiro e sozinho; as fotos e a assinatura seguem depois**, como anexos da entrega, para que arquivos pesados não atrasem nem derrubem o registro principal.
- Q: A foto e a assinatura são obrigatórias na entrega? → A: **Opcionais** (decidido em 12/10/2026): como a posição (Spec 008, RF-013), a entrega continua válida só com o nome do recebedor; sem câmera, sem sinal ou sem recebedor presente, a entrega nunca fica travada. Exigir foto ou assinatura por organização fica para uma spec futura.
- Q: O que pode ficar guardado no aparelho enquanto a operação espera conexão? → A: **Só até o envio ser confirmado pelo servidor, sem apagar nada em silêncio** (decidido em 12/10/2026): posição, nome do recebedor, fotos e assinatura saem do aparelho quando o servidor confirma; se nunca confirmarem, continuam guardados e a pessoa é avisada com texto, para não perder a evidência. Há limite de espaço, com aviso antes de recusar anexos; o registro principal tem prioridade sobre os anexos. Isso substitui, só para a fila e só até o envio, a regra da Spec 009 de não guardar posição no aparelho.
- Q: Quando o aparelho está sem conexão, a pessoa pode continuar registrando depois de 30 minutos parada ou de 8 horas, os limites de sessão da Spec 002? → A: **Offline vale só o teto de 8 horas desde a última confirmação do servidor; a inatividade de 30 minutos não bloqueia offline** (decidido em 12/10/2026). Ao voltar a conexão, o servidor reavalia a sessão antes de enviar; sessão já expirada no servidor exige nova entrada e a fila espera, sem perder nada. Passadas as 8 horas offline, a tela bloqueia o registro de novas operações (a fila continua guardada e visível só como contagem) até haver conexão para entrar de novo.
- Q: Depois que uma entrega já foi registrada, a pessoa pode acrescentar fotos ou a assinatura a ela mais tarde? → A: **Sim, enquanto a viagem estiver em andamento ou concluída há até 7 dias** (decidido em 12/10/2026): "Acrescentar foto ou assinatura" numa entrega já registrada, respeitando os limites de 3 fotos e 1 assinatura, sem alterar o registro da entrega (imutável), com evento e auditoria e com a mesma permissão de operar viagens. Viagem cancelada ou concluída há mais de 7 dias não aceita novos anexos.
- Q: Até quantos dias depois de o aparelho registrar uma operação sem conexão o servidor ainda a aceita ao receber? → A: **7 dias** (confirmado em 12/10/2026): acima disso a operação vira conflito (`STALE_OFFLINE_OPERATION`) e exige decisão humana.
- Q: Quem decide um conflito de sincronização? → A: **Só quem está com o aparelho de origem**, com a permissão de operar viagens (decidido em 12/10/2026): o conflito e os dados do registro ficam só nesse aparelho até a decisão. Gestores e auditores acompanham a **trilha de sincronização** no servidor (operação, resultado, motivo, hora e ator), sem os dados do registro, e não decidem a partir de outro aparelho nesta spec.

## Objetivos

- A pessoa confere a carga, registra a chegada e registra a entrega de uma viagem já aberta no aparelho **sem conexão**, e vê o que está pendente.
- Ao voltar a conexão, tudo é enviado ao servidor em ordem, sem duplicar, sem perder e com retomada depois de qualquer queda.
- Todo conflito com o servidor fica visível, preservado e decidido por uma pessoa autorizada, nunca descartado em silêncio.
- A entrega recebe **fotos** do cilindro entregue e a **assinatura do recebedor**, enviadas sem atrasar o registro principal.
- O aplicativo instala em Android por HTTPS real e funciona instalado, com a fila.
- Coordenadas, nome do recebedor, fotos e assinatura continuam protegidos: fora de log e de auditoria em texto aberto, com permissão por tipo de dado e com limites no aparelho.

## Atores

- **Operador de estoque**: confere a carga offline.
- **Gestor logístico**: confere, registra chegada e entrega offline, fotografa, colhe a assinatura e resolve conflitos.
- **Motorista (cadastro da Spec 007)**: continua sem tela própria com login; quem registra no campo é a pessoa autorizada que usa o celular com a viagem aberta.
- **Administrador do tenant**: tem todas as permissões de viagem e de cilindro.
- **Auditor do tenant**: só consulta; vê a trilha de sincronização, os conflitos e quem os resolveu, sem ação de escrita.
- **Administrador FluxID (perfil global)**: só vê dados de uma organização quando atua com ela como organização ativa.
- **Natã Baracho**: validador oficial da validação humana do ciclo.

## Cenários de usuário e testes

### História 1 — Registrar conferência, chegada e entrega sem conexão (Prioridade: P1)

Com a viagem aberta no aparelho, a pessoa fica sem sinal. Ela continua lendo os cilindros, registrando a chegada e a entrega (com a posição lida do aparelho, o recebedor e o método de leitura). Cada operação **vira um pedido pendente** na fila, com a hora do aparelho, e a tela mostra de forma clara que a operação **ainda não foi enviada** ("Pendente: será enviado quando houver conexão"). A pessoa vê a fila, a contagem de pendentes na barra superior e pode abrir cada item.

**Por que esta prioridade**: é o ganho central da fase e a promessa não cumprida das Specs 008 e 009. Sem ela, o aplicativo de campo para no pátio sem sinal.

**Teste independente**: com uma viagem em andamento aberta no aparelho, ficar offline, conferir os cilindros, registrar a chegada e a entrega, e confirmar que tudo aparece como pendente, que nada foi gravado no servidor e que a fila sobrevive a fechar e abrir o aplicativo.

**Cenários de aceitação**:

1. **Dado** uma viagem "carregando" aberta no aparelho e o aparelho sem conexão, **quando** a pessoa lê ou toca para conferir um cilindro previsto, **então** a conferência fica pendente na fila, a tela mostra o cilindro como "conferido, pendente de envio" e nenhuma escrita chega ao servidor.
2. **Dado** uma viagem "em andamento" aberta no aparelho, **quando** a pessoa registra a chegada e a entrega offline, **então** ambos ficam na fila, na ordem em que foram feitos, e a entrega só pode ser enviada depois da chegada que a antecede.
3. **Dado** operações pendentes, **quando** a pessoa fecha e reabre o aplicativo (ou o aparelho reinicia), **então** a fila continua intacta e a contagem de pendentes aparece.
4. **Dado** o aparelho offline, **quando** a pessoa tenta iniciar a viagem, cancelar, concluir, desbloquear ou devolver, **então** a ação fica desabilitada com o motivo ("exige conexão") e nada é enfileirado.
5. **Dado** o aparelho offline, **quando** a pessoa lê um código que não é de cilindro da viagem guardada, **então** a tela diz "não confirmado sem conexão" e nada é conferido.
6. **Dado** uma operação pendente de conferir, **quando** a pessoa a desfaz antes do envio, **então** a operação sai da fila sem criar evento no servidor.

---

### História 2 — Sincronizar com segurança ao voltar a conexão (Prioridade: P1)

Quando a conexão volta, o aplicativo envia a fila ao servidor, uma operação por vez por viagem, na ordem em que foram feitas. Cada envio leva o **identificador do pedido** já previsto na Spec 008; se o mesmo pedido chegar duas vezes (queda no meio do envio), o servidor devolve o mesmo resultado e **não duplica** nada. A operação só sai da fila depois que o servidor **confirma**. Se o servidor recusar (viagem cancelada, cilindro que mudou de situação, item já conferido por outra pessoa), a operação vira **conflito**: continua guardada com os dados originais, visível, e as que dependem dela esperam.

**Por que esta prioridade**: sem sincronização segura a fila é só um risco de perder ou duplicar registro; é o que fecha o princípio V da constituição.

**Teste independente**: criar operações pendentes, voltar a conexão, enviar e confirmar o servidor com cada registro exatamente uma vez; repetir o envio forçando quedas e reenvios e confirmar que nada duplica; provocar um conflito (cancelar a viagem em outra sessão) e confirmar que ele fica visível e preservado.

**Cenários de aceitação**:

1. **Dado** operações pendentes e a conexão de volta, **quando** o envio roda, **então** o servidor registra cada operação uma só vez, na ordem original, os eventos e a auditoria saem como se a pessoa estivesse online e a fila esvazia.
2. **Dado** uma queda de conexão no meio do envio, **quando** a conexão volta, **então** o envio retoma de onde parou, e uma operação já gravada no servidor mas sem confirmação chegar ao aparelho é reenviada e **não duplica**.
3. **Dado** uma operação cuja viagem foi cancelada em outra sessão, **quando** ela é enviada, **então** o servidor a recusa com o motivo, ela vira "conflito" preservando os dados originais, as operações que dependem dela esperam e as demais viagens seguem.
4. **Dado** um conflito, **quando** uma pessoa com permissão o abre, **então** vê o que foi feito, o motivo da recusa e o estado atual no servidor, e pode **descartar com justificativa** (auditado) ou **reenviar** depois de corrigir a causa; nada é descartado sem essa decisão.
5. **Dado** a sessão expirada durante o envio, **quando** a pessoa entra de novo com a mesma conta e a mesma organização, **então** a fila continua e é enviada; outra conta ou organização **não** vê nem envia a fila alheia.
6. **Dado** que o destino Supabase ativo mudou (nuvem, rede local ou local) com a fila pendente, **quando** o aplicativo tenta enviar, **então** a fila **não** é enviada ao novo destino, a pessoa é avisada e a troca de destino segue a sincronização segura da arquitetura de conectividade; a mesma operação nunca vai a dois destinos.

---

### História 3 — Fotografar a entrega (Prioridade: P2)

Na entrega de uma parada, a pessoa tira fotos do que foi entregue (até três por entrega). O aparelho **reduz e comprime** a imagem, **remove os metadados** (localização e dados do aparelho) e guarda a foto junto à entrega. O registro da entrega é enviado primeiro; as fotos seguem depois, com envio que **retoma** se cair. Quem tem permissão vê as fotos no detalhe da viagem.

**Por que esta prioridade**: é a evidência visual da entrega, mas depende da fila (História 1) e da sincronização (História 2).

**Teste independente**: registrar uma entrega com três fotos offline, voltar a conexão e confirmar que o registro chega primeiro, as fotos depois, sem metadados de localização, e que quem não tem permissão não as vê.

**Cenários de aceitação**:

1. **Dado** a tela de entrega, **quando** a pessoa tira uma foto, **então** a prévia aparece, a foto fica limitada em tamanho e sem metadados, e ela pode refazer ou remover antes de salvar a entrega.
2. **Dado** uma entrega com fotos registrada offline, **quando** a conexão volta, **então** o registro da entrega chega primeiro e as fotos chegam depois como anexos dessa entrega, uma a uma, com retomada em caso de queda.
3. **Dado** uma foto já enviada, **quando** o envio é repetido, **então** o servidor não duplica o anexo.
4. **Dado** um aparelho sem câmera ou com a permissão negada, **quando** a pessoa registra a entrega, **então** a foto não é exigida pelo aparelho e o texto explica o motivo.
4a. **Dado** uma entrega já registrada de uma viagem em andamento (ou concluída há até 7 dias), **quando** a pessoa escolhe "Acrescentar foto ou assinatura", **então** o anexo entra respeitando os limites, o registro da entrega não muda e o histórico mostra que foi acrescentado depois.
4b. **Dado** uma viagem cancelada ou concluída há mais de 7 dias, **quando** a pessoa tenta acrescentar um anexo, **então** a ação não é oferecida e, por pedido direto, o servidor a recusa com o motivo.
5. **Dado** uma pessoa sem permissão para ver os anexos, **quando** abre a viagem, **então** não vê nem consegue baixar as fotos, nem por pedido direto.
6. **Dado** um tenant diferente, **quando** tenta ler um anexo de entrega de outro tenant, **então** o servidor o nega (RLS e permissão por tipo).

---

### História 4 — Colher a assinatura de quem recebeu (Prioridade: P2)

Na entrega, o recebedor **assina com o dedo na tela**. A assinatura é guardada como imagem junto à entrega, com as mesmas regras de proteção do nome do recebedor: só quem tem a permissão de ver o recebedor a vê, e ela **nunca** aparece em evento nem em auditoria. A pessoa pode limpar e assinar de novo antes de salvar.

**Por que esta prioridade**: completa a prova de entrega, mas é menos crítica que a fila e a foto.

**Teste independente**: assinar na entrega offline, voltar a conexão e confirmar que a assinatura chega como anexo, que quem não tem a permissão do recebedor não a vê, e que ela não aparece em histórico nem auditoria.

**Cenários de aceitação**:

1. **Dado** a tela de entrega, **quando** o recebedor assina, **então** o traço aparece na hora, pode ser limpo e refeito, e assinatura vazia (sem traço) não é aceita.
2. **Dado** uma entrega assinada offline, **quando** a conexão volta, **então** a assinatura chega como anexo da entrega, sem duplicar em reenvio.
3. **Dado** uma pessoa sem a permissão de ver o recebedor, **quando** abre a viagem, **então** não vê a assinatura.
4. **Dado** o histórico e a auditoria da entrega, **quando** consultados, **então** mostram apenas que houve assinatura (sim ou não), nunca a imagem.
5. **Dado** uma pessoa que usa só teclado ou tecnologia assistiva, **quando** registra a entrega, **então** a assinatura é opcional e o campo tem alternativa (a spec não torna o gesto obrigatório sem outra forma de confirmar o recebimento).

---

### História 5 — Instalar o aplicativo no Android e usá-lo instalado, com a fila (Prioridade: P2)

A Spec 009 deixou pendente confirmar a instalação em Android: o Chrome do aparelho da validação recusou instalar por `localhost`, enquanto no computador a instalação funcionou. Esta spec confirma a instalação em um **endereço HTTPS real** (ambiente de homologação) e a operação **com o aplicativo instalado**: abrir offline, ver a viagem guardada, usar a fila e enviar ao voltar a conexão, com as telas acessíveis de 360 px a desktop amplo.

**Por que esta prioridade**: fecha a pendência da Spec 009 e é o jeito de a fila ser usada no dia a dia, mas não bloqueia a fila em si.

**Teste independente**: abrir o endereço HTTPS no Android, instalar, abrir pelo ícone sem conexão, usar a fila e enviar ao voltar a conexão; rodar a verificação de acessibilidade nas telas novas.

**Cenários de aceitação**:

1. **Dado** o endereço HTTPS de homologação, **quando** a pessoa abre no Chrome do Android, **então** o botão "Instalar App" (ou o menu do Chrome) instala o aplicativo e o ícone abre em tela cheia.
2. **Dado** o aplicativo instalado e sem conexão, **quando** a pessoa o abre, **então** a estrutura aparece, a viagem guardada abre e a fila está disponível.
3. **Dado** a fila com itens pendentes, **quando** a conexão volta com o aplicativo aberto, **então** o envio começa sozinho e o estado "enviando", "enviado" ou "conflito" aparece em texto.
4. **Dado** as telas da fila, dos conflitos, da foto e da assinatura, **quando** testadas de 360 a 1920 px, **então** não há rolagem horizontal, o foco é visível e a verificação de acessibilidade automatizada passa sem violação crítica ou grave.

---

### Casos de borda

- **Espaço no aparelho acabando**: a fila e os anexos têm limite; ao chegar perto, a tela avisa e deixa de aceitar novas fotos antes de recusar o registro principal.
- **Aparelho sem espaço para guardar**: o registro principal (texto) tem prioridade sobre foto e assinatura; nunca se perde a operação por causa de um anexo.
- **Relógio do aparelho errado**: a hora do aparelho é evidência auxiliar; o servidor guarda a hora de recebimento e valida a hora informada contra a janela aceita (entrega informada com mais de 7 dias de atraso vira conflito). A ordem de aplicação é a da fila, não a da hora.
- **Posição com validade**: a regra de 2 minutos da Spec 009 vale **no momento do registro** no aparelho; no envio posterior o servidor valida a posição contra o **horário informado do registro**, não contra a hora em que a operação chegou.
- **Duas pessoas com a mesma viagem**: se outra pessoa conferiu o mesmo cilindro, a operação offline vira conflito "já conferido", sem duplicar o evento.
- **Viagem alterada no servidor depois de guardada no aparelho** (por exemplo, cilindro retirado da carga): ao enviar, a operação em conflito aparece com o estado atual, e a viagem guardada é atualizada.
- **Mesmo anexo enviado duas vezes** (queda depois do envio): um só anexo no servidor.
- **Foto sem câmera, imagem corrompida ou arquivo grande demais**: a tela explica e o registro da entrega segue.
- **Troca de conta ou saída (logout) com fila pendente**: o aplicativo avisa que há operações não enviadas e não as entrega a outra conta; a pessoa decide enviar antes de sair.
- **Pessoa parada mais de 30 minutos sem conexão**: o registro continua liberado até o teto de 8 horas offline; passado o teto, a tela bloqueia novas operações com o motivo e mantém a fila intacta.
- **Sessão expirada com fila pendente**: a fila fica guardada até nova entrada da mesma conta e organização; nada é descartado por expiração.
- **Conflito que bloqueia dependentes**: uma conferência recusada impede a chegada e a entrega que dependem dela só **na mesma viagem**; as outras viagens seguem.
- **Mesmo aparelho, duas abas**: só uma delas envia a fila por vez, para não enviar a mesma operação em paralelo.
- **Instalação já feita ou recusada**: a tela não insiste; o estado "instalado" aparece em texto.

## Requisitos

### Requisitos funcionais

**Fila offline**

- **RF-001**: Com uma viagem já aberta no aparelho, a conferência e o desfazer de conferência de um cilindro, o registro de chegada e o registro de entrega devem poder ser feitos **sem conexão**, entrando numa fila de operações pendentes, na ordem em que foram feitos.
- **RF-002**: Cada operação pendente deve guardar a operação, os dados originais (incluindo método de leitura, posição e seus metadados), o identificador do pedido (Spec 008), a hora do aparelho e a conta, a organização e o destino Supabase a que pertence.
- **RF-003**: As operações que dependem de revalidação do servidor (planejar, iniciar o carregamento, iniciar a viagem, cancelar, concluir, desbloquear, devolver ao estoque e corrigir entrega) devem continuar **exigindo conexão**, com o motivo em texto, sem entrar na fila.
- **RF-004**: A fila deve sobreviver ao fechamento do aplicativo e à reinicialização do aparelho, e a tela deve mostrar a contagem de pendentes na barra superior e a lista com o estado de cada item: pendente, enviando, enviado, conflito ou falhou.
- **RF-005**: A pessoa deve poder desfazer uma conferência ainda pendente, que sai da fila sem criar evento no servidor.
- **RF-006**: A leitura offline deve comparar o código só com os identificadores dos cilindros da viagem guardada no aparelho; código fora dela deve receber "não confirmado sem conexão" e não conferir nada.
- **RF-007**: A viagem deve ser guardada no aparelho quando a pessoa a abre com conexão, e atualizada a cada abertura online; ao sair da conta a **cópia da viagem** (só de leitura) deve ser removida, depois de avisar sobre as pendências. A **fila e os anexos pendentes nunca são removidos** ao sair da conta: só saem do aparelho quando o servidor confirma o envio ou quando uma pessoa autorizada descarta com decisão registrada.

**Sincronização e conflitos**

- **RF-008**: Ao voltar a conexão, com o aplicativo aberto, a fila deve ser enviada automaticamente, e a pessoa deve poder acioná-la por "Enviar agora".
- **RF-009**: Cada operação deve ser enviada com seu identificador de pedido, de forma que o reenvio da mesma operação devolva o mesmo resultado e **não duplique** registro, evento ou auditoria.
- **RF-010**: As operações de uma mesma viagem devem ser enviadas **uma por vez e em ordem**; viagens diferentes podem ser enviadas em paralelo, e uma operação só sai da fila depois da **confirmação do servidor**.
- **RF-011**: O servidor deve validar cada operação enviada como validaria online (permissão, situação da viagem e do cilindro, geocerca, posição e demais regras da Spec 008 e da Spec 009) e recusá-la com o motivo quando não valer mais.
- **RF-012**: A operação recusada deve virar **conflito**: permanece guardada na fila com os dados originais (os dados sensíveis ficam **só** na própria operação da fila, nunca copiados para o registro do conflito), aparece com o motivo e o estado atual do servidor, e bloqueia só as operações que dependem dela na mesma viagem.
- **RF-013**: A pessoa que está com o aparelho de origem do conflito e tem permissão de operar viagens deve poder **descartar** um conflito com justificativa, ou **reenviá-lo** depois de corrigir a causa; toda decisão deve gerar evento e auditoria, e nenhum conflito pode ser descartado sem decisão; o servidor guarda só a trilha de sincronização (sem os dados do registro), visível a quem pode ver o histórico da viagem, e ninguém decide a partir de outro aparelho.
- **RF-014**: A hora do aparelho deve ser guardada como evidência auxiliar; o servidor guarda a hora de recebimento, e a ordem de aplicação é a da fila. A hora informada de uma entrega é aceita até 7 dias antes do recebimento; além disso a operação vira conflito.
- **RF-015**: A validade da posição (Spec 009) deve ser conferida contra o horário informado do registro, não contra o horário de recebimento no servidor.
- **RF-016a**: Sem conexão, a sessão local vale até **8 horas** desde a última confirmação da sessão pelo servidor, e a regra de 30 minutos de inatividade da Spec 002 **não bloqueia** o registro offline; ao voltar a conexão o servidor reavalia a sessão antes do envio, e a sessão já expirada no servidor exige nova entrada da mesma conta com a fila preservada. Passado o teto de 8 horas offline, novas operações ficam bloqueadas com o motivo em texto até haver conexão, sem apagar nada da fila.
- **RF-016**: A fila deve pertencer à conta, à organização e ao destino Supabase em que foi criada; outra conta ou organização não a vê nem a envia, e a mesma operação nunca é enviada a dois destinos ao mesmo tempo nem a um destino diferente do de origem.
- **RF-017**: Só uma aba ou janela por vez deve enviar a fila, para não enviar a mesma operação em paralelo.

**Fotos e assinatura de entrega**

- **RF-018**: A entrega deve permitir **até 3 fotos**, tiradas na hora, com prévia, opção de refazer e de remover antes de salvar.
- **RF-019**: A foto deve ser reduzida e comprimida no aparelho (lado maior de até 1.600 px e no máximo 1,5 MB), e os **metadados** (localização e dados do aparelho) devem ser removidos antes de ser guardada ou enviada.
- **RF-020**: A entrega deve permitir a **assinatura do recebedor** feita com o dedo, com opção de limpar e refazer; assinatura vazia não vale.
- **RF-021a**: Uma entrega já registrada deve aceitar **foto e assinatura depois**, enquanto a viagem estiver em andamento ou concluída há até 7 dias, dentro dos mesmos limites (3 fotos e 1 assinatura), com a permissão de operar viagens, sem alterar o registro da entrega, gerando evento e auditoria; viagem cancelada ou fora do prazo recusa o anexo com o motivo. Isso também vale offline, para entrega já conhecida no aparelho.
- **RF-021**: O registro da entrega deve ser enviado **antes** dos anexos; as fotos e a assinatura devem seguir como anexos da entrega, um por vez, com **retomada** e sem duplicar em reenvio.
- **RF-022**: Os anexos devem ser guardados em área privada, vinculados à entrega e à organização, sem exclusão física, e entregues só a quem tiver permissão: as fotos a quem pode ver viagens e a assinatura a quem pode ver o recebedor (Spec 008).
- **RF-023**: Foto e assinatura **nunca** devem aparecer em evento, auditoria, log, URL ou mensagem de erro; o histórico mostra só que houve foto ou assinatura e quantas.
- **RF-024**: A foto e a assinatura são **opcionais**: a entrega continua válida só com o nome do recebedor, e a falta de câmera, de sinal ou de recebedor presente nunca impede o registro. Exigi-las por organização fica para uma spec futura.

**Dados guardados no aparelho e privacidade**

- **RF-025**: O que a fila guarda no aparelho (posição, nome do recebedor, fotos e assinatura) deve ficar guardado **só até o servidor confirmar o envio**, e ser removido do aparelho logo depois; nada fora da fila e da viagem guardada pode manter esses dados (em especial `localStorage`, `sessionStorage` e cache de rede), e a regra da Spec 009 de não guardar posição no aparelho continua valendo para tudo o que não for a fila.
- **RF-026**: Nenhum dado pendente deve ser apagado em silêncio por tempo, por falta de sessão ou por limite; operações que ficam sem confirmação por muito tempo devem ser destacadas em texto, e ao se aproximar do limite de espaço a pessoa é avisada, o registro principal tem prioridade sobre os anexos e novas fotos deixam de ser aceitas antes de qualquer recusa do registro.
- **RF-027**: Nenhuma credencial privilegiada, chave `service_role` ou segredo existe no cliente; o envio usa a sessão da pessoa e a permissão conferida no banco.

**Instalação e interface**

- **RF-028**: O aplicativo deve ser instalável em Android por um endereço HTTPS real e funcionar instalado, abrindo sem conexão, com a viagem guardada e a fila (a confirmação da instalação pendente da Spec 009).
- **RF-029**: As telas da fila, dos conflitos, da foto e da assinatura devem seguir o design system e a identidade visual da Spec 005, com estados de carregando, vazio, erro, offline e sincronização, de 360 px a desktop amplo, sem rolagem horizontal, atendendo a WCAG 2.2 AA e operáveis por teclado onde há alternativa.
- **RF-030**: O estado de conexão e o de sincronização devem aparecer em texto na barra superior (pendentes, enviando, conflitos), de forma discreta, sem ocupar a área do corpo.
- **RF-031**: Nenhum dado é excluído fisicamente, e nenhuma permissão nova de domínio é criada sem registro na spec; a fila reaproveita as permissões de conferir carga, registrar entrega e ver viagens da Spec 008, e a resolução de conflito exige a de operar viagens.

### Requisitos não funcionais

- **RNF-001**: Registrar uma operação offline na fila leva até 1 segundo, sem depender da rede.
- **RNF-002**: A fila de uma viagem de 10 cilindros e 3 paradas é enviada em até 30 segundos em conexão 4G.
- **RNF-003**: Uma entrega com 3 fotos e a assinatura termina de enviar em até 60 segundos em conexão 4G, sem bloquear o envio das demais operações.
- **RNF-004**: A fila suporta ao menos 200 operações pendentes e 50 MB de anexos antes de avisar sobre o limite.
- **RNF-005**: As telas atendem WCAG 2.2 AA e o padrão visual da Spec 005 (tokens, componentes, ícones e Montserrat da Spec 003), sem valor arbitrário de Tailwind nem cor literal.
- **RNF-006**: Nenhum segredo, token, coordenada, nome de recebedor, foto ou assinatura entra em log, auditoria em texto aberto ou repositório.
- **RNF-007**: O pacote de entrada não cresce além de 5% sobre a linha de base da Spec 009; câmera de foto, assinatura e fila carregam só quando usadas.

### Regras de negócio

- **RN-001**: A fila **guarda pedidos, não decisões**: quem muda a situação da viagem e do cilindro é a mesma operação da Spec 008, validada pelo servidor quando chega.
- **RN-002**: O servidor vence qualquer conflito de estado; a operação recusada nunca é descartada sem uma decisão humana registrada.
- **RN-003**: Cada operação tem um identificador de pedido único, criado quando entra na fila; o reenvio é seguro.
- **RN-004**: A hora do aparelho é evidência auxiliar e nunca autoridade de ordenação; vale a ordem da fila e a hora de recebimento do servidor.
- **RN-005**: Foto e assinatura são **evidência declarada pelo aparelho**: o sistema guarda e protege, mas não afirma autenticidade.
- **RN-006**: A assinatura e o nome do recebedor têm o mesmo nível de proteção (dado pessoal, só quem tem a permissão do recebedor).
- **RN-007**: A mesma operação nunca é enviada a duas instâncias Supabase; a troca de destino com fila pendente espera a sincronização segura da arquitetura de conectividade.

### Entidades principais

- **Operação pendente (fila)**: pedido guardado no aparelho (operação, dados originais, identificador do pedido, hora do aparelho, conta, organização, destino, estado). Não é registro do servidor; vira registro só quando confirmada.
- **Registro de sincronização**: evento imutável do servidor para cada operação recebida da fila (aplicada, repetida, em conflito, descartada, reenviada), com ator, hora de recebimento e motivo, sem dado sensível.
- **Conflito de sincronização**: operação recusada, preservada com os dados originais, o motivo, o estado do servidor e a decisão (descartada com justificativa ou reenviada).
- **Anexo de entrega**: foto ou assinatura vinculada a uma entrega e à organização, com tipo, tamanho, ordem, resumo (hash) para evitar duplicata e sem exclusão física; a assinatura tem a proteção do recebedor.
- **Viagem guardada no aparelho**: cópia da viagem aberta (paradas, cilindros e identificadores da viagem), usada para operar offline e removida ao sair da conta.
- **Registro de entrega e de chegada (Spec 008 e 009)**: continuam os mesmos; ganham a ligação com os anexos e com o registro de sincronização.

## Critérios de aceitação transversais

- **CA-001**: Nenhuma operação é duplicada nem perdida em 100 reenvios forçados com quedas de conexão em pontos aleatórios.
- **CA-002**: Todo conflito fica visível, preservado e decidido por pessoa autorizada, com evento e auditoria; nenhum é descartado em silêncio.
- **CA-003**: O Tenant B nunca vê, envia, resolve nem lê anexo da fila ou da entrega do Tenant A (RLS testada com dois tenants, com acesso permitido e bloqueado).
- **CA-004**: Nenhuma coordenada, nome de recebedor, foto, assinatura ou valor lido aparece em log, auditoria em texto aberto, URL ou mensagem de erro.
- **CA-005**: Offline, só as operações de campo previstas entram na fila; as demais ficam desabilitadas com o motivo.
- **CA-006**: A fila de uma conta nunca é vista nem enviada por outra conta, organização ou destino.
- **CA-007**: As telas passam na verificação de acessibilidade automatizada (axe) em 360, 768 e 1920 px, sem violação crítica ou grave, e são operáveis só com teclado onde há alternativa.
- **CA-008**: O aplicativo instala e abre offline em Android por HTTPS real, confirmado em aparelho.

## Critérios de sucesso

### Resultados mensuráveis

- **MS-001**: Uma viagem de 4 cilindros e 2 paradas é conferida, chegada e entregue totalmente offline, sem erro, e enviada ao voltar a conexão sem intervenção manual.
- **MS-002**: 0 operação duplicada e 0 operação perdida em 100 reenvios forçados com quedas de conexão.
- **MS-003**: Em 100% dos conflitos provocados nos testes (viagem cancelada, item já conferido, cilindro alterado), a operação fica preservada e visível até uma decisão registrada.
- **MS-004**: Uma entrega com 3 fotos e assinatura termina de enviar em até 60 segundos em 4G, e o registro da entrega chega antes dos anexos.
- **MS-005**: 0 anexo, coordenada ou nome de recebedor em log ou auditoria, e 0 acesso a anexo de outro tenant, em todos os testes de RLS com dois tenants.
- **MS-006**: 0 violação crítica ou grave de acessibilidade e 0 rolagem horizontal em 360, 768 e 1920 px.
- **MS-007**: O aplicativo é instalado e aberto offline em um Android real por HTTPS, confirmado por Natã Baracho.

## Premissas e dependências

- As Specs 008 e 009 estão integradas à `main`; conferência, chegada, entrega, leitura, posição, histórico e o identificador de pedido existem e são estendidos, não substituídos.
- A fila trata só de **um destino Supabase ativo por vez** (`docs/arquitetura-conectividade-supabase.md`); a sincronização entre destinos e a promoção para a nuvem seguem o que a arquitetura já define, e a fila bloqueia a troca de destino enquanto houver pendência.
- O envio automático acontece com o aplicativo aberto; o navegador não garante envio em segundo plano em todos os aparelhos, então a spec não promete isso.
- A foto usa a câmera do aparelho pelo navegador; sem ela, a entrega segue sem foto.
- O prazo de retenção e a anonimização de coordenadas, fotos e assinaturas continuam **fora desta spec** (spec de privacidade futura, T061 da Spec 009); enquanto não existir, os anexos e as coordenadas ficam enquanto a viagem existir, sem exclusão física, e isso precisa ser definido antes de o aplicativo de campo ir a produção.
- A confirmação da instalação em Android exige um endereço HTTPS real de homologação, que esta spec assume disponível ou criado como parte da validação.
- A trava física do lacre (Fase 6) e o rastreamento contínuo, proximidade, alertas e relatórios (Fase 7) estão fora.
- Todo dado de teste é fictício e `@example.invalid`.

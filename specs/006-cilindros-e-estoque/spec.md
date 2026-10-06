# Especificação da funcionalidade: Cilindros, identificadores, estoque e histórico

**Branch da funcionalidade**: `feat/006-cilindros-e-estoque` (criada depois da integração da Spec 005, PR #14)

**Criada em**: 05/10/2026

**Status**: Rascunho

**Entrada**: Fase 2 do plano de implementação do PRD (`docs/prd.md`, seção 15): cadastrar e inativar cilindros sem exclusão física (RF004), manter identificadores (QR Code, Data Matrix, etiqueta NFC e número gravado no casco) e o histórico de eventos (RF005), registrar testes hidrostáticos (RF006), registrar a entrada de um cilindro no estoque sem duplicar a operação (US002) e consultar o histórico de custódia, com eventos ordenados e imutáveis (US008, na parte de cilindros). Segue o AGENTS.md: isolamento por tenant com RLS testada com dois tenants, autorização por permissão, auditoria de toda ação sensível, interface responsiva de 360 px a desktop amplo, WCAG 2.2 AA, PWA e a identidade visual da Spec 005.

## Contexto

Até a Spec 005 o produto tem identidade (Spec 002), design system e shell (Spec 003), menu por permissão (Spec 004) e uma Visão geral com dados de exemplo (Spec 005). Ainda não existe nenhum dado de domínio: o FluxID não sabe que cilindros uma empresa possui. Esta spec cria o primeiro dado real do produto: o **cadastro de cilindros** de cada organização, com os identificadores que permitem reconhecê-los, o **teste hidrostático**, a **entrada no estoque** e o **histórico imutável** de tudo o que aconteceu com cada cilindro.

As Fases 3 a 7 (clientes, frota, viagens, aplicativo de campo, IoT, proximidade e alertas) dependem desta base: toda viagem, leitura e entrega fala de cilindros já cadastrados e identificáveis. Por isso esta spec define só o que é necessário para o cilindro existir, ser reconhecido e ter história, sem antecipar nenhuma dessas fases.

## Clarifications

### Session 2026-10-05

- Q: As operações de escrita desta spec — cadastro, edição, entrada em estoque, testes e identificadores — devem exigir conexão, sem fila offline? → A: Todas as escritas exigem conexão; offline permite apenas abrir a estrutura da PWA.
- Q: Nesta spec, o estoque deve representar apenas se o cilindro está “em estoque” ou “fora do estoque”, sem cadastrar locais físicos? → A: Sim; locais físicos, depósitos, posições e transferências ficam para uma spec futura.
- Q: A tela deve gerar o código para conferência? → A: Sim (decisão da validação humana, 05/10/2026): o detalhe do cilindro mostra, sob demanda, o QR Code ou o Data Matrix do valor de cada identificador ativo desse tipo, sem criar identificador novo.
- Q: A leitura por câmera entra nesta spec? → A: Sim, de forma limitada (validação humana de 05/10/2026): onde o navegador lê código (BarcodeDetector, hoje Chrome no Android), a pessoa pode ler QR Code e Data Matrix pela câmera nos campos de identificador; NFC nativo e o aplicativo de campo seguem na Fase 5.
- Q: Nesta spec, como os valores de QR Code, Data Matrix e NFC devem ser informados? → A: Por digitação, colagem ou leitor que age como teclado, que seguem sempre disponíveis. A leitura de QR Code e Data Matrix pela câmera foi incluída depois, na validação humana (pergunta anterior, RF-045); o NFC nativo e o aplicativo de campo ficam para a Fase 5.
- Q: A Visão geral da Spec 005 deve continuar exibindo somente dados de exemplo durante a Spec 006? → A: Sim; a substituição por métricas reais fica para uma entrega futura.
- Q: Um identificador desativado pode ser reutilizado em outro cilindro da mesma organização? → A: Sim, somente por transferência explícita, atômica, confirmada, justificada e auditada, preservando os históricos de origem e destino.
- Q: Quando um cilindro é inativado, o que acontece com os identificadores ativos dele? → A: Continuam ativos e reservados ao cilindro inativo; a leitura informa que o cilindro está inativo, e o reaproveitamento exige desativação e transferência explícita.
- Q: Uma tentativa direta de apagar um cilindro, teste ou evento no banco deve ser apenas bloqueada, ou também auditada? → A: Bloqueada no banco para qualquer papel; as tentativas feitas pelas funções do aplicativo são auditadas como negadas, e as feitas por SQL direto ficam apenas no log do PostgreSQL.
- Decisões assumidas na análise (`/speckit-analyze`, 05/10/2026), a confirmar na revisão: (a) abrir o cadastro sem permissão é negado pela consulta de permissões ao servidor, antes de exibir o formulário; (b) sem filtro cadastral escolhido, a lista mostra só cilindros ativos; (c) só cilindro ativo é editado; (d) a versão (`version`) sobe a cada edição e a cada mudança de situação cadastral ou de estoque, mas não ao registrar teste ou identificador.
- Q: Quando um teste hidrostático deve mudar de “em dia” para “a vencer”? → A: Quando faltarem 30 dias ou menos.
- Q: Qual volume por organização deve orientar os testes de desempenho da busca e da primeira página da lista? → A: 50 mil cilindros por organização.

## Objetivos

- Cada organização cadastra e mantém os próprios cilindros, e nenhuma outra organização os vê.
- Cada cilindro tem um ou mais identificadores, e um identificador pertence a um só cilindro por vez, dentro da organização.
- Nenhum cilindro é apagado: ele é inativado com justificativa, e sua história permanece.
- O teste hidrostático de cada cilindro é registrado, e a situação do teste (em dia, a vencer, vencido, reprovado) fica visível.
- Registrar a entrada de um cilindro no estoque é uma operação que não duplica quando repetida.
- Toda mudança relevante gera um evento de histórico imutável, ordenado, que permite reconstruir a custódia, e um registro de auditoria.

## Atores

- **Administrador do tenant**: tem todas as permissões de cilindros da própria organização.
- **Estoquista**: cadastra cilindros, registra entradas e consulta o histórico.
- **Técnico**: registra testes hidrostáticos e mantém identificadores.
- **Auditor**: só consulta cilindros e histórico.
- **Administrador FluxID (perfil global)**: opera a plataforma, mas só vê dados de cilindros de uma organização quando atua com ela como organização ativa e com permissão para isso.
- **Alisson Almeida**: responsável pela validação humana do ciclo.

## Cenários de usuário e testes

### História 1 — Cadastrar um cilindro com seu identificador (Prioridade: P1)

Uma pessoa autorizada cadastra um cilindro informando o tipo (gás e capacidade), o número de série gravado no casco, o fabricante, o ano de fabricação e a pressão de trabalho, e vincula o primeiro identificador (QR Code, Data Matrix, etiqueta NFC ou o próprio número do casco). O cilindro aparece na lista da organização.

**Por que esta prioridade**: sem cilindros cadastrados e identificáveis nada mais do produto funciona; é a base de estoque, viagens e entrega.

**Teste independente**: com um administrador de tenant, cadastrar um cilindro com um identificador, vê-lo na lista e abrir o detalhe; com um administrador de outro tenant, confirmar que ele não aparece.

**Cenários de aceitação**:

1. **Dado** uma pessoa com permissão de cadastrar cilindros, **quando** ela preenche os campos obrigatórios e envia, **então** o cilindro é criado ativo, o identificador fica vinculado, um evento "cilindro cadastrado" entra no histórico e um registro de auditoria é gerado.
2. **Dado** um identificador já vinculado a outro cilindro da mesma organização, **quando** a pessoa tenta vinculá-lo, **então** o cadastro é recusado com mensagem que explica o conflito e indica o cilindro que o usa, sem criar nada pela metade.
3. **Dado** o mesmo identificador em outra organização, **quando** ele é vinculado, **então** é aceito, porque a unicidade é por organização.
4. **Dado** campos obrigatórios vazios ou inválidos, **quando** a pessoa envia, **então** cada erro aparece junto do campo, em texto, e o foco vai ao primeiro erro.
5. **Dado** uma pessoa sem a permissão, **quando** ela abre o endereço do cadastro, **então** a tela confirma as permissões no servidor antes de exibir o formulário, nega o acesso sem exibi-lo e não oferece a ação; um envio direto ao servidor também é negado.

---

### História 2 — Consultar a lista e o detalhe dos cilindros (Prioridade: P1)

A pessoa vê a lista de cilindros da organização, busca por identificador ou número de série, filtra por situação e abre o detalhe de um cilindro com identificadores, testes hidrostáticos e histórico.

**Por que esta prioridade**: é como se encontra e confere o que foi cadastrado.

**Teste independente**: com 60 cilindros de exemplo de duas organizações, buscar um identificador na primeira e confirmar que só os dela aparecem, em 360, 768 e 1920 px.

**Cenários de aceitação**:

1. **Dado** a lista, **quando** a pessoa digita um identificador completo ou parte do número de série, **então** a lista mostra só os cilindros que correspondem, sem recarregar a página.
2. **Dado** a lista, **quando** a pessoa filtra por ativo ou inativo, por situação do teste ou por situação de estoque, **então** o resultado respeita os filtros combinados e o total é anunciado. Sem filtro cadastral escolhido, a lista mostra apenas cilindros ativos; a pessoa pode escolher inativos ou todos.
3. **Dado** mais cilindros do que cabem em uma página, **quando** a pessoa avança, **então** a paginação mantém busca e filtros.
4. **Dado** 360 px, **quando** a lista aparece, **então** cada cilindro é um cartão com os dados principais, sem rolagem horizontal; a partir de 768 px a lista é uma tabela.
5. **Dado** um detalhe, **quando** a pessoa o abre, **então** vê os dados do cilindro, os identificadores (ativos e desativados), os testes hidrostáticos e o histórico, cada um em seu bloco.
6. **Dado** nenhuma organização com cilindros, **quando** a lista abre, **então** um estado vazio explica o próximo passo e só oferece "Cadastrar cilindro" a quem tem permissão.

---

### História 3 — Registrar a entrada no estoque sem duplicar (Prioridade: P1)

O estoquista informa o identificador de um cilindro (digitando, colando ou com um leitor que age como teclado) e registra a entrada dele no estoque da organização. Se a operação for repetida, por duplo clique, nova tentativa ou resposta perdida, o sistema reconhece que é a mesma e não cria outra.

**Por que esta prioridade**: é a história US002 do PRD e o primeiro evento real de custódia.

**Teste independente**: registrar a entrada de um cilindro duas vezes com a mesma chave de operação e confirmar um único evento; registrar com identificador desconhecido e confirmar a recusa.

**Cenários de aceitação**:

1. **Dado** um cilindro ativo fora do estoque, **quando** a pessoa registra a entrada pelo identificador, **então** a situação passa para "em estoque", um evento "entrada no estoque" entra no histórico, a auditoria registra a ação e a tela confirma o resultado.
2. **Dado** a mesma operação enviada de novo (mesma chave de operação), **quando** o servidor a recebe, **então** nada é duplicado e a resposta é a mesma da primeira vez.
3. **Dado** um cilindro que já está em estoque, **quando** uma entrada nova (com outra chave) é tentada, **então** ela é recusada com mensagem clara, sem alterar o histórico.
4. **Dado** um identificador que não existe na organização, **quando** a pessoa tenta a entrada, **então** a tela informa que o cilindro não foi encontrado e oferece cadastrá-lo, se tiver permissão.
5. **Dado** um cilindro inativo, **quando** a entrada é tentada, **então** ela é recusada.
6. **Dado** um cilindro com teste hidrostático vencido ou reprovado, **quando** a entrada é registrada, **então** ela é permitida, mas a tela destaca o aviso e o evento guarda a situação do teste no momento (a entrada não esconde o problema nem impede o recebimento físico).
7. **Dado** que a conexão caiu, **quando** a pessoa tenta registrar, **então** a tela informa que a operação exige conexão e não registra nada localmente (fila offline fica para a Fase 5).

---

### História 4 — Registrar e acompanhar testes hidrostáticos (Prioridade: P2)

Uma pessoa autorizada registra um teste hidrostático de um cilindro (data, resultado, laudo, executor e próxima data) e vê a situação do teste na lista e no detalhe.

**Por que esta prioridade**: é segurança regulatória do produto, mas depende do cadastro (História 1).

**Teste independente**: registrar um teste aprovado com próxima data daqui a 6 meses, um a vencer em 20 dias e um reprovado, e conferir a situação mostrada para cada cilindro.

**Cenários de aceitação**:

1. **Dado** um cilindro ativo, **quando** a pessoa registra um teste aprovado com data e próxima data, **então** o teste entra no histórico do cilindro, a situação passa a "em dia" e a auditoria registra a ação.
2. **Dado** a próxima data, **quando** faltam 30 dias ou menos, **então** a situação é "a vencer"; **quando** a data passa, **então** é "vencido", sem ação manual.
3. **Dado** um teste reprovado, **quando** ele é registrado, **então** a situação é "reprovado" até um teste aprovado posterior, e a pessoa vê o aviso no detalhe e na lista.
4. **Dado** um teste já registrado, **quando** a pessoa percebe um erro, **então** ela o corrige por um novo registro que o substitui na leitura (retificação com justificativa); o registro original permanece visível no histórico.
5. **Dado** data futura de realização ou próxima data anterior à realização, **quando** a pessoa envia, **então** o formulário recusa com mensagem junto do campo.

---

### História 5 — Gerenciar identificadores de um cilindro (Prioridade: P2)

Uma pessoa autorizada acrescenta um identificador a um cilindro, desativa um identificador perdido ou danificado e vincula o substituto, sem perder a ligação histórica.

**Por que esta prioridade**: etiquetas se perdem e se trocam; o histórico precisa sobreviver a isso.

**Teste independente**: desativar a etiqueta NFC de um cilindro, vincular uma nova e confirmar que a antiga continua no histórico, não identifica mais o cilindro e não pode ser reutilizada em outro por engano.

**Cenários de aceitação**:

1. **Dado** um cilindro ativo, **quando** a pessoa acrescenta um identificador de qualquer um dos quatro tipos, **então** ele fica ativo no cilindro e entra no histórico.
2. **Dado** um identificador ativo, **quando** a pessoa o desativa com justificativa, **então** ele deixa de identificar o cilindro, permanece listado como desativado, e o evento e a auditoria registram quem, quando e por quê.
3. **Dado** um identificador desativado, **quando** alguém tenta vinculá-lo a outro cilindro, **então** isso só pode ocorrer pela operação explícita de transferência, que exige confirmação e justificativa, acontece atomicamente e registra a auditoria e os históricos dos cilindros de origem e destino.
4. **Dado** um cilindro, **quando** ele fica sem nenhum identificador ativo, **então** a situação "sem identificador" aparece no detalhe e na lista.

---

### História 6 — Inativar e reativar um cilindro, sem apagar nada (Prioridade: P2)

Uma pessoa autorizada inativa um cilindro (baixado, perdido, condenado) com justificativa e pode reativá-lo se a inativação foi engano. Nada é excluído.

**Por que esta prioridade**: o PRD exige que cilindros não sejam excluídos fisicamente.

**Teste independente**: inativar um cilindro em estoque, confirmar a saída do estoque e a presença do histórico; tentar excluir por qualquer caminho e confirmar que não existe.

**Cenários de aceitação**:

1. **Dado** um cilindro ativo, **quando** a pessoa o inativa com motivo e justificativa, **então** ele passa a inativo, sai das buscas de padrão ativo, deixa o estoque (com um evento de saída) e a auditoria registra a ação.
2. **Dado** um cilindro inativo, **quando** a pessoa o reativa com justificativa, **então** ele volta ativo e fora do estoque, e a entrada nova precisa ser registrada.
3. **Dado** qualquer cilindro, **quando** alguém tenta excluí-lo (pela tela ou diretamente no servidor), **então** a operação é impossível e a tentativa é recusada.
4. **Dado** uma ação feita sem justificativa onde ela é obrigatória, **quando** a pessoa confirma, **então** a ação é recusada com mensagem junto do campo.
5. **Dado** um cilindro inativado com identificadores ativos, **quando** um deles é lido ou buscado, **então** os identificadores permanecem ativos e reservados a esse cilindro, a tela informa que ele está inativo e nenhum outro cilindro pode usar o valor, salvo desativação e transferência explícita (RF-011).

---

### História 7 — Consultar o histórico de custódia de um cilindro (Prioridade: P2)

Uma pessoa autorizada abre o histórico de um cilindro e lê, em ordem cronológica, cada evento: cadastro, identificadores, entradas e saídas do estoque, testes, inativações e reativações, com quem fez, quando e por quê.

**Por que esta prioridade**: é a parte desta fase da história US008, que permite ao auditor reconstruir a custódia.

**Teste independente**: executar uma sequência conhecida de ações e comparar o histórico exibido, ordem e conteúdo, com a sequência; tentar alterar ou apagar um evento e confirmar que é impossível.

**Cenários de aceitação**:

1. **Dado** um cilindro com eventos, **quando** a pessoa abre o histórico, **então** vê os eventos do mais recente para o mais antigo, cada um com tipo, data e hora, autor e justificativa quando houver, e pode inverter a ordem.
2. **Dado** o histórico, **quando** alguém tenta alterar ou excluir um evento (pela tela ou diretamente no servidor), **então** isso é impossível; correções são novos eventos que referenciam o anterior.
3. **Dado** dois eventos no mesmo instante, **quando** o histórico é exibido, **então** a ordem é sempre a mesma, determinada pela ordem de registro.
4. **Dado** um auditor, **quando** ele abre o histórico, **então** vê tudo, mas não encontra ação de alteração.
5. **Dado** uma pessoa de outra organização, **quando** ela tenta ver o histórico, **então** o servidor nega, sem revelar se o cilindro existe.

---

### História 8 — Usar tudo em celular, tablet e desktop, só com teclado (Prioridade: P2)

As telas funcionam de 360 px a desktop amplo, em retrato e paisagem, com a identidade visual da Spec 005, e por teclado e leitor de tela.

**Teste independente**: percorrer cadastro, lista, detalhe e entrada em 360, 768 e 1920 px só com Tab, sem rolagem horizontal; rodar a verificação de acessibilidade em cada tela.

**Cenários de aceitação**:

1. **Dado** 360 px, **quando** a pessoa usa qualquer tela, **então** não há rolagem horizontal, os alvos têm 44 por 44 px e o formulário fica em uma coluna.
2. **Dado** o teclado, **quando** a pessoa percorre a tela, **então** a ordem de foco é coerente, o anel de foco aparece sempre, e a lista, o formulário e o histórico são operáveis sem mouse.
3. **Dado** um leitor de tela, **quando** a lista é filtrada ou uma operação termina, **então** o resultado é anunciado uma vez, sem mover o foco.
4. **Dado** os estados de carregamento, vazio, erro e offline, **quando** ocorrem, **então** usam os componentes da Spec 003, e o aviso offline da Spec 003 continua aparecendo.
5. **Dado** a instalação PWA, **quando** o aplicativo é aberto offline, **então** a estrutura abre, e nenhum dado de cilindro é guardado no cache do service worker.

## Requisitos funcionais

### Cadastro e manutenção de cilindros

- **RF-001**: A pessoa autorizada deve poder cadastrar um cilindro com tipo de gás, capacidade, número de série gravado no casco, fabricante, ano de fabricação, pressão de trabalho e observações; número de série, tipo de gás e capacidade são obrigatórios.
- **RF-002**: O número de série deve ser único dentro da organização entre cilindros ativos e inativos, para impedir cadastro duplicado do mesmo casco.
- **RF-003**: A organização deve manter um catálogo de tipos de cilindro (gás, capacidade e classificação medicinal ou industrial), mantido pela mesma permissão de cadastro, e cada cilindro referencia um tipo.
- **RF-004**: A pessoa autorizada deve poder editar os dados cadastrais de um cilindro; cada edição gera evento de histórico com os valores anteriores e novos e é protegida contra edição simultânea (a segunda gravação baseada em dado antigo é recusada com orientação para recarregar). Só cilindro ativo pode ser editado; a versão usada na proteção sobe a cada edição e a cada mudança de situação cadastral ou de estoque, e não sobe ao registrar teste ou identificador.
- **RF-005**: Nenhum cilindro, identificador, teste ou evento pode ser excluído, pela tela ou diretamente no servidor.
- **RF-006**: A pessoa autorizada deve poder inativar um cilindro com motivo (baixado, perdido, condenado ou outro) e justificativa, e reativá-lo com justificativa. A inativação não altera os identificadores: eles continuam ativos e reservados ao cilindro inativo, que não pode receber entrada no estoque (RF-015).

### Identificadores

- **RF-007**: O sistema deve aceitar quatro tipos de identificador: QR Code, Data Matrix, etiqueta NFC e número gravado no casco, cada um com um valor textual.
- **RF-008**: Um valor de identificador ativo deve pertencer a um só cilindro dentro da organização; o mesmo valor pode existir em organizações diferentes.
- **RF-009**: Um cilindro pode ter vários identificadores ativos, de tipos iguais ou diferentes, e deve poder ter ao menos um para entrar no estoque.
- **RF-010**: A pessoa autorizada deve poder acrescentar e desativar identificadores, com justificativa ao desativar; um identificador desativado permanece no histórico e não identifica mais o cilindro.
- **RF-011**: Um identificador desativado só pode ser reutilizado na mesma organização por uma operação explícita de transferência, atômica, confirmada, justificada e auditada; os históricos dos cilindros de origem e destino registram a transferência. Fora dessa operação, o valor permanece indisponível para novo vínculo.
- **RF-012**: A busca por identificador deve ignorar diferença de caixa e espaços nas pontas, e retornar o cilindro dono do identificador ativo.

### Estoque

- **RF-013**: O sistema deve registrar a entrada de um cilindro ativo no estoque da organização a partir de um de seus identificadores ativos.
- **RF-014**: Toda operação de entrada deve levar uma chave de operação gerada no cliente; repeti-la não pode criar evento nem alterar o estado, e a resposta repetida deve ser igual à primeira.
- **RF-015**: A entrada de um cilindro que já está em estoque, ou de um inativo, deve ser recusada com motivo claro.
- **RF-016**: A saída do estoque ocorre nesta spec apenas pela inativação (RF-006); as saídas por entrega pertencem às Fases 3 e 4.
- **RF-017**: A entrada de cilindro com teste vencido ou reprovado deve ser permitida, destacada na tela e registrada no evento com a situação do teste no momento.
- **RF-018**: A situação de estoque do cilindro (em estoque ou fora do estoque) é independente da situação cadastral (ativo ou inativo) e da situação do teste hidrostático, e as três são mostradas separadamente.

### Teste hidrostático

- **RF-019**: A pessoa autorizada deve poder registrar um teste hidrostático com data de realização, resultado (aprovado ou reprovado), número do laudo, executor, próxima data (obrigatória quando aprovado) e observações.
- **RF-020**: A situação do teste deve ser calculada, e não digitada: "em dia" (próxima data a mais de 30 dias), "a vencer" (30 dias ou menos), "vencido" (data passada), "reprovado" (último teste reprovado) ou "sem teste" (nenhum registro).
- **RF-021**: O limite de 30 dias para "a vencer" é único para todo o produto nesta spec, deve ser documentado e não pode ficar espalhado pelas telas.
- **RF-022**: A correção de um teste deve ser feita por retificação com justificativa, que referencia o registro original; o original permanece no histórico.

### Histórico

- **RF-023**: O sistema deve registrar um evento de histórico para cada: cadastro, edição, inativação, reativação, acréscimo de identificador, desativação de identificador, transferência de identificador, entrada no estoque, saída do estoque por inativação, registro de teste e retificação de teste.
- **RF-024**: Cada evento guarda o tipo, o cilindro, a organização, a pessoa autora, o instante, a justificativa quando houver e os dados do fato, e é imutável: não pode ser alterado nem excluído por ninguém, nem pelo administrador do tenant, nem pelo perfil global.
- **RF-025**: A ordem dos eventos deve ser estável e determinística, mesmo para eventos no mesmo instante.
- **RF-026**: A pessoa autorizada deve poder consultar o histórico de um cilindro, filtrar por tipo de evento e período, e a lista deve funcionar com paginação.

### Telas e navegação

- **RF-027**: O menu por permissão (Spec 004) deve ganhar as telas "Cilindros" (lista, cadastro, detalhe e histórico) e "Entrada no estoque", cada uma visível só a quem tem a permissão correspondente, sem alterar nenhuma regra de visibilidade existente.
- **RF-028**: A lista de cilindros deve ter busca (identificador e número de série), filtros (ativo ou inativo, situação do teste, situação de estoque, tipo), ordenação e paginação, com o total anunciado. O filtro cadastral padrão é "ativos".
- **RF-029**: A tela "Entrada no estoque" deve ter um campo de identificador com foco inicial, aceitar Enter para enviar (compatível com leitor que age como teclado) e, depois de cada entrada, limpar o campo e devolver o foco a ele para a próxima leitura.
- **RF-030**: Os formulários devem ter seções na mesma página e um único envio (Spec 003, RF-020), com erros junto dos campos e foco no primeiro erro.
- **RF-031**: As telas devem usar apenas tokens, componentes, ícones, fonte e logotipo da Spec 003 e o padrão visual decidido na Spec 005 (conteúdo em largura disponível, barra superior, menu em gaveta no celular), sem cor, tamanho ou espaçamento fora dos tokens.
- **RF-032**: Dados de exemplo não podem ser misturados a dados reais: a lista de cilindros mostra só dados reais da organização ativa.

### Acessibilidade, PWA e estados

- **RF-033**: As telas devem funcionar de 360 px a desktop amplo, em retrato e paisagem, sem rolagem horizontal de 320 a 1920 px nem com zoom de 200%.
- **RF-034**: As telas devem atender WCAG 2.2 AA: contraste, foco visível, alvos de 44 px, um só `h1` e um só `main`, tabelas com cabeçalhos associados e estado nunca indicado só por cor.
- **RF-035**: Carregamento, vazio, erro e offline devem usar os componentes da Spec 003; operações de escrita não são enfileiradas offline nesta spec e, sem conexão, a tela informa que a operação exige conexão.
- **RF-036**: A instalação e o funcionamento PWA, inclusive offline da estrutura, devem ser preservados; nenhum dado de cilindro, identificador ou histórico pode ser guardado no cache do service worker.
- **RF-037**: As rotas novas devem ser carregadas sob demanda, sem aumentar o pacote de entrada além do limite da Spec 005 (593,95 kB).

### Segurança, multitenancy e auditoria

- **RF-038**: Todas as tabelas novas devem ter `organization_id` e políticas RLS, testadas com pelo menos dois tenants, confirmando acesso permitido e bloqueado para leitura, escrita, histórico e busca por identificador.
- **RF-039**: Cada ação deve exigir uma permissão própria: ver cilindros, cadastrar e editar, inativar e reativar, gerenciar identificadores, registrar entrada, registrar teste e ver histórico; as permissões são atribuídas aos papéis padrão (administrador do tenant: todas; estoquista: ver, cadastrar, entrada e histórico; técnico: ver, identificadores, teste e histórico; auditor: ver e histórico) e a decisão final é sempre do servidor.
- **RF-040**: Toda ação sensível (cadastro, edição, inativação, reativação, identificadores, entrada, teste e retificação) deve gerar um registro de auditoria imutável com autor, organização, instante e justificativa, sem dados pessoais desnecessários.
- **RF-041**: Nenhuma credencial privilegiada pode existir no cliente; todo acesso a dados passa pelas regras do servidor com a sessão da pessoa.
- **RF-042**: Respostas de negação não podem revelar a existência de cilindros de outra organização.
- **RF-043**: A organização ativa vem do servidor, e nenhuma ação aceita uma organização enviada pelo cliente que não corresponda à da sessão.

## Requisitos não funcionais

- **RF-044**: O detalhe do cilindro deve permitir ver, sob demanda, o símbolo do valor de cada identificador **ativo** do tipo QR Code (QR) ou Data Matrix (Data Matrix), com texto alternativo e o valor ao lado, para conferência com leitor; identificadores desativados, NFC e número do casco não geram símbolo. O símbolo é gerado no navegador, sem enviar o valor a terceiros, e não grava nada nem cria identificador.
- **RF-045**: Nas telas de entrada no estoque, busca da lista, cadastro e acréscimo de identificador, quando o navegador oferece `getUserMedia` e `BarcodeDetector` com suporte (consultado por `getSupportedFormats`) a `qr_code`, `data_matrix` ou a ambos, deve existir "Ler com a câmera": abre um diálogo com a imagem, lê QR Code ou Data Matrix, entrega o valor ao campo (na entrada no estoque, registra a entrada em seguida), desliga a câmera ao terminar ou cancelar e explica a negação de permissão. Nada é gravado nem enviado do aparelho; onde não há suporte, o botão não aparece e a digitação e o leitor-teclado seguem valendo.
- **RNF-001**: Busca por identificador responde em até 1 s no percentil 95 com 50 mil cilindros na organização, no ambiente de teste.
- **RNF-002**: A lista de cilindros mostra a primeira página em até 2 s no percentil 95 com 50 mil cilindros, em conexão de teste de 4G.
- **RNF-002a**: O volume de referência oficial para planejamento de capacidade e testes de desempenho é de 50 mil cilindros por organização.
- **RNF-003**: O pacote de produção de entrada continua dentro do limite de +5% sobre a linha de base da Spec 005 (593,95 kB); as telas novas carregam em chunks próprios.
- **RNF-004**: Sem dependência nova de execução, salvo decisão registrada no plano (exceção registrada: `bwip-js`, MIT, para RF-044, carregada sob demanda em chunk próprio).
- **RNF-005**: Concorrência: duas pessoas editando o mesmo cilindro não perdem alterações silenciosamente (RF-004).

## Regras de negócio

- Cilindros, identificadores, testes e eventos nunca são excluídos fisicamente.
- Situação cadastral, situação de estoque e situação do teste são estados independentes (Constituição, princípio IV).
- A situação do teste é sempre calculada a partir dos registros e da data de hoje.
- Eventos de histórico e auditoria são imutáveis; correções são novos registros.
- Entrada no estoque é idempotente por chave de operação.
- Um identificador ativo pertence a um só cilindro por organização.
- Justificativa é obrigatória em inativação, reativação, desativação e transferência de identificador e retificação de teste.
- Nenhum dado de cilindro vem de dados de exemplo.

## Critérios de aceitação transversais

- **CA-001**: Um cilindro cadastrado por uma organização nunca é visível, buscável nem alterável por outra, comprovado por testes de RLS com dois tenants para cada tabela.
- **CA-002**: Repetir uma entrada com a mesma chave de operação 10 vezes produz um único evento e a mesma resposta.
- **CA-003**: Nenhuma operação de exclusão de cilindro, identificador, teste ou evento existe na interface nem é aceita pelo servidor; tentativa direta no banco é recusada para qualquer papel, e a tentativa feita pelas funções do aplicativo é recusada e auditada como negada (tentativas por SQL direto ficam apenas no log do PostgreSQL).
- **CA-004**: Nenhum evento de histórico pode ser alterado ou excluído por papel algum.
- **CA-005**: Toda ação sensível gera evento e auditoria, conferido por teste por ação.
- **CA-006**: Nenhuma violação crítica ou grave de acessibilidade (axe) nas telas novas em 360, 768 e 1920 px; sem rolagem horizontal de 320 a 1920 px nem com zoom de 200%.
- **CA-007**: A estrutura das telas abre offline, e nenhum dado de cilindro fica no cache do service worker.
- **CA-008**: Os valores de situação do teste (em dia, a vencer, vencido, reprovado, sem teste) são calculados corretamente nos limites de data, comprovado por testes de domínio.
- **CA-009**: Capturas visuais de referência das telas novas existem em três larguras, geradas no Linux.
- **CA-011**: Para um identificador ativo QR Code ou Data Matrix, o detalhe mostra o símbolo correto sob demanda (RF-044); desativados, NFC e número do casco não oferecem o símbolo; a biblioteca não entra no pacote de entrada.
- **CA-010**: Pacote de entrada dentro de 593,95 kB.

## Cenários de exceção e casos de borda

- Identificador com maiúsculas, minúsculas ou espaços nas pontas: tratado como o mesmo valor (RF-012).
- Identificador de leitor com Enter no fim ou prefixo: o campo remove quebras de linha e espaços das pontas.
- Duas pessoas cadastram o mesmo número de série ao mesmo tempo: uma é aceita e a outra recebe o conflito, sem duplicar.
- Duas pessoas inativam o mesmo cilindro: a segunda recebe aviso de que ele já está inativo.
- Entrada repetida por duplo clique ou resposta perdida: não duplica (RF-014).
- Perda de conexão no meio do envio: a tela mostra estado desconhecido e permite repetir com a mesma chave, sem criar duplicata.
- Pessoa perde a permissão com a tela aberta: a ação seguinte é recusada pelo servidor e a tela atualiza o que mostra.
- Organização ativa trocada com a tela aberta: a tela recarrega com a nova organização, sem mostrar dados da anterior.
- Tenant suspenso: leitura e escrita negadas como nas specs anteriores.
- Teste com próxima data muito distante ou data de fabricação futura: validação recusa com mensagem.
- Cilindro com muitos eventos (milhares): o histórico pagina, sem carregar tudo.
- Tentativa de exclusão direta no banco: rejeitada para qualquer papel; registrada apenas no log do PostgreSQL. Tentativa pelas funções do aplicativo: rejeitada e auditada como negada.
- Identificador ativo de cilindro inativo lido na entrada: informa que o cilindro está inativo e recusa a entrada (RF-015).
- Identificador desativado lido na entrada: informa que foi desativado e a quem pertencia, sem identificar como cilindro ativo.

## Requisitos de acessibilidade e experiência

- Lista em tabela a partir de 768 px, com cabeçalhos, e em cartões abaixo disso.
- Situação do teste, de estoque e cadastral com texto e ícone, nunca só cor.
- Mensagens de erro em português, junto do campo, sem culpar a pessoa.
- Formulários com rótulos visíveis, ajuda e erros associados aos campos.
- Confirmação por diálogo acessível nas ações que inativam, desativam ou transferem, devolvendo o foco ao acionador.
- Anúncios de resultado em região de status, uma vez, sem mover o foco.
- Movimento reduzido respeitado; nada pisca mais de três vezes por segundo.

## Entidades principais

- **Tipo de cilindro**: gás, capacidade e classificação (medicinal ou industrial) de uma organização.
- **Cilindro**: o casco individual, com número de série, tipo, fabricante, ano, pressão de trabalho, situação cadastral e situação de estoque.
- **Identificador**: valor textual de um tipo (QR Code, Data Matrix, NFC ou número do casco) vinculado a um cilindro, ativo ou desativado.
- **Teste hidrostático**: registro de um teste de um cilindro, com resultado, laudo, executor e próxima data; retificações referenciam o original.
- **Evento de histórico**: fato imutável sobre um cilindro, com autor, instante e justificativa.
- **Operação de entrada**: a solicitação de entrada no estoque, com chave de operação que a torna idempotente.
- **Registro de auditoria**: já existente (Spec 002), ampliado com as ações novas.

## Dependências

- Spec 002: autenticação, organizações, papéis, permissões, RLS e auditoria.
- Spec 003: design system, shell, estados e escalas.
- Spec 004: menu por permissão e consulta de permissões do servidor.
- Spec 005: padrão visual, Visão geral e divisão do pacote por rota.
- `docs/arquitetura-conectividade-supabase.md`: seleção de destino Supabase e regras de sincronização.

## Premissas e decisões assumidas

1. Cada organização (tenant) tem os próprios cilindros; o escopo é sempre a organização ativa da sessão.
2. O "estoque" desta fase possui somente as situações independentes "em estoque" e "fora do estoque" na organização; locais físicos, depósitos, posições, transferências, endereçamento e contagem por local ficam para uma spec futura.
3. Nesta spec, valores de QR Code, Data Matrix e NFC são informados por digitação, colagem ou leitor que se comporta como teclado, e, para QR Code e Data Matrix, também pela câmera quando o navegador a suporta (RF-045). NFC nativo e o aplicativo de campo pertencem à Fase 5; o contrato já suporta os quatro tipos.
4. As operações de escrita exigem conexão e nunca são enfileiradas localmente nesta spec. Fila offline, sincronização e resolução de conflitos pertencem à Fase 5; a entrada é idempotente desde já para que ela possa ser reaproveitada.
5. Fotos de cilindros, importação assistida em massa e exportação de relatórios (RF020) ficam para spec própria.
6. A Visão geral continua com os dados de exemplo da Spec 005; substituir a fonte por métricas reais fica para uma entrega futura.
7. O limite de 30 dias para "a vencer" é uma regra única e fixa para todo o produto nesta spec.
8. Permissões novas seguem o modelo da Spec 002 e são incluídas por migration nos papéis padrão; nenhum papel existente perde permissão.
9. Os dados de teste usam e-mails `@example.invalid` e organizações de seed; nenhum dado real é usado.

## Fora do escopo

- Clientes, unidades, geocercas, frota, motoristas, viagens, paradas e entregas (Fases 3 e 4).
- Aplicativo de campo, leitura NFC, GPS e operação offline com fila (Fase 5). A leitura por câmera limitada a RF-045 está dentro do escopo.
- Lacres, IoT, comandos e telemetria (Fase 6).
- Proximidade, alertas e relatórios (Fase 7).
- Fotos de cilindros, importação em massa e exportação de relatórios.
- Locais de estoque e contagens por local.
- Troca dos dados de exemplo da Visão geral por dados reais.

## Métricas de sucesso

- **MS-001**: Uma pessoa autorizada cadastra um cilindro com identificador em até 90 segundos na primeira tentativa, sem ajuda.
- **MS-002**: Registrar a entrada de um cilindro pelo identificador leva até 10 segundos, e uma sequência de 20 entradas com leitor tipo teclado é concluída sem tocar no mouse.
- **MS-003**: Em 100% das repetições de uma mesma entrada não há duplicata.
- **MS-004**: 0 vazamento de dados entre organizações nos testes de RLS com dois tenants.
- **MS-005**: Um auditor reconstrói a custódia de um cilindro de exemplo só pelo histórico, sem consultar outra fonte, em até 2 minutos.
- **MS-006**: 0 violações críticas ou graves de acessibilidade e 0 rolagem horizontal de 320 a 1920 px.
- **MS-007**: Validação humana por entrevista aprovada pela pessoa responsável, em celular e desktop.

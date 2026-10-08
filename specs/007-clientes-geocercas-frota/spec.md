# Especificação da funcionalidade: Clientes, unidades, geocercas, veículos e motoristas

**Branch da funcionalidade**: `feat/007-clientes-geocercas-frota` (criada depois da integração da Spec 006, PRs #17, #19 e #20)

**Criada em**: 06/10/2026

**Status**: Rascunho

**Entrada**: Fase 3 do plano de implementação do PRD (`docs/prd.md`, seção 15): gerenciar clientes, unidades e geocercas (RF007) e gerenciar veículos e motoristas (RF008), como pré-requisito da jornada do PRD (passo 2: "cadastrar clientes, unidades, geocercas, veículos e motoristas"). Segue o AGENTS.md: isolamento por tenant com RLS testada com dois tenants, autorização por permissão, auditoria de toda ação sensível, interface responsiva de 360 px a desktop amplo, WCAG 2.2 AA, PWA e a identidade visual da Spec 005.

## Contexto

Com a Spec 006 o FluxID sabe quais cilindros cada organização possui. Ainda não sabe **para quem** entregá-los, **onde** ficam os clientes, **em que veículo** e **com qual motorista**. A Fase 4 (viagens, paradas e cargas) depende de tudo isso: cada parada tem um cliente e uma unidade de destino, cada viagem tem veículo e motorista, e a proximidade da Fase 7 usa a geocerca da unidade. Esta spec cria esses quatro cadastros de base, completos, com situação, histórico imutável e auditoria, sem antecipar nenhuma viagem, leitura de campo ou alerta.

Três pontos tornam esta spec diferente da anterior: o **endereço** da unidade é preenchido a partir do CEP, por um serviço público externo; o cadastro de **motoristas** e de clientes pessoa física guarda documentos pessoais (CPF e CNH), o que traz requisitos de proteção de dados; e, por isso, a spec também oferece a **anonimização irreversível** desses dados pessoais, sem apagar nenhum cadastro nem o histórico.

## Clarifications

### Session 2026-10-06

- Q: Como guardar a geocerca? → A: Com PostGIS, habilitado por migration, com índice espacial e consulta "ponto dentro da geocerca"; a geocerca é círculo (centro e raio) ou polígono.
- Q: O motorista é só cadastro ou fica vinculado a um usuário do sistema? → A: Cadastro com vínculo opcional a um usuário da mesma organização, para o aplicativo de campo da Fase 5; sem o vínculo o cadastro funciona.
- Q: Como tratar o endereço da unidade? → A: A pessoa informa o CEP, o sistema busca logradouro, bairro, cidade e UF na API pública ViaCEP e a pessoa complementa número, complemento e demais campos; ela pode sempre digitar o endereço inteiro.
- Q: O que sai para o serviço externo de CEP? → A: Somente o CEP, nunca número, complemento, nome, documento ou qualquer outro dado; a chamada é feita pelo servidor, com limite de taxa e tempo máximo, e o provedor deve ser substituível.
- Q: O escopo é a Fase 3 inteira? → A: Sim: clientes, unidades, geocercas, veículos e motoristas, em uma só spec.
- Decisões assumidas na especificação, ainda não perguntadas por terem baixo impacto: (a) o veículo tem uma única situação (disponível, em manutenção ou inativo); (b) o limite de 30 dias para "a vencer" da Spec 006 vale também para o licenciamento do veículo e a validade da CNH. As decisões sobre cascata de inativação e sobre documentos mascarados foram confirmadas na sessão de 07/10/2026 (abaixo).

### Session 2026-10-07

- Q: Ao inativar um cliente, o que deve acontecer com as unidades e geocercas ativas dele? → A: Inativa tudo na mesma operação atômica, cada item com o próprio evento; reativar o cliente reativa só o cliente, e unidades e geocercas voltam uma a uma (RF-035).
- Q: Quem pode revelar o CPF e a CNH completos, e por quanto tempo eles ficam visíveis? → A: Só o administrador do tenant, pela permissão "ver documentos", registro a registro e sob demanda; o documento fica visível até a pessoa ocultá-lo ou sair da tela, e cada revelação é auditada (RF-030).
- Q: Qual limite de buscas de CEP por pessoa e por organização? → A: 10 buscas por minuto por pessoa e 100 por minuto por organização; ao exceder, a tela informa que o limite foi atingido, diz quando tentar de novo e mantém a digitação manual (RF-010).
- Q: Quais usuários da organização podem ser vinculados a um motorista? → A: Só usuários ativos da mesma organização que já têm o papel `driver`; a tela lista só esses, o servidor recusa os demais e o vínculo não concede nem altera nenhum papel (RF-027).
- Q: O que acontece quando uma geocerca nova se sobrepõe a outra geocerca ativa da mesma unidade? → A: É permitido e a tela avisa com qual geocerca há sobreposição, sem bloquear; a consulta de ponto devolve todas as geocercas que o contêm (RF-016a).
- Q: O documento do cliente, a placa do veículo e o CPF e a CNH do motorista podem ser corrigidos depois do cadastro? → A: Sim, por edição com justificativa obrigatória; a unicidade por organização continua valendo e o evento de CPF e CNH registra apenas que o campo foi alterado, enquanto o de CNPJ e placa registra o valor antigo e o novo (RF-004a).
- Q: O sistema deve buscar as coordenadas pelo endereço? Qual provedor e quando confirmar? → A: Sim; o servidor geocodifica o endereço com Nominatim/OpenStreetMap atrás de uma porta substituível; a pessoa confirma endereço e ponto antes de gravar (cadastro, nesta spec) e o motorista reconfirma na primeira entrega à unidade (requisito da Fase 4) (RF-065 a RF-069, CA-018).
- Q: Como mostrar o mapa e os pontos das unidades? → A: Leaflet com blocos do OpenStreetMap, sob demanda; a Visão geral mostra as unidades com coordenadas (80% mapa, 20% indicadores empilhados); abre-se uma exceção na regra de recursos de terceiros só para o domínio dos blocos (RF-070).
- Q: A janela de recebimento da unidade é um horário único ou varia por dia da semana? → A: Uma só faixa de horário (inicial e final) aplicada aos dias da semana marcados; o horário final deve ser depois do inicial, sem faixa que atravesse a meia-noite, e pelo menos um dia marcado quando houver horário (RF-005).
- Q: Segmento do cliente e tipo do veículo são listas fixas ou mantidas por organização? → A: Listas fixas do produto, com a opção "outro" que abre um campo de texto de até 60 caracteres para detalhar; não há tela nem permissão de manutenção de catálogo nesta spec (RF-001 e RF-019).
- Q: A spec deve oferecer a anonimização dos dados pessoais sensíveis? → A: Sim (decisão de 07/10/2026): esta spec inclui a anonimização irreversível de CPF, número da CNH, nome, telefone e e-mail de pessoas físicas (motorista, cliente pessoa física e contato de cliente), sem excluir nenhum cadastro e sem apagar o histórico (RF-054 a RF-063).
- Q: Quem pode anonimizar e com que exigências? → A: Só o administrador do tenant, por permissão própria, com MFA, motivo, justificativa e confirmação digitada; motorista e cliente pessoa física precisam estar inativos antes (RF-055 e RF-056).
- Q: A anonimização por "fim do prazo de retenção" é manual ou automática? → A: Sempre manual: o administrador decide e executa; "fim do prazo de retenção" é só um motivo registrado, e não há rotina agendada, prazo configurável nem anonimização automática nesta spec (RF-056).
- Q: A anonimização exige aprovação de uma segunda pessoa? → A: Não: basta um administrador do tenant com permissão crítica, MFA, registro inativo, motivo, justificativa e confirmação digitada, e a auditoria identifica quem anonimizou; fluxo de pedido e aprovação em dupla fica fora desta spec (RF-055 e RF-056).
- Q: Um registro anonimizado aparece nas listas e na busca? → A: Aparece como inativo, com o nome fixo e o selo "anonimizado", só nas visões "inativos" e "todos" (o filtro padrão continua "ativos"), e não é achado pelos valores que tinha; o contato anonimizado permanece na lista de contatos do cliente com o nome fixo (RF-058).
- Q: Onde ficam os formulários de cadastro e edição? → A: Em modal (decisão de 07/10/2026), sobre a lista no cadastro e sobre o detalhe na edição, para a pessoa não perder o lugar nem recarregar a tela. O endereço do modal continua valendo como link direto e o botão Voltar do navegador fecha o modal (RF-064).
- Q: O tipo de pessoa do cliente pode ser alterado depois do cadastro? → A: Não: o tipo (física ou jurídica) é fixo; quem errou o tipo inativa o cliente e cadastra outro, e a correção de documento (RF-004a) vale só dentro do mesmo tipo (RF-001).
- Q: Ao inativar um motorista, o vínculo com o usuário é mantido ou removido? → A: Mantido: a inativação não mexe no vínculo, que volta a valer na reativação; o usuário continua ligado a esse motorista (e não pode ser ligado a outro) até alguém desvincular, o que é permitido mesmo com o motorista inativo; só a anonimização remove o vínculo sozinha (RF-027).
- Decisões assumidas na análise (`/speckit-analyze`, 07/10/2026), a confirmar na validação humana: (a) **contatos do cliente**: telefone e e-mail só são devolvidos a quem tem `customer.write`, e os demais papéis veem nome e função (RF-003); (b) **veículo**: em manutenção é editável, inativo não é editável e só volta para "disponível" (RF-021 e RF-034); (c) **o que a anonimização não alcança**: endereço de unidade e geocercas (rastreabilidade das entregas), categoria e validade da CNH, identificadores internos, cópias de segurança e logs da plataforma (premissa 14).

## Objetivos

- Cada organização cadastra e mantém os próprios clientes, unidades, geocercas, veículos e motoristas, e nenhuma outra organização os vê.
- O endereço de uma unidade se preenche a partir do CEP, sem nunca impedir o cadastro quando o serviço de CEP falha.
- Cada unidade pode ter geocercas, e o servidor sabe dizer quais geocercas ativas contêm um ponto.
- Nada é apagado: tudo é inativado com justificativa, e a história permanece.
- Documentos pessoais (CPF e CNH) são coletados no mínimo, mascarados e nunca aparecem em log nem em auditoria em texto aberto.
- Toda mudança relevante gera um evento de histórico imutável e um registro de auditoria.
- Dados pessoais de pessoas físicas podem ser anonimizados de forma irreversível, mediante autorização, MFA e justificativa, sem apagar o cadastro nem o histórico.

## Atores

- **Administrador do tenant**: tem todas as permissões da Fase 3 na própria organização, inclusive revelar CPF e CNH e anonimizar dados pessoais (com MFA).
- **Operador de estoque**: consulta clientes, unidades, geocercas, veículos e motoristas (sem documentos completos).
- **Operador técnico**: consulta veículos e a lista de clientes e unidades.
- **Auditor**: só consulta e vê o histórico, sem revelar documentos.
- **Motorista (papel `driver`)**: nesta spec não acessa nenhuma tela de cadastro; o vínculo dele com o cadastro de motorista serve à Fase 5.
- **Administrador FluxID (perfil global)**: só vê dados de uma organização quando atua com ela como organização ativa e com permissão para isso.
- **Natã Baracho**: validador oficial da validação humana do ciclo (confirmado pelo responsável pelo projeto em 08/10/2026; antes constava Alisson Almeida).

## Cenários de usuário e testes

### História 1 — Cadastrar um cliente com uma unidade, endereço pelo CEP (Prioridade: P1)

Uma pessoa autorizada cadastra um cliente (pessoa jurídica ou física) com documento, nome, segmento e contatos, e acrescenta uma unidade: informa o CEP, o sistema preenche logradouro, bairro, cidade e UF, e a pessoa completa número, complemento, coordenadas, responsável e janela de recebimento e instruções de acesso.

**Por que esta prioridade**: sem cliente e unidade não existe destino de entrega; é a base de viagens, paradas e geocercas.

**Teste independente**: com um administrador de tenant, cadastrar um cliente com uma unidade usando um CEP válido, ver os dados do endereço preenchidos, salvar e abrir o detalhe; com um administrador de outro tenant, confirmar que nada aparece.

**Cenários de aceitação**:

1. **Dado** uma pessoa com permissão de cadastrar clientes, **quando** ela preenche os campos obrigatórios e envia, **então** o cliente é criado ativo, um evento "cliente cadastrado" entra no histórico e um registro de auditoria é gerado, sem o documento em texto aberto.
2. **Dado** o formulário de unidade, **quando** a pessoa informa um CEP válido e sai do campo ou aciona "Buscar CEP", **então** logradouro, bairro, cidade e UF são preenchidos, o foco vai ao campo "Número", e os campos continuam editáveis.
3. **Dado** um CEP bem formado que não existe, **quando** a busca termina, **então** a tela informa "CEP não encontrado" e deixa digitar o endereço inteiro.
4. **Dado** que o serviço de CEP falhou, demorou além do limite ou a pessoa está sem conexão, **quando** a busca termina, **então** a tela informa que não foi possível buscar agora, mantém tudo o que a pessoa digitou e permite preencher o endereço à mão e salvar normalmente.
5. **Dado** um CNPJ ou CPF com dígitos verificadores inválidos, **quando** a pessoa envia, **então** o erro aparece junto do campo, em texto, e o foco vai ao primeiro erro.
6. **Dado** um documento já cadastrado na mesma organização, **quando** a pessoa tenta cadastrá-lo, **então** o cadastro é recusado com mensagem que indica o cliente existente, sem criar nada pela metade; em outra organização o mesmo documento é aceito.
7. **Dado** uma pessoa sem a permissão, **quando** ela abre o endereço do cadastro, **então** a tela confirma as permissões no servidor antes de exibir o formulário, nega o acesso e não oferece a ação; um envio direto ao servidor também é negado.
8. **Dado** um endereço completo (logradouro, número, bairro, cidade e UF), **quando** a pessoa aciona "Buscar coordenadas", **então** o servidor consulta o provedor de geocodificação e a tela mostra latitude e longitude encontradas, o endereço normalizado devolvido pelo provedor e uma pré-visualização em texto; nada é gravado até a pessoa confirmar.
9. **Dado** as coordenadas sugeridas, **quando** a pessoa marca "Confirmo que o endereço e o ponto encontrados estão corretos." e salva, **então** a unidade é gravada com latitude, longitude, origem `geocodificada`, quem confirmou e quando; **quando** ela edita as coordenadas à mão, a origem passa a `manual`; **quando** altera o endereço depois de confirmar, a confirmação é descartada e a tela pede nova busca e nova confirmação.
10. **Dado** que a geocodificação não encontrou o endereço, ficou indisponível, estourou o tempo ou o limite de taxa, **quando** a busca termina, **então** a tela informa o motivo, mantém tudo o que foi digitado e permite informar as coordenadas à mão ou salvar sem coordenadas.
11. **Dado** uma unidade com coordenadas e ainda sem entrega concluída, **quando** a primeira entrega a ela for registrada (Fase 4), **então** o motorista deverá confirmar o endereço e o ponto antes de concluir; a confirmação fica no histórico da unidade. Nesta spec fica gravado o marcador `primeira_entrega_confirmada` (inicialmente falso) e o requisito para a Fase 4; a tela de entrega não faz parte desta spec.

---

### História 2 — Consultar clientes e unidades (Prioridade: P1)

Uma pessoa autorizada encontra clientes e unidades por busca e filtros, abre o detalhe de um cliente com suas unidades, contatos e geocercas, e vê a situação de cada um.

**Por que esta prioridade**: é como se encontra e confere o que foi cadastrado.

**Teste independente**: com 60 clientes de exemplo de duas organizações, buscar um nome na primeira e confirmar que só os dela aparecem, com paginação e total anunciado.

**Cenários de aceitação**:

1. **Dado** uma lista paginada, **quando** a pessoa busca por nome, nome fantasia, documento, cidade ou nome da unidade, **então** a lista mostra só os resultados da organização ativa, e o total é anunciado.
2. **Dado** os filtros de situação, segmento, UF e se tem geocerca, **quando** a pessoa os combina, **então** o resultado respeita todos, e o filtro de situação padrão é "ativos".
3. **Dado** um cliente com CPF, **quando** a lista e o detalhe são exibidos, **então** o CPF aparece mascarado; o CNPJ aparece completo.
4. **Dado** um cliente sem unidades, **quando** a pessoa abre o detalhe, **então** a tela mostra o estado vazio com a ação de acrescentar a primeira unidade, se ela tiver permissão.
5. **Dado** a lista em 360 px, **quando** ela é exibida, **então** vira cartões, sem rolagem horizontal.

---

### História 3 — Definir a geocerca de uma unidade (Prioridade: P1)

Uma pessoa autorizada cria uma geocerca para uma unidade, em círculo (centro e raio) ou polígono (lista de vértices), vê uma pré-visualização esquemática da forma e a ativa. O servidor passa a saber responder se um ponto está dentro da geocerca.

**Por que esta prioridade**: o PRD usa a geocerca da unidade para a proximidade após a entrega (Fase 7); definir e validar a forma agora evita retrabalho.

**Teste independente**: criar um círculo de 200 m e um polígono com quatro vértices para a mesma unidade, informar um ponto dentro e um fora de cada um e conferir o resultado; tentar um polígono que se cruza e confirmar a recusa.

**Cenários de aceitação**:

1. **Dado** uma unidade ativa, **quando** a pessoa cria um círculo com centro e raio dentro dos limites, **então** a geocerca é criada ativa, com evento de histórico e auditoria.
2. **Dado** o centro vazio e a unidade com coordenadas, **quando** a pessoa escolhe "usar as coordenadas da unidade", **então** o centro é preenchido.
3. **Dado** um polígono com menos de três vértices, não fechado de forma válida ou com arestas que se cruzam, **quando** a pessoa envia, **então** a recusa explica o problema, em texto, junto do campo.
4. **Dado** um raio abaixo do mínimo ou acima do máximo, ou coordenadas fora do intervalo válido, **quando** a pessoa envia, **então** a recusa informa os limites.
5. **Dado** uma geocerca ativa, **quando** a pessoa usa "Testar um ponto" informando latitude e longitude, **então** a tela diz "dentro" ou "fora", em texto, sem gravar nada.
6. **Dado** uma geocerca de outra organização, **quando** alguém tenta lê-la, testá-la ou alterá-la, **então** o servidor nega sem revelar que ela existe.
7. **Dado** uma geocerca ativa que se sobrepõe a outra geocerca ativa da mesma unidade, **quando** a pessoa salva, **então** a tela avisa com qual há sobreposição e a geocerca é salva mesmo assim.

---

### História 4 — Cadastrar e manter veículos (Prioridade: P1)

Uma pessoa autorizada cadastra um veículo (placa, tipo, marca, modelo, ano, capacidade e vencimento do licenciamento), acompanha a situação do documento e muda a situação operacional (disponível, em manutenção, inativo).

**Por que esta prioridade**: toda viagem da Fase 4 usa um veículo.

**Teste independente**: cadastrar um veículo com placa antiga e outro com placa Mercosul, tentar repetir uma placa, mudar um veículo para "em manutenção" e conferir lista, filtros, situação do documento e histórico.

**Cenários de aceitação**:

1. **Dado** os campos obrigatórios válidos, **quando** a pessoa envia, **então** o veículo é criado como "disponível", com evento e auditoria.
2. **Dado** uma placa no padrão antigo (AAA9999) ou Mercosul (AAA9A99), com ou sem hífen e em qualquer caixa, **quando** a pessoa envia, **então** a placa é normalizada em maiúsculas e sem hífen e aceita; outro formato é recusado.
3. **Dado** uma placa já cadastrada na organização, ativa ou inativa, **quando** a pessoa tenta repeti-la, **então** é recusada com indicação do veículo existente.
4. **Dado** o vencimento do licenciamento, **quando** a lista é exibida, **então** a situação do documento é calculada: "em dia", "a vencer" (30 dias ou menos), "vencido" ou "sem data", com texto e ícone.
5. **Dado** a mudança de situação para "em manutenção" ou "inativo", **quando** a pessoa confirma, **então** o evento registra a situação anterior e a nova; inativar exige justificativa.

---

### História 5 — Cadastrar e manter motoristas, com proteção de dados (Prioridade: P1)

Uma pessoa autorizada cadastra um motorista (nome, CPF, CNH com categoria e validade, telefone), pode vinculá-lo a um usuário da organização e acompanha a validade da CNH. CPF e CNH ficam mascarados.

**Por que esta prioridade**: toda viagem da Fase 4 tem um motorista, e o vínculo a um usuário prepara o aplicativo de campo da Fase 5.

**Teste independente**: cadastrar um motorista com CNH válida, vincular a um usuário da própria organização, tentar vincular um usuário de outra organização e confirmar a recusa; conferir que CPF e CNH aparecem mascarados e que revelar o documento gera auditoria.

**Cenários de aceitação**:

1. **Dado** CPF e CNH válidos, **quando** a pessoa envia, **então** o motorista é criado ativo, com evento e auditoria que não trazem o CPF nem a CNH em texto aberto.
2. **Dado** um CPF ou número de CNH já cadastrado na organização, **quando** a pessoa tenta repeti-lo, **então** é recusado com indicação do motorista existente, sem expor o documento completo.
3. **Dado** a validade da CNH, **quando** a lista é exibida, **então** a situação é calculada: "em dia", "a vencer" (30 dias ou menos), "vencida" ou "sem data".
4. **Dado** um usuário ativo da mesma organização com o papel `driver`, **quando** a pessoa o vincula ao motorista, **então** o vínculo é gravado com evento; um usuário já vinculado a outro motorista, de outra organização ou sem o papel `driver` é recusado.
5. **Dado** uma pessoa com a permissão de ver documentos, **quando** ela aciona "Revelar", **então** o documento aparece na tela até ela ocultá-lo ou sair da tela, e o servidor registra uma auditoria de revelação; sem a permissão, a ação não existe e o servidor nega.
6. **Dado** o formulário de edição, **quando** é aberto, **então** CPF e CNH não são pré-preenchidos: o campo mostra o valor mascarado e só altera o documento se a pessoa digitar um novo.

---

### História 6 — Inativar e reativar, sem apagar nada (Prioridade: P2)

Uma pessoa autorizada inativa e reativa clientes, unidades, geocercas, veículos e motoristas, com justificativa. Nada é excluído.

**Por que esta prioridade**: o PRD exige rastreabilidade; apagar quebraria viagens e auditoria futuras.

**Teste independente**: inativar um cliente com duas unidades e uma geocerca, conferir a inativação em conjunto e o histórico; reativar o cliente e conferir que as unidades continuam inativas; tentar excluir por qualquer via e confirmar a recusa.

**Cenários de aceitação**:

1. **Dado** um cliente com unidades e geocercas ativas, **quando** a pessoa o inativa com justificativa, **então** o cliente, as unidades e as geocercas ativas dele ficam inativos na mesma operação, cada um com seu evento, e a tela informa quantos foram afetados antes da confirmação.
2. **Dado** um cliente inativo, **quando** a pessoa o reativa, **então** só o cliente volta a ativo; unidades e geocercas continuam inativas até serem reativadas uma a uma.
3. **Dado** uma unidade, geocerca, veículo ou motorista inativo, **quando** a pessoa o reativa com justificativa, **então** ele volta a ativo, desde que o pai (cliente ou unidade) esteja ativo.
4. **Dado** qualquer tentativa de excluir um registro, **quando** feita por tela, função do aplicativo ou diretamente no banco, **então** é recusada; pelas funções do aplicativo a recusa é auditada como negada.
5. **Dado** uma inativação sem justificativa, **quando** a pessoa confirma, **então** é recusada com mensagem junto do campo.

---

### História 7 — Consultar o histórico de cada cadastro (Prioridade: P2)

Uma pessoa autorizada consulta o histórico imutável de um cliente, unidade, geocerca, veículo ou motorista, com filtro por tipo de evento e período.

**Por que esta prioridade**: permite ao auditor reconstruir o que mudou, quando e por quem.

**Teste independente**: executar uma sequência conhecida de ações sobre um veículo e comparar o histórico exibido, ordem e conteúdo, com a sequência executada.

**Cenários de aceitação**:

1. **Dado** uma edição, **quando** o histórico é aberto, **então** o evento mostra os campos alterados com os valores anteriores e novos, exceto os campos pessoais (CPF, CNPJ de pessoa física, CNH, nome, telefone e e-mail de pessoa física, contatos e observações de cliente pessoa física), que mostram apenas "alterado".
2. **Dado** eventos no mesmo instante, **quando** o histórico é exibido, **então** a ordem é estável e determinística.
3. **Dado** milhares de eventos, **quando** o histórico é aberto, **então** ele pagina, sem carregar tudo.
4. **Dado** qualquer papel, inclusive o administrador do tenant e o perfil global, **quando** tenta alterar ou excluir um evento, **então** o servidor recusa.

---

### História 8 — Anonimizar dados pessoais, sem apagar o cadastro (Prioridade: P2)

Um administrador do tenant anonimiza de forma irreversível os dados pessoais de um motorista, de um cliente pessoa física ou de um contato de cliente, por exemplo a pedido do titular. O cadastro, a situação e o histórico permanecem, mas sem os dados que identificam a pessoa.

**Por que esta prioridade**: a spec coleta CPF, CNH, nome e telefone de pessoas físicas; sem anonimização, eles ficariam para sempre no sistema, e a proteção de dados pessoais exige poder retirá-los.

**Teste independente**: cadastrar um motorista com CPF, CNH, nome e telefone fictícios, inativá-lo, anonimizá-lo e confirmar que nenhum desses valores existe mais em tabela, evento, auditoria nem resposta, e que o motorista continua listado como "anonimizado"; repetir para um cliente pessoa física e para um contato de cliente pessoa jurídica.

**Cenários de aceitação**:

1. **Dado** um motorista inativo e um administrador com MFA, **quando** ele informa motivo, justificativa e a confirmação digitada, **então** nome, CPF, número da CNH, telefone e vínculo com o usuário são removidos de forma irreversível, o motorista aparece como "Motorista anonimizado", e um evento e uma auditoria são gerados sem nenhum dos valores removidos.
2. **Dado** um motorista ou cliente pessoa física ainda ativo, **quando** a pessoa tenta anonimizar, **então** a ação é recusada com a orientação de inativar antes.
3. **Dado** uma pessoa sem a permissão, **quando** ela abre o detalhe, **então** a ação não existe e o servidor nega o envio direto; **dado** um administrador sem MFA na sessão, **então** o servidor exige o segundo fator antes de anonimizar.
4. **Dado** um registro anonimizado, **quando** alguém tenta editá-lo, reativá-lo, revelar documento ou vinculá-lo a um usuário, **então** o servidor recusa e a tela não oferece essas ações; **e** o CPF ou a CNH que ele tinha pode ser cadastrado de novo, como um novo registro.
5. **Dado** um cliente pessoa física inativo, **quando** ele é anonimizado, **então** nome, CPF, contatos, responsável de recebimento, instruções de acesso e coordenadas das unidades são removidos, e endereço (CEP, logradouro, bairro, cidade e UF) e geocercas permanecem; **dado** um contato de um cliente pessoa jurídica, **quando** só ele é anonimizado, **então** nome, função, telefone e e-mail dele são removidos e o CNPJ e a razão social permanecem.
6. **Dado** um registro que teve edições antes de ser anonimizado, **quando** se procuram os valores antigos (nome, CPF, CNH, telefone, e-mail) em qualquer tabela, evento de histórico, registro de auditoria ou resposta, **então** nenhum é encontrado.
7. **Dado** uma anonimização repetida ou uma falha no meio da operação, **quando** ela termina, **então** a repetição é recusada como "já anonimizado" e uma falha não deixa nada pela metade.
8. **Dado** um registro de outra organização, **quando** alguém tenta anonimizá-lo, **então** o servidor responde como se ele não existisse.

---

### História 9 — Usar tudo em celular, tablet e desktop, só com teclado (Prioridade: P2)

As telas novas funcionam de 360 px a desktop amplo, com a identidade visual da Spec 005, sem rolagem horizontal, só com teclado e com leitor de tela.

**Teste independente**: percorrer cadastro, lista, detalhe e histórico de cada área em 360, 768 e 1920 px só com Tab, sem rolagem horizontal; rodar a verificação de acessibilidade (axe) e a captura visual.

**Cenários de aceitação**:

1. **Dado** o menu da Spec 004, **quando** a pessoa tem permissões de Fase 3, **então** vê só os itens das áreas que pode usar; sem permissão, o item não aparece e o servidor continua negando o acesso direto.
2. **Dado** a busca de CEP, **quando** ela termina, **então** o resultado é anunciado uma vez em região de status, sem mover o foco, exceto o foco ao campo "Número" após o preenchimento bem-sucedido.
3. **Dado** o formulário de polígono, **quando** a pessoa adiciona ou remove vértices, **então** isso é possível só com teclado, com rótulos e erros associados a cada vértice.
4. **Dado** a situação de qualquer cadastro, **quando** ela é exibida, **então** usa texto e ícone, nunca só cor.

## Requisitos funcionais

### Clientes

- **RF-001**: A pessoa autorizada deve poder cadastrar um cliente com tipo de pessoa (jurídica ou física), documento (CNPJ ou CPF), razão social ou nome, nome fantasia (opcional), segmento (lista fixa: hospital, clínica, laboratório, indústria, distribuidor ou outro, com detalhe de até 60 caracteres quando for "outro"), contatos e observações; tipo de pessoa, documento e razão social ou nome são obrigatórios. O tipo de pessoa é **fixo depois do cadastro**: a edição não o altera, e a correção de documento (RF-004a) só vale dentro do mesmo tipo (CNPJ por CNPJ, CPF por CPF).
- **RF-002**: O documento do cliente deve ter os dígitos verificadores validados, aceitando CPF, CNPJ numérico e CNPJ alfanumérico (formato em vigor desde julho de 2026), e deve ser único dentro da organização entre clientes ativos e inativos.
- **RF-003**: O cliente pode ter até 10 contatos, que a edição do cliente acrescenta e remove (a lista enviada substitui os contatos não anonimizados; os anonimizados permanecem), cada um com nome, função, telefone brasileiro e e-mail, um deles marcado como principal; telefone e e-mail são validados quando informados e **só são devolvidos a quem tem `customer.write`**; os demais papéis veem nome e função do contato.
- **RF-004**: A pessoa autorizada deve poder editar os dados de um cliente ativo; cada edição gera evento de histórico e é protegida contra edição simultânea (a segunda gravação baseada em dado antigo é recusada com orientação para recarregar).

### Unidades

- **RF-004a**: O documento do cliente, a placa do veículo e o CPF e o número da CNH do motorista podem ser corrigidos por edição que exige justificativa; a unicidade (RF-002, RF-020 e RF-025) é conferida de novo, e o evento de histórico e a auditoria de CPF e CNH registram só que o campo foi alterado, sem o valor antigo nem o novo; o de CNPJ de pessoa jurídica e o de placa registram o valor antigo e o novo.
- **RF-005**: O cliente pode ter várias unidades; cada unidade tem nome (único dentro do cliente), endereço completo (CEP, logradouro, número, complemento, bairro, cidade e UF), latitude e longitude (opcionais), responsável pelo recebimento (nome e telefone), janela de recebimento (dias da semana marcados e uma só faixa de horário, inicial e final, com o final depois do inicial; opcional, mas, se informada, com ao menos um dia marcado), instruções de acesso (até 500 caracteres) e situação; nome e endereço (CEP, logradouro, número, cidade e UF) são obrigatórios.
- **RF-006**: Latitude e longitude, quando informadas, devem estar nos intervalos válidos e ser informadas juntas; a unidade não depende do serviço de CEP para ser cadastrada.
- **RF-007**: A pessoa autorizada deve poder editar uma unidade ativa, com evento de histórico e proteção contra edição simultânea.

### Endereço pelo CEP

- **RF-008**: No formulário de unidade, a pessoa deve poder informar o CEP (8 dígitos, com ou sem hífen) e buscar o endereço; o sistema preenche logradouro, bairro, cidade e UF a partir da API pública ViaCEP e leva o foco ao campo "Número". Todos os campos preenchidos continuam editáveis, e o preenchimento não apaga o que a pessoa já digitou em número, complemento ou outros campos. O campo "complemento" devolvido pelo serviço descreve o logradouro e é ignorado: o complemento da unidade é sempre digitado pela pessoa.
- **RF-065**: O servidor do FluxID deve obter latitude e longitude a partir do endereço da unidade (logradouro, número, bairro, cidade, UF e CEP) por meio de uma porta `GeocodingProvider` substituível, com `NominatimProvider` (OpenStreetMap) como primeira implementação, respeitando a política de uso (identificação do aplicativo, no máximo 1 requisição por segundo, resultado não guardado em cache além do necessário) e prazo máximo de 4 s. Somente os campos do endereço saem; nunca nome, documento, contatos, responsável, instruções de acesso nem identificação da organização ou da pessoa. A chamada exige pessoa autenticada com permissão de editar unidades e tem o mesmo limite de taxa da busca de CEP. **Ajuste de 08/10/2026 (uso controlado no protótipo)**: a integração com o Nominatim é **temporária e exclusiva do protótipo** e fica atrás de configuração de servidor (`GEOCODING_*`); a consulta ocorre só no clique em "Buscar coordenadas", depois de aviso e confirmação explícita; é bloqueada para cadastro de pessoa física, funcionalidade desligada, endereço incompleto, limite atingido e testes automatizados sem mock; envia ao provedor somente logradouro, número, cidade, estado, CEP e país (o bairro deixa de sair); usa cache por organização de 30 dias e limite global de 1 requisição por segundo; o registro de operação não traz endereço nem URL; e o ponto pode ser corrigido no mapa antes de salvar. Detalhes em `docs/geocodificacao-prototipo.md`; a decisão para produção segue em T146.
- **RF-066**: As coordenadas encontradas são apenas uma sugestão: só são gravadas depois da confirmação explícita da pessoa, que vê o endereço normalizado, as coordenadas e o grau de precisão devolvido. A unidade guarda a origem das coordenadas (`geocodificada` ou `manual`), quem confirmou e quando; editar o endereço invalida a confirmação.
- **RF-067**: Falha de geocodificação (não encontrado, indisponível, tempo esgotado, limite de taxa, sem conexão) nunca bloqueia o cadastro (mesmo princípio do RF-011); a tela informa o motivo em linguagem simples.
- **RF-068**: Cada geocodificação e cada confirmação geram evento de histórico e registro de auditoria sem o endereço completo em log da plataforma; endereço de pessoa física segue a decisão aberta da premissa 14.
- **RF-069**: A unidade guarda o marcador `primeira_entrega_confirmada`; a confirmação do motorista na primeira entrega é requisito para a Fase 4 e não é implementada nesta spec.
- **RF-070**: A tela deve mostrar mapas de visualização (Leaflet com blocos do OpenStreetMap, carregados sob demanda): o ponto na edição das coordenadas e no detalhe da unidade, e, na Visão geral, **todas as unidades ativas de clientes ativos que têm coordenadas**, com balão (unidade, cliente, cidade e situação da confirmação) e lista alternativa em texto. A Visão geral ocupa 80% da largura com o mapa e 20% com os indicadores principais empilhados na vertical (abaixo de 1024 px, indicadores acima e mapa abaixo). Só os blocos da região vista saem para o OpenStreetMap, sem dado de cadastro; sem conexão o mapa dá lugar a um aviso. A leitura dos pontos usa a permissão `customer.read`; sem ela o mapa mostra a região de exemplo, marcada "Exemplo".
- **RF-009**: Na busca de CEP, somente o CEP pode ser enviado ao serviço externo: nunca número, complemento, nome, documento, coordenadas ou qualquer dado da organização ou da pessoa. (A geocodificação do endereço segue o RF-065.) A chamada ao serviço é feita pelo servidor do FluxID, nunca diretamente pelo navegador, e exige uma pessoa autenticada com permissão de editar unidades.
- **RF-010**: A busca de CEP deve ter limite de taxa de 10 buscas por minuto por pessoa e 100 por minuto por organização (valores centralizados em um só lugar), tempo máximo de resposta e resposta padronizada pelo FluxID (logradouro, bairro, cidade, UF e código do município), de modo que o provedor possa ser trocado sem mudar a tela; a resposta distingue "CEP não encontrado" de "serviço indisponível".
- **RF-011**: Em qualquer falha (CEP inexistente, serviço fora do ar, tempo esgotado, limite de taxa, sem conexão), a tela deve informar o motivo em linguagem simples, preservar tudo o que foi digitado e permitir digitar o endereço inteiro; o cadastro nunca fica bloqueado por falha do serviço de CEP.
- **RF-012**: A busca de CEP não grava o resultado, não é guardada no cache do service worker e não registra o CEP junto da identificação da pessoa em log.

### Geocercas

- **RF-013**: Cada geocerca pertence a uma unidade (e, por ela, a um cliente e a uma organização), tem nome (único dentro da unidade), forma (círculo ou polígono) e situação; uma unidade pode ter várias geocercas.
- **RF-014**: O círculo tem centro (latitude e longitude) e raio entre 25 m e 5 000 m; a pessoa pode preencher o centro com as coordenadas da unidade.
- **RF-015**: O polígono tem de 3 a 100 vértices em ordem, é fechado automaticamente, não pode ter arestas que se cruzem nem vértices repetidos em sequência, e tem área maior que zero.
- **RF-016**: O servidor deve oferecer a consulta "quais geocercas ativas da organização contêm este ponto" e "este ponto está dentro desta geocerca"; a consulta usa índice espacial, só enxerga a organização da sessão e não grava nada.
- **RF-016a**: Ao salvar uma geocerca ativa que se sobrepõe a outra geocerca ativa da mesma unidade, a tela deve avisar com qual (por nome) e salvar mesmo assim; a sobreposição não bloqueia nada e não gera erro.
- **RF-017**: A tela de geocerca deve oferecer "Testar um ponto" e uma pré-visualização esquemática da forma (sem mapa de terceiros), com alternativa em texto (forma, tamanho e vértices).
- **RF-018**: A pessoa autorizada deve poder editar uma geocerca ativa, com evento de histórico (forma anterior e nova) e proteção contra edição simultânea.

### Veículos

- **RF-019**: A pessoa autorizada deve poder cadastrar um veículo com placa, tipo (lista fixa: caminhão, van, utilitário ou outro, com detalhe de até 60 caracteres quando for "outro"), marca, modelo, ano de fabricação, capacidade em número de cilindros, carga máxima em kg (opcional) e vencimento do licenciamento (opcional); placa, tipo e capacidade em cilindros são obrigatórios.
- **RF-020**: A placa deve ser normalizada (maiúsculas, sem hífen e sem espaços), aceita nos padrões AAA9999 e AAA9A99, e ser única dentro da organização entre veículos ativos e inativos.
- **RF-021**: O veículo tem uma situação: "disponível", "em manutenção" ou "inativo". A mudança de situação gera evento com a situação anterior e a nova; "inativo" exige justificativa, e sair de "inativo" exige justificativa. Do estado "inativo" o veículo só volta para "disponível".
- **RF-022**: A situação do licenciamento deve ser calculada, e não digitada: "em dia" (mais de 30 dias), "a vencer" (30 dias ou menos), "vencido" ou "sem data". O limite de 30 dias é o mesmo da Spec 006 e fica em um só lugar do código.
- **RF-023**: O ano de fabricação deve estar entre 1980 e o ano seguinte ao atual; a capacidade em cilindros é um inteiro de 1 a 9 999.

### Motoristas

- **RF-024**: A pessoa autorizada deve poder cadastrar um motorista com nome, CPF, número da CNH, categoria da CNH (A, B, C, D, E, AB, AC, AD ou AE), validade da CNH e telefone; nome, CPF, número, categoria e validade da CNH são obrigatórios.
- **RF-025**: O CPF e o número da CNH devem ter os dígitos verificadores válidos e ser únicos, cada um, dentro da organização entre motoristas ativos e inativos.
- **RF-026**: A situação da CNH deve ser calculada: "em dia", "a vencer" (30 dias ou menos), "vencida" ou "sem data"; uma CNH vencida é destacada, mas não impede o cadastro nem a edição (a Fase 4 decidirá o efeito sobre a escalação em viagem).
- **RF-027**: O motorista pode ser vinculado a um usuário ativo da mesma organização que já tenha o papel `driver` (o vínculo não concede nem altera papéis); um usuário só se vincula a um motorista por vez, e o vínculo pode ser removido com evento. O motorista funciona sem vínculo. A inativação do motorista **não altera o vínculo**, que volta a valer na reativação; o usuário só se liga a outro motorista depois de ser desvinculado, e a desvinculação é permitida **mesmo com o motorista inativo** (exceção à regra de editar só registros ativos, RF-034); só a anonimização remove o vínculo automaticamente (RF-057).
- **RF-028**: Só se coleta o mínimo: nenhum outro documento, endereço pessoal, data de nascimento ou foto é pedido nesta spec.

### Proteção de dados pessoais

- **RF-029**: CPF (de motorista ou de cliente pessoa física) e número da CNH aparecem mascarados em listas, detalhes, mensagens e exportações (por exemplo, só os dois últimos dígitos do CPF e os três últimos da CNH visíveis); o CNPJ de pessoa jurídica aparece completo.
- **RF-030**: A permissão "ver documentos" permite revelar o CPF e a CNH completos, apenas sob demanda, um registro por vez; o documento fica visível até a pessoa ocultá-lo ou sair da tela (trocar de página ou de organização, recarregar ou perder a sessão voltam a mascará-lo), nunca é guardado no cache nem restaurado ao voltar pelo navegador, e cada revelação gera um registro de auditoria, sem o documento no texto do registro.
- **RF-031**: CPF, CNPJ de pessoa física e CNH nunca aparecem em texto aberto em logs, eventos de histórico, registros de auditoria, mensagens de erro, URLs, cache do service worker ou telemetria; eventos de edição desses campos mostram apenas que houve alteração, e o mesmo vale para nome, telefone e e-mail de pessoa física, contatos e observações de cliente pessoa física (RF-054), para que a anonimização alcance também o histórico.
- **RF-032**: Mensagens de duplicidade indicam o cadastro existente (nome ou placa) sem mostrar o documento completo.

### Anonimização de dados pessoais

- **RF-054**: Os dados pessoais anonimizáveis são: **motorista** (nome, CPF, número da CNH, telefone e vínculo com usuário); **cliente pessoa física** (nome, nome fantasia, CPF e observações, mais, para todos os contatos dele, nome, função, telefone e e-mail, e, para todas as unidades dele, nome da unidade, responsável pelo recebimento e seu telefone, instruções de acesso, complemento, número (que passa a "S/N") e coordenadas); e **contato de cliente**, inclusive de pessoa jurídica (nome, função, telefone e e-mail).
- **RF-055**: Devem existir três operações: anonimizar motorista, anonimizar cliente pessoa física e anonimizar contato de cliente. Cada uma exige permissão própria (`driver.anonymize` e `customer.anonymize`), atribuída só ao administrador do tenant, e MFA na sessão; a decisão final é sempre do servidor.
- **RF-056**: Motorista e cliente pessoa física só podem ser anonimizados **depois de inativados**; o contato pode ser anonimizado a qualquer momento. Toda anonimização exige motivo (solicitação do titular, fim do prazo de retenção ou outro; o motivo só é registrado, e a anonimização é sempre uma ação manual, sem rotina agendada nem prazo configurável), justificativa de 5 a 500 caracteres e confirmação explícita (a tela exige digitar a palavra ANONIMIZAR e o envio direto leva `confirmed: true`).
- **RF-057**: A anonimização substitui os valores de forma **irreversível** (nome por um texto fixo como "Motorista anonimizado", "Cliente anonimizado" ou "Contato anonimizado"; documentos, telefone, e-mail e demais campos por vazio), registra quem anonimizou e quando, desvincula o usuário do motorista e **mantém** identificadores, organização, situação, categoria e validade da CNH, endereço de unidade (CEP, logradouro, bairro, cidade e UF), geocercas, histórico e auditoria. Nenhum registro é excluído.
- **RF-058**: Um registro anonimizado não pode ser editado, reativado, vinculado a usuário nem ter documento revelado; leituras mostram "dados anonimizados" e a data; nas listas ele aparece como inativo, com o nome fixo e o selo "anonimizado", só nas visões "inativos" e "todos" (o filtro padrão continua "ativos"); ele não é mais encontrado pelo nome, documento, telefone ou e-mail que tinha, e o contato anonimizado permanece na lista de contatos do cliente com o nome fixo.
- **RF-059**: A anonimização libera a unicidade: o CPF, a CNH ou o documento que o registro tinha pode ser cadastrado de novo, como registro novo, sem relação com o anonimizado.
- **RF-060**: A anonimização gera um evento de histórico (`person_anonymized` ou `contact_anonymized`) e um registro de auditoria com autor, instante, motivo, justificativa e a **lista de campos afetados**, nunca os valores. Eventos e auditorias anteriores não guardam esses valores (RF-031), de modo que nada identificável resta depois da operação.
- **RF-061**: A operação é atômica (tudo ou nada), protegida por versão (`expected_version`) e recusa repetição como "já anonimizado".
- **RF-062**: A tela deve mostrar, antes de confirmar, o que será removido e o que permanece, avisar que a ação é irreversível, exigir motivo, justificativa e a confirmação digitada, devolver o foco ao acionador e, depois, exibir o aviso "Dados pessoais anonimizados em <data>" e desabilitar as ações bloqueadas.
- **RF-063**: A anonimização atua nos dados do FluxID; ela não altera cópias de segurança nem logs da plataforma, que seguem os prazos de retenção da própria plataforma, e não anonimiza o endereço de unidade nem as geocercas (premissa 14).
- **RF-064**: O cadastro e a edição de cliente, unidade, geocerca, veículo e motorista devem abrir em **modal** sobre a lista (cadastro) ou sobre o detalhe (edição), sem recarregar a página e sem remontar a tela de trás. O modal anuncia o título, prende o foco, fecha com Escape, com "Cancelar" ou com o botão Voltar do navegador, devolve o foco ao controle que o abriu e mantém o botão de salvar sempre à vista em formulário longo. A tela de trás fica inerte enquanto o modal está aberto. O endereço do modal (`/clientes/novo`, `/veiculos/<id>/editar` e as demais rotas de ação) continua valendo como link direto: abre a lista ou o detalhe com o modal aberto. Ao salvar, o cadastro leva ao detalhe do que foi criado e a edição fecha o modal e mostra os dados novos. Clicar fora do modal não o fecha, para não descartar o que foi digitado. O modal cabe de 360 px a desktop amplo sem rolagem horizontal.

### Situação, inativação e histórico

- **RF-033**: Nenhum cliente, unidade, geocerca, veículo, motorista ou evento pode ser excluído, pela tela, pelas funções do aplicativo ou diretamente no banco. A única exceção são os **contatos do cliente**, que são parte do cadastro e não um registro com histórico próprio: a edição do cliente os acrescenta e remove (RF-003), sempre por função do aplicativo, com o evento `contacts_changed`, e nunca por exclusão direta; contatos anonimizados nunca são removidos.
- **RF-034**: Cada entidade tem situação cadastral (ativo ou inativo), com inativação e reativação mediante justificativa obrigatória; só são editados clientes, unidades, geocercas e motoristas ativos e veículos que não estejam inativos (disponível ou em manutenção); unidades, geocercas só podem ser reativadas se o cliente (e a unidade, no caso da geocerca) estiver ativo.
- **RF-035**: Inativar um cliente inativa, na mesma operação atômica, as unidades e geocercas ativas dele, cada uma com seu evento; a tela mostra a quantidade afetada antes da confirmação. Reativar o cliente não reativa unidades nem geocercas. Inativar uma unidade inativa as geocercas ativas dela do mesmo modo.
- **RF-036**: O sistema deve registrar um evento de histórico para cada: cadastro, edição, inativação, reativação, mudança de situação do veículo, vínculo e remoção de vínculo de usuário do motorista, e revelação de documento.
- **RF-037**: Cada evento guarda tipo, entidade, organização, autor, instante, justificativa quando houver e dados do fato, e é imutável: nenhum papel o altera ou exclui. A ordem é estável e determinística, e a consulta pagina e filtra por tipo e período.
- **RF-038**: Toda gravação de edição é protegida por versão: a segunda gravação baseada em dado antigo é recusada com orientação para recarregar.

### Telas e navegação

- **RF-039**: O menu por permissão (Spec 004) deve ganhar as áreas "Clientes", "Geocercas", "Veículos" e "Motoristas", cada uma visível só a quem tem a permissão de leitura correspondente, sem alterar nenhuma regra de visibilidade existente. Unidades aparecem dentro do cliente.
- **RF-040**: Cada lista deve ter busca, filtros, ordenação e paginação com total anunciado, e o filtro de situação padrão é "ativos".
- **RF-041**: Os formulários devem ter seções no mesmo formulário e um único envio (Spec 003, RF-020), com erros junto dos campos e foco no primeiro erro. O cadastro e a edição abrem em modal (RF-064).
- **RF-042**: As telas devem usar apenas tokens, componentes, ícones, fonte e logotipo da Spec 003 e o padrão visual decidido na Spec 005, sem cor, tamanho ou espaçamento fora dos tokens, e mostrar só dados reais da organização ativa.

### Acessibilidade, PWA e estados

- **RF-043**: As telas devem funcionar de 360 px a desktop amplo, em retrato e paisagem, sem rolagem horizontal de 320 a 1920 px nem com zoom de 200%.
- **RF-044**: As telas devem atender WCAG 2.2 AA: contraste, foco visível, alvos de 44 px, um só `h1` e um só `main`, tabelas com cabeçalhos associados e estado nunca indicado só por cor.
- **RF-045**: Carregamento, vazio, erro e offline devem usar os componentes da Spec 003; operações de escrita e a busca de CEP exigem conexão, não são enfileiradas e, sem conexão, a tela informa isso.
- **RF-046**: A instalação e o funcionamento PWA, inclusive offline da estrutura, devem ser preservados; nenhum dado de cliente, unidade, geocerca, veículo ou motorista, nem resposta de CEP, pode ser guardado no cache do service worker.
- **RF-047**: As rotas novas devem ser carregadas sob demanda, sem aumentar o pacote de entrada além do limite da Spec 005 (593,95 kB).

### Segurança, multitenancy e auditoria

- **RF-048**: Todas as tabelas novas devem ter `organization_id` e políticas RLS, testadas com pelo menos dois tenants, confirmando acesso permitido e bloqueado para leitura, escrita, histórico, busca e consulta espacial.
- **RF-049**: Cada ação deve exigir uma permissão própria por área, no padrão da Spec 006: ver, cadastrar e editar, inativar e reativar, ver histórico, para motoristas e clientes pessoa física, ver documentos (atribuída só ao administrador do tenant) e, para motoristas e clientes, anonimizar dados pessoais (`driver.anonymize` e `customer.anonymize`, só do administrador do tenant, críticas e com MFA). As permissões são atribuídas aos papéis padrão (administrador do tenant: todas; operador de estoque: ver clientes, geocercas, veículos e motoristas; operador técnico: ver veículos e clientes; auditor: ver e histórico de todas as áreas, sem ver documentos) e a decisão final é sempre do servidor. O papel `driver` não recebe nenhuma. Nenhum papel existente perde permissão.
- **RF-050**: Toda ação sensível (cadastro, edição, inativação, reativação, mudança de situação, vínculo de usuário, revelação de documento) deve gerar um registro de auditoria imutável com autor, organização, instante e justificativa, sem dados pessoais desnecessários.
- **RF-051**: Nenhuma credencial privilegiada pode existir no cliente; todo acesso a dados passa pelas regras do servidor com a sessão da pessoa, e a chave de acesso ao serviço de CEP, se houver, existe só no servidor.
- **RF-052**: Respostas de negação não podem revelar a existência de registros de outra organização.
- **RF-053**: A organização ativa vem do servidor, e nenhuma ação aceita uma organização enviada pelo cliente que não corresponda à da sessão.

## Requisitos não funcionais

- **RNF-001**: A busca em qualquer lista responde em até 1 s no percentil 95 no volume de referência (10 mil clientes, 50 mil unidades, 50 mil geocercas, 5 mil veículos e 5 mil motoristas por organização), no ambiente de teste.
- **RNF-002**: A primeira página de cada lista aparece em até 2 s no percentil 95 no volume de referência, em conexão de teste de 4G.
- **RNF-003**: A consulta "geocercas que contêm um ponto" responde em até 200 ms no percentil 95 com 50 mil geocercas por organização.
- **RNF-004**: A busca de CEP termina, com sucesso ou falha, em até 5 s; a falha nunca trava a tela.
- **RNF-005**: O pacote de produção de entrada continua dentro do limite de 593,95 kB; as telas novas carregam em chunks próprios.
- **RNF-006**: Sem dependência nova de execução no cliente, salvo decisão registrada no plano.
- **RNF-007**: Duas pessoas editando o mesmo registro não perdem alterações silenciosamente (RF-038).

## Regras de negócio

- Clientes, unidades, geocercas, veículos, motoristas e eventos nunca são excluídos fisicamente.
- Situação cadastral, situação do documento (licenciamento ou CNH) e, no veículo, situação operacional são estados independentes (Constituição, princípio IV).
- A situação do documento é sempre calculada a partir da data de validade e da data de hoje de `America/Sao_Paulo`.
- Eventos de histórico e auditoria são imutáveis; correções são novos registros.
- Um documento de cliente, uma placa, um CPF e um número de CNH são únicos por organização.
- Uma geocerca pertence a uma unidade; uma unidade pertence a um cliente.
- Só o CEP sai para o serviço externo; nenhum dado pessoal ou de cadastro vai a terceiros.
- Justificativa é obrigatória em inativação, reativação e mudança de situação do veículo para ou a partir de "inativo".
- CPF e CNH são mascarados; revelar exige permissão e gera auditoria.
- Nenhum dado das telas vem de dados de exemplo.
- Anonimizar é irreversível, exige permissão própria, MFA, motivo, justificativa e confirmação, e só vale para motorista e cliente pessoa física inativos; o cadastro, o histórico e a auditoria permanecem sem os dados pessoais.
- Nome, telefone e e-mail de pessoa física nunca ficam em evento de histórico nem em auditoria, para que a anonimização seja completa.

## Critérios de aceitação transversais

- **CA-001**: Um registro cadastrado por uma organização nunca é visível, buscável, testável ou alterável por outra, comprovado por testes de RLS com dois tenants para cada tabela e para a consulta espacial.
- **CA-002**: Nenhuma operação de exclusão de cliente, unidade, geocerca, veículo, motorista ou evento existe na interface nem é aceita pelo servidor (os contatos são substituídos pela edição do cliente, RF-033); tentativa direta no banco é recusada para qualquer papel, e a tentativa feita pelas funções do aplicativo é recusada e auditada como negada.
- **CA-003**: Nenhum evento de histórico pode ser alterado ou excluído por papel algum.
- **CA-004**: Toda ação sensível gera evento e auditoria, conferido por teste por ação.
- **CA-005**: CPF, CNPJ de pessoa física e CNH nunca aparecem em texto aberto em logs, histórico, auditoria, mensagens de erro nem cache, comprovado por teste que cadastra e edita com valores conhecidos e procura esses valores em todas as saídas.
- **CA-006**: O serviço de CEP só recebe o CEP, comprovado por teste que captura a chamada de saída e confere que ela não contém nenhum outro dado do formulário; e o cadastro funciona integralmente quando o serviço falha (inexistente, indisponível, tempo esgotado, limite de taxa).
- **CA-018**: A geocodificação só envia campos de endereço, comprovado por teste que captura a chamada de saída; nada é gravado sem confirmação; editar o endereço invalida a confirmação; e o cadastro funciona integralmente quando o provedor falha, comprovado por testes com provedor falso (nunca o Nominatim real no CI).
- **CA-007**: Os limites de forma da geocerca (raio, vértices, cruzamento, área) e a consulta de ponto dentro são corretos nos limites, comprovados por testes de domínio e de banco, com pontos dentro, fora e na borda.
- **CA-008**: As validações de CPF, CNPJ numérico e alfanumérico, CNH, placa antiga e Mercosul, telefone e CEP são corretas nos limites, comprovadas por testes de domínio.
- **CA-009**: As situações de licenciamento e de CNH são calculadas corretamente nos limites de data (30 dias, hoje, ontem), comprovado por testes de domínio.
- **CA-010**: Inativar um cliente é atômico: ou o cliente e todos os filhos ativos ficam inativos, ou nada muda, comprovado por teste de banco.
- **CA-011**: Nenhuma violação crítica ou grave de acessibilidade (axe) nas telas novas em 360, 768 e 1920 px; sem rolagem horizontal de 320 a 1920 px nem com zoom de 200%.
- **CA-012**: A estrutura das telas abre offline, e nenhum dado de cadastro nem resposta de CEP fica no cache do service worker.
- **CA-013**: Capturas visuais de referência das telas novas existem em três larguras, geradas no Linux.
- **CA-014**: Pacote de entrada dentro de 593,95 kB.
- **CA-015**: Depois de anonimizar um motorista, um cliente pessoa física ou um contato, nenhum dos valores antigos (nome, CPF, CNH, telefone, e-mail, observações) existe em qualquer tabela do cadastro, evento de histórico, registro de auditoria ou resposta de leitura, comprovado por teste que cadastra, edita, anonimiza e procura esses valores em todas as saídas, inclusive depois de edições anteriores.
- **CA-016**: A anonimização exige permissão própria e MFA, recusa registro ativo (motorista e cliente pessoa física), é atômica, repetível apenas como recusa e irreversível; um registro anonimizado não aceita edição, reativação, vínculo nem revelação, comprovado por testes de banco e de função.
- **CA-017**: A anonimização não apaga linha alguma e mantém identificadores, situação, categoria e validade da CNH, endereço, geocercas, histórico e auditoria, comprovado por contagem de linhas antes e depois e por teste de que o CPF liberado pode ser cadastrado de novo.

## Cenários de exceção e casos de borda

- CEP com hífen, espaços ou menos de 8 dígitos: normalizado ou recusado com mensagem, sem chamar o serviço.
- CEP genérico (de cidade inteira) que não traz logradouro ou bairro: a tela preenche o que veio e deixa os demais campos para digitação.
- Resposta do serviço de CEP com campos inesperados ou muito longos: o servidor devolve só os campos previstos, com tamanho limitado.
- Duas pessoas cadastram o mesmo documento ou a mesma placa ao mesmo tempo: uma é aceita e a outra recebe o conflito, sem duplicar.
- Duas pessoas editam o mesmo registro: a segunda recebe o conflito de versão.
- Cliente pessoa física com CPF: o documento é tratado como dado pessoal (mascarado e fora de log).
- CNPJ alfanumérico: aceito com os dígitos verificadores calculados pelo novo formato; letras minúsculas são normalizadas.
- Polígono com vértices em sentido horário ou anti-horário: ambos aceitos.
- Geocerca cruzando o antimeridiano ou fora do Brasil: aceita se as coordenadas forem válidas; nenhuma restrição geográfica nesta spec.
- Geocercas que se sobrepõem, da mesma unidade ou de unidades diferentes: permitido; o cadastro avisa quando é da mesma unidade (RF-016a) e a consulta devolve todas que contêm o ponto.
- Ponto exatamente na borda de uma geocerca: conta como dentro.
- Pessoa perde a permissão com a tela aberta: a ação seguinte é recusada pelo servidor e a tela atualiza o que mostra.
- Organização ativa trocada com a tela aberta: a tela recarrega com a nova organização, sem mostrar dados da anterior.
- Motorista inativado com usuário vinculado: o vínculo permanece (o usuário não pode ser ligado a outro motorista até ser desvinculado); desvincular é permitido com o motorista inativo; reativar o motorista mantém o vínculo.
- Usuário vinculado ao motorista é desativado ou sai da organização: o vínculo permanece no histórico e a tela o marca como "usuário inativo", sem apagar o motorista.
- Tenant suspenso: leitura e escrita negadas como nas specs anteriores.
- Veículo com licenciamento vencido: destacado, mas não bloqueia edição.
- Perda de conexão no meio de um envio: a tela mostra estado desconhecido e permite repetir, sem criar duplicata (a unicidade por documento ou placa impede a duplicata).
- Tentativa de exclusão direta no banco: rejeitada para qualquer papel; registrada apenas no log do PostgreSQL. Tentativa pelas funções do aplicativo: rejeitada e auditada como negada.
- Anonimizar motorista com usuário vinculado: o vínculo é removido na mesma operação, com o evento de desvinculação, sem alterar papéis nem a conta do usuário.
- Anonimizar cliente pessoa física com unidades e geocercas: os campos pessoais das unidades são removidos; as geocercas e o endereço permanecem; cliente, unidades e geocercas já estão inativos pela regra da inativação.
- Anonimizar o contato principal de um cliente: o contato permanece como "Contato anonimizado" e deixa de ser principal; o cliente pode ficar sem contato principal.
- Pedido de anonimização de registro de outra organização ou inexistente: mesma resposta de não encontrado.
- Anonimização concorrente com edição do mesmo registro: a segunda operação recebe conflito de versão ou "registro anonimizado".
- Pessoa anonimizada que volta a ser cliente ou motorista: é um cadastro novo, sem ligação com o anonimizado.

## Requisitos de acessibilidade e experiência

- Listas em tabela a partir de 768 px, com cabeçalhos, e em cartões abaixo disso.
- Situação cadastral, de documento e do veículo com texto e ícone, nunca só cor.
- Mensagens de erro em português, junto do campo, sem culpar a pessoa; falha do serviço de CEP descrita como "não foi possível buscar agora", com a saída (digitar o endereço).
- Formulários com rótulos visíveis, ajuda e erros associados aos campos; campo de CEP com máscara que não atrapalha leitor de tela.
- Confirmação por diálogo acessível nas ações que inativam, mostrando o efeito em cascata, devolvendo o foco ao acionador.
- Documento revelado tem botão "Ocultar" visível e é anunciado a leitores de tela como exibido; ao ocultar ou sair da tela, volta a ficar mascarado.
- A confirmação da anonimização é um diálogo acessível: lista o que será removido e o que permanece, avisa que é irreversível, tem campo de confirmação com rótulo e erro associados, fecha com Escape sem anonimizar e devolve o foco ao acionador.
- Anúncios de resultado em região de status, uma vez, sem mover o foco.
- Movimento reduzido respeitado; nada pisca mais de três vezes por segundo.

## Entidades principais

- **Cliente**: empresa ou pessoa que recebe cilindros, com documento, nome, segmento, contatos e situação.
- **Contato do cliente**: pessoa de referência do cliente, com função, telefone e e-mail.
- **Unidade do cliente**: local de recebimento com endereço, coordenadas, responsável, janela de recebimento e instruções.
- **Geocerca**: área (círculo ou polígono) ligada a uma unidade, com situação.
- **Veículo**: placa, tipo, capacidade, vencimento do licenciamento e situação.
- **Motorista**: pessoa que dirige, com CPF, CNH, validade e vínculo opcional a um usuário.
- **Evento de histórico**: fato imutável sobre um cadastro, com autor, instante e justificativa; há um conjunto de eventos por área.
- **Anonimização**: operação irreversível sobre um motorista, cliente pessoa física ou contato, com motivo, justificativa, autor e instante; o registro anonimizado guarda só a marca de que foi anonimizado.
- **Registro de auditoria**: já existente (Spec 002), ampliado com as ações novas.

## Dependências

- Spec 002: autenticação, organizações, papéis, permissões, RLS e auditoria.
- Spec 003: design system, shell, estados e escalas.
- Spec 004: menu por permissão e consulta de permissões do servidor.
- Spec 005: padrão visual e divisão do pacote por rota.
- Spec 006: padrões de cadastro, situação, histórico imutável, versão otimista, permissões e limite de 30 dias.
- Serviço público ViaCEP (`viacep.com.br`), acessado só pelo servidor; indisponibilidade nunca bloqueia o cadastro.
- PostGIS, habilitado por migration, para as geocercas.
- `docs/arquitetura-conectividade-supabase.md`: seleção de destino Supabase e regras de sincronização.

## Premissas e decisões assumidas

1. Cada organização (tenant) tem os próprios cadastros; o escopo é sempre a organização ativa da sessão.
2. As operações de escrita e a busca de CEP exigem conexão e nunca são enfileiradas localmente; fila offline e sincronização pertencem à Fase 5.
3. O ViaCEP é um serviço público, sem chave e sem garantia de disponibilidade; o FluxID o trata como conveniência. O provedor é substituível porque a tela depende da resposta padronizada do servidor, e não do formato do ViaCEP.
4. O ViaCEP não devolve coordenadas: o sistema as obtém pelo endereço com a geocodificação do RF-065 (Nominatim/OpenStreetMap, decisão da pessoa responsável em 2026-10-07), sempre com confirmação humana; a pessoa ainda pode informá-las à mão (opcionais). Obter coordenadas pelo aparelho ou por mapa interativo pertence às fases com GPS e mapa. A precisão do Nominatim varia no Brasil (às vezes só a rua ou o bairro), por isso a confirmação e, na Fase 4, a reconfirmação na primeira entrega.
5. O mapa interativo, o desenho de geocerca sobre o mapa e o cálculo de proximidade pertencem às Fases 6 e 7; aqui a forma é informada por números e conferida por pré-visualização esquemática e pela consulta de ponto.
6. Os limites de raio (25 m a 5 000 m) e de vértices (3 a 100) são valores iniciais, centralizados em um só lugar, e podem ser ajustados na clarificação.
7. O limite de 30 dias para "a vencer" é o mesmo da Spec 006, em uma regra única.
8. Permissões novas seguem o modelo da Spec 002 e são incluídas por migration nos papéis padrão; nenhum papel existente perde permissão. Ainda não existe papel de "gestor de logística"; o administrador do tenant faz todas as escritas até a Fase 4 decidir.
9. O CNPJ alfanumérico (em vigor desde julho de 2026) é aceito junto com o numérico; o algoritmo exato será confirmado no plano.
10. O vínculo motorista-usuário não dá ao usuário nenhum acesso novo nesta spec.
11. Os dados de teste usam e-mails `@example.invalid`, documentos de teste sabidamente fictícios e organizações de seed; nenhum dado real é usado.
12. Segmento do cliente e tipo do veículo são listas fixas do produto; catálogos por organização ficam para spec futura.
13. Fotos de motorista ou de veículo, anexos do CRLV e da CNH e importação em massa ficam para spec própria.
14. **Anonimização no lugar de exclusão**: nenhum cadastro é excluído (RF-033); os dados pessoais de pessoas físicas são removidos por anonimização irreversível (RF-054 a RF-063). Ficam fora dela, por necessidade de rastreabilidade das entregas e por não identificarem sozinhos uma pessoa sem nome e documento: endereço de unidade (CEP, logradouro, bairro, cidade e UF) e geocercas, categoria e validade da CNH, identificadores internos, histórico e auditoria (sem valores pessoais). Cópias de segurança e logs da plataforma seguem os prazos de retenção da própria plataforma (RF-063). Endereço e geocerca de cliente pessoa física são dado de localização e podem ser tratados por spec futura, se a validação humana ou a equipe jurídica assim decidir.

## Fora do escopo

- Viagens, paradas, cargas, entregas e escalação de motorista e veículo (Fase 4).
- Aplicativo de campo, GPS, leitura NFC e operação offline com fila (Fase 5).
- IoT, lacres, comandos e telemetria (Fase 6).
- Proximidade, alertas, relatórios e mapa interativo (Fase 7).
- Fotos, anexos de documentos (CRLV, CNH), importação em massa e exportação de relatórios.
- Manutenção detalhada do veículo (ordens de serviço, histórico de manutenção) além da situação operacional.
- Locais de estoque e contagens por local.
- Troca dos dados de exemplo da Visão geral por dados reais.
- Anonimização de endereço e geocercas de cliente pessoa física, de cópias de segurança e de logs da plataforma (ver premissa 14).
- Anonimização automática por prazo de retenção, prazo configurável e lembretes de registros antigos.
- Fluxo de pedido e aprovação em dupla para anonimizar.

## Métricas de sucesso

- **MS-001**: Uma pessoa autorizada cadastra um cliente com uma unidade, endereço pelo CEP, em até 3 minutos na primeira tentativa, sem ajuda.
- **MS-002**: Em condições normais, o endereço aparece preenchido em até 3 segundos depois de a pessoa informar o CEP, e em 100% das falhas simuladas do serviço a pessoa consegue concluir o cadastro digitando o endereço.
- **MS-003**: Uma pessoa autorizada cria uma geocerca circular e uma poligonal para uma unidade, e confere um ponto dentro e um fora, em até 4 minutos.
- **MS-004**: Uma pessoa autorizada cadastra um veículo e um motorista em até 2 minutos cada, na primeira tentativa.
- **MS-005**: 0 vazamento de dados entre organizações nos testes de RLS com dois tenants.
- **MS-006**: 0 ocorrência de CPF, CNPJ de pessoa física ou CNH em texto aberto nas saídas verificadas (logs, histórico, auditoria, mensagens e cache).
- **MS-007**: Um auditor reconstrói o histórico de um cadastro de exemplo só pela tela, sem consultar outra fonte, em até 2 minutos.
- **MS-008**: 0 violações críticas ou graves de acessibilidade e 0 rolagem horizontal de 320 a 1920 px.
- **MS-009**: Em 100% das anonimizações de teste, nenhum valor pessoal antigo é encontrado nas saídas verificadas (CA-015), e o administrador conclui a anonimização de um motorista em até 90 segundos, lendo o que será removido.

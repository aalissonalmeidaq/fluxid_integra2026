# Especificação da funcionalidade: Autenticação, multitenancy e controle de acesso RBAC

**Branch da funcionalidade**: `feat/002-autenticacao-multitenancy-rbac`

**Criada em**: 29/09/2026

**Status**: Planejada e decomposta em tarefas; pronta para análise final

**Entrada**: Disponibilizar autenticação por e-mail e senha, organizações isoladas, gestão de usuários, papéis e permissões granulares, autorização em todas as camadas, perfil com avatar e auditoria de acessos, sem antecipar funcionalidades operacionais das próximas Specs.

## Contexto

O FluxID é uma plataforma multitenant. A própria FluxID administra a plataforma, enquanto cada empresa contratante opera como um tenant independente. Esta funcionalidade estabelece a identidade de cada pessoa, seu vínculo com uma ou mais organizações, o tenant ativo da sessão e as permissões efetivas dentro desse contexto.

O isolamento entre organizações é uma condição de segurança, não apenas uma conveniência de interface. Nenhum identificador de tenant fornecido pelo cliente é considerado prova de acesso. Toda leitura ou alteração protegida deve ser autorizada novamente em uma fronteira confiável, com negação por padrão e evidência auditável para ações sensíveis.

## Clarifications

### Session 2026-09-29

- Q: Para quem e em quais situações a autenticação multifator (MFA) deve ser obrigatória? → A: Obrigatória para Master FluxID e Administrador FluxID; exigida como confirmação adicional para ações críticas de qualquer perfil.
- Q: Os papéis preestabelecidos poderão ser alterados ou deverão permanecer imutáveis? → A: Papéis preestabelecidos são imutáveis; tenants criam papéis personalizados com permissões delegáveis.
- Q: Qual política de sessão deve valer no MVP para duração, inatividade, simultaneidade e logout? → A: Máximo de 8 horas, 30 minutos de inatividade, até 3 sessões simultâneas e logout somente da sessão atual.
- Q: Por quanto tempo convites e links de recuperação devem permanecer válidos, e o que deve acontecer após um reenvio? → A: Convites por 72 horas, recuperação por 1 hora; o reenvio revoga todos os links anteriores do mesmo fluxo.
- Q: Como a consulta à auditoria do tenant deve ser autorizada? → A: Pela permissão delegável `audit.read`, incluída por padrão no papel Administrador do tenant.

### Session 2026-09-29

- Q: Qual matriz inicial de permissões deve ser aplicada aos seis papéis preestabelecidos? → A: Master possui todas as permissões; Administrador FluxID gerencia tenants, usuários globais e auditoria, exceto Master e políticas críticas; Administrador do tenant gerencia usuários, papéis delegáveis e auditoria do próprio tenant; papéis operacionais acessam somente o próprio perfil nesta Spec.
- Q: Quais arquivos de avatar devem ser aceitos e quem poderá visualizá-los? → A: JPEG, PNG e WebP, até 2 MB; leitura privada e autenticada para usuários autorizados.
- Q: Qual política de retenção deve ser aplicada a auditoria, convites expirados e perfis inativos? → A: Auditoria por 5 anos; convites expirados por 90 dias; perfis inativos por 2 anos e depois anonimizados, salvo retenção legal.
- Q: Como os e-mails de convite e recuperação devem ser entregues nos ambientes local, LAN e cloud? → A: **Resposta supersedida pela clarificação posterior desta mesma data e por RF-043.** A decisão vigente usa captura local em desenvolvimento, serviço padrão somente em homologação controlada e SMTP homologado em LAN/cloud produtivos.
- Q: O que deve acontecer quando o serviço padrão de e-mail não confirmar o envio de um convite ou recuperação? → A: Manter o envio como pendente ou falho, auditar o resultado e permitir reenvio manual após o intervalo de segurança.

### Session 2026-09-29

- Q: Qual estratégia deve ser adotada para e-mails produtivos diante das limitações do serviço padrão? → A: Usar captura local em desenvolvimento, permitir o serviço padrão apenas em homologação controlada e exigir SMTP homologado em LAN/cloud produtivos.
- Q: Como cumprir o limite de três sessões simultâneas? → A: Manter o limite e usar uma fronteira servidor confiável para login, contagem e revogação.

### Session 2026-09-29 — revisão arquitetural de conectividade

- Q: Qual passa a ser a ordem obrigatória do modo automático? → A: `cloud → LAN → local`, reiniciada a cada novo ciclo completo de resolução.
- Q: Quando o fallback pode ocorrer? → A: Somente por indisponibilidade técnica classificada; falhas de autenticação, sessão, autorização, RLS, tenant, validação, integridade, domínio ou configuração bloqueiam a resolução.
- Q: Como retornar à cloud depois de operar por LAN/local? → A: Sem interromper operação corrente; sincronizar saída, sincronizar entrada, confirmar sessão, tenant e consistência e somente então promover cloud.
- Q: Quais operações de negócio são permitidas offline? → A: Ainda não definido para os domínios operacionais futuros; esta Spec bloqueia offline as operações de identidade, sessão, convite, RBAC, auditoria sensível e administração.

### Session 2026-09-29 — clarificação de identidade LAN e limites de operação

- Q: Qual estratégia de identidade deve ser adotada quando a aplicação operar em modo degradado via LAN? → A: **Resposta supersedida pela revisão de segurança consolidada em RF-050 e no plano.** Cloud, LAN e local são autoridades de sessão independentes; o destino selecionado deve emitir e validar sua própria sessão. Compartilhar chave JWT não torna senha, refresh token, revogação ou sessão portáveis, e nenhum segredo Auth é replicado.
- Q: Qual deve ser o intervalo mínimo de segurança entre reenvios de e-mail e o comportamento ao atingir o limite? → A: 60 segundos para recuperação de senha e 5 minutos para convite; após o limite, a resposta pública é genérica sem revelar o tempo restante.
- Q: Quais são os limites numéricos padrão do resolvedor de conexão e da tela de inicialização? → A: Probe timeout padrão 3 segundos; backoff automático de 3 ciclos com intervalos de 2 s, 4 s e 8 s; máximo de 5 tentativas por item da outbox; tela de inicialização oferece ação de recuperação ao usuário em no máximo 30 segundos. Todos os valores são configuráveis por ambiente; os padrões devem ser documentados e testados.
- Q: Qual deve ser a estratégia de resolução padrão para conflitos de versão em registros críticos sem regra de domínio definida? → A: Bloquear o item no estado `conflict` e preservar as versões local e remota sem escrita automática; a resolução exige regra de domínio explícita ou ator autorizado. “Última escrita vence” nunca é aplicada automaticamente a registros de identidade, vínculo, papel ou auditoria.
- Q: Qual deve ser o comportamento da interface quando o usuário atingir o limite de três sessões ao tentar um novo login? → A: Exibir mensagem acessível informando que o limite foi atingido e apresentar a lista de sessões ativas com opção de encerrar uma para liberar o novo login; sessão não é encerrada automaticamente.

## Objetivos

- Permitir que usuários convidados acessem o FluxID com identidade individual e recuperem o acesso com segurança.
- Permitir que a equipe FluxID cadastre e administre tenants sem delegar privilégios globais.
- Permitir que cada administrador de tenant gerencie seus usuários, papéis e permissões dentro dos limites delegáveis.
- Manter permissões independentes por vínculo organizacional e selecionar explicitamente o tenant ativo quando houver mais de um vínculo elegível.
- Impedir acesso cruzado entre tenants tanto pela interface quanto por requisições diretas.
- Registrar autenticação e gestão de acesso em uma trilha de auditoria resistente a alteração.
- Oferecer fluxos acessíveis, responsivos e compatíveis com a PWA existente.

## Atores

| Ator | Responsabilidade nesta funcionalidade |
|---|---|
| Master FluxID | Possuir todas as permissões globais e de tenant, inclusive gestão de administradores FluxID, do próprio papel Master e de políticas críticas não delegáveis. |
| Administrador FluxID | Gerenciar tenants, usuários globais e auditoria da plataforma, sem administrar usuários Master nem políticas críticas não delegáveis. |
| Administrador do tenant | Gerenciar usuários, convites, papéis personalizados, permissões delegáveis e auditoria somente do próprio tenant. |
| Operador técnico | Acessar somente o próprio perfil nesta Spec; capacidades técnicas serão concedidas por Specs de domínio posteriores. |
| Operador de estoque | Acessar somente o próprio perfil nesta Spec; capacidades de estoque serão concedidas por Specs de domínio posteriores. |
| Motorista | Acessar somente o próprio perfil nesta Spec; suas funções operacionais serão concedidas por Specs posteriores. |
| Usuário convidado | Concluir o convite e estabelecer sua identidade antes de obter acesso ativo. |
| Serviço de identidade | Validar credenciais, manter sessões e apoiar recuperação de senha. |
| Auditor autorizado | Consultar eventos de segurança e acesso dentro do escopo concedido, sem alterar a trilha. |

## Cenários de usuário e testes

### História 1 — Entrar e manter uma sessão segura (Prioridade: P1)

Como usuário ativo, quero entrar com e-mail e senha e encerrar minha sessão para acessar somente o que me foi autorizado.

**Por que esta prioridade**: todas as demais jornadas dependem de uma identidade autenticada e de uma sessão com ciclo de vida controlado.

**Teste independente**: um usuário ativo consegue entrar, renovar a sessão, acessar uma rota permitida e sair; credenciais inválidas, usuário bloqueado e sessão expirada não concedem acesso.

**Cenários de aceitação**:

1. **Dado** um usuário ativo com credenciais válidas e ao menos um vínculo elegível, **quando** ele entrar, **então** recebe acesso somente aos tenants e capacidades autorizados.
2. **Dado** um e-mail inexistente ou uma senha incorreta, **quando** o login falhar, **então** a mensagem não revela qual parte da credencial está incorreta.
3. **Dado** um usuário bloqueado ou inativo, **quando** tentar entrar ou renovar a sessão, **então** o acesso é negado e a tentativa é auditada sem registrar a senha ou tokens.
4. **Dado** uma sessão válida próxima da expiração, **quando** a renovação for permitida, **então** a continuidade ocorre sem ampliar permissões nem trocar silenciosamente o tenant ativo.
5. **Dado** uma sessão expirada, revogada ou encerrada, **quando** uma rota protegida for acessada, **então** dados protegidos não são exibidos e o usuário recebe orientação acessível para entrar novamente.
6. **Dado** um usuário autenticado, **quando** solicitar logout, **então** a sessão selecionada deixa de autorizar novas operações e o usuário retorna a uma área pública.
7. **Dado** um Master FluxID ou Administrador FluxID, **quando** concluir a autenticação inicial, **então** o acesso global somente é liberado após MFA válida.
8. **Dado** qualquer perfil prestes a executar uma ação crítica, **quando** não houver confirmação MFA válida para a operação, **então** a ação é interrompida e o usuário é conduzido ao desafio adicional.
9. **Dado** uma sessão com 8 horas de duração total ou 30 minutos de inatividade, **quando** uma nova operação protegida for solicitada, **então** a sessão é considerada expirada e exige nova autenticação.
10. **Dado** um usuário com três sessões ativas, **quando** tentar iniciar uma quarta sessão, **então** o novo acesso não é liberado até que uma sessão existente seja encerrada.

---

### História 2 — Recuperar o acesso (Prioridade: P1)

Como usuário, quero solicitar a recuperação e definir uma nova senha para retomar o acesso sem expor se uma conta existe.

**Por que esta prioridade**: a recuperação é parte essencial do ciclo de autenticação e reduz suporte sem introduzir enumeração de usuários.

**Teste independente**: solicitações para e-mails existentes e inexistentes apresentam resposta equivalente; somente um fluxo válido e vigente permite definir uma nova senha.

**Cenários de aceitação**:

1. **Dado** qualquer endereço de e-mail com formato válido, **quando** uma recuperação for solicitada, **então** a resposta pública é equivalente exista ou não uma conta.
2. **Dado** um meio de recuperação válido e ainda vigente, **quando** o usuário definir uma senha aceita pela política, **então** a senha anterior deixa de autenticar e o evento é auditado.
3. **Dado** um meio de recuperação inválido, expirado ou já utilizado, **quando** houver tentativa de redefinição, **então** nenhuma senha é alterada e a interface oferece uma nova solicitação sem expor detalhes internos.
4. **Dado** solicitações repetidas, **quando** o limite de segurança for atingido, **então** novas tentativas são controladas com mensagem genérica e sem confirmar a existência da conta.
5. **Dado** um link de recuperação emitido há mais de 1 hora ou substituído por reenvio, **quando** houver tentativa de uso, **então** nenhuma senha é alterada e o usuário pode solicitar um novo link.
6. **Dado** que o serviço de e-mail não confirmou uma recuperação, **quando** o resultado for recebido, **então** a solicitação fica como envio pendente ou falho, o resultado é auditado e um novo envio manual só é permitido após o intervalo de segurança.

---

### História 3 — Administrar tenants e seus responsáveis (Prioridade: P1)

Como usuário FluxID autorizado, quero cadastrar tenants e convidar seus administradores para habilitar contratantes com isolamento e responsabilidade definidos.

**Por que esta prioridade**: nenhum tenant pode operar com segurança sem ciclo de vida e responsável administrativo controlados pela FluxID.

**Teste independente**: um usuário global autorizado cria um tenant, convida ao menos um administrador e altera seu estado; um administrador de tenant não consegue executar essas ações globais.

**Cenários de aceitação**:

1. **Dado** um Master FluxID ou Administrador FluxID com permissão específica, **quando** cadastrar um tenant válido, **então** o tenant nasce `inactive`, isolado dos demais e com a operação auditada.
2. **Dado** um tenant sem administrador ativo, **quando** um usuário global autorizado enviar um convite administrativo, **então** o convite concede somente o papel previsto naquele tenant após aceitação válida.
3. **Dado** um tenant ativo, **quando** for suspenso, **então** seus usuários deixam de iniciar ou continuar operações protegidas nesse tenant, preservando dados e auditoria.
4. **Dado** um tenant suspenso ou inativo, **quando** for reativado por usuário global autorizado, **então** somente vínculos ainda elegíveis voltam a permitir acesso.
5. **Dado** um administrador de tenant, **quando** tentar criar, suspender, inativar ou reativar outro tenant, **então** a operação é negada e auditada.

---

### História 4 — Gerenciar usuários do tenant (Prioridade: P2)

Como administrador do tenant, quero convidar e administrar usuários da minha organização para manter acessos atualizados.

**Por que esta prioridade**: o tenant precisa operar com autonomia limitada, sem depender da FluxID para toda mudança de equipe.

**Teste independente**: um administrador do Tenant A convida, ativa, bloqueia, inativa e reativa usuários do Tenant A, mas não visualiza nem altera usuários ou convites do Tenant B.

**Cenários de aceitação**:

1. **Dado** um administrador de tenant autorizado, **quando** convidar um e-mail válido, **então** o convite fica associado somente ao tenant ativo e não concede acesso antes da aceitação.
2. **Dado** um convite válido e vigente, **quando** for aceito pela pessoa destinatária, **então** o vínculo passa de convidado para ativo com os papéis concedidos naquele tenant.
3. **Dado** um convite inválido, expirado, revogado ou destinado a outro usuário, **quando** houver tentativa de aceitação, **então** nenhum vínculo ativo é criado.
4. **Dado** um usuário do Tenant A, **quando** seu vínculo for bloqueado ou inativado, **então** ele perde o acesso ao Tenant A sem alteração automática de vínculos em outros tenants.
5. **Dado** um administrador do Tenant A, **quando** tentar consultar ou alterar um usuário do Tenant B por requisição direta, **então** a operação é negada sem revelar dados do Tenant B.
6. **Dado** que uma alteração removeria o último administrador ativo do tenant, **quando** ela for solicitada, **então** a operação é recusada até que outro administrador ativo exista.
7. **Dado** um convite emitido há mais de 72 horas ou substituído por reenvio, **quando** houver tentativa de aceitação, **então** nenhum vínculo é ativado; somente o convite mais recente pode ser utilizado.
8. **Dado** que o serviço de e-mail não confirmou um convite, **quando** o resultado for recebido, **então** o convite não é apresentado como enviado, o resultado é auditado e um reenvio manual só é permitido após o intervalo de segurança.

---

### História 5 — Administrar papéis e permissões (Prioridade: P2)

Como administrador autorizado, quero organizar permissões granulares em papéis e atribuí-los a usuários para controlar acesso sem regras fixas dispersas.

**Por que esta prioridade**: papéis administráveis e permissões granulares reduzem privilégios excessivos e tornam a autorização verificável.

**Teste independente**: mudanças em papéis e atribuições alteram o acesso apenas no tenant correspondente; permissões globais críticas nunca podem ser delegadas pelo tenant.

**Cenários de aceitação**:

1. **Dado** um tenant ativo, **quando** seu administrador criar ou alterar um papel, **então** somente permissões delegáveis podem ser associadas.
2. **Dado** um usuário com um ou mais papéis no tenant ativo, **quando** solicitar uma ação, **então** a autorização considera a união das permissões válidas nesse tenant e nega o que não estiver concedido.
3. **Dado** uma permissão crítica da FluxID, **quando** um administrador de tenant tentar atribuí-la a um papel ou usuário, **então** a operação é negada e auditada.
4. **Dado** um papel preestabelecido, **quando** qualquer usuário tentar alterar ou excluir sua identidade, descrição ou permissões, **então** a operação é negada; adaptações do tenant exigem um papel personalizado.
5. **Dado** uma remoção de papel ou permissão, **quando** a mudança for confirmada, **então** novas operações passam a obedecer à autorização atualizada sem depender apenas de informação antiga da interface.

---

### História 6 — Selecionar o tenant ativo (Prioridade: P2)

Como usuário vinculado a mais de um tenant, quero selecionar em qual organização estou atuando para não misturar contexto, permissões ou dados.

**Por que esta prioridade**: o modelo deve comportar múltiplos vínculos sem compartilhar direitos entre organizações.

**Teste independente**: um usuário com dois vínculos seleciona um tenant por vez e vê permissões e dados correspondentes; trocar o identificador no cliente não concede acesso ao outro contexto.

**Cenários de aceitação**:

1. **Dado** um usuário com um único vínculo ativo, **quando** entrar, **então** esse tenant pode ser selecionado sem uma etapa de escolha desnecessária.
2. **Dado** um usuário com mais de um vínculo ativo, **quando** entrar, **então** deve escolher um tenant antes de acessar áreas protegidas específicas de organização.
3. **Dado** um tenant suspenso, inativo ou um vínculo bloqueado, **quando** as opções forem apresentadas, **então** esse contexto não pode ser selecionado para operar.
4. **Dado** uma troca de tenant, **quando** a seleção for concluída, **então** dados, permissões, navegação e ações pendentes do contexto anterior não permanecem acessíveis.
5. **Dado** um identificador de tenant alterado no cliente, **quando** houver requisição direta, **então** a autorização usa o vínculo confiável do usuário e nega qualquer contexto não permitido.

---

### História 7 — Manter o perfil e o avatar (Prioridade: P3)

Como usuário autenticado, quero consultar e atualizar meus dados de perfil e avatar para manter minha identificação reconhecível.

**Por que esta prioridade**: a identificação pessoal apoia uso e auditoria, mas depende dos controles centrais de autenticação e autorização.

**Teste independente**: o usuário atualiza somente os campos editáveis do próprio perfil e envia um avatar válido; arquivos inválidos e acesso a avatares não autorizados são bloqueados.

**Cenários de aceitação**:

1. **Dado** um usuário autenticado, **quando** atualizar campos editáveis do próprio perfil, **então** campos de identidade, tenant, papéis e permissões não podem ser alterados por esse fluxo.
2. **Dado** um arquivo JPEG, PNG ou WebP de até 2 MB, **quando** o envio for validado, **então** o avatar anterior é substituído de modo controlado e o perfil referencia somente o arquivo autorizado.
3. **Dado** um arquivo SVG, de outro formato, maior que 2 MB, com extensão enganosa ou conteúdo inválido, **quando** houver tentativa de envio, **então** o arquivo é rejeitado com mensagem acessível.
4. **Dado** um usuário autenticado, **quando** tentar ler, substituir ou excluir um avatar fora do seu escopo, **então** a operação é negada.
5. **Dado** uma pessoa não autenticada, **quando** tentar acessar diretamente a URL de um avatar, **então** o arquivo não é exibido.

---

### História 8 — Auditar autenticação e gestão de acessos (Prioridade: P3)

Como auditor autorizado, quero consultar eventos de identidade e autorização para reconstruir ações sensíveis e investigar incidentes.

**Por que esta prioridade**: a responsabilização e a investigação dependem de evidência confiável, especialmente em operações globais e mudanças de acesso.

**Teste independente**: cada evento sensível gera um registro consultável no escopo correto, sem segredos e sem possibilidade de edição ou exclusão por usuários comuns.

**Cenários de aceitação**:

1. **Dado** login, falha relevante, logout, recuperação ou revogação de sessão, **quando** o evento ocorrer, **então** uma evidência sanitizada é registrada.
2. **Dado** criação ou mudança de tenant, vínculo, convite, papel, permissão ou estado de usuário, **quando** a ação for concluída ou negada por segurança, **então** ator, escopo, ação, resultado e instante ficam auditáveis.
3. **Dado** um usuário de tenant, **quando** consultar auditoria, **então** enxerga somente eventos autorizados do próprio tenant.
4. **Dado** qualquer usuário comum ou administrador de tenant, **quando** tentar alterar ou excluir auditoria, **então** a operação é negada.
5. **Dado** um Administrador do tenant ou vínculo com papel personalizado que conceda `audit.read`, **quando** consultar auditoria, **então** recebe somente eventos do tenant ativo; sem essa permissão, a consulta é negada.

---

### História 9 — Inicializar e sincronizar a PWA com segurança (Prioridade: P1)

Como pessoa autorizada em campo, quero que a PWA priorize cloud e prepare os dados antes de liberar a operação para não perder alterações nem misturar tenants durante falhas de conectividade.

**Teste independente**: a inicialização carrega somente o shell, resolve `cloud → LAN → local`, envia a outbox antes de receber mudanças, bloqueia fallback por falha de segurança e libera a área somente após confirmar sessão, tenant e consistência.

**Cenários de aceitação**:

1. **Dado** cloud saudável, **quando** a PWA iniciar, **então** cloud é selecionada e LAN/local não são sondados.
2. **Dado** cloud tecnicamente indisponível e LAN saudável, **quando** a resolução ocorrer, **então** LAN é selecionada; local não é sondado.
3. **Dado** cloud e LAN tecnicamente indisponíveis, **quando** local estiver saudável, **então** local é selecionado em modo degradado explícito.
4. **Dado** erro de autenticação, autorização, RLS, tenant, validação, integridade ou configuração em cloud, **quando** classificado, **então** a tentativa é bloqueada sem fallback.
5. **Dado** cloud disponível e itens pendentes, **quando** a sincronização iniciar, **então** o push idempotente termina antes do pull e cada item permanece na outbox até confirmação.
6. **Dado** um conflito crítico, **quando** push ou pull o detectar, **então** versões local e remota são preservadas, o cursor não avança indevidamente e a aplicação apresenta recuperação autorizada.
7. **Dado** LAN/local ativo e cloud novamente saudável, **quando** houver operação em andamento, **então** nenhuma troca ocorre até estabilização e sincronização segura.
8. **Dado** tenant ou sessão não confirmados após sincronização, **quando** a inicialização avaliar os gates, **então** a área operacional permanece bloqueada com estado acessível e recuperável.
9. **Dado** fechamento da PWA durante sincronização, **quando** ela reiniciar, **então** retoma com idempotência sem duplicar operação nem perder item pendente.
10. **Dado** troca de tenant, **quando** o novo contexto for confirmado, **então** cache, cursor e outbox permanecem segregados e dados do tenant anterior não são reutilizados.

## Requisitos funcionais

- **RF-001**: O sistema deve autenticar usuários individualmente por e-mail e senha.
- **RF-002**: O sistema deve encerrar a sessão selecionada mediante logout e impedir seu uso posterior.
- **RF-003**: O sistema deve renovar sessões elegíveis sem ampliar permissões ou trocar o tenant ativo.
- **RF-004**: O sistema deve reconhecer sessão expirada, revogada ou inválida antes de liberar conteúdo protegido.
- **RF-005**: O sistema deve oferecer solicitação e conclusão segura de recuperação de senha, com respostas que não permitam enumerar contas.
- **RF-006**: O sistema deve proteger todas as rotas privadas e apresentar estado de acesso negado quando o usuário autenticado não possuir autorização.
- **RF-007**: O sistema deve manter FluxID como organização proprietária da plataforma e empresas contratantes como tenants isolados.
- **RF-008**: Somente usuários globais com permissão específica podem cadastrar, suspender, inativar e reativar tenants.
- **RF-009**: Todo tenant nasce no estado `inactive` e só pode passar a `active` quando possuir ao menos um administrador com vínculo ativo; depois disso, nenhuma alteração comum pode deixá-lo sem administrador ativo.
- **RF-010**: O sistema deve manter estados distintos de tenant: ativo, suspenso e inativo.
- **RF-011**: O sistema deve permitir convite de administrador de tenant por usuário global autorizado.
- **RF-012**: O sistema deve permitir convite de usuários por administrador autorizado, sempre no tenant ativo.
- **RF-013**: Convites devem possuir destinatário, tenant, finalidade, estado, validade e evidência de criação e consumo, sem expor o segredo de aceitação na auditoria.
- **RF-013A**: Convites devem expirar 72 horas após a emissão; links de recuperação devem expirar 1 hora após a emissão; o reenvio deve revogar imediatamente todos os links anteriores do mesmo fluxo.
- **RF-014**: O sistema deve manter estados distintos de vínculo do usuário: convidado, ativo, bloqueado e inativo.
- **RF-015**: Bloqueio ou inativação em um tenant não deve modificar automaticamente os vínculos do mesmo usuário em outros tenants.
- **RF-016**: O sistema deve permitir reativação somente por ator autorizado e registrar a justificativa em toda ação crítica listada em RF-021C.
- **RF-017**: O sistema deve disponibilizar os papéis preestabelecidos Master FluxID, Administrador FluxID, Administrador do tenant, Operador técnico, Operador de estoque e Motorista.
- **RF-018**: Permissões devem ser granulares, identificáveis e associadas a papéis; a interface não pode ser a única responsável por decidir autorização.
- **RF-019**: O sistema deve permitir criação e manutenção de papéis personalizados no tenant com permissões delegáveis.
- **RF-020**: O sistema deve permitir atribuir um ou mais papéis a um vínculo de usuário, com efeito restrito ao tenant correspondente.
- **RF-021**: Permissões críticas da FluxID devem ser classificadas como não delegáveis e não podem integrar papéis administrados pelo tenant.
- **RF-021A**: Papéis preestabelecidos devem ser imutáveis e não podem ser alterados ou excluídos por usuários da aplicação; necessidades específicas do tenant devem ser atendidas por papéis personalizados.
- **RF-021B**: O catálogo inicial de permissões desta Spec é fechado e contém `platform.manage` (global, não delegável, crítica), `tenant.manage` (tenant, delegável, crítica), `audit.read` (tenant, delegável) e `profile.read` (tenant, delegável). Permissão crítica exige MFA AAL2 vigente no momento da operação. Novas permissões dependem de nova Spec.
- **RF-021C**: São ações críticas, e portanto exigem MFA e justificativa (RF-016): criar, suspender, inativar e reativar tenant; convidar administrador de tenant; bloquear, inativar ou reativar vínculo; criar, alterar ou inativar papel personalizado; atribuir ou remover papel; resolver conflito de sincronização; descartar item da outbox.
- **RF-022**: Toda operação protegida deve ser negada por padrão quando identidade, vínculo, tenant ativo, estado ou permissão não puderem ser comprovados.
- **RF-023**: Um identificador de tenant recebido do cliente deve ser tratado somente como contexto solicitado, nunca como prova de autorização.
- **RF-024**: A autorização deve ser revalidada em uma fronteira confiável para leitura, criação, alteração e exclusão, inclusive em requisições diretas que contornem a interface.
- **RF-025**: Todas as entidades pertencentes a tenant devem possuir o identificador canônico `organization_id`, salvo exceção global explicitamente documentada e protegida.
- **RF-026**: O usuário com mais de um vínculo ativo deve selecionar um tenant antes de operar; o sistema deve manter apenas um tenant ativo por contexto operacional.
- **RF-027**: A troca de tenant deve remover da interface dados e permissões do contexto anterior antes de liberar o novo contexto. Operações pendentes permanecem preservadas e inacessíveis em partição isolada por `organization_id` até reautenticação equivalente ou descarte autorizado e auditado.
- **RF-028**: O sistema deve permitir consultar e atualizar os campos editáveis do próprio perfil sem permitir autoatribuição de estado, tenant, papel ou permissão.
- **RF-029**: O sistema deve aceitar somente avatares JPEG, PNG ou WebP de até 2 MB, após validar o conteúdo real do arquivo; SVG e demais formatos devem ser rejeitados.
- **RF-030**: O armazenamento de avatares deve ser privado e exigir autenticação e autorização para leitura, alteração ou exclusão.
- **RF-031**: A interface deve apresentar estados de carregamento, vazio, erro, sucesso, offline, sincronização, sessão expirada e acesso negado nos fluxos aplicáveis.
- **RF-032**: O funcionamento offline da PWA não deve conceder novo acesso, prolongar sessão inválida nem autorizar alterações sensíveis sem validação confiável.
- **RF-033**: A mudança de destino Supabase durante uma sessão deve seguir o contrato de conectividade existente e nunca ocorrer como resposta a erro de autenticação, autorização, validação ou isolamento.
- **RF-034**: O sistema deve exigir MFA de Master FluxID e Administrador FluxID para liberar acesso global e exigir confirmação MFA adicional antes de ações críticas executadas por qualquer perfil.
- **RF-035**: Cada sessão deve possuir duração máxima de 8 horas e expirar após 30 minutos consecutivos de inatividade.
- **RF-036**: Cada usuário pode manter no máximo três sessões simultâneas; ao tentar um quarto login, a interface deve exibir mensagem acessível informando o limite atingido e apresentar a lista das sessões ativas com opção de encerrar uma para liberar o novo acesso. Nenhuma sessão é encerrada automaticamente.
- **RF-037**: O logout comum deve revogar somente a sessão atual, sem encerrar automaticamente as demais sessões válidas do usuário.
- **RF-038**: A consulta da auditoria do tenant deve exigir a permissão delegável `audit.read`, incluída por padrão no papel preestabelecido Administrador do tenant e disponível para papéis personalizados do mesmo tenant.
- **RF-039**: Master FluxID deve possuir todas as permissões globais e de tenant, incluindo gestão de usuários Master e de políticas críticas não delegáveis.
- **RF-040**: Administrador FluxID deve poder gerenciar tenants, usuários globais não Master e auditoria da plataforma, sem administrar usuários Master nem políticas críticas não delegáveis.
- **RF-041**: Administrador do tenant deve poder gerenciar usuários, convites, papéis personalizados, permissões delegáveis e auditoria exclusivamente do próprio tenant.
- **RF-042**: Operador técnico, Operador de estoque e Motorista devem possuir somente acesso ao próprio perfil nesta Spec; nenhuma permissão administrativa ou operacional de domínio deve ser antecipada.
- **RF-043**: Convites e recuperações de senha devem usar captura local em desenvolvimento, podem usar o serviço padrão do Supabase somente em homologação controlada e devem usar SMTP homologado em LAN/cloud produtivos, com templates transacionais do FluxID em português brasileiro.
- **RF-044**: Quando o serviço de e-mail não confirmar o envio, a solicitação deve permanecer com estado “envio pendente” ou “falhou”, registrar o resultado e permitir reenvio manual somente após o intervalo de segurança aplicável: mínimo de 60 segundos para recuperação de senha e 5 minutos para convite. A resposta pública ao atingir o intervalo é genérica e não revela o tempo restante.
- **RF-045**: No modo automático, o resolvedor deve avaliar sequencialmente cloud, LAN e local, interrompendo-se no primeiro destino saudável.
- **RF-046**: Fallback só pode ocorrer por timeout, falha de DNS/rede, conexão recusada, endpoint inalcançável ou resposta de indisponibilidade explicitamente classificada; falhas de segurança, domínio, integridade, validação ou configuração devem bloquear a tentativa.
- **RF-047**: Cloud, LAN e local devem possuir pares separados de URL e chave publicável e uma versão pública esperada do contrato/schema, configurados por ambiente; endereço LAN não pode ser fixado no código e nenhuma credencial privilegiada pode integrar o frontend. Depois do health check, a versão exposta pelo destino deve coincidir com a esperada; ausência ou incompatibilidade é erro de configuração bloqueante, sem fallback.
- **RF-048**: A resolução deve usar timeout configurável (padrão 3 segundos por probe), cancelamento, uma passagem finita por ciclo, exclusão mútua entre resoluções e repetição manual ou automática com backoff limitado a 3 ciclos e intervalos padrão de 2 s, 4 s e 8 s.
- **RF-049**: Cada novo ciclo completo deve voltar a priorizar cloud e registrar somente endpoint, categoria de falha, duração e transição sanitizados.
- **RF-050**: Exatamente um cliente Supabase pode permanecer ativo; uma troca controlada deve invalidar o cliente anterior. Sessões não são portáveis entre projetos por simples troca de URL ou compartilhamento de chave JWT: LAN e local exigem autenticação válida emitida pelo próprio destino antes de liberar dados protegidos. Nenhum refresh token, senha ou segredo MFA é copiado ou sincronizado entre projetos.
- **RF-051**: Ao iniciar, a PWA deve carregar somente shell e configuração pública, abrir a base local, restaurar apenas sessão válida emitida pelo destino selecionado, identificar tenant autorizado e inspecionar a outbox bloqueada antes de liberar conteúdo protegido.
- **RF-052**: Com cloud disponível, a sincronização de saída deve preceder a de entrada; a área operacional só pode ser liberada após confirmar saída, entrada, sessão, tenant e consistência mínima.
- **RF-053**: A outbox deve usar UUID gerado no cliente, chave de idempotência, tenant, ator, dispositivo, timestamps local e confirmado, versão, dependências, tentativas limitadas, estado e motivo sanitizado.
- **RF-054**: Itens da outbox devem suportar `pending`, `syncing`, `synced`, `conflict`, `failed` e `discarded`; descarte exige ator autorizado e auditoria, e remoção da fila só ocorre após confirmação do servidor.
- **RF-055**: O pull deve buscar alterações posteriores ao último cursor confirmado, aplicar RLS, atualizar dados locais e avançar o cursor atomicamente somente depois da aplicação completa.
- **RF-056**: A resolução de conflitos não pode aplicar “última escrita vence” indiscriminadamente. Para registros críticos de identidade, vínculo, papel ou auditoria sem regra de domínio explícita, o item deve ser bloqueado no estado `conflict` com ambas as versões preservadas, sem escrita automática. A resolução manual exige sessão vigente, justificativa, `tenant.manage` no tenant afetado ou `platform.manage` no escopo global e evento append-only `sync.conflict.resolve` com ator, tenant, versões e decisão sanitizados. O cursor não avança e o item não é marcado como `synced` enquanto o conflito não for resolvido.
- **RF-057**: Enquanto LAN/local estiver ativo, cloud deve ser reavaliada após 60 segundos, com jitter de até 10% e sem sobrepor ciclos; sua promoção exige estabilizar a operação corrente, pausar novas mutações, executar push e pull e confirmar os gates antes de trocar o cliente.
- **RF-058**: O modo degradado deve identificar o endpoint ativo, nunca simular confirmação definitiva e bloquear as operações desta Spec que exijam autenticação, autorização ou confirmação confiável do servidor.
- **RF-059**: Base local, cache, outbox e cursor devem ser segregados por `organization_id`; troca de tenant ou encerramento de sessão deve isolar ou limpar o contexto anterior sem sincronização cruzada.
- **RF-060**: A tela de inicialização deve comunicar de modo acessível os estados de inspeção local, conexão, push, pull, preparação, conclusão, falha, conflito, sessão expirada e acesso negado, com timeout máximo de 30 segundos antes de oferecer ação de recuperação ao usuário; a interface nunca permanece indefinidamente bloqueada.

## Requisitos não funcionais

- **RNF-001 — Segurança**: a autorização deve aplicar menor privilégio, separação entre autenticação e autorização e negação por padrão.
- **RNF-002 — Privacidade**: dados pessoais devem ser minimizados, associados a uma finalidade e excluídos de logs técnicos quando não forem necessários.
- **RNF-003 — Desempenho percebido**: em condições normais de referência, 95% dos logins válidos devem apresentar o resultado ao usuário em até 3 segundos, desconsiderando tempo externo de entrega de e-mail.
- **RNF-004 — Recuperação**: 95% das solicitações válidas de recuperação devem apresentar confirmação em até 2 segundos, sem prometer o prazo do provedor de e-mail.
- **RNF-005 — Responsividade**: todos os fluxos devem ser utilizáveis sem rolagem horizontal indevida de 360 px a desktop amplo.
- **RNF-006 — Acessibilidade**: os fluxos devem atender WCAG 2.2 AA e não introduzir violações críticas ou graves detectáveis automaticamente.
- **RNF-007 — PWA**: autenticação e proteção de rotas devem preservar instalação, atualização e shell offline da aplicação, sem cache indevido de credenciais ou dados protegidos.
- **RNF-008 — Resiliência**: indisponibilidade deve ser distinguida de falhas de credencial, autorização, validação e isolamento, sem fallback inseguro.
- **RNF-009 — Testabilidade**: requisitos de domínio, autorização, isolamento, contratos, interface, acessibilidade e PWA devem ser verificáveis de forma automatizada sempre que tecnicamente possível.
- **RNF-010 — Compatibilidade**: os fluxos devem funcionar nos navegadores e perfis de viewport homologados pelo projeto.
- **RNF-011 — Determinismo**: a ordem de endpoints, a classificação de falhas e as transições de sincronização devem produzir resultado repetível para a mesma entrada.
- **RNF-012 — Idempotência**: repetição após timeout, fechamento ou perda de rede não pode duplicar uma mutação já confirmada.
- **RNF-013 — Inicialização limitada**: cada probe deve respeitar o timeout configurado (padrão 3 s); o backoff deve possuir no máximo 3 ciclos (2 s → 4 s → 8 s); a outbox admite no máximo 5 tentativas por item antes de marcar `failed`; a interface nunca pode permanecer indefinidamente sem ação de recuperação, com teto de 30 segundos para a tela de inicialização.

## Regras de negócio

- **RN-001**: FluxID é a organização proprietária; tenants contratantes não recebem administração global.
- **RN-002**: Master FluxID e Administrador FluxID são papéis globais distintos; o segundo atua somente conforme permissões explícitas.
- **RN-003**: Administradores de tenant só administram recursos e permissões delegáveis do tenant ativo.
- **RN-004**: O conjunto efetivo de permissões é calculado por vínculo organizacional; nenhum papel ou permissão atravessa tenants.
- **RN-005**: Um usuário pode possuir identidade única e múltiplos vínculos, mas opera em um tenant ativo por vez.
- **RN-006**: Tenants suspensos ou inativos não permitem operações protegidas de seus usuários; seus dados e auditoria são preservados.
- **RN-007**: Usuários convidados não recebem acesso operacional antes da aceitação válida; usuários bloqueados ou inativos não operam naquele vínculo.
- **RN-008**: Um tenant não pode ficar sem ao menos um administrador ativo por remoção, bloqueio, inativação ou rebaixamento comum.
- **RN-009**: Permissões críticas globais são não delegáveis, mesmo que um cliente tente associá-las diretamente.
- **RN-010**: Ocultar controles na interface melhora a experiência, mas nunca substitui a autorização confiável da operação.
- **RN-011**: Eventos de auditoria de segurança e acesso são append-only para usuários da aplicação e não podem guardar senha, token, segredo de convite ou segredo de recuperação.
- **RN-012**: Mudanças de acesso devem produzir efeito em novas operações sem depender exclusivamente de informações antigas presentes no cliente.
- **RN-013**: Eventos de auditoria devem ser retidos por 5 anos; convites expirados, por 90 dias; perfis inativos, por 2 anos antes da anonimização, salvo obrigação legal de preservação documentada.

## Critérios de aceitação transversais

- **CA-001**: A suíte de isolamento usa Tenant A, Tenant B, usuário do Tenant A, usuário do Tenant B e Master FluxID.
- **CA-002**: Para cada entidade protegida por tenant, os testes comprovam acesso permitido no tenant correto e bloqueio de consulta, alteração e exclusão no tenant incorreto.
- **CA-003**: Uma requisição direta com `organization_id` do Tenant B feita pelo usuário do Tenant A não retorna nem modifica dados e não revela detalhes desnecessários sobre sua existência.
- **CA-004**: Testes unitários cobrem estados, transições, cálculo de permissões, delegabilidade e invariantes do último administrador.
- **CA-005**: Testes de integração comprovam autenticação, recuperação, sessões, convites, perfis, Storage, auditoria e autorização com o serviço de backend homologado.
- **CA-006**: Testes de contrato validam entradas, respostas sanitizadas, estados e limites de arquivos sem acoplar regras de domínio aos componentes React.
- **CA-007**: Testes de políticas de isolamento cobrem leitura, inserção, alteração e exclusão, incluindo tentativas diretas entre dois tenants.
- **CA-008**: Testes E2E cobrem login, logout, recuperação, sessão expirada, seleção de tenant, convite, gestão de usuário, RBAC, acesso negado e perfil.
- **CA-009**: Testes de acessibilidade verificam teclado, foco visível e não obscurecido, nomes acessíveis, anúncio de erros, contraste, ordem semântica e autenticação sem barreira cognitiva desnecessária.
- **CA-010**: Testes responsivos validam ao menos 360 px, tablet e desktop amplo, incluindo formulários, tabelas ou listas e diálogos.
- **CA-011**: Testes PWA comprovam que o shell continua instalável e que o modo offline não expõe conteúdo protegido nem simula sucesso de ações sensíveis.
- **CA-012**: A cobertura respeita os limites globais do projeto (85% de linhas e funções e 80% de branches, definidos em `vitest.config.ts`) e exige 95% de linhas, funções e branches nas regras de domínio e autorização desta Spec.

## Cenários de exceção e casos de borda

- Usuário válido sem vínculo ativo em qualquer tenant.
- Usuário com vínculos ativos e bloqueados em tenants diferentes.
- Tenant suspenso durante uma sessão já iniciada.
- Usuário bloqueado ou papel removido durante uma sessão já iniciada.
- Último administrador ativo tenta bloquear a si próprio ou perder o papel administrativo.
- Dois administradores alteram simultaneamente papéis ou o último administrador.
- Convites duplicados, expirados, revogados, já aceitos ou enviados para e-mail já vinculado.
- Convite expirado atinge 90 dias de retenção e deve ser eliminado sem remover a evidência de auditoria correspondente.
- Usuário acessa link de recuperação em navegador ou dispositivo diferente.
- Sessão expira durante envio de formulário ou troca de tenant.
- Renovação de sessão falha por indisponibilidade, revogação ou mudança de senha.
- Cliente altera rota, corpo, cabeçalho ou parâmetro com identificador de outro tenant.
- Permissão removida permanece em informação antiga da sessão ou da interface.
- Avatar possui extensão permitida e conteúdo inválido, tamanho excessivo ou tentativa de caminho de outro usuário.
- Aplicação fica offline antes ou depois do login, durante recuperação ou durante uma alteração de acesso.
- Destinos local, LAN e cloud possuem identidades ou configurações não equivalentes; a troca não presume transferência de sessão.
- Registro alterado local e remotamente; registro removido remotamente; dependência ainda não sincronizada.
- Permissão removida, tenant suspenso ou sessão expirada durante push/pull.
- Perda de rede, fechamento da PWA ou retorno de cloud durante sincronização.
- Operação repetida após resposta perdida e mudança de endpoint antes da confirmação.

## Requisitos de segurança

- **RS-001**: Senhas, tokens, chaves, segredos de convite e recuperação nunca devem aparecer em logs, auditoria, URLs persistidas ou mensagens de erro.
- **RS-002**: Somente chave publicável apropriada pode chegar ao frontend; chaves secretas e `service_role` permanecem exclusivamente em ambiente servidor controlado.
- **RS-003**: Nenhuma autorização pode depender somente do frontend, de rota oculta ou de identificador enviado pelo cliente.
- **RS-004**: Informações editáveis pelo próprio usuário não podem fundamentar decisões de autorização.
- **RS-005**: Políticas de acesso devem partir de negação por padrão e permitir somente ações necessárias ao ator, escopo e estado válidos.
- **RS-006**: Alterações devem validar tanto a linha originalmente acessível quanto o estado resultante, impedindo a troca de proprietário ou tenant.
- **RS-007**: Funções privilegiadas, quando inevitáveis, devem ter escopo mínimo, validar explicitamente identidade e autorização e não ficar expostas por padrão.
- **RS-008**: Mudanças de papel, permissão, vínculo, tenant ou sessão devem considerar a defasagem de credenciais e impedir continuidade indevida em operações sensíveis.
- **RS-009**: Endpoints de autenticação, recuperação, convite e arquivos devem possuir limites contra abuso compatíveis com o risco.
- **RS-010**: Mensagens de login e recuperação devem evitar enumeração de usuários e detalhes internos.
- **RS-011**: Uploads devem usar lista permitida de formatos, limite de tamanho, validação do conteúdo real e nomes/caminhos não controlados livremente pelo cliente.
- **RS-012**: Sessões devem admitir expiração e revogação; alteração de senha, bloqueio, inativação e suspensão devem ter comportamento verificável sobre sessões existentes.
- **RS-013**: Nenhum segredo ou credencial real pode ser versionado ou incluído nos artefatos desta Spec.
- **RS-014**: Ações críticas devem validar uma confirmação MFA vigente no momento da operação; autenticação convencional ou ocultação do controle na interface não satisfazem esse requisito.

## Requisitos de acessibilidade e experiência

- **RA-001**: Campos devem possuir rótulo visível, instrução associada e erro próximo, anunciado por tecnologia assistiva.
- **RA-002**: A ordem de foco deve seguir a ordem visual; o foco deve permanecer visível e não obscurecido em todos os fluxos.
- **RA-003**: Todos os controles devem operar por teclado, com alvos de toque mínimos de 44 × 44 px.
- **RA-004**: Cor não pode ser o único meio de comunicar estado, erro, sucesso, bloqueio ou permissão.
- **RA-005**: Login e redefinição devem permitir colar credenciais e usar gerenciadores de senha; não devem depender apenas de memória, transcrição ou desafio cognitivo.
- **RA-006**: Mensagens de erro devem indicar como corrigir o problema sem expor informações de segurança.
- **RA-007**: Ao expirar a sessão ou negar acesso, o foco deve ser conduzido de forma previsível para o aviso ou ação de recuperação.
- **RA-008**: Interfaces densas de papéis e usuários devem adaptar tabelas para uma apresentação operável em telas pequenas, sem perda de contexto.
- **RA-009**: Transições devem respeitar redução de movimento e não podem atrasar feedback essencial.

## Requisitos de auditoria

- **AUD-001**: Devem ser auditados eventos de login relevantes, logout, falha de recuperação, redefinição, renovação, expiração e revogação de sessão.
- **AUD-002**: Devem ser auditadas criação e mudança de estado de tenant; convite e mudança de estado de vínculo; criação ou alteração de papel; atribuição ou remoção de papel e permissão.
- **AUD-003**: Cada evento deve registrar identificador do ator quando conhecido, organização e tenant de contexto quando aplicável, ação, alvo, resultado, instante, origem técnica minimizada e justificativa quando exigida.
- **AUD-004**: Eventos devem ser imutáveis para usuários da aplicação, ordenáveis e consultáveis somente dentro do escopo autorizado.
- **AUD-005**: Tentativas negadas de operações críticas e acesso cruzado devem gerar evidência sem revelar dados do recurso alvo.
- **AUD-006**: Auditoria deve minimizar dados pessoais e nunca armazenar credenciais ou conteúdo secreto.
- **AUD-007**: A permissão `audit.read` concede somente leitura dos eventos do tenant ativo e não autoriza acesso global, alteração ou exclusão da trilha.
- **AUD-008**: Eventos de auditoria devem permanecer íntegros por 5 anos e ser descartados ao final do prazo, salvo retenção legal documentada que suspenda o descarte.
- **AUD-009**: A anonimização de perfil inativo após 2 anos deve remover ou tornar irreversivelmente não identificáveis os dados pessoais desnecessários, preservando somente referências mínimas exigidas para integridade e auditoria.
- **AUD-010**: Falha, pendência, confirmação e reenvio manual de mensagens de convite ou recuperação devem ser auditados sem registrar o conteúdo secreto do link.

## Requisitos de isolamento multitenant

- **ISO-001**: `organization_id` é o identificador canônico de isolamento nas entidades pertencentes a tenant.
- **ISO-002**: Identidade global, vínculo organizacional, papel e atribuição devem permanecer conceitos separados para suportar múltiplos tenants sem compartilhar permissões.
- **ISO-003**: A autorização deve derivar tenant e capacidades de vínculos confiáveis e ativos, e não aceitar o valor do cliente como autoridade.
- **ISO-004**: Dados globais da FluxID devem ser separados de dados pertencentes a tenant e possuir permissões próprias.
- **ISO-005**: Toda política de isolamento deve ser testada com ao menos dois tenants e cobrir tanto acesso permitido quanto bloqueado.
- **ISO-006**: Consultas agregadas globais só podem existir para papéis FluxID com permissão explícita e devem ser auditadas quando sensíveis.
- **ISO-007**: Armazenamento de arquivos deve aplicar o mesmo isolamento do dado relacional associado.
- **ISO-008**: Cache, estado da interface, fila offline e troca de tenant não podem reutilizar dados ou comandos de outra organização.

## Entidades principais

- **Organização**: representa a FluxID proprietária ou uma empresa contratante; possui natureza, estado e dados mínimos de identificação.
- **Perfil**: dados pessoais mínimos e preferências associadas à identidade autenticada, sem conter autorização editável pelo usuário.
- **Vínculo organizacional**: associação entre identidade e organização, com estado independente e histórico; delimita onde papéis podem ser atribuídos.
- **Convite**: autorização temporária e de uso controlado para criar ou ativar um vínculo específico; distingue os estados de envio pendente, enviado e falho dos estados de aceitação, expiração e revogação.
- **Papel**: agrupamento nomeado de permissões, global ou pertencente a um tenant conforme sua finalidade.
- **Permissão**: capacidade granular e estável, classificada como global, delegável ou não delegável.
- **Atribuição de papel**: associação de um papel a um vínculo, limitada ao mesmo escopo organizacional.
- **Sessão**: contexto autenticado com ciclo de vida, estado e tenant ativo quando aplicável.
- **Avatar**: arquivo de imagem validado e associado ao perfil, com acesso controlado.
- **Evento de auditoria**: evidência append-only de ação sensível ou evento de segurança, com ator, escopo, alvo e resultado sanitizados.
- **Configuração de endpoint**: URL, chave publicável, tipo e timeout validados sem expor valores sensíveis.
- **Estado de conectividade**: resolução, endpoint ativo, tentativas e falha sanitizada.
- **Base local**: armazenamento segregado por tenant para dados explicitamente permitidos, cursores e outbox; nunca contém credencial privilegiada.
- **Item de outbox**: comando idempotente pendente de confirmação remota, com ator, tenant, dispositivo, versão e estado.
- **Cursor de sincronização**: marco confirmado por tenant, coleção e endpoint de origem para pull incremental.
- **Conflito de sincronização**: registro das versões e do motivo que impedem convergência automática.

## Dependências

- Fundação técnica, PWA e resolvedor de conectividade entregues pela Spec 001.
- Serviço de identidade, banco relacional, armazenamento de arquivos e políticas de acesso providos pelo Supabase homologado.
- Captura local de e-mails em desenvolvimento, serviço padrão do Supabase restrito à homologação controlada e SMTP homologado para LAN/cloud produtivos.
- Política organizacional para classificação de permissões globais críticas e delegáveis.
- Definições aprovadas de retenção de auditoria e dados pessoais.
- Design system FluxID e matriz de testes existente.
- ADR-001 e contrato revisado de conectividade `cloud → LAN → local`.
- Persistência local transacional em IndexedDB, acessada por adapter próprio e segregada por `organization_id`, conforme decisão consolidada no planejamento e em `research.md`.

## Premissas e decisões assumidas

- O nome canônico do tenant em dados e políticas será `organization_id`, conforme a constituição e o `AGENTS.md`; “tenant” permanece como termo de negócio.
- Uma identidade poderá possuir múltiplos vínculos desde esta Spec, embora a operação use somente um tenant ativo por vez.
- Papéis preestabelecidos existem desde a ativação do ambiente e são imutáveis; papéis personalizados são limitados às permissões delegáveis do tenant.
- A exclusão física de tenants, vínculos, papéis em uso e auditoria não faz parte do fluxo comum; estados de inativação preservam rastreabilidade.
- E-mail e senha são o método de autenticação desta Spec; login social, SSO e acesso anônimo não estão incluídos.
- A interface pode antecipar bloqueios por experiência, mas o resultado definitivo sempre vem da autorização confiável.
- A recuperação de senha e convites usam mensagens e respostas resistentes à enumeração de contas.
- O serviço padrão de e-mail do Supabase não será tratado como canal produtivo; ambientes produtivos dependem de SMTP homologado, credenciais somente no servidor e domínio de envio configurado.
- O shell pode funcionar offline, mas login, recuperação, seleção inicial de tenant e alterações de acesso exigem validação online confiável.
- Cloud é a fonte preferencial. LAN/local são contingências independentes e não recebem a mesma escrita simultaneamente.
- Timestamps do dispositivo não são fonte definitiva de ordenação; versão e confirmação do servidor prevalecem.

## Fora do escopo

- Cadastro e operação de cilindros, tipos, identificadores e testes hidrostáticos.
- Estoque, custódia e reconciliação.
- Frota, veículos, viagens, paradas e funções operacionais do motorista.
- Clientes, unidades, roteirização, mapas, geocercas e telemetria.
- QR Code, Data Matrix, NFC e leitura de ativos.
- Comandos de bloqueio ou desbloqueio e integração IoT.
- Controle financeiro e faturamento.
- Login social, SSO empresarial, autenticação anônima e auto cadastro público.
- Implementação de funções operacionais do papel Motorista.
- Replicação automática de senha, refresh token, segredo MFA ou sessão Auth entre projetos Supabase distintos.
- Escrita simultânea em instâncias diferentes.

## Métricas de sucesso

- **MS-001**: 100% dos cenários de isolamento entre Tenant A e Tenant B bloqueiam consulta, alteração e exclusão cruzadas, inclusive por requisição direta.
- **MS-002**: 100% das operações protegidas avaliadas sem permissão explícita são negadas.
- **MS-003**: 100% das ações sensíveis definidas em auditoria produzem evento sanitizado e imutável para usuários da aplicação.
- **MS-004**: Pelo menos 95% dos usuários de teste concluem login válido na primeira tentativa em até 60 segundos, sem apoio externo.
- **MS-005**: Pelo menos 90% dos usuários de teste concluem recuperação de senha válida em até 5 minutos após receber a mensagem de recuperação.
- **MS-006**: Pelo menos 90% dos administradores de teste conseguem convidar um usuário e atribuir um papel permitido em até 3 minutos.
- **MS-007**: Zero credenciais privilegiadas, senhas, tokens ou segredos são encontrados em arquivos versionáveis, logs e artefatos entregues ao navegador.
- **MS-008**: Zero violações críticas ou graves de acessibilidade automatizada nos fluxos principais; navegação completa por teclado é aprovada em 360 px, tablet e desktop.
- **MS-009**: 100% das mudanças de tenant eliminam dados e ações pendentes visíveis do contexto anterior antes de liberar o novo contexto.
- **MS-010**: Todos os fluxos críticos apresentam estados inequívocos de carregamento, erro, sucesso, sessão expirada, acesso negado e offline quando aplicáveis.
- **MS-011**: 100% dos testes do modo automático comprovam a ordem `cloud → LAN → local` e interrupção imediata após sucesso ou falha bloqueante.
- **MS-012**: 100% das repetições controladas de comandos confirmados mantêm uma única alteração lógica no servidor.
- **MS-013**: 100% dos cenários de troca de tenant e sincronização com Tenant A/Tenant B impedem leitura, envio ou cache cruzado.

## Decisão futura fora do escopo desta Spec

As funcionalidades operacionais de Specs futuras ainda deverão ser classificadas como `offline-safe`, somente leitura, proibidas offline ou dependentes de confirmação cloud. Essa decisão não bloqueia a Spec 002: nesta Spec, operações de identidade, sessão, convite, RBAC, auditoria sensível e administração permanecem proibidas na outbox e no modo degradado.

> **Nota**: Topologia de identidade LAN/local, valores de probe/backoff/outbox/tela, reavaliação da cloud e estratégia padrão de conflitos estão resolvidos nos requisitos desta Spec.

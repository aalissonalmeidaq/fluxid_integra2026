# Especificação da funcionalidade: Navegação por permissão

**Branch da funcionalidade**: `feat/004-navegacao-por-permissao`

**Criada em**: 01/10/2026

**Status**: Rascunho, pronta para `/speckit-clarify` ou `/speckit-plan`

**Entrada**: Criar um menu de navegação no shell do FluxID que mostra só as telas que a pessoa autenticada pode usar, em celular e desktop, acessível por teclado e com a identidade visual da Spec 003. O servidor passa a informar, em consulta somente leitura, o que a pessoa pode fazer no tenant ativo (e no nível global, para o perfil global), sem expor dados de outros usuários ou tenants. O cliente só decide a aparência e nunca é a barreira de segurança.

## Clarifications

### Session 2026-10-01

- Q: A partir de qual largura o menu deixa de ficar recolhido e passa a ficar sempre visível? → A: Recolhido abaixo de 768 px; visível a partir de 768 px.
- Q: Onde o menu guarda as últimas permissões conhecidas para exibir offline? → A: Em armazenamento restrito à aba e à sessão, separado por pessoa e tenant, só com códigos de permissão, limpo ao sair (mecanismo no plano).
- Q: Como o menu atualiza as permissões durante o uso para cumprir o prazo de 60 segundos? → A: A cada navegação e a cada 60 s com a aba visível; pausa offline e retoma ao voltar a rede (mecanismo no plano).
- Q: O perfil global (Master) vê os itens do tenant só por ser global? → A: Não. Cada item segue a permissão que o servidor exige: os do tenant dependem de `tenant.manage` ou `audit.read` no tenant ativo; os globais dependem das permissões globais.
- Q: Enquanto as permissões carregam, o menu mostra o item da tela restrita já aberta pela URL? → A: Não. A regra vale para toda tela, inclusive a atual: o item só aparece após a confirmação das permissões.
- Q: No celular, tocar ou clicar fora do painel aberto o fecha? → A: Sim. Tocar ou clicar fora do painel o fecha e devolve o foco ao botão.
- Q: O menu aparece enquanto a sessão de um perfil global só pode seguir o fluxo de verificação em duas etapas? → A: Não. O menu fica oculto até o segundo fator ser confirmado.
- Q: Os detalhes técnicos de RF-016 e RF-020 ficam na spec ou só no plano? → A: Só no plano; a spec mantém o comportamento e os prazos.

## Contexto

A Spec 002 entregou as telas de identidade e administração e a Spec 003 deu a elas um shell e um padrão visual únicos, mas o aplicativo não tem menu. Hoje a pessoa só chega a pessoas do tenant, papéis, auditoria e organizações digitando o endereço. Em um celular, durante a validação da Spec 003, isso ficou evidente: só login, início, perfil e sair eram alcançáveis.

Mostrar um menu com todas as telas para todo mundo seria simples, mas induz ao erro: a pessoa clica e recebe "Acesso negado". Esta spec faz o menu mostrar só o que a pessoa pode usar. Para isso o cliente precisa saber o que ela pode fazer, e hoje não existe uma consulta das próprias permissões: as funções do servidor listam papéis e permissões apenas para quem administra o tenant.

As permissões atuais são `platform.manage` (global), `tenant.manage`, `audit.read` e `profile.read` (por tenant). As telas e a exigência de cada uma já existem na Spec 002: início e perfil para qualquer pessoa autenticada; pessoas do tenant e papéis e permissões para quem administra o tenant; auditoria do tenant para quem consulta auditoria; organizações e auditoria da plataforma para o perfil global, com segundo fator (AAL2). A decisão de acesso continua sendo do servidor.

## Objetivos

- Mostrar no shell um menu com as telas que a pessoa pode usar no tenant ativo, e as globais quando for perfil global.
- Funcionar em celular e em desktop, operável só pelo teclado, com o visual da Spec 003.
- Manter o servidor como única barreira: esconder um link é conveniência, não segurança.
- Acompanhar a troca de organização e a mudança de permissões.

## Atores

- **Administrador de tenant**: gerencia pessoas, papéis e consulta a auditoria da organização.
- **Operador técnico**: usa o aplicativo com poucas permissões; vê um menu curto.
- **Master FluxID (perfil global)**: administra organizações e consulta a auditoria da plataforma.
- **Pessoa com mais de uma organização**: troca de tenant e espera um menu coerente com a escolhida.
- **Pessoa sem permissão**: tenta abrir uma tela pelo endereço e recebe a negativa do servidor.
- **Alisson Almeida**: responsável pela validação humana do ciclo.

## Cenários de usuário e testes

### História 1 — Ver só as telas que posso usar (Prioridade: P1)

Depois de entrar, a pessoa vê no shell um menu com Início, Meu perfil e, conforme as permissões, pessoas do tenant, papéis e permissões, auditoria do tenant e, no perfil global, organizações e auditoria da plataforma.

**Por que esta prioridade**: sem isso o aplicativo não é navegável, e é o pedido que motivou a spec.

**Teste independente**: entrar com um administrador de tenant, um operador técnico e o Master e comparar os itens do menu com o esperado para cada um.

**Cenários de aceitação**:

1. **Dado** um administrador de tenant, **quando** entra, **então** o menu mostra Início, Meu perfil, Pessoas do tenant, Papéis e permissões e Auditoria do tenant, e não mostra Organizações nem Auditoria da plataforma.
2. **Dado** um operador técnico sem `tenant.manage` nem `audit.read`, **quando** entra, **então** o menu mostra só Início e Meu perfil.
3. **Dado** o Master FluxID, **quando** entra, **então** o menu mostra Organizações e Auditoria da plataforma, além de Início e Meu perfil, e só mostra os itens do tenant se ele tiver as permissões do tenant (RF-006).
4. **Dado** uma pessoa não autenticada, **quando** abre o aplicativo, **então** nenhum item de menu aparece além do que a tela de entrada já oferece.

### História 2 — Navegar no celular e no desktop, só com teclado (Prioridade: P1)

A pessoa usa o menu em 360 px (recolhido e aberto por um botão), em tablet e em desktop amplo (visível), e opera tudo só com o teclado.

**Por que esta prioridade**: a Spec 003 exige responsividade e acessibilidade em toda tela; o menu é o primeiro componente que a pessoa toca.

**Teste independente**: percorrer o menu só com Tab, Enter e Escape nas três larguras de referência, sem rolagem horizontal.

**Cenários de aceitação**:

1. **Dado** uma tela de 360 px, **quando** a pessoa aciona o botão do menu, **então** a lista de telas abre, o foco vai ao primeiro item e Escape fecha o menu devolvendo o foco ao botão.
2. **Dado** o menu aberto, **quando** a pessoa ativa um item, **então** vai à tela escolhida, o menu fecha no celular e o foco vai ao título da tela.
3. **Dado** qualquer largura, **quando** a pessoa está em uma tela, **então** o item correspondente é identificado por texto e por atributo acessível, e não só por cor.
4. **Dado** o menu, **quando** a pessoa usa só o teclado, **então** o primeiro Tab ainda leva ao link "Pular para o conteúdo principal", e cada item tem anel de foco visível de 3:1 ou mais e alvo de 44 por 44 px.

### História 3 — O servidor continua decidindo (Prioridade: P1)

Esconder um link não impede o acesso; a pessoa que abre uma tela pela URL sem permissão continua recebendo "Acesso negado" do servidor, e uma permissão retirada deixa de valer imediatamente no servidor, mesmo que o menu ainda a mostre por alguns instantes.

**Por que esta prioridade**: a constituição (item III) proíbe que a interface seja a barreira de segurança.

**Teste independente**: abrir cada tela administrativa pela URL com uma pessoa sem permissão e confirmar a negativa e que nenhum dado é entregue; retirar uma permissão e repetir.

**Cenários de aceitação**:

1. **Dado** um operador técnico, **quando** abre `/admin/papeis` pela URL, **então** recebe "Acesso negado" e nenhum dado do tenant.
2. **Dado** um administrador que perdeu `tenant.manage` depois de o menu carregar, **quando** aciona Pessoas do tenant, **então** o servidor recusa e a tela informa o acesso negado.
3. **Dado** uma consulta de permissões adulterada no cliente, **quando** a pessoa tenta ver telas que não lhe cabem, **então** o servidor continua recusando; o menu alterado não concede nada.

### História 4 — Trocar de organização e ver o menu certo (Prioridade: P2)

A pessoa com mais de uma organização troca de tenant e o menu passa a refletir as permissões dela naquele tenant, sem sobras do anterior.

**Por que esta prioridade**: o isolamento entre tenants é regra central; o menu não pode vazar o que a pessoa podia no outro.

**Teste independente**: com uma pessoa que administra o Tenant A e é só operadora no Tenant B, alternar entre os dois e comparar o menu.

**Cenários de aceitação**:

1. **Dado** administrador no Tenant A e operadora no Tenant B, **quando** troca de A para B, **então** o menu perde Pessoas do tenant, Papéis e permissões e Auditoria do tenant antes de a tela de B ser exibida.
2. **Dado** a troca de organização em andamento, **quando** o menu ainda não conhece as permissões do novo tenant, **então** mostra só o que vale em qualquer tenant (Início e Meu perfil) e indica o carregamento.
3. **Dado** o perfil global, **quando** troca de tenant, **então** os itens globais continuam, e os do tenant seguem o novo contexto.

### História 5 — Menu que informa carregamento, erro e offline (Prioridade: P2)

O menu trata os estados do Spec 003: enquanto as permissões carregam, quando a consulta falha e quando o aparelho está offline.

**Por que esta prioridade**: sem isso o menu parece vazio ou quebrado em rede ruim, que é o cenário de campo do produto.

**Teste independente**: forçar atraso, falha e perda de rede e observar o menu e o anúncio.

**Cenários de aceitação**:

1. **Dado** a consulta em andamento, **quando** o menu é exibido, **então** mostra Início e Meu perfil e um indicador de carregamento anunciado uma vez, sem bloquear o teclado.
2. **Dado** uma falha da consulta, **quando** o menu é exibido, **então** mostra Início e Meu perfil, avisa em texto que parte das telas não pôde ser listada e oferece tentar de novo; nenhum item restrito aparece.
3. **Dado** o aparelho offline, **quando** a pessoa abre o menu, **então** vê as últimas telas conhecidas dentro da mesma sessão e o estado offline, e nunca vê telas de uma sessão ou de um tenant anterior.

### História 6 — Mudança de permissão refletida no menu (Prioridade: P3)

Quando um administrador altera papéis, o menu da pessoa afetada se atualiza sem exigir que ela saia e entre.

**Por que esta prioridade**: melhora a experiência, mas a segurança já está garantida pelo servidor (história 3).

**Teste independente**: atribuir e remover um papel de uma pessoa logada e observar o menu dela.

**Cenários de aceitação**:

1. **Dado** uma pessoa logada, **quando** recebe `audit.read`, **então** o item Auditoria do tenant aparece em até 60 segundos ou na próxima navegação, o que ocorrer primeiro.
2. **Dado** uma pessoa logada, **quando** perde `audit.read`, **então** o item some no mesmo prazo, e o servidor já recusa o acesso desde o momento da retirada.

## Requisitos funcionais

### Consulta das permissões

- **RF-001**: O servidor deve oferecer uma consulta somente leitura que informa à pessoa autenticada quais permissões ela tem no tenant ativo e, quando for perfil global, quais permissões globais.
- **RF-002**: A consulta só pode revelar as permissões da própria pessoa no contexto dela: nunca as de outros usuários, de outros tenants nem a lista de papéis ou de pessoas.
- **RF-003**: A consulta deve respeitar a sessão vigente e não deve funcionar sem sessão válida. O nível de segurança (AAL) não filtra o resultado: as telas que exigem segundo fator o verificam ao abrir (RN-004).
- **RF-004**: A consulta deve usar o tenant ativo confirmado pelo servidor, nunca um identificador de organização escolhido pelo cliente sem validação.

### Menu

- **RF-005**: O shell deve exibir um menu de navegação para a pessoa autenticada, com as telas Início, Meu perfil, Pessoas do tenant, Papéis e permissões, Auditoria do tenant, Organizações e Auditoria da plataforma, na ordem e nos nomes usados pelos títulos das telas.
- **RF-006**: Cada item restrito só aparece se a consulta indicar que a pessoa pode usar a tela; Início e Meu perfil aparecem sempre que há sessão autenticada. Ser perfil global não concede, por si só, os itens do tenant: Pessoas do tenant e Papéis e permissões dependem de `tenant.manage` e Auditoria do tenant de `audit.read` no tenant ativo, enquanto Organizações e Auditoria da plataforma dependem das permissões globais.
- **RF-007**: O menu não deve exibir nenhum item restrito enquanto as permissões não estiverem confirmadas, nem em caso de falha da consulta. A regra vale também para a tela restrita já aberta pela URL: o item dela só aparece após a confirmação, e a proteção da tela continua sendo do servidor.
- **RF-008**: A regra que decide quais itens aparecem deve ser a mesma que o servidor aplica ao abrir cada tela; uma divergência entre as duas é um defeito.
- **RF-009**: O menu deve identificar a tela atual por texto e por atributo acessível, e não só por cor.
- **RF-010**: O menu deve usar os componentes, tokens e ícones da Spec 003, sem criar cor, tamanho ou espaçamento fora dos tokens.

### Responsividade e teclado

- **RF-011**: Abaixo de 768 px (por exemplo, 360 px) o menu deve ficar recolhido atrás de um botão com nome acessível; a partir de 768 px (tablet e desktop) deve ficar visível, sem rolagem horizontal em nenhuma largura de 320 px a 1920 px.
- **RF-012**: O menu deve ser operável só pelo teclado: Tab percorre os itens, Enter ativa, Escape fecha o menu aberto e devolve o foco ao botão, tocar ou clicar fora do painel aberto o fecha e devolve o foco ao botão, e o link "Pular para o conteúdo principal" continua sendo o primeiro item de Tab.
- **RF-013**: Ao ativar um item, o foco deve ir ao título da tela de destino (RA-006 da Spec 003) e, no celular, o menu deve fechar.
- **RF-014**: Todos os controles do menu devem ter alvo de 44 por 44 px e anel de foco visível de 3:1 ou mais.

### Contexto e atualização

- **RF-015**: A troca de organização deve atualizar o menu para as permissões do novo tenant, removendo antes os itens do tenant anterior (RA-006).
- **RF-016**: O menu deve refletir uma mudança de permissão da própria pessoa em até 60 segundos ou na próxima navegação, o que ocorrer primeiro, sem exigir novo login. A atualização acontece a cada navegação e a cada 60 segundos enquanto a aba está visível; offline ela pausa e, ao voltar a rede, é retomada.
- **RF-017**: Ao sair, ao expirar a sessão ou ao trocar de pessoa, o menu e qualquer permissão guardada devem ser descartados.

### Estados

- **RF-018**: O menu deve tratar carregamento, erro, offline e vazio com o vocabulário da Spec 003 (Loading, ErrorState ou Alert, SyncStatus), anunciando uma vez e sem mover o foco. Não há estado visual de vazio próprio: um conjunto sem permissões restritas mostra apenas Início e Meu perfil.
- **RF-019**: Em caso de falha da consulta, o menu deve oferecer tentar de novo e manter Início e Meu perfil.
- **RF-020**: Offline, o menu pode mostrar as últimas permissões conhecidas **da mesma pessoa e do mesmo tenant, dentro da sessão da aba**, sempre identificadas como possivelmente desatualizadas; nunca de sessão ou tenant anterior. Essas permissões ficam restritas à aba e à sessão, separadas por pessoa e tenant, contêm só códigos de permissão (sem credenciais ou dados pessoais) e são removidas ao sair (RF-017).

### Segurança e auditoria

- **RF-021**: Nenhuma tela pode depender do menu para ser protegida; abrir uma tela pela URL sem permissão continua resultando em "Acesso negado" do servidor, sem dado algum entregue.
- **RF-022**: O cliente não deve guardar, nem registrar em log, nenhuma credencial; a consulta usa só a chave publicável e a sessão da pessoa.
- **RF-023**: A leitura das próprias permissões não é ação sensível e não gera evento de auditoria; as negativas de acesso por URL mantêm o registro de auditoria que a Spec 002 já define.

## Requisitos não funcionais

- **RNF-001**: A consulta de permissões deve concluir em até 1 segundo no p95, com o backend simulado, e o menu não deve piorar em mais de 20% o carregamento do shell autenticado, comparado com o mesmo shell antes do menu e medido na mesma máquina (referência da Spec 003: 132 ms de mediana na tela de entrada, limite de 158 ms).
- **RNF-002**: O menu deve funcionar de 360 px a desktop amplo, em retrato e paisagem, e abrir offline com o aplicativo instalado.
- **RNF-003**: Nenhuma biblioteca de navegação ou de componentes nova deve ser adicionada sem justificativa registrada no plano.

## Regras de negócio

- **RN-001**: A autorização é decidida e aplicada pelo servidor; a consulta de permissões serve só à apresentação.
- **RN-002**: As regras de acesso das telas da Spec 002 não mudam: esta spec não cria, remove nem altera permissão.
- **RN-003**: Início e Meu perfil estão disponíveis a toda pessoa autenticada, independentemente de papel.
- **RN-004**: Telas que exigem segundo fator continuam levando a pessoa ao fluxo de verificação ao serem abertas com a sessão em AAL1; o menu as mostra se a pessoa tem a permissão, e a verificação é feita ao abrir. Exceção: enquanto a sessão estiver limitada ao fluxo de verificação em duas etapas (perfil global que ainda precisa confirmar o segundo fator), o menu não é exibido; ele aparece depois da confirmação.

## Critérios de aceitação transversais

- **CA-001**: Para cada perfil de teste (administrador de tenant, operador técnico, Master e pessoa com dois tenants), os itens do menu são exatamente os esperados, comprovados por teste automático.
- **CA-002**: Um teste com dois tenants confirma que a consulta devolve só as permissões do tenant ativo da pessoa e que um identificador de outro tenant não devolve nada dele (conjunto vazio, sem confirmar se o tenant existe).
- **CA-003**: Um teste confirma que um usuário sem permissão não consegue abrir nenhuma tela restrita pela URL, e que a adulteração do menu no cliente não concede acesso.
- **CA-004**: O menu não apresenta violações críticas ou graves de acessibilidade (WCAG 2.2 AA) em 360, 768 e 1920 px, e opera só pelo teclado com foco visível de 3:1 ou mais.
- **CA-005**: Nenhuma largura de 320 a 1920 px, nem o zoom de 200%, apresenta rolagem horizontal por causa do menu.
- **CA-006**: Carregamento, falha e offline do menu são exercitados em teste, sem mostrar item restrito e sem mover o foco.
- **CA-007**: As suítes das Specs 001 a 003 continuam passando sem mudança nas verificações de comportamento; só seletores e textos de apoio podem mudar.
- **CA-008**: As capturas de referência do menu, em três larguras e nos estados principais, entram na regressão visual da Spec 003.
- **CA-009**: Toda política de acesso ou função nova tem teste com pelo menos dois tenants, cobrindo o acesso permitido e o bloqueado.

## Cenários de exceção e casos de borda

- Pessoa sem nenhum vínculo ativo: o menu mostra só Início e Meu perfil, e a tela de escolha de organização segue o fluxo da Spec 002.
- Tenant suspenso ou vínculo bloqueado depois de o menu carregar: o servidor recusa e o menu se corrige na próxima atualização.
- Permissões que mudam durante uma navegação: o servidor decide; o menu só se ajusta depois.
- Consulta lenta ou que nunca responde: o menu cai para Início e Meu perfil e oferece tentar de novo, sem bloquear a navegação.
- Sessão expirada com o menu aberto: o menu some e a pessoa é conduzida à entrada com o aviso da Spec 002.
- Muitos itens em tela pequena: a lista rola dentro do menu, sem rolagem horizontal e sem cobrir o conteúdo ao fechar.
- Texto de item longo em 360 px: quebra dentro do alvo de 44 px sem estourar a largura.
- Perfil global sem tenant ativo: o menu mostra os itens globais e Início e Meu perfil.

## Requisitos de acessibilidade e experiência

- **RA-001**: O menu atende WCAG 2.2 AA, incluindo contraste, reflow, foco visível e não obscurecido e tamanho de alvo.
- **RA-002**: O menu é um landmark de navegação com nome acessível; só há um landmark principal na tela.
- **RA-003**: A tela atual é indicada por atributo acessível e por texto; a informação nunca depende só de cor.
- **RA-004**: Mudanças de estado do menu (carregamento, erro) são anunciadas sem mover o foco indevidamente.
- **RA-005**: O botão que abre e fecha o menu no celular informa se está aberto ou fechado.
- **RA-006**: O foco se move de forma previsível: ao abrir (primeiro item), ao fechar (botão) e ao navegar (título da tela).
- **RA-007**: O menu respeita a preferência de movimento reduzido e nada pisca mais de três vezes por segundo.
- **RA-008**: Leitor de tela está fora do escopo do projeto atual; a estrutura semântica continua coberta por testes automáticos.

## Entidades principais

- **Permissão da pessoa**: código de permissão que a pessoa tem no tenant ativo ou no nível global; só leitura e só dela.
- **Item de menu**: tela de destino, nome visível, regra de exibição e estado (atual ou não).
- **Contexto de navegação**: pessoa autenticada, tenant ativo e nível de segurança da sessão.

## Dependências

- Spec 002 (identidade, tenant ativo, papéis e permissões, auditoria) e Spec 003 (shell, componentes, tokens, estados e regressão visual).
- Constituição, itens II (TDD), III (multitenancy e segurança), IV (estados explícitos), V (experiência e acessibilidade) e VI (rastreabilidade).
- Infraestrutura de testes existente: backend simulado dos E2E, testes ao vivo com o Supabase local e testes de RLS com dois tenants.

## Premissas e decisões assumidas

- A pessoa vê uma tela no menu se tem a permissão que o servidor exige para ela; a verificação em duas etapas, quando exigida, acontece ao abrir (RN-004), e não esconde o item. Só a sessão limitada ao fluxo de verificação (ainda sem o segundo fator confirmado) oculta o menu inteiro.
- Mostrar só Início e Meu perfil durante o carregamento e na falha é preferível a mostrar tudo ou nada: nunca expõe item restrito e mantém a pessoa navegando.
- A leitura das próprias permissões não gera auditoria (RF-023), porque é uma leitura sem efeito e de dados da própria pessoa.
- O prazo de 60 segundos para refletir mudança de permissão (RF-016) é suficiente para a apresentação; a segurança não depende dele.
- O menu usa os nomes e a ordem dos títulos das telas atuais; telas futuras entram no menu quando forem criadas, com a mesma regra.
- O leitor de tela não será usado no projeto atual; a acessibilidade assistiva continua assegurada por estrutura semântica e testes automáticos.

## Fora do escopo

- Telas novas de produto, cilindros, estoque e histórico.
- Criar, alterar ou remover permissões e papéis; mudar a regra de acesso das telas existentes.
- Busca, favoritos, atalhos de teclado globais e personalização do menu.
- Notificações e indicadores numéricos no menu.
- Teste com leitor de tela e em aparelho real, que seguem como pendência de validação das specs anteriores.

## Métricas de sucesso

- **MS-001**: 100% dos perfis de teste veem exatamente os itens de menu esperados.
- **MS-002**: 0 telas restritas acessíveis pela URL por quem não tem permissão, e 0 itens restritos exibidos antes da confirmação das permissões.
- **MS-003**: 100% dos itens do menu operáveis só pelo teclado, com alvo de 44 px e foco de 3:1 ou mais.
- **MS-004**: 0 violações críticas ou graves de acessibilidade no menu nas três larguras de referência.
- **MS-005**: 0 vazamento de permissão entre tenants nos testes com dois tenants.
- **MS-006**: O carregamento do shell autenticado com o menu não piora mais de 20% em relação ao mesmo shell sem o menu, medido na mesma máquina, e a tela de entrada fica em até 158 ms.
- **MS-007**: A pessoa responsável aprova o menu em celular e desktop, com registro da validação humana (amostra, ambiente, duração e resultado).

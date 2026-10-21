# Especificação da funcionalidade: Perfis de demonstração e acessos de teste na página de login

**Branch da funcionalidade**: `feat/014-perfis-demonstracao`

**Criada em**: 20/10/2026

**Status**: Esclarecida (20/10/2026)

**Entrada**: Pedido do responsável pelo produto em 20/10/2026, depois do fechamento da Spec 013: criar perfis de demonstração no Supabase em nuvem e, na página de login, um botão que abre um modal com as credenciais dos acessos de teste da plataforma publicada, iguais às da plataforma local. Decisões do responsável no mesmo dia: só perfis de tenant (o Master não entra na demonstração) e o botão aparece em todos os ambientes, podendo ser desligado por configuração.

## Contexto

Hoje quem quer conhecer o FluxID publicado não tem como entrar. Na nuvem existe só o Master real, e o seed local, com usuários e senhas conhecidas, nunca vai para a nuvem (`docs/publicacao-em-nuvem.md`). No ambiente local, os usuários do seed existem para as suítes de teste: elas encerram sessões, trocam papéis e bloqueiam vínculos enquanto rodam, então não servem como acesso estável de demonstração.

Esta spec cria um conjunto pequeno e dedicado de acessos de demonstração:

- **Os mesmos acessos nos dois ambientes.** Os mesmos e-mails e senhas valem no Supabase local e no publicado. Quem aprende no local entra igual no publicado.
- **Só dentro do tenant da demonstração, o "Oxigênio Cariri".** Os perfis são do próprio tenant (administrador, operadores, auditor e motorista). O cilindro de teste C262 já está lá e, na nuvem, com o lacre de bancada vinculado, mostrando posição e saúde reais. Nenhum tem permissão da plataforma: não criam tenants, não aprovam nem retiram lacres e não veem a senha da rede de configuração dos lacres.
- **Visíveis na própria tela de login.** Um botão abre a lista dos acessos e preenche o formulário com um clique. A pessoa ainda confirma a entrada.

As credenciais exibidas são públicas por decisão do responsável e valem só para o tenant da demonstração.

## Clarifications

### Session 2026-10-20

- Q: Quais perfis entram na demonstração? → A: **Só perfis de tenant.** O Master não entra; na nuvem continua só o Master real.
- Q: Onde aparece o botão dos acessos de teste? → A: **Em todos os ambientes** (local e publicado), com uma configuração pública para desligar.
- Q: Em qual tenant fica a demonstração? → A: **No "Oxigênio Cariri"**, o primeiro tenant da nuvem (criado em 13/10/2026, hoje inativo, sem pessoas e sem cilindros). O script o reativa na nuvem, e o ambiente local cria o mesmo tenant, com o mesmo identificador.
- Q: O tenant da demonstração vem com dados? → A: **O cilindro de teste C262 e, na nuvem, o lacre de bancada DSP-P77E49TC vinculado a ele**, para os visitantes verem a posição e a saúde de um lacre real. Os visitantes podem pedir para travar ou destravar. Sem clientes nem viagens. No ambiente local, o C262 existe sem o lacre real, que fala só com a nuvem.
- Q: As contas de demonstração têm restrições que as outras não têm? → A: **Sim.** Ficam bloqueados os convites no tenant da demonstração, a troca e a recuperação de senha das contas de demonstração e o "Devolver à plataforma" do lacre de bancada. O resto segue as regras de qualquer tenant, inclusive travar e destravar.
- Q: (20/10/2026, durante a implementação) A empresa da demonstração ganha dados de exemplo além do C262? → A: **Sim, um conjunto enxuto**: cerca de 12 cilindros em situações diferentes, 3 clientes com unidades, 3 geocercas, 2 veículos, 2 motoristas (um ligado ao perfil Motorista da demonstração), 3 viagens (planejada, em andamento e concluída) e alertas gerados por lacres simulados (sem hardware), que falam pelo mesmo caminho do lacre real. Os dados entram pela restauração (local e nuvem), que recria o que faltar e devolve os registros publicados ao estado original; o que os visitantes cadastrarem a mais continua lá. O lacre de bancada continua no C262.
- Q: Quem roda o script que restaura a demonstração na nuvem? → A: **A pessoa responsável, pelo terminal, quando quiser, e uma rotina automática uma vez por dia, de madrugada**, com a chave secreta guardada só como segredo do repositório no GitHub.

## Objetivos

- Permitir que qualquer pessoa conheça a plataforma publicada pelos olhos de cada perfil de tenant, sem pedir acesso a ninguém.
- Manter a plataforma e os outros tenants protegidos: o acesso público alcança só o tenant da demonstração.
- Ter uma única fonte para os acessos de demonstração, usada pelo ambiente local, pela nuvem e pela tela de login, para que nunca fiquem diferentes.

## Atores

- **Visitante:** quem abre a página de login para conhecer o sistema. Escolhe um acesso de demonstração e entra.
- **Pessoa responsável pela operação:** cria ou restaura os acessos de demonstração na nuvem pelo terminal, com a chave secreta só no próprio ambiente, e cadastra o segredo da rotina diária.
- **Rotina diária de restauração:** roda o mesmo script uma vez por dia, de madrugada, no GitHub, com a chave secreta guardada como segredo do repositório.
- **Master real:** continua o único perfil global na nuvem. Não é afetado pela demonstração.

## Cenários de usuário e testes

### História 1 — O visitante vê os acessos de teste e entra com um deles (Prioridade: P1)

Na tela de login, o visitante aciona "Acessos de teste". Abre um modal com os perfis de demonstração. Para cada um, o modal mostra o papel, uma linha sobre o que ele pode fazer, o e-mail e a senha. O visitante escolhe "Usar este acesso": o modal fecha, o e-mail e a senha ficam preenchidos no formulário e o foco vai para o botão Entrar. A entrada só acontece quando ele confirma.

**Por que esta prioridade**: é o que o responsável pediu e o que dá valor à plataforma publicada.

**Teste independente**: abrir o login, acionar o botão, escolher um perfil e confirmar que o formulário fica preenchido, nada é enviado sozinho e, ao entrar, a pessoa chega à Visão geral do tenant da demonstração com o papel escolhido.

**Cenários de aceitação**:

1. **Dado** a tela de login, **quando** o visitante aciona "Acessos de teste", **então** abre um modal com os 5 perfis de demonstração, cada um com papel, descrição curta, e-mail e senha, e o aviso de que os acessos são públicos.
2. **Dado** o modal aberto, **quando** o visitante escolhe "Usar este acesso" em um perfil, **então** o modal fecha, o e-mail e a senha daquele perfil aparecem no formulário, o foco vai para "Entrar" e nenhum login é enviado.
3. **Dado** o formulário preenchido por um acesso de demonstração, **quando** o visitante confirma, **então** entra no tenant da demonstração com as telas daquele papel, e só elas.
4. **Dado** o modal aberto, **quando** o visitante pressiona Escape, clica fora ou aciona "Fechar", **então** o modal fecha e o foco volta ao botão "Acessos de teste".
5. **Dado** um celular de 360 px, **quando** o visitante abre o modal, **então** tudo cabe sem rolagem horizontal e cada ação tem área de toque adequada.

---

### História 2 — Os mesmos acessos existem no local e na nuvem (Prioridade: P1)

A pessoa responsável roda, no próprio terminal, o script de operação que cria ou restaura o tenant da demonstração e os 5 perfis na nuvem, com os mesmos e-mails e senhas do ambiente local. No local, o seed cria o mesmo conjunto. Rodar o script de novo não duplica nada e devolve tudo ao estado publicado.

**Por que esta prioridade**: sem os perfis na nuvem, o botão não serve para nada no site publicado.

**Teste independente**: rodar o script duas vezes contra o Supabase local isolado (sem o seed) e conferir que existem exatamente 1 tenant da demonstração, 5 perfis e o cilindro C262, que os 5 entram com as senhas publicadas e que o Master e os outros tenants não mudaram.

**Cenários de aceitação**:

1. **Dado** um projeto sem a demonstração, **quando** o script roda, **então** cria (ou reativa) o tenant "Oxigênio Cariri", os 5 usuários, os perfis, os vínculos ativos, um papel por usuário e o cilindro C262 em estoque, e registra a operação na auditoria da plataforma.
2. **Dado** a demonstração já criada, **quando** o script roda de novo, **então** nada é duplicado, e senha, situação do vínculo e papel de cada perfil voltam ao publicado.
3. **Dado** que um visitante bloqueou um vínculo, trocou um papel, mudou uma senha de demonstração ou inativou o C262, **quando** o script roda, **então** o perfil e o cilindro voltam ao estado publicado.
4. **Dado** que o "Oxigênio Cariri" tem algum vínculo de pessoa que não é de demonstração, **quando** o script roda, **então** ele para e explica, sem alterar nada, para nunca expor uma pessoa real às senhas públicas.
5. **Dado** qualquer execução, **quando** o script termina, **então** o Master real, os outros tenants e os dados deles estão exatamente como antes.
6. **Dado** o ambiente local recriado pelo seed, **quando** cada perfil de demonstração entra com a senha publicada, **então** os 5 entram no "Oxigênio Cariri" e veem o C262.

---

### História 3 — A demonstração não alcança a plataforma nem outros tenants (Prioridade: P1)

Mesmo com as senhas públicas, um perfil de demonstração só vê e altera o tenant da demonstração.

**Por que esta prioridade**: é o que torna seguro publicar as senhas.

**Teste independente**: com um segundo tenant e o Master, entrar com cada perfil de demonstração e tentar listar, abrir e alterar dados do outro tenant e telas da plataforma; tudo deve ser negado, sem revelar nada.

**Cenários de aceitação**:

1. **Dado** um perfil de demonstração, **quando** tenta abrir Organizações, Lacres da plataforma ou a Auditoria da plataforma, **então** recebe "Acesso negado" e o menu nem mostra essas telas.
2. **Dado** um perfil de demonstração, **quando** pede dados de outro tenant pelo endereço ou pelas funções do servidor, **então** a resposta é a mesma de um registro inexistente; quando a negação é por falta de permissão, ela fica auditada, como para qualquer usuário.
3. **Dado** o administrador de demonstração, **quando** tenta dar a alguém um papel ou permissão global, **então** o pedido é recusado.
4. **Dado** qualquer perfil de demonstração, **quando** procura a senha da rede de configuração dos lacres, **então** não há tela nem operação que a mostre.

---

### História 4 — Desligar os acessos de teste sem mexer no código (Prioridade: P2)

Quando a plataforma deixar de ser demonstração, a pessoa responsável desliga o botão por uma configuração pública do ambiente, sem alterar código.

**Por que esta prioridade**: hoje o pedido é mostrar sempre; desligar é preparação para o uso real.

**Teste independente**: publicar com a configuração desligada e conferir que o login não tem o botão nem nenhuma credencial na página.

**Cenários de aceitação**:

1. **Dado** a configuração ligada ou ausente, **quando** a tela de login abre, **então** o botão "Acessos de teste" aparece.
2. **Dado** a configuração desligada, **quando** a tela de login abre, **então** não há botão, modal nem credencial de demonstração na página.

---

### Casos de borda

- **Vários visitantes no mesmo perfil.** O limite de 3 sessões por pessoa (Spec 002) continua valendo. O quarto visitante vê o aviso de limite e escolhe uma sessão para encerrar, como qualquer usuário.
- **Visitante tenta mudar a senha ou recuperar o acesso.** A troca de senha de uma conta de demonstração é recusada pelo próprio Auth. Não há tela para isso: a página de nova senha só abre por um link de recuperação, que não é enviado a contas de demonstração. A recuperação de senha responde como para qualquer e-mail, sem revelar nada, e não envia nada a endereços de demonstração.
- **Visitante tenta convidar alguém.** O convite no tenant da demonstração é recusado com uma explicação simples, sem enviar e-mail. Assim a conta pública não serve para mandar e-mail a estranhos, e o tenant continua só com as pessoas da demonstração.
- **Visitante bloqueia outro perfil ou tira o papel dele.** O administrador de demonstração pode fazer isso dentro do tenant. O perfil volta ao normal na próxima execução do script. O último administrador nunca pode ser removido (Spec 002).
- **Visitante altera ou anonimiza dados do tenant.** Os dados do tenant da demonstração podem ser alterados por qualquer visitante. O modal avisa que os dados são públicos e podem mudar. O script restaura só o que é publicado (perfis e o C262); o que os visitantes cadastrarem a mais continua lá.
- **Visitante pede para travar ou destravar o lacre.** É permitido, como para qualquer administrador do tenant, com justificativa e auditoria. O lacre de bancada obedece de verdade.
- **Visitante desvincula o lacre do C262.** O script refaz o vínculo na próxima execução, se o lacre ainda estiver destinado ao tenant da demonstração.
- **Visitante tenta devolver o lacre à plataforma.** "Devolver à plataforma" (Spec 013) é recusado para o lacre de bancada no tenant da demonstração, com uma explicação simples. Se o lacre deixar de estar destinado ao tenant por outro caminho (por exemplo, retirado pelo Master), o script avisa e não tenta destiná-lo, porque destinar lacre é só do Master.
- **Visitante mexe nas redes Wi-Fi do lacre.** Pode adicionar ou remover redes extras. A rede padrão da plataforma (Spec 013, RF-023) nunca é apagada, então o lacre não perde a conexão.
- **Visitante muda o C262.** Um visitante pode editar, mudar a situação ou trocar a custódia do C262. O script devolve o cilindro ao estoque, ativo e com os dados publicados, sem apagar o histórico (Spec 006).
- **Ambiente sem a demonstração criada.** Se o botão estiver ligado e os perfis não existirem (por exemplo, nuvem antes do script), o login responde como a qualquer credencial errada, com a mensagem genérica.
- **E-mail de demonstração igual ao de um usuário real.** Os e-mails usam um domínio reservado que não recebe e-mail, então não colidem com pessoas reais. Se um deles já existir na nuvem com outro uso, o script para e explica, sem alterar o usuário.

## Requisitos

### Requisitos funcionais

- **RF-001**: Deve existir um conjunto fixo de 5 perfis de demonstração, um usuário para cada papel de tenant: administrador do tenant, operador de estoque, operador técnico, auditor do tenant e motorista, todos no tenant "Oxigênio Cariri", que tem o mesmo identificador no ambiente local e na nuvem.
- **RF-002**: Os acessos de demonstração (nome, papel, descrição curta, e-mail e senha) devem vir de uma única fonte, usada pelo ambiente local, pelo script da nuvem e pela tela de login, para que os três nunca fiquem diferentes.
- **RF-003**: Nenhum perfil de demonstração pode ter permissão global, pertencer a outro tenant ou ao tenant proprietário, nem ser Master. O Master não faz parte da demonstração.
- **RF-004**: O ambiente local deve criar o tenant "Oxigênio Cariri", os 5 perfis e o cilindro C262 ao ser recriado, com as mesmas credenciais da nuvem.
- **RF-005**: A nuvem deve ter um script de operação idempotente, rodado pela pessoa responsável no próprio terminal, que cria ou reativa o "Oxigênio Cariri" e cria ou restaura os 5 usuários, os perfis, os vínculos ativos, os papéis, as senhas publicadas e o cilindro C262 em estoque. O script nunca usa o seed, nunca altera o Master nem outros tenants, para sem alterar nada se o tenant tiver vínculos que não são de demonstração, e registra cada execução na auditoria da plataforma, sem a senha.
- **RF-006**: A tela de login deve ter o botão "Acessos de teste", que abre um modal com os perfis de demonstração: para cada um, o papel, uma descrição curta do que ele faz, o e-mail, a senha e a ação "Usar este acesso".
- **RF-007**: "Usar este acesso" deve preencher o e-mail e a senha no formulário, fechar o modal e levar o foco ao botão Entrar, sem enviar o login.
- **RF-008**: O modal deve avisar, em linguagem simples, que os acessos são públicos, valem só para o tenant da demonstração e que os dados podem ser alterados por outros visitantes; e pedir que não se cadastrem dados reais.
- **RF-009**: Uma configuração pública do ambiente deve ligar ou desligar o botão. Desligado, a página não mostra o botão, o modal nem nenhuma credencial de demonstração. Ausente, o botão aparece.
- **RF-010**: O botão e o modal seguem o padrão visual da Spec 005 e a moldura pública da tela de login, com WCAG 2.2 AA: operáveis só pelo teclado, foco visível e preso no modal, Escape e clique fora fecham, foco devolvido ao botão, leitores de tela anunciando o título e cada perfil, e de 360 px a desktop sem rolagem horizontal.
- **RF-011**: Os perfis de demonstração seguem todas as regras dos outros usuários (sessões, limite de 3 sessões, RLS, permissões, justificativas e auditoria), com as exceções de RF-016.
- **RF-012**: O isolamento do tenant da demonstração deve ser testado com pelo menos dois tenants, confirmando o acesso permitido dentro dele e o bloqueado fora (constituição, princípio III).
- **RF-013**: O cilindro de teste C262 deve existir no tenant da demonstração, ativo e em estoque. Restaurá-lo nunca apaga o histórico dele.
- **RF-014**: Na nuvem, o lacre de bancada DSP-P77E49TC deve ficar destinado ao tenant da demonstração e vinculado ao C262. A destinação é feita uma vez pelo Master real, em Lacres da plataforma (Spec 013, só o Master destina lacres). O script refaz o vínculo com o C262 quando o lacre está destinado ao tenant e sem vínculo, e avisa sem alterar nada quando o lacre não está destinado a ele.
- **RF-015**: Os perfis de demonstração veem a posição, a saúde, os alertas e os comandos do lacre conforme o próprio papel, como em qualquer tenant (Spec 012). Travar e destravar seguem a justificativa e a auditoria de sempre.
- **RF-016**: O servidor deve recusar, com mensagem simples nas telas que têm a ação: (a) convites no tenant da demonstração; (b) troca de senha das contas de demonstração; (c) recuperação de senha das contas de demonstração, respondendo como a qualquer e-mail e sem enviar nada; (d) "Devolver à plataforma" do lacre de bancada no tenant da demonstração. As negações de (a), (c) e (d) ficam na auditoria; a de (b) é recusada pelo próprio Auth, que registra a falha no log dele, porque a recusa desfaz a transação e não deixa gravar a auditoria da plataforma. A recusa vale no servidor, não só na tela, e a tela explica por que a ação não está disponível em vez de esconder o motivo.
- **RF-018**: A empresa da demonstração deve ter dados de exemplo publicados (cilindros em situações diferentes, clientes com unidades, geocercas, veículos, motoristas, viagens planejada, em andamento e concluída, e lacres simulados com posições e alertas), criados e restaurados pelas operações do domínio, com histórico e auditoria como os de uma pessoa. A restauração recria o que faltar e devolve os registros publicados ao estado publicado, sem apagar histórico nem o que os visitantes criaram. Viagem que um visitante fez avançar não volta atrás: a restauração cria outra no estado publicado quando os cilindros permitem, ou avisa.
- **RF-017**: Uma rotina automática deve rodar o script de restauração uma vez por dia, de madrugada (horário de Brasília), e também sob demanda. A chave secreta do projeto fica só como segredo do repositório no GitHub, nunca em arquivo versionado, log ou navegador. Sem o segredo cadastrado, a rotina falha com uma mensagem dizendo o que falta, sem tentar nada. O resultado de cada execução fica visível no próprio GitHub e na auditoria da plataforma.

### Regras de negócio

- **RN-001**: As credenciais de demonstração são públicas por decisão do responsável (20/10/2026). Elas não são segredo e por isso podem ficar no repositório e na página. Senhas de usuários reais, chaves e a senha da rede de configuração dos lacres continuam nunca versionadas.
- **RN-002**: A demonstração alcança só o tenant da demonstração. Qualquer permissão da plataforma fica fora dela.
- **RN-003**: O estado publicado da demonstração (usuários, vínculos ativos, papéis e senhas) é o que vale. O script devolve a ele o que visitantes tiverem mudado.
- **RN-004**: Uma conta de demonstração é reconhecida pelo servidor, e não pela tela, para que as restrições de RF-016 valham em qualquer caminho.

### Entidades principais

- **Acesso de demonstração**: nome de exibição, papel, descrição curta, e-mail de domínio reservado e senha pública. É o mesmo nos dois ambientes.
- **Tenant da demonstração**: o "Oxigênio Cariri", organização do tipo tenant, ativa, com o mesmo identificador nos dois ambientes. Contém só os perfis de demonstração, o cilindro C262 e os dados que os visitantes criam.
- **Cilindro de teste C262**: cilindro do tenant da demonstração, ativo e em estoque, restaurado pelo script.
- **Lacre de bancada DSP-P77E49TC**: o lacre físico da bancada, destinado ao tenant da demonstração e vinculado ao C262, só na nuvem.

## Critérios de sucesso

### Resultados mensuráveis

- **MS-001**: Um visitante sem conta entra na plataforma publicada com um perfil de demonstração em até 30 segundos depois de abrir a tela de login.
- **MS-002**: Os 5 perfis entram com as mesmas credenciais no ambiente local e no publicado (5 de 5 nos dois).
- **MS-003**: Nos testes de isolamento, 0 dados de outro tenant e 0 telas da plataforma são alcançados por perfis de demonstração.
- **MS-004**: Duas execuções seguidas do script deixam exatamente 1 tenant da demonstração, 5 perfis e 1 cilindro C262 ativo em estoque, e 0 alterações no Master e nos outros tenants.
- **MS-005**: Com a configuração desligada, a página de login não contém nenhuma das 5 credenciais.
- **MS-006**: Na nuvem, um visitante com o perfil de administrador de demonstração vê a posição e a saúde do lacre de bancada no C262 em até 1 minuto depois do envio do lacre.
- **MS-007**: Depois de qualquer mudança feita por visitantes, a demonstração volta ao estado publicado em até 24 horas sem ninguém agir, desde que a rotina diária esteja com o segredo cadastrado.

## Premissas e dependências

- Specs 002 (autenticação, tenants, papéis e RLS), 005 (tela de login) e 013 (acesso só com e-mail e senha, sem segundo fator) integradas.
- Os papéis de tenant padrão (administrador do tenant, operador de estoque, operador técnico, auditor do tenant e motorista) já existem e são criados para cada tenant novo.
- Os e-mails de demonstração usam um domínio reservado que não entrega e-mail. Convites e recuperação de senha para eles não chegam a ninguém.
- As senhas de demonstração seguem a política de senha atual da plataforma.
- O script da nuvem segue o modelo do `npm run operacao:primeiro-master` (Spec 010): roda no terminal de quem opera, com a chave secreta só no ambiente dessa pessoa, nunca no navegador nem no repositório.
- O "Oxigênio Cariri" é um tenant de teste, por decisão do responsável (20/10/2026). As senhas de demonstração dão acesso público a ele.
- Os papéis de tenant padrão do "Oxigênio Cariri" já existem na nuvem, porque são criados com o tenant.
- O lacre de bancada continua ligado e falando com a nuvem pela rede `FluxID`. Hoje ele está como pedido "aguardando" na nuvem.
- A rotina diária segue o modelo da limpeza de retenção (Spec 002): workflow do GitHub, segredo só no repositório e execução manual quando preciso.
- Travar e destravar pelos visitantes acionam o lacre real. Isso foi aceito pelo responsável para a demonstração (20/10/2026).

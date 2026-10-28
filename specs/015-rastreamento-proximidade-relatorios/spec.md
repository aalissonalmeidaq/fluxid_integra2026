# Especificação da funcionalidade: Rastreamento, proximidade e relatórios

**Branch da funcionalidade**: `feature/015-rastreamento-proximidade-relatorios`

**Criada em**: 22/10/2026

**Status**: Rascunho

**Entrada**: Fase 7 do PRD — acompanhar viagens e ativos no mapa, avaliar a proximidade entre o lacre e o celular do motorista, tratar afastamentos confirmados e emitir relatórios operacionais exportáveis.

## Esclarecimentos

### Sessão 2026-10-22

- P: Quais valores padrão devem determinar se uma comparação de proximidade é válida e configura afastamento? → R: Afastamento acima de 100 m; posições com até 2 minutos; precisão máxima de 50 m.
- P: Como o rastreamento do celular do motorista deve começar, continuar e terminar durante uma viagem? → R: Inicia ao começar a viagem, registra a cada minuto mesmo em segundo plano, sinaliza continuamente ao motorista e termina na conclusão ou no cancelamento.
- P: O que deve acontecer se o celular negar localização ou não conseguir rastrear em segundo plano durante a viagem? → R: A viagem continua; motorista e gestor recebem aviso; o rastreamento fica degradado e não confirma afastamento.
- P: Quem deve controlar os avisos por e-mail e qual deve ser o estado inicial? → R: O administrador libera categorias e cada pessoa opta por recebê-las; tudo começa desativado.
- P: Dentro de quais faixas a empresa poderá ajustar os limites de proximidade? → R: Distância de 50 a 500 m; idade de 1 a 5 minutos; precisão de 20 a 100 m.
- P: O que deve acontecer com as posições coletadas pelo celular quando a conexão cair durante uma viagem? → R: Guardar no aparelho e sincronizar em ordem, sem duplicar; avaliações atrasadas ficam identificadas como retrospectivas.
- P: Se posições sincronizadas com atraso confirmarem um afastamento que já aconteceu, como o FluxID deve tratar essa ocorrência? → R: Se a viagem ainda estiver ativa, abrir alerta marcado como retrospectivo; se já terminou, registrar somente ocorrência histórica.
- P: Como as permissões devem separar consulta de rastreamento, exportação de relatórios e configuração de avisos? → R: Separar permissões para consultar rastreamento, exportar relatórios e administrar categorias de aviso.
- P: Por quanto tempo o celular deve continuar coletando novas posições sem conexão antes de exigir nova autenticação online? → R: Até 8 horas; depois pausa novas coletas, preserva a fila e exige autenticação online.
- P: Quais categorias poderão ser liberadas pelo administrador para aviso por e-mail nesta spec? → R: Afastamento confirmado e alertas altos ou críticos de lacre, incluindo recuperação quando existir.

## Cenários de usuário e testes *(obrigatório)*

### História de usuário 1 — Acompanhar uma viagem em andamento (Prioridade: P1)

Como gestor logístico, quero ver no mapa a posição mais recente do veículo, do motorista e dos lacres de uma viagem em andamento, com horário e qualidade da informação, para reconhecer desvios e perda de acompanhamento sem consultar várias telas.

**Por que esta prioridade**: o acompanhamento operacional é a base para decidir se um afastamento exige ação e entrega valor mesmo antes dos relatórios.

**Teste independente**: iniciar uma viagem com posições válidas e degradadas, abrir seu acompanhamento com uma pessoa autorizada e confirmar que cada origem aparece de forma distinguível, atualizada e limitada à empresa ativa.

**Cenários de aceitação**:

1. **Dado** que uma viagem em andamento possui posições recentes do celular e de lacres vinculados, **quando** o gestor abre o acompanhamento, **então** vê os ativos no mapa, o instante da última posição, sua origem e sua condição de atualização.
2. **Dado** que uma origem deixou de informar posição no prazo esperado, **quando** o gestor consulta a viagem, **então** ela é apresentada como degradada, sem inventar deslocamento nem classificar automaticamente o cilindro como extraviado.
3. **Dado** que a pessoa não possui acesso à viagem ou pertence a outra empresa, **quando** tenta consultar o acompanhamento, **então** nenhum dado de posição ou trajeto é revelado.
4. **Dado** que não há conexão, **quando** uma posição já consultada estiver disponível no aparelho, **então** a interface a identifica como informação anterior, informa seu horário e não a apresenta como atual.

---

### História de usuário 2 — Detectar afastamento durante o transporte (Prioridade: P1)

Como gestor logístico, quero que o FluxID compare o GPS do celular do motorista com o GPS de cada lacre transportado para identificar possível separação física durante a viagem e permitir resposta rápida.

**Por que esta prioridade**: a proximidade é uma regra central de segurança do MVP e reduz falso positivo ao exigir evidência sucessiva, em vez de reagir a uma leitura isolada.

**Teste independente**: simular pares de posições do celular e do lacre antes, durante e depois de um afastamento e confirmar que somente três leituras válidas consecutivas acima do limite configurado abrem uma ocorrência.

**Cenários de aceitação**:

1. **Dado** que celular e lacre têm posições válidas durante a mesma viagem, **quando** três comparações consecutivas excedem o limite configurado, **então** o sistema confirma o afastamento, abre um alerta único e registra as evidências usadas.
2. **Dado** que apenas uma ou duas comparações excedem o limite, **quando** uma leitura posterior volta à faixa esperada, **então** nenhuma ocorrência de afastamento é confirmada e a sequência é reiniciada.
3. **Dado** que uma das posições está ausente, vencida ou imprecisa, **quando** a comparação seria realizada, **então** ela é marcada como inconclusiva e não conta a favor nem contra a confirmação.
4. **Dado** que o motorista faz uma leitura presencial válida do cilindro, **quando** não há GPS contínuo suficientemente preciso, **então** essa evidência confirma a presença naquele momento sem alegar proximidade contínua de dez metros.
5. **Dado** que a entrega do cilindro foi registrada, **quando** chegam novas posições, **então** a proximidade com o motorista deixa de ser avaliada e permanece a vigilância da geocerca do destino já prevista para o lacre.
6. **Dado** que o motorista inicia uma viagem, **quando** o acompanhamento começa, **então** o celular registra posição a cada minuto inclusive em segundo plano, mantém uma indicação visível durante toda a coleta e para ao concluir ou cancelar a viagem.
7. **Dado** que a localização foi negada ou o rastreamento em segundo plano deixou de funcionar, **quando** a viagem começa ou continua, **então** a operação não é bloqueada, motorista e gestor são avisados e a condição fica degradada sem confirmar afastamento.
8. **Dado** que o celular perde a conexão durante a viagem, **quando** continua coletando posições e depois se reconecta, **então** envia cada posição uma única vez, preserva horário e ordem originais e identifica como retrospectivas as avaliações realizadas após o fato.
9. **Dado** que posições atrasadas confirmam um afastamento, **quando** são sincronizadas, **então** o sistema abre alerta retrospectivo somente se a viagem ainda estiver ativa; se ela já terminou, registra a ocorrência apenas no histórico, sem aviso urgente.
10. **Dado** que o celular permanece sem conexão por oito horas desde a última confirmação online, **quando** a janela expira, **então** novas coletas são pausadas, a fila existente permanece intacta e o motorista é orientado a autenticar-se online.

---

### História de usuário 3 — Investigar trajeto e ocorrências (Prioridade: P2)

Como gestor ou auditor, quero consultar o histórico cronológico de uma viagem ou de um cilindro no mapa e em uma lista acessível, para reconstruir o trajeto e relacionar posições, perda de sinal, afastamentos, alertas e eventos de custódia.

**Por que esta prioridade**: a investigação transforma telemetria dispersa em evidência compreensível para operação, suporte e auditoria.

**Teste independente**: consultar um período conhecido contendo posições e eventos de naturezas diferentes e conferir ordem, filtros, origem, horários e correspondência entre mapa e lista.

**Cenários de aceitação**:

1. **Dado** um período com posições e eventos, **quando** a pessoa consulta o histórico, **então** vê o trajeto ordenado, as interrupções de acompanhamento e os eventos relacionados sem unir pontos através de lacunas como se houvesse um percurso comprovado.
2. **Dado** um intervalo sem posição válida, **quando** o histórico é exibido, **então** a lacuna fica explícita e não é preenchida por estimativa silenciosa.
3. **Dado** um conjunto grande de registros, **quando** a pessoa altera período e filtros, **então** recebe somente os dados do recorte solicitado e mantém uma alternativa textual ao mapa.
4. **Dado** que o registro pertence a outra empresa, **quando** uma pessoa tenta encontrá-lo por filtro, endereço ou identificador, **então** ele não aparece nem revela sua existência.

---

### História de usuário 4 — Tratar uma ocorrência de proximidade (Prioridade: P2)

Como pessoa autorizada, quero reconhecer, investigar e encerrar um alerta de afastamento com observação, para documentar a decisão operacional e manter uma trilha de auditoria.

**Por que esta prioridade**: detectar sem permitir tratamento deixa a operação incompleta e acumula alertas sem responsabilidade definida.

**Teste independente**: abrir um afastamento confirmado, reconhecê-lo e encerrá-lo com justificativa, verificando autorização, histórico imutável e ausência de alteração automática na custódia ou na trava.

**Cenários de aceitação**:

1. **Dado** um afastamento confirmado, **quando** uma pessoa autorizada o reconhece, **então** ficam registrados responsável e horário sem encerrar a ocorrência.
2. **Dado** um alerta reconhecido ou aberto, **quando** uma pessoa autorizada informa uma conclusão e o encerra, **então** o resultado fica auditado e o histórico original permanece preservado.
3. **Dado** um usuário sem autorização, **quando** tenta reconhecer ou encerrar o alerta, **então** a ação é negada e nenhuma informação é modificada.
4. **Dado** um afastamento confirmado, **quando** o alerta é aberto ou encerrado, **então** a situação de custódia e o estado físico conhecido da trava não mudam automaticamente.

---

### História de usuário 5 — Consultar e exportar relatórios essenciais (Prioridade: P2)

Como gestor ou auditor, quero gerar relatórios de viagens, telemetria, proximidade, alertas, entregas e custódia dentro de um período, para acompanhar a operação e compartilhar evidências sem montar planilhas manualmente.

**Por que esta prioridade**: os relatórios atendem uma entrega prevista do MVP e tornam os dados operacionais úteis fora da análise caso a caso.

**Teste independente**: selecionar um relatório, período e filtros com resultados conhecidos, comparar resumo e detalhes exibidos e exportar o mesmo recorte.

**Cenários de aceitação**:

1. **Dado** um período válido, **quando** o gestor gera um relatório, **então** vê critérios utilizados, data de geração, totais e registros detalhados coerentes com o recorte.
2. **Dado** um relatório apresentado, **quando** a pessoa o exporta, **então** o arquivo contém o mesmo recorte, cabeçalhos compreensíveis, horários com contexto e identificação da empresa.
3. **Dado** um filtro sem resultados, **quando** o relatório é solicitado, **então** a pessoa recebe um estado vazio claro e pode revisar os filtros sem baixar um arquivo enganoso.
4. **Dado** um relatório com dados sensíveis de localização, **quando** ele é consultado ou exportado, **então** somente pessoas autorizadas da empresa ativa recebem os dados mínimos previstos para sua finalidade.
5. **Dado** que uma pessoa pode consultar o rastreamento, mas não possui autorização para exportar, **quando** solicita um arquivo, **então** a exportação é negada sem retirar seu acesso à consulta.

---

### História de usuário 6 — Receber avisos operacionais por e-mail (Prioridade: P3)

Como gestor, quero escolher quais eventos críticos também geram aviso por e-mail, para tomar conhecimento mesmo quando não estiver com o aplicativo aberto, sem receber duplicatas ou mensagens de outra empresa.

**Por que esta prioridade**: complementa as notificações já existentes, mas a detecção, consulta e resposta aos eventos continuam funcionais sem esse canal.

**Teste independente**: ativar e desativar categorias de aviso para uma pessoa, abrir e recuperar alertas e confirmar destinatários, conteúdo mínimo, deduplicação e respeito às permissões.

**Cenários de aceitação**:

1. **Dado** que uma pessoa autorizada optou por uma categoria, **quando** um alerta elegível é aberto, **então** ela recebe no máximo um aviso referente à abertura, com contexto suficiente para acessar o FluxID e sem dados excessivos.
2. **Dado** que a pessoa desativou a categoria ou perdeu a permissão, **quando** ocorre um novo evento, **então** nenhum novo e-mail é destinado a ela.
3. **Dado** que um envio falha, **quando** a operação consulta o evento, **então** a falha do canal é visível e não altera nem duplica o alerta original.
4. **Dado** que o administrador da empresa liberou uma categoria, **quando** uma pessoa autorizada opta por recebê-la, **então** os próximos eventos elegíveis podem gerar e-mail; sem as duas escolhas, nenhum aviso é enviado.
5. **Dado** que ocorre um alerta médio, baixo ou meramente informativo, **quando** as preferências de e-mail são avaliadas, **então** nenhuma mensagem é enviada por esta funcionalidade.

### Casos extremos

- Posições chegam fora de ordem, repetidas ou com o mesmo instante; o histórico mantém uma ordem determinística e a avaliação não duplica comparações.
- O celular troca de motorista, veículo ou viagem; posições de contextos diferentes nunca formam um par de proximidade.
- Um lacre é removido da carga, devolvido à plataforma ou vinculado a outro cilindro; comparações posteriores respeitam o vínculo válido no instante observado.
- A viagem é cancelada, concluída ou fica sem motorista; a sessão de proximidade é encerrada sem apagar evidências anteriores.
- A precisão declarada é maior que o limite útil, o horário do aparelho diverge ou a posição está no futuro; a leitura é inconclusiva e o motivo fica visível.
- O limite de afastamento muda durante uma viagem; a regra aplicável e sua versão ficam associadas às comparações, sem reescrever decisões passadas.
- Um trajeto cruza a linha internacional de data ou regiões com fusos diferentes; consulta e exportação mantêm uma referência temporal inequívoca e uma apresentação compreensível.
- O mapa externo está indisponível; lista, filtros, estados e exportações continuam utilizáveis, e a indisponibilidade é informada.
- Uma exportação ultrapassa o volume que pode ser entregue imediatamente; a pessoa recebe progresso, conclusão ou falha, sem arquivo parcial apresentado como completo.
- A pessoa troca de empresa enquanto consulta ou exporta; o contexto anterior é descartado antes de qualquer novo resultado.
- A sessão ou a empresa ativa muda antes da sincronização de posições móveis; os itens ficam presos à conta, à empresa e à viagem de origem e nunca são enviados no contexto novo.

## Requisitos *(obrigatório)*

### Requisitos funcionais

- **RF-001**: O sistema deve oferecer uma visão de acompanhamento das viagens em andamento com as posições mais recentes disponíveis do celular do motorista e dos lacres vinculados à carga.
- **RF-002**: Cada posição apresentada deve informar, de forma compreensível, sua origem, instante, precisão disponível e condição de atualização.
- **RF-003**: O sistema deve distinguir informação atual, atrasada, ausente e inconclusiva, sem estimar silenciosamente uma posição inexistente.
- **RF-004**: O mapa deve possuir uma alternativa textual completa para posições, estados e eventos relevantes.
- **RF-005**: A pessoa deve poder filtrar o acompanhamento por viagem, veículo, motorista, cilindro, lacre, estado e período, dentro de suas permissões.
- **RF-006**: Resultados de mapa, lista, contadores e filtros devem permanecer coerentes entre si para o mesmo recorte.
- **RF-007**: O sistema deve avaliar proximidade somente durante o transporte, entre o celular associado à execução da viagem e cada lacre válido da carga no mesmo contexto temporal.
- **RF-007a**: O rastreamento do celular deve iniciar junto com a viagem, tentar registrar uma posição a cada minuto inclusive quando o aplicativo estiver em segundo plano e terminar quando a viagem for concluída ou cancelada.
- **RF-007b**: O motorista deve receber uma indicação contínua e inequívoca enquanto o celular estiver sendo rastreado.
- **RF-007c**: Negação de localização ou indisponibilidade do rastreamento em segundo plano não deve bloquear a viagem; deve avisar o motorista no painel de coleta e o gestor por meio do estado degradado, com motivo e horário de início, na lista de viagens ativas, no acompanhamento e na cronologia; marcar o acompanhamento como degradado e impedir a confirmação de afastamento enquanto não houver posições válidas.
- **RF-007d**: Durante uma perda de conexão, o celular deve continuar coletando as posições da viagem e guardá-las no aparelho, vinculadas à conta, à empresa e à viagem de origem; ao reconectar, deve sincronizá-las em ordem, de forma idempotente e com o horário original.
- **RF-007e**: Avaliações realizadas somente após a sincronização de posições atrasadas devem ser identificadas como retrospectivas e não podem ser apresentadas como detecção em tempo real.
- **RF-007f**: Um afastamento retrospectivo deve abrir alerta identificado como atrasado somente enquanto a viagem estiver ativa; depois da conclusão ou do cancelamento, deve gerar apenas ocorrência histórica, sem notificação urgente.
- **RF-007g**: A coleta offline de novas posições deve ser permitida por até 8 horas desde a última confirmação online; depois disso, deve pausar sem apagar a fila e só retomar após autenticação online válida da mesma conta e empresa.
- **RF-007h**: A fila de uma viagem deve comportar ao menos 480 posições móveis por aparelho, correspondentes à coleta de uma posição por minuto durante toda a janela offline de 8 horas.
- **RF-008**: Uma comparação deve ser considerada válida somente quando ambas as posições atendem aos limites vigentes de idade e precisão.
- **RF-009**: O limite de afastamento, a idade máxima e a precisão aceitável devem ser configuráveis por empresa, respectivamente, entre 50 e 500 m, entre 1 e 5 minutos e entre 20 e 100 m; os valores padrão são distância acima de 100 m, posições com até 2 minutos e precisão máxima de 50 m.
- **RF-009a**: Somente pessoas com permissão específica para administrar a regra de proximidade podem alterá-la; a alteração exige justificativa, cria nova versão vigente a partir do momento da gravação, não reescreve comparações anteriores e gera auditoria com valores anterior e novo.
- **RF-010**: O sistema deve confirmar afastamento somente após três comparações válidas consecutivas acima do limite vigente.
- **RF-011**: Uma comparação válida dentro do limite deve reiniciar a sequência ainda não confirmada.
- **RF-012**: Leituras ausentes, vencidas ou imprecisas devem ser inconclusivas e não podem confirmar nem desfazer sozinhas um afastamento.
- **RF-013**: Cada avaliação deve preservar as duas evidências de posição, a distância apurada, a regra vigente, o resultado e o vínculo operacional que justificou a comparação.
- **RF-014**: Um afastamento confirmado deve abrir um único alerta por sessão e par de acompanhamento enquanto a ocorrência anterior permanecer aberta.
- **RF-015**: A confirmação de afastamento não deve, por si só, alterar custódia, situação do cilindro ou estado físico conhecido da trava.
- **RF-016**: Uma leitura presencial válida deve poder registrar presença pontual quando não houver GPS contínuo suficiente, sem ser apresentada como prova de proximidade contínua.
- **RF-017**: A proximidade com o motorista deve terminar para o cilindro entregue; após a entrega, prevalece a vigilância da geocerca de destino.
- **RF-018**: Cancelamento ou conclusão da viagem deve encerrar novas avaliações e preservar todo o histórico produzido.
- **RF-019**: Pessoas autorizadas devem poder consultar um histórico por viagem ou cilindro que combine posições, lacunas, proximidade, alertas e eventos operacionais em ordem cronológica.
- **RF-020**: O histórico não deve desenhar nem afirmar percurso contínuo através de intervalos sem evidência válida.
- **RF-021**: A consulta histórica deve permitir recorte temporal e filtros, com paginação ou carregamento progressivo que não altere a ordem dos fatos.
- **RF-022**: Pessoas autorizadas devem poder reconhecer e encerrar alertas de afastamento, registrando responsável, horário e observação obrigatória no encerramento.
- **RF-023**: A abertura, o reconhecimento e o encerramento de ocorrências devem gerar auditoria imutável, sem incluir coordenadas ou outros dados desnecessários no registro de auditoria.
- **RF-024**: O sistema deve oferecer relatórios de viagens, disponibilidade de telemetria, ocorrências de proximidade, alertas, entregas e histórico de custódia.
- **RF-025**: Todo relatório deve explicitar empresa, tipo, período, filtros, instante de geração, totais e critérios de interpretação.
- **RF-026**: A pessoa deve poder examinar o resumo e os registros que sustentam os totais antes de exportar.
- **RF-027**: A exportação deve reproduzir o mesmo recorte autorizado mostrado na consulta e utilizar formato tabular amplamente utilizável.
- **RF-028**: Exportações demoradas devem apresentar estado de preparação, conclusão, expiração ou falha, e nunca disponibilizar arquivo parcial como completo.
- **RF-029**: Toda geração e obtenção de exportação deve registrar auditoria com tipo, filtros, período, responsável e resultado, sem copiar o conteúdo integral do arquivo.
- **RF-030**: O sistema deve impedir fórmulas executáveis ou conteúdo ativo originado de dados textuais em arquivos tabulares exportados.
- **RF-031**: Uma exportação deve ficar disponível somente à pessoa que a solicitou e enquanto ela mantiver autorização na mesma empresa.
- **RF-032**: O administrador da empresa deve poder liberar ou retirar as categorias elegíveis para aviso por e-mail — afastamento confirmado e alertas altos ou críticos de lacre, incluindo a recuperação quando existir — e cada pessoa autorizada deve poder optar individualmente pelas categorias liberadas; todas as opções começam desativadas.
- **RF-033**: O aviso por e-mail deve conter somente contexto mínimo, não deve incluir coordenadas precisas e deve direcionar a pessoa autenticada ao registro correspondente.
- **RF-034**: O sistema deve enviar no máximo um aviso de abertura e, quando aplicável, um de recuperação por destinatário e ocorrência; alertas médios, baixos ou informativos não são elegíveis nesta spec.
- **RF-035**: Falhas no canal de e-mail devem ser rastreáveis e não podem alterar, encerrar nem duplicar o alerta de origem.
- **RF-036**: Nenhuma posição, avaliação, relatório, exportação, preferência ou aviso pode atravessar o limite da empresa ativa; acesso permitido e bloqueado devem ser verificáveis com pelo menos duas empresas.
- **RF-037**: A autorização deve distinguir, no mínimo, consulta de rastreamento, exportação de relatórios, administração das categorias de aviso e administração da regra de proximidade; conceder uma dessas capacidades não deve conceder automaticamente as demais, e todas devem ser verificadas independentemente do que a interface oculta.
- **RF-038**: Dados de localização devem ser minimizados em telas, exportações, avisos, registros e diagnósticos conforme a finalidade de cada saída.
- **RF-039**: A experiência deve cobrir carregamento, vazio, erro, offline, atualização, informação degradada, permissão negada e indisponibilidade do mapa.
- **RF-040**: As telas devem ser operáveis por teclado e tecnologia assistiva, adaptar-se de 360 px a desktop amplo e preservar instalação e funcionamento do PWA.
- **RF-041**: Atualizações recebidas enquanto a pessoa consulta mapa ou histórico não devem roubar foco, alterar inesperadamente sua seleção nem anunciar mudanças irrelevantes de forma repetitiva.
- **RF-042**: O produto deve deixar claro quando um número é medido, agregado, indisponível ou inconclusivo e não pode apresentar dados de exemplo como dados operacionais.

### Entidades principais

- **Sessão de proximidade**: período em que um celular de motorista e os lacres da carga podem ser comparados no contexto de uma viagem; guarda início, fim, participantes e regra vigente.
- **Posição móvel**: evidência de localização do celular associada à pessoa, empresa, viagem e instante, com precisão, condição de validade, estado de sincronização e origem em uma coleta ativa explicitamente indicada ao motorista.
- **Comparação de proximidade**: pareamento de uma posição móvel e uma posição do lacre, com distância, regra aplicada, resultado e motivo quando inconclusiva.
- **Ocorrência de afastamento**: confirmação formada por três comparações consecutivas válidas, relacionada a viagem, cilindro, lacre e alerta tratável.
- **Regra de proximidade**: limites vigentes de distância, idade e precisão, com período de validade e empresa responsável.
- **Visão de trajeto**: recorte cronológico autorizado que reúne posições, lacunas e eventos sem criar novos fatos operacionais.
- **Relatório**: definição do tipo, período, filtros, totais e linhas detalhadas consultadas pela pessoa.
- **Exportação**: materialização temporária e auditável do recorte de um relatório para uma pessoa autorizada.
- **Preferência de aviso**: escolha inicialmente desativada de uma pessoa autorizada sobre categorias que o administrador da empresa liberou para envio por e-mail.

## Critérios de sucesso *(obrigatório)*

### Resultados mensuráveis

- **CS-001**: Em pelo menos 95% das atualizações válidas de uma viagem acompanhada, a nova condição fica visível para o gestor em até 10 segundos após o recebimento pelo FluxID.
- **CS-002**: Em 100% dos cenários de teste, um afastamento só é confirmado após três comparações válidas consecutivas acima do limite e nunca por leitura isolada, ausente ou imprecisa.
- **CS-003**: Em 100% dos testes com duas empresas, nenhuma posição, trajeto, ocorrência, relatório, exportação ou preferência da outra empresa é revelada.
- **CS-004**: Gestores conseguem localizar uma viagem em andamento e compreender a condição de cada origem de posição em até 30 segundos, sem ajuda externa, em pelo menos 90% das validações.
- **CS-005**: Uma pessoa autorizada consegue reconstruir a sequência de posições, lacunas e eventos de uma ocorrência conhecida em até 2 minutos.
- **CS-006**: Relatórios de até 10.000 registros ficam disponíveis para consulta ou preparação de exportação em até 30 segundos em pelo menos 95% das solicitações válidas.
- **CS-007**: Em 100% das amostras, resumo, detalhes exibidos e arquivo exportado apresentam o mesmo recorte e os mesmos totais.
- **CS-008**: Em 100% dos alertas de afastamento testados, abertura, reconhecimento e encerramento preservam evidências e auditoria sem alterar automaticamente custódia ou trava.
- **CS-009**: Em 100% dos testes de aviso, cada destinatário elegível recebe no máximo uma mensagem por tipo de transição da ocorrência, e pessoas sem permissão não recebem nenhuma.
- **CS-010**: Todas as jornadas essenciais podem ser concluídas por teclado, sem violação crítica ou grave de acessibilidade, nas larguras de 360, 768 e 1920 px.
- **CS-011**: Quando o mapa estiver indisponível, 100% das posições, estados e eventos necessários à operação permanecem consultáveis por alternativa textual.
- **CS-012**: Nenhuma exportação de teste interpreta texto fornecido por usuário como fórmula ou conteúdo ativo ao ser aberta em ferramenta tabular comum.
- **CS-013**: Em 100% dos testes de localização negada ou rastreamento em segundo plano indisponível, a viagem continua, os dois públicos recebem aviso, o estado fica degradado e nenhum afastamento é confirmado sem evidência válida.
- **CS-014**: Em 100% dos testes de reconexão, cada posição móvel coletada offline é sincronizada uma única vez no contexto original, mantém seu horário e produz avaliação claramente identificada como retrospectiva.
- **CS-015**: Em 100% dos testes de autorização, uma pessoa com apenas uma das permissões novas não consegue exercer as demais, inclusive por acesso direto.
- **CS-016**: Em teste de 8 horas offline, as 480 posições esperadas permanecem disponíveis para sincronização; ao exceder a janela, nenhuma nova posição é coletada e nenhum item pendente é perdido.

## Premissas

- A Spec 012 continua sendo a fonte das posições do lacre, da saúde, dos alertas e da vigilância de geocerca; esta spec amplia o uso desses dados e não substitui seu ciclo de vida.
- A associação entre motorista, veículo e viagem criada nas specs anteriores identifica o celular cuja posição participa da proximidade.
- O produto adota como padrão afastamento acima de 100 m, posições com até 2 minutos e precisão máxima de 50 m; a empresa pode ajustar, respectivamente, entre 50 e 500 m, entre 1 e 5 minutos e entre 20 e 100 m.
- Os relatórios essenciais são operacionais e auditáveis; painéis analíticos avançados, inteligência preditiva, faturamento e integrações com ERP ficam fora do escopo.
- A exportação tabular é o formato mínimo do MVP; documentos diagramados não são necessários para considerar esta spec concluída.
- O mapa depende de um provedor substituível, mas lista, histórico textual, alertas e relatórios não podem depender da disponibilidade visual desse provedor.
- Avisos por e-mail complementam as notificações do aplicativo e não constituem confirmação de leitura nem substituem o registro interno do alerta.
- A política completa de retenção e anonimização de coordenadas, fotos e assinaturas será tratada em uma spec de privacidade; até lá prevalecem minimização, autorização e os prazos já vigentes no produto.
- Roteirização avançada, acompanhamento fora de viagens, homologação de hardware, cifragem da memória do lacre e alterações mecânicas pertencem a fases posteriores.

# Resultados da validação da Spec 015

Síntese sanitizada, sem coordenadas, e-mails, tokens ou dados pessoais. A validação humana foi guiada pelo roteiro de `quickstart.md`
em 27/10/2026 e concluída em 28/10/2026, com a empresa de demonstração "Oxigênio Cariri" no Supabase local. As respostas da pessoa responsável
estão em "Entrevista de validação (T111)", no fim desta seção, e no RIA.

## Ambiente

- Gestor: Chrome no Windows 11, servidor de desenvolvimento local.
- Motorista: celular Android 14 com o aplicativo nativo (Capacitor) instalado por USB, ligado ao Supabase local.
- Etapas 4 a 6: navegador automatizado (Playwright, Chromium) contra o mesmo Supabase local, a pedido da pessoa responsável.

## Roteiro humano (T109)

| Etapa | O que foi feito | Resultado |
|---|---|---|
| 1. Acompanhamento do gestor | Viagem simulada com dois lacres, lacuna e afastamento; leitura da lista, do mapa e do texto | A pessoa respondeu "tudo funcionou". CS-004: "9 ou 10 corretas", sem tempos cronometrados |
| 2. Coleta do motorista | Aplicativo em segundo plano e sem conexão; reabertura | Posições guardadas no aparelho e enviadas ao reabrir, como retrospectivas, sem duplicar e com a sequência contínua. Defeito encontrado e corrigido: o backup automático do Android encerrava o processo de coleta |
| 3. Proximidade | Afastamento confirmado, retorno, leitura imprecisa, leitura antiga, retrospectiva com viagem ativa e encerrada, regra alterada com justificativa, recusa para o auditor | Cenários 3a, 3b, 3c, 3d, 3e/3f, 3h e 3i passaram. O GPS dentro de casa tinha precisão de cerca de 100 m; com autorização da pessoa, parte dos cenários usou um celular simulado. O 3b também ocorreu com GPS real |
| 4. Histórico e relatórios | Histórico da viagem e do cilindro, seis relatórios, recorte vazio, CSV, permissões e estados da exportação | Tudo passou. Corrigidos: critérios por extenso, tabela sem quebrar palavras no desktop, download pelo destino ativo e CSV no horário de Brasília com textos em português |
| 5. E-mail e administração | Liberação e escolha pelas telas, envio, repetição, recuperação, severidade média, falhas do provedor, retirada de escolha e de liberação, conta sem permissão | Tudo passou com o provedor falso. Decididos durante a validação: o e-mail diz o tipo do alerta, e retirar a liberação desliga a escolha das pessoas |
| 6. Acessibilidade e responsividade | axe, teclado, foco, nomes acessíveis e rolagem em 13 telas, em 360, 768 e 1920 px | Nenhuma violação do axe, nenhuma rolagem horizontal, foco com nome e anel visível, foco estável durante a atualização. Corrigidos: nome e teclado nos pontos do mapa, caixa de seleção que encolhia |

Defeitos encontrados na validação e corrigidos com testes: T113 a T125 em `tasks.md`.

## Pendências da validação

Situação em 28/10/2026, depois do pedido da pessoa responsável para resolver as pendências:

- Teste com leitor de tela real: **aprovado** pela pessoa responsável em 28/10/2026, dentro da validação de 58 min. A Etapa 6 já
  cobria nomes acessíveis, papéis, foco e anúncios com axe e teclado.
- CSV no Excel: **resolvido**. Um CSV gerado pelo mesmo código da exportação, com 13 valores perigosos (`=`, `+`, `-`, `@`, tab, CR,
  `HYPERLINK`, comando DDE, telefone e códigos que começam com sinal), foi aberto no Excel 16 do Windows com as configurações regionais.
  Resultado: nenhuma célula com fórmula, nenhum link, acentos corretos, separador `;` reconhecido e números com vírgula.
- Cenário 3g: **resolvido** (T131). O teste `supabase/tests/015_delivery_geofence_handoff.test.sql` faz o fluxo completo: a entrega
  encerra a proximidade, abre a vigilância da geocerca do destino, e duas saídas do lacre abrem a violação e o alerta alto da Spec 012,
  sem nenhuma comparação, ocorrência ou alerta de afastamento novo.
- Alerta de afastamento: **decidido e corrigido** (T132). Cada afastamento confirmado abre o próprio alerta, com push e e-mail. A regra
  da Spec 012 de um alerta aberto por lacre e tipo continua para os alertas do lacre. Antes, um alerta antigo ainda aberto ou reconhecido
  do mesmo lacre absorvia a ocorrência nova: sem push, com o estado do antigo, com o contexto misturado, e fechar um fechava as duas.
- Envio das posições: **corrigido** (T133) e **aprovado no celular** pela pessoa responsável em 28/10/2026, com o APK reinstalado. A causa estava na tela, não no Android: só o painel da tela da viagem recolhia e
  enviava as posições. Fora dela, o serviço nativo seguia coletando, mas nada subia até a pessoa voltar à tela, e cada volta criava uma
  coordenação nova, que disputava o buffer nativo com a anterior. Agora uma coordenação única por viagem é mantida pelo aplicativo
  enquanto houver viagem em andamento, em qualquer tela. O Capacitor não pausa o JavaScript em segundo plano (`KeepRunning`), então o
  envio segue com o aplicativo minimizado e em outra tela.

## Entrevista de validação (T111)

Respostas dadas pela pessoa responsável em 28/10/2026, gravadas com a confirmação dela:

- Quem validou: Alisson Almeida, em 28/10/2026.
- Amostra: perfis gestor e motorista; larguras de celular, tablet e desktop; fluxo de viagens.
- Ambiente: Chrome no Windows 11 e celular Android.
- Duração: 58 min.
- Resultado: aprovado, incluindo o envio com o aplicativo minimizado e o teste com leitor de tela.
- Itens a corrigir: nenhum.
- Decisão: utilizado. Justificativa: atendeu sem ajustes.
- Confirmação para gravar as respostas em nome da pessoa: sim.

## Verificações automatizadas (T107)

| Verificação | Resultado |
|---|---|
| Lint e tipagem | Sem erros |
| Vitest com cobertura | 450 arquivos, 6.278 testes. Cobertura: 89,2% instruções, 83,3% ramos, 87,5% funções, 92,8% linhas |
| Banco (pgTAP), depois de `supabase db reset` | 147 arquivos, 3.734 testes |
| Integração ao vivo (`npm run test:live`) | Todos aprovados depois de atualizar a lista de permissões e telas do administrador (T129); 3 testes pulados por configuração |
| Android (`npm run android:testar`) | 6 testes aprovados, com o wrapper do Gradle fixado em 8.14.3 (T128) |
| Ensaio de desempenho (`npm run test:desempenho:rastreamento`) | 5 de 5 metas; detalhes em `performance.md` |
| E2E (`npm run test:e2e`, 5 projetos) | 2.044 aprovados, 4 reprovados, 110 pulados. Detalhes na seção seguinte |
| Capturas visuais no Linux (`npm run test:visual:atualizar`) | 288 de 288, duas vezes seguidas (reproduzíveis); 159 imagens atualizadas, nenhuma `*-win32.png` |

Durante a execução com cobertura, um teste do botão de leitura de cilindro (`read-cylinder-button.test.tsx`) falhou por tempo e passou
sozinho e na execução seguinte.

## E2E

A primeira rodada completa teve 1.963 testes aprovados e 85 reprovados. 77 falhas vieram de servidores de preview antigos ocupando as
portas 4173 e 4174. As demais levaram às correções T126, T127 e T129.

Na rodada final, 2.044 testes passaram e 4 falharam:

- 2 são o orçamento de LCP da landing, corrigido depois (T130, abaixo);
- 2 são de telas de outras specs (Visão geral offline em 1920 px e axe da Entrada no estoque no WebKit) e passaram nas 3 repetições
  seguintes: são intermitentes.

**Orçamento da landing (Spec 011):** o LCP mediano em Slow 4G ficou entre 2,51 s e 2,57 s, acima do limite de 2,5 s. Para comparar,
a `main` mede menos de 2,5 s, e a `main` só com o commit da foto da equipe (41cb991, já presente nesta branch) mede 2,50 a 2,51 s. A
Spec 015 acrescenta de 30 a 50 ms. O pacote de entrada ficou em 603.961 bytes, dentro do limite (609.747).

A foto da equipe não entra na conta: ela carrega sob demanda, fora da primeira dobra, e nem é baixada antes do LCP. O LCP é a captura
da abertura, que chega cedo, mas só é desenhada quando o módulo da landing termina de baixar. Esse módulo esperava o pacote de entrada
chegar e rodar para começar (cascata), e ainda disputava a rede com a fila e o envio de campo, que a landing anônima não usa.

**Correção (T130), por decisão da pessoa responsável em 28/10/2026:** o `index.html` passou a pedir o módulo da landing e o estilo dele
junto com o pacote de entrada, só na landing do navegador, e os módulos de campo só carregam com a conta autenticada. Na nova medição, a
mediana ficou em 2,39 s no desktop (amostras 2,38 a 2,40 s) e 2,38 s no celular (2,38 a 2,41 s), com CLS e peso de imagens inalterados.
Depois da correção: suíte unitária com 452 arquivos e 6.283 testes aprovados, lint e tipagem sem erros, e 272 E2E de campo, offline e
landing aprovados. Um deles (formulário de viagem sem conexão, no WebKit) falhou de forma intermitente com vários workers, também sem a
correção, e passou 15 de 15 vezes com um worker só.

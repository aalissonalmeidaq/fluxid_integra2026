# Pesquisa e decisões técnicas: Leitura de identificadores e GPS no aplicativo de campo

**Feature**: `009-leitura-gps-campo` | **Data**: 12/10/2026

Cada decisão segue o formato: decisão, justificativa e alternativas avaliadas. Não restou nenhum ponto "a esclarecer" do contexto técnico; os valores de 2 minutos, 15 segundos e 100 metros são premissas da spec, confirmadas só em aparelho real.

## 1. Leitura de QR Code e Data Matrix pela câmera

- **Decisão**: generalizar o `CameraScanButton` da Spec 006 em um leitor contínuo (`identifier-reader-dialog`) sobre o detector de código de barras do navegador, com a mesma consulta de formatos suportados (`getSupportedFormats`) e o mesmo critério: só aparece onde o navegador lê pelo menos um dos formatos. O leitor fica aberto para leituras em sequência (conferir dez cilindros sem reabrir), trata o mesmo código repetido em sequência curta como uma leitura (RF-004) e entrega o texto lido ao chamador, que decide o que fazer.
- **Justificativa**: a Spec 006 já provou o caminho (sem biblioteca, sem imagem fora do aparelho, sem peso no pacote) e foi validada em Chrome no Android. Reaproveitar mantém o pacote dentro dos 5% (RNF-005) e a mesma regra de suporte.
- **Alternativas**: biblioteca de decodificação em JavaScript ou WebAssembly (funcionaria em iOS e Firefox, mas acrescenta peso e dependência; fica como evolução se a validação pedir); manter só o botão de leitura única (obrigaria reabrir a câmera a cada cilindro e não atenderia MS-001).

## 2. Leitura de NFC

- **Decisão**: adaptador `nfc-reader.ts` sobre o leitor NFC do navegador (Web NFC), que só existe no Chrome do Android em contexto seguro. No evento de leitura o aparelho entrega o número de série e os registros da etiqueta; o adaptador devolve ao domínio uma lista de **candidatos**: o número de série sem separadores e em maiúsculas, o mesmo número com dois-pontos, e cada texto gravado. A detecção é por existência do recurso; sem ele o botão de NFC não aparece.
- **Justificativa**: é a única forma de ler NFC sem aplicativo nativo e a Spec 006 guarda o valor NFC como texto livre, sem formato fixo; mandar vários candidatos deixa o servidor casar com o formato que a organização cadastrou (hexadecimal com ou sem dois-pontos, ou o texto), sem o cliente adivinhar.
- **Limites assumidos (da spec)**: valores cadastrados em decimal ou com bytes em outra ordem não casam (resposta "não encontrado" com a dica de formato); o número de série pode ser copiado, então a leitura identifica o cilindro mas não prova presença; etiquetas cujo número muda a cada leitura não são detectáveis: o valor não casa e a resposta é "não encontrado".
- **Alternativas**: ler só o texto gravado (decisão anterior da spec, revista em 12/10/2026 para aproveitar as etiquetas existentes); ler o número de série em decimal ou invertido (mais formatos, sem evidência de uso; avaliar com os dados reais na validação).

## 3. Resolução do identificador no servidor

- **Decisão**: nova operação `query_identifier_resolve` (consulta, `cylinder.read`), exposta pela Edge Function `query-cylinders` como operação `resolve`. Recebe de 1 a 3 valores candidatos e, opcionalmente, o tipo esperado; procura entre os identificadores **ativos** da organização ativa, por `value_normalized`, na ordem em que os candidatos foram enviados; devolve o cilindro, o identificador casado e, **somente quando a pessoa tem `trip.read`**, a viagem aberta que reserva o cilindro (número e situação). Código inexistente e código de outra organização recebem a mesma resposta (RN-005). Valor desativado informa o cilindro a que pertencia, como o `query_cylinder_lookup` já faz.
- **Justificativa**: reaproveita a regra e o índice da Spec 006, evita duas buscas em sequência quando o formato é incerto (NFC) e centraliza a regra de não vazar dados entre tenants e entre perfis.
- **Alternativas**: chamar `lookup` até três vezes pelo cliente (três idas ao servidor, pior em 4G e sem a viagem); resolver no cliente com a lista de itens da viagem (não cobriria "Ler cilindro" nem o cilindro de outra organização).

## 4. Método de conferência e de entrega

- **Decisão**: o método é um argumento texto validado com quatro valores: `manual` (toque, mantém o valor já gravado), `typed` (código digitado, colado ou de leitor-teclado), `camera` e `nfc`. A restrição `trip_items_source_check` passa a aceitar os quatro; em `register_delivery` o método entra em cada elemento de `results` (campo `source`). O servidor só valida o valor; **o método é declarado pelo cliente** e não é prova de que a leitura ocorreu, o que a spec assume (RN-002).
- **Justificativa**: o navegador não distingue digitação de leitor físico (decisão da spec), as linhas antigas continuam válidas sem migração de dados e o histórico ganha a informação sem nova tabela.
- **Alternativas**: tabela própria de leituras (cresce sem necessidade, já que a leitura sozinha não é dado); registrar o código lido no evento (guardaria identificador em texto no histórico, e o código já está ligado ao cilindro).

## 5. Posição por GPS

- **Decisão**: `geolocation-reader.ts` faz **uma** chamada de posição por pedido (alta precisão, tempo máximo de 15 s, sem reaproveitar posição em cache) e nunca usa observação contínua. O resultado alimenta `position-quality.ts`: precisão pior que 100 m gera aviso (não bloqueia) e posição lida há mais de 2 minutos é descartada antes de salvar. Erros do navegador (permissão negada, posição indisponível, tempo esgotado) viram mensagens em texto com a alternativa manual. O estado da permissão é consultado quando o navegador permite, só para orientar o texto, nunca para ler a posição.
- **Justificativa**: atende RN-004 (localização só quando a pessoa pede) e RF-015 (nada guardado no aparelho). A leitura única evita consumo de bateria e rastreamento.
- **Alternativas**: observar a posição até a precisão melhorar (melhora o dado, mas é leitura contínua e foi descartada pela spec); aceitar posição em cache (poderia gravar posição velha como atual).

## 6. Dados da posição no servidor

- **Decisão**: `trip_stops` ganha `arrival_latitude`, `arrival_longitude`, `arrival_accuracy_m`, `arrival_position_source`, `arrival_position_read_at` e `arrival_outside_geofence`; `trip_deliveries` ganha `accuracy_m`, `position_source` e `position_read_at`. Origem em `gps`, `typed` ou `site_address` (esta derivada de `at_site_address`). As restrições repetem as regras do cliente (coordenadas em par, precisão não negativa, origem coerente com o dado, horário da leitura não no futuro e não mais velho que 10 minutos no momento do registro). A auditoria registra apenas origem e faixa de precisão, **sem coordenadas**.
- **Justificativa**: a chegada não guardava posição (`arrive_stop` só tinha o horário), e a spec pede a posição lá também. Colunas na mesma linha evitam tabela de posição e mantêm o histórico imutável existente. O limite de 10 minutos no servidor é só uma sanidade contra posição velha; a regra de 2 minutos fica no cliente porque depende de quando a pessoa tocou em salvar.
- **Alternativas**: tabela de posições (cresce e separa o dado do evento); validar os 2 minutos no servidor (o relógio do aparelho e o do servidor divergem e geraria recusas falsas).

## 7. Posição fora da geocerca na chegada

- **Decisão**: reaproveitar `private.point_inside_site_geofence` (Spec 007) também na chegada, guardando `arrival_outside_geofence` (nulo sem posição ou sem geocerca ativa), com a mesma regra de aceitar e destacar (RF-013).
- **Justificativa**: mesma consulta espacial, mesma regra, sem nova função.
- **Alternativas**: comparar só na entrega (deixaria a chegada sem aviso, que a spec pede).

## 8. Privacidade e logs

- **Decisão**: nenhum código lido, coordenada ou nome de recebedor em log, auditoria em texto aberto, URL ou armazenamento do aparelho. A varredura de contrato que já proíbe o nome do recebedor em log passa a cobrir também os campos de posição e o valor lido. Nada de leitura é guardado em `localStorage`, `sessionStorage` nem IndexedDB.
- **Justificativa**: localização é dado pessoal de quem dirige e o código identifica ativo do cliente.

## 9. Testabilidade dos recursos do navegador

- **Decisão**: os três adaptadores (`barcode-reader`, `nfc-reader`, `geolocation-reader`) são interfaces pequenas, com uma implementação real e simulações injetáveis. Nos testes de unidade e de página, o domínio e a tela recebem leituras e posições falsas; no E2E, o Playwright concede e simula geolocalização e um detector de código falso; câmera e NFC reais só entram na validação humana.
- **Justificativa**: câmera, NFC e GPS reais não são reproduzíveis em CI e a Constituição pede TDD; as regras que importam (normalização, precisão, validade, método) são puras.
- **Alternativas**: depender do navegador real no CI (instável e sem NFC).

## 10. Desempenho e pacote

- **Decisão**: o leitor, o bloco de posição e os adaptadores carregam sob demanda (`React.lazy` ou importação dinâmica) quando a janela abre, como as telas de viagem. A meta de pacote de entrada é a linha de base da Spec 008 mais no máximo 5%.
- **Justificativa**: a maioria das visitas não usa leitura; o custo só existe para quem abre.

# Contrato: verificações automáticas

**Atende**: CA-001 a CA-014

Cada linha é uma verificação que deve existir e passar no CI. A coluna "Origem" ajuda a achar o requisito. Os testes nascem RED antes do código (constituição, princípio II).

## pgTAP (`supabase/tests/007_*.test.sql`)

| Arquivo | Verifica | Origem |
|---|---|---|
| `007_rls.test.sql` | Para **cada tabela** (`customers`, `customer_contacts`, `customer_sites`, `geofences`, `vehicles`, `drivers`, `registry_events`): o Tenant A lê o que é dele e não vê nada do Tenant B (e o inverso); `anon` sem acesso; membro sem a permissão de leitura sem acesso; `insert`, `update` e `delete` diretos recusados | CA-001, RF-048 |
| `007_documents_rls.test.sql` | `customer_documents` e `driver_documents`: nenhum papel (`authenticated`, membro com `*.read`, administrador do tenant) lê pelo acesso direto; só a RPC de revelação devolve o valor | CA-005, RF-029 a RF-031 |
| `007_permissions.test.sql` | As 20 permissões existem (`customer.anonymize` e `driver.anonymize` críticas e só no administrador); mapeamento por papel conforme o contrato; `driver` sem nenhuma; `*.document` só no administrador; nenhum papel perdeu permissão | RF-049 |
| `007_customers.test.sql` | Unicidade do documento por organização (e repetido em outra); CNPJ numérico e alfanumérico; CPF para pessoa física; contatos até 10 e um principal; segmento "outro" exige detalhe; edição com versão; correção de documento com justificativa | RF-001 a RF-004a |
| `007_contacts_visibility.test.sql` | `get_customer` devolve telefone e e-mail dos contatos só com `customer.write`; `tenant_auditor`, `stock_operator` e `technical_operator` recebem só nome e função; o Tenant B não vê contatos do A | RF-003 |
| `007_sites.test.sql` | Unidade por cliente, nome único no cliente; coordenadas juntas e no intervalo; janela de recebimento válida; unidade não depende de CEP | RF-005 a RF-007 |
| `007_geofences.test.sql` | Limites de raio (24, 25, 5000, 5001) e de vértices (2, 3, 100, 101); cruzamento, área zero e vértice repetido recusados; círculo e polígono (os dois sentidos) aceitos; nome único na unidade; sobreposição devolve aviso e não bloqueia | RF-013 a RF-018, CA-007 |
| `007_geofence_query.test.sql` | "Ponto dentro" com ponto dentro, fora e **na borda** (conta como dentro) para círculo e polígono; só geocercas ativas e da organização da sessão; tenant B não encontra geocerca do A; plano de execução usa o índice GiST com 50 mil geocercas | RF-016, RNF-003, CA-007 |
| `007_vehicles.test.sql` | Placa antiga e Mercosul, normalização, rejeição de outros formatos; unicidade por organização; ano e capacidade nos limites; situação com justificativa de e para `inactive`; licenciamento calculado nos limites (31, 30, 0, −1 dia) | RF-019 a RF-023, CA-009 |
| `007_drivers.test.sql` | CPF e CNH válidos; unicidade por organização; categoria e validade; vínculo só a usuário ativo da organização com papel `driver`, único por motorista e por usuário; usuário de outra organização recusado sem vazar existência; CNH calculada nos limites | RF-024 a RF-028, CA-009 |
| `007_inactivation.test.sql` | Cascata do cliente (unidades e geocercas ativas), uma auditoria com contagens, um evento por registro; reativar só o cliente; `PARENT_INACTIVE`; **atomicidade**: falha injetada desfaz tudo; `CASCADE_CHANGED`; edição de inativo recusada | RF-034, RF-035, CA-010 |
| `007_immutability.test.sql` | `update` e `delete` em `registry_events` recusados a todo papel, inclusive `service_role`; `delete` recusado em todas as tabelas de cadastro e de documentos, **exceto** `customer_contacts`, em que o `delete` só é aceito dentro de `update_customer` (e recusado a qualquer papel fora dela) | CA-002, CA-003 |
| `007_audit.test.sql` | Uma asserção por ação sensível (cadastro, edição, inativação, reativação, situação do veículo, vínculo, revelação): evento e auditoria na mesma transação, e falha de ambos juntos; **nenhum CPF, CNH ou CNPJ de pessoa física** em `audit_logs.metadata` nem em `registry_events.data` | CA-004, CA-005, RF-050 |
| `007_anonymization.test.sql` | Motorista, cliente pessoa física e contato: efeito conforme `data-model.md` (campos substituídos e campos mantidos); recusa registro ativo (`ACTIVE_RECORD`) para motorista e cliente pessoa física e aceita contato ativo; permissão `*.anonymize` só do administrador; `VERSION_CONFLICT`, `ALREADY_ANONYMIZED`; edição, reativação, vínculo e revelação sobre anonimizado → `ANONYMIZED_RECORD`; vínculo de usuário removido com evento; **nenhuma linha apagada** (contagem antes e depois); CPF, CNH e documento liberados para novo cadastro; atomicidade com falha injetada; Tenant B → `NOT_FOUND`; evento e auditoria só com motivo, justificativa e lista de campos | RF-054 a RF-061, CA-016, CA-017 |
| `007_history.test.sql` | Sequência contínua por entidade, ordem estável com eventos no mesmo instante, filtros por tipo e período, paginação | RF-036, RF-037 |
| `007_limits_contract.test.sql` | `private.geofence_limits()` e `private.document_expiring_days()` devolvem os valores do contrato | RF-014, RF-022 |

## Domínio e serviço (Vitest)

| Arquivo | Verifica | Origem |
|---|---|---|
| `src/domain/registry/document-validation.test.ts` | CPF, CNPJ numérico e **alfanumérico** (inclui `12.ABC.345/01DE-35`), CNH; rejeita repetidos, tamanho errado, letra no dígito verificador; normalização de maiúsculas e pontuação; mesma tabela de casos do SQL | CA-008 |
| `src/domain/registry/masks.test.ts` | Máscaras de CPF e CNH; CNPJ completo; nunca devolve o documento inteiro de CPF e CNH | RF-029 |
| `src/domain/registry/plate.test.ts` | Normalização e os dois padrões; formatos inválidos | RF-020, CA-008 |
| `src/domain/registry/phone-and-postal-code.test.ts` | Telefone de 10 e 11 dígitos; CEP com e sem hífen e espaços; 7 e 9 dígitos recusados | CA-008 |
| `src/domain/registry/geofence-geometry.test.ts` | Limites de raio e de vértices, vértice repetido, cruzamento de arestas (incluindo toque em vértice), área zero, sentido horário e anti-horário, intervalo de coordenadas; mesma tabela de casos do pgTAP | CA-007 |
| `src/domain/shared/validity-status.test.ts` | Em dia, a vencer, vencido e sem data nos limites (31, 30, 1, 0, −1 dia) com o dia de `America/Sao_Paulo`; `hydrostatic-status` continua passando com a constante compartilhada | CA-009 |
| `src/application/registry/*.test.ts` | Mapeamento dos códigos de erro para estados de tela; serviço de CEP (estados, sem conexão, sem armazenamento local); revelação mantém o valor só em memória | RF-011, RF-030 |
| `tests/contract/*-handler.test.ts` | Manipuladores com portas falsas: autenticação, método, operação desconhecida, corpo inválido, `organization_id` divergente da sessão, mapeamento HTTP, `Cache-Control: no-store` na revelação | RF-053 |
| `tests/contract/geocode-address-handler.test.ts` | Porta falsa do provedor: encontrado, não encontrado, 503 por erro e por tempo esgotado (4 s), validação antes de qualquer chamada, só campos de endereço chegam ao provedor, permissão, três baldes de limite (pessoa, organização e 1/s global) e log só com código e duração | CA-018, RF-065 a RF-068 |
| `tests/contract/nominatim-provider.test.ts` | **Captura da requisição de saída: só campos de endereço na query, GET sem corpo, `user-agent` fixo**; precisão por `addresstype`; lista vazia, status, JSON e coordenadas inválidas | CA-018 |
| `supabase/tests/007_site_geocoding.test.sql` | Origem e confirmação: criação geocodificada e manual, endereço alterado descarta a confirmação, edição à mão vira manual, remoção limpa, reenvio não renova o instante, evento e auditoria com a origem | RF-066, RF-068 |
| `tests/contract/lookup-postal-code-handler.test.ts` | Porta falsa do provedor: encontrado, `erro` como `true` e como `"true"`, CEP malformado sem chamar o provedor, tempo esgotado (4 s), 5xx, JSON inválido, UF inválida, campos extras descartados, limite por pessoa (10) e por organização (100) com `retry_after_seconds`, **captura da requisição de saída: só o CEP no caminho, sem query, sem corpo, sem cookie**, log sem CEP | CA-006, RF-009 a RF-012 |
| `src/pages/registry/components/anonymize-dialog.test.tsx` | Lista do que será removido e do que permanece, aviso de irreversível, motivo e justificativa obrigatórios, confirmação digitada, `MFA_REQUIRED` tratado, Escape fecha sem anonimizar, foco devolvido ao acionador, aviso final e ações bloqueadas depois | RF-062 |
| `src/pages/registry/**/*.test.tsx` | Listas (busca, filtros, paginação mantendo filtros, vazio com e sem permissão, total anunciado); formulários (erros junto dos campos, foco no primeiro erro, um envio); campo de CEP (todos os estados, foco em "Número", não apaga o digitado); polígono só com teclado; revelação (mostrar, ocultar, sumir ao sair da tela); diálogo de cascata com quantidades | RF-040, RF-041 |

## Contrato (`tests/contract/`)

| Arquivo | Verifica |
|---|---|
| `registry-permissions.test.ts` | Códigos de permissão iguais na migration, no catálogo de telas, nas rotas e nos manipuladores |
| `registry-no-delete.test.ts` | Nenhuma operação de exclusão nas funções, nos serviços nem nas telas (CA-002) |
| `registry-limits.test.ts` | Limite de 30 dias e limites de geocerca iguais no TypeScript e no SQL |
| `registry-anonymization-leak.live.test.ts` | Cadastra e edita motorista, cliente pessoa física e contato com nome, CPF, CNH, telefone e e-mail conhecidos (fictícios), anonimiza e procura todos os valores antigos, inclusive os de edições anteriores, em todas as tabelas de cadastro, em `registry_events`, em `audit_logs` e em toda resposta de lista, detalhe e histórico (CA-015, MS-009) |
| `registry-no-sensitive-output.test.ts` | Cadastra e edita com valores conhecidos de CPF, CNH e CNPJ de pessoa física e procura esses valores em `audit_logs`, `registry_events`, respostas de erro, logs capturados e em qualquer resposta de lista (CA-005, MS-006) |
| `postal-code-egress.test.ts` | A única chamada de saída da função de CEP é `GET /ws/{8 dígitos}/json/`, sem outros dados (CA-006) |
| `pwa-config.test.ts` (existente) | Continua reprovando `runtimeCaching` de dados; teste novo: nenhuma resposta de `/functions/v1` é guardada (CA-012) |
| `escalas-no-codigo.test.ts` (existente) | Continua verde sobre as telas novas |

## Suíte `.live` (Supabase local)

- Duas sessões cadastrando o mesmo documento, a mesma placa e o mesmo CPF: uma vence, a outra recebe o conflito, sem duplicar.
- Duas edições simultâneas do mesmo registro: a segunda recebe `VERSION_CONFLICT`.
- Duas inativações simultâneas do mesmo cliente: a segunda recebe `ALREADY_INACTIVE`; cascata concorrente com criação de unidade não deixa unidade ativa sob cliente inativo.
- Desempenho de banco e função com o volume de referência (RNF-001 a RNF-003): busca p95 ≤ 1 s em cada lista, primeira página de cada lista, consulta "ponto dentro" p95 ≤ 200 ms com 50 mil geocercas. Massa criada e limpa por `tests/support/sql/registry-volume-*.sql`.
- Função `lookup-postal-code` contra um provedor falso local (nunca contra o ViaCEP real no CI).

## E2E (Playwright, backend simulado) e visual

- Jornada: cliente → unidade com CEP (provedor simulado, com os cenários encontrado, inexistente, indisponível, limite e offline) → geocerca (círculo e polígono) → "Testar um ponto" → veículo → motorista com vínculo → inativar cliente com cascata → histórico, em 360, 768 e 1920 px.
- Teclado completo, foco visível e primeiro erro focado; axe sem violação crítica ou grave; sem rolagem horizontal de 320 a 1920 px nem com zoom de 200%; offline com a estrutura aberta e escrita desabilitada com motivo (CA-011, CA-012).
- Primeira página de cada lista em 4G (Playwright com limitação de rede) com a massa de referência, registrada em `validation.md` (RNF-002).
- Capturas das telas novas em três larguras, geradas no Linux por `npm run test:visual:atualizar` (CA-013).
- Pacote: `npm run build` antes e depois; entrada ≤ 593,95 kB (CA-014).

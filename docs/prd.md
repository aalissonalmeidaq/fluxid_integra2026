# PRD do sistema FluxID

## 1 Resumo executivo

O FluxID é uma plataforma web e móvel multitenant para identificar, controlar, rastrear e auditar cilindros de gases medicinais e industriais. O produto combina cadastro individual, leitura móvel, estoque, custódia, frota, viagens, geocercas, telemetria, alertas e comandos assíncronos para lacres inteligentes.

## 2 Problema e oportunidade

Registros em papel e planilhas dificultam a leitura do número gravado no casco, geram transcrição manual, permitem trocas entre clientes e fornecedores e tornam a auditoria lenta. A oportunidade é criar uma fonte confiável sobre identidade, posse, localização e estado operacional de cada cilindro.

## 3 Personas e usuários alvo

| Persona | Objetivo | Dificuldade atual |
|---|---|---|
| Administrador FluxID | Operar a plataforma | Suporte sem visão consolidada |
| Administrador do tenant | Controlar empresa e acessos | Permissões dispersas |
| Gestor logístico | Planejar e acompanhar entregas | Ausência de rota e posição confiáveis |
| Estoquista | Conferir movimentações | Digitação e divergências manuais |
| Motorista | Executar a rota | Listas em papel e pouca evidência |
| Técnico | Manter cilindros e lacres | Histórico incompleto |
| Auditor | Verificar eventos | Dados fragmentados |

## 4 Jornada do usuário

1. cadastrar empresa, usuários e permissões;
2. cadastrar clientes, unidades, geocercas, veículos e motoristas;
3. cadastrar ou importar cilindros;
4. vincular identificador e lacre;
5. planejar viagem e distribuir cilindros por parada;
6. conferir carregamento pelo celular;
7. bloquear cilindros e iniciar a viagem;
8. acompanhar posição e proximidade;
9. confirmar chegada e ler cilindros;
10. registrar entrega ou divergência;
11. solicitar desbloqueio;
12. ativar geocerca do cliente;
13. planejar recolhimento e retorno;
14. conferir entrada e atualizar custódia.

## 5 Escopo do produto

### MVP

- autenticação, organizações, usuários e RBAC;
- RLS multitenant;
- cilindros, tipos, identificadores, fotos e testes hidrostáticos;
- estoque, custódia e reconciliação;
- clientes, unidades e geocercas;
- veículos, motoristas, viagens e paradas;
- PWA e aplicativo Android;
- QR Code, Data Matrix e NFC compatível;
- operação offline;
- GPS, mapa e proximidade;
- alertas, notificações e auditoria;
- comandos IoT e simulador.

### Evoluções

- gateway BLE;
- iOS nativo;
- roteirização avançada;
- manutenção preditiva;
- faturamento completo;
- integrações ERP;
- análises com inteligência artificial.

## 6 Requisitos funcionais

| ID | Requisito | Prioridade |
|---|---|---|
| RF001 | Autenticar usuários individualmente | Must |
| RF002 | Isolar os dados por organização | Must |
| RF003 | Gerenciar perfis e permissões | Must |
| RF004 | Cadastrar e inativar cilindros | Must |
| RF005 | Manter identificadores e histórico | Must |
| RF006 | Registrar testes hidrostáticos | Must |
| RF007 | Gerenciar clientes, unidades e geocercas | Must |
| RF008 | Gerenciar veículos e motoristas | Must |
| RF009 | Planejar viagens, paradas e cargas | Must |
| RF010 | Ler cilindros por QR, Data Matrix ou NFC | Must |
| RF011 | Operar offline e sincronizar com idempotência | Must |
| RF012 | Registrar posições do lacre e do celular | Must |
| RF013 | Avaliar proximidade durante transporte | Must |
| RF014 | Confirmar entrega com evidência | Must |
| RF015 | Enviar comandos IoT assíncronos | Must |
| RF016 | Confirmar execução do comando | Must |
| RF017 | Gerar e tratar alertas | Must |
| RF018 | Registrar auditoria imutável | Must |
| RF019 | Consultar mapa e histórico | Should |
| RF020 | Exportar relatórios | Should |
| RF021 | Selecionar Supabase local, LAN ou cloud e aplicar fallback controlado quando o destino preferencial estiver indisponível | Must |

## 7 Requisitos não funcionais

| ID | Requisito | Meta inicial |
|---|---|---|
| RNF001 | Responsividade | 360 px a desktop 4K |
| RNF002 | Acessibilidade | WCAG 2.2 AA |
| RNF003 | Instalação | PWA desktop e Android |
| RNF004 | Segurança | TLS, RLS, MFA e auditoria |
| RNF005 | Disponibilidade | Premissa de 99,5% no MVP |
| RNF006 | Desempenho | p95 da API abaixo de 800 ms sem mapas externos |
| RNF007 | Sincronização | Fila idempotente e recuperável |
| RNF008 | Observabilidade | Logs, métricas e trace ID |
| RNF009 | Testabilidade | TDD e pipeline obrigatório |
| RNF010 | Privacidade | Minimização e retenção configurável |
| RNF011 | Resiliência de backend | Seleção cloud → LAN → local sem fallback em erros de autenticação, autorização ou RLS; retorno à cloud somente após sincronização segura |

## 8 Histórias e critérios de aceitação

| ID | História | Critério resumido |
|---|---|---|
| US001 | Como administrador, quero criar uma organização para habilitar um cliente | Organização criada isoladamente e auditada |
| US002 | Como estoquista, quero ler um cilindro para registrar sua entrada | Leitura válida cria evento sem duplicar operação |
| US003 | Como gestor, quero planejar uma viagem para distribuir cilindros por cliente | Cada item possui veículo, motorista, parada e destino |
| US004 | Como motorista, quero conferir a carga pelo celular para evitar divergências | Todos os cilindros previstos são lidos ou justificados |
| US005 | Como gestor, quero monitorar proximidade para identificar possível extravio | Três leituras válidas confirmam afastamento configurado |
| US006 | Como motorista, quero confirmar a entrega para encerrar minha responsabilidade | Entrega registra cilindros, posição, horário e recebedor |
| US007 | Como usuário autorizado, quero solicitar desbloqueio para liberar o cilindro | Comando exige permissão, motivo e confirmação do hardware |
| US008 | Como auditor, quero consultar o histórico para reconstruir a custódia | Eventos são ordenados e imutáveis |

## 9 Priorização MoSCoW

| Categoria | Itens |
|---|---|
| Must | Multitenancy, cilindros, estoque, viagens, campo, telemetria, comandos, auditoria |
| Should | Relatórios, importação assistida, mapa histórico e notificações configuráveis |
| Could | Otimização avançada, dashboards analíticos e integrações adicionais |
| Won't no MVP | Gateway BLE, iOS nativo, ERP completo e IA preditiva |

## 10 Regras de negócio

- cilindros não são excluídos fisicamente;
- todos os cilindros previstos devem ser lidos no carregamento e na entrega;
- exceções exigem justificativa e permissão;
- viagem só inicia com bloqueios confirmados;
- entrega e desbloqueio são registros independentes;
- comando pendente não altera o estado físico conhecido;
- proximidade de transporte usa GPS do celular e do lacre;
- leitura presencial substitui a alegação de GPS contínuo a dez metros;
- após entrega, proximidade do motorista encerra e geocerca do cliente inicia;
- desbloqueio excepcional exige MFA e auditoria;
- perda de telemetria gera estado degradado, não extravio automático;
- eventos de custódia e auditoria são imutáveis.
- o destino Supabase permanece fixo durante uma sessão e mudanças de destino são auditadas;
- uma mesma mutação não é enviada simultaneamente para as instâncias local e cloud;
- o fallback para cloud exige compatibilidade de schema, sincronização idempotente e tratamento explícito de conflitos.

## 11 Especificações técnicas

Frontend React, TypeScript, Vite e Tailwind. Aplicativo de campo com PWA e Capacitor. Supabase para autenticação, PostgreSQL, PostGIS, Storage, Realtime e Edge Functions. A resolução de endpoint segue `docs/arquitetura-conectividade-supabase.md`, com modos local, LAN, cloud e auto. Serviço IoT Node.js e TypeScript com adaptadores HTTP ou MQTT. Estado de servidor com TanStack Query, formulários React Hook Form e validação Zod. Testes Vitest, React Testing Library, Playwright, Maestro, axe-core e k6.

## 12 Modelo de dados inicial

| Domínio | Entidades principais |
|---|---|
| Identidade | organizations, profiles, memberships, roles, permissions |
| Ativos | cylinders, cylinder_types, cylinder_identifiers, hydrostatic_tests |
| IoT | devices, device_bindings, device_commands, device_command_events |
| Logística | vehicles, drivers, trips, trip_stops, trip_cylinders |
| Clientes | customers, customer_sites, geofences |
| Operação | scan_events, deliveries, delivery_items, custody_events |
| Telemetria | device_positions, mobile_positions, proximity_sessions |
| Governança | alerts, notifications, domain_events, audit_logs |

## 13 Requisitos UX UI

- identidade visual FluxID;
- desktop eficiente para operação densa;
- mobile orientado à tarefa;
- navegação acessível e consistente;
- alvos de toque mínimos de 44 px;
- feedback para offline, sincronização e comando pendente;
- nenhuma confirmação física otimista;
- formulários longos divididos em etapas;
- tabelas adaptadas para listas no mobile;
- design system versionado e Storybook.

## 14 Métricas de sucesso

| Métrica | Forma de medição |
|---|---|
| Identificação válida | Cilindros ativos com identificador operacional |
| Tempo de conferência | Duração entre início e conclusão |
| Divergências | Ocorrências por 100 movimentações |
| Entregas com evidência | Entregas completas sobre total |
| Telemetria válida | Tempo monitorado com posições utilizáveis |
| Comandos confirmados | Executados sobre enviados |
| Sincronização | Operações móveis sincronizadas sem intervenção |
| Adoção | Usuários ativos e tarefas concluídas |

## 15 Plano de implementação

| Fase | Resultado |
|---|---|
| 0 | Constituição, repositório, CI e design system |
| 1 | Autenticação, organizações, RBAC e RLS |
| 2 | Cilindros, identificadores, estoque e histórico |
| 3 | Clientes, geocercas, frota e motoristas |
| 4 | Viagens, paradas, carga e entrega |
| 5 | Aplicativo de campo, leitura, GPS e offline |
| 6 | IoT simulado, comandos e telemetria |
| 7 | Rastreamento, proximidade, alertas e relatórios |
| 8 | Integração com hardware validado |
| 9 | Piloto e estabilização |

## 16 Critérios de pronto

- spec, plano e tarefas aprovados;
- testes automatizados aprovados;
- cobertura mínima atendida;
- RLS testada com dois tenants;
- acessibilidade e responsividade validadas;
- auditoria presente;
- documentação atualizada;
- CI e revisão humana aprovadas;
- merge por pull request.

## 17 Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| GPS impreciso | Falsos alertas | Precisão, janela e leituras consecutivas |
| Falta de conexão | Operação interrompida | Offline e monitoramento degradado |
| Falha do hardware | Estado desconhecido | Comandos assíncronos e confirmação |
| Vazamento multitenant | Crítico | RLS, testes e service role fora do cliente |
| Interface complexa | Baixa adoção | Campo orientado à tarefa e testes de usabilidade |
| Mudança regulatória | Retrabalho | Revisão com responsáveis técnicos |
| Dependência de mapas | Custo e indisponibilidade | Adaptador e limites monitorados |

## 18 Dependências

- Supabase;
- provedor de mapas;
- serviço de telecomunicação dos lacres;
- dispositivos Android do piloto;
- validação mecânica do hardware;
- homologação e análise regulatória;
- GitHub e pipeline CI;
- UI UX Pro Max versionada.

## 19 Questões em aberto

As decisões de software estão fechadas para início. Permanecem para fase de hardware: mecanismo físico definitivo, sensor de posição, comportamento sem energia, autonomia, protocolo do dispositivo real, homologação e validação mecânica.

## 20 Resumo do MVP recomendado

O MVP deve entregar uma jornada completa de cadastro, carga, transporte, entrega, geocerca, retorno e auditoria usando hardware simulado. Essa abordagem permite validar software, operação, UX, estados, segurança e integração antes de fixar o desenho físico do lacre.

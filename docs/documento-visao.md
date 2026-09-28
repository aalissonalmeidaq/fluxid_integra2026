# Documento de visão do FluxID

## Identificação

- Produto: FluxID
- Slogan: Rastreabilidade que protege. Inteligência que conecta.
- Contexto inicial: controle e rastreamento de cilindros de gases medicinais e industriais.
- Empresa de referência do problema: Oxigênio Cariri.

## Visão do produto

O FluxID será uma plataforma multitenant de rastreabilidade, logística, custódia e segurança de cilindros. A solução substituirá registros manuais e planilhas por identificação individual, histórico imutável, operações móveis, rastreamento geográfico, geocercas, planejamento de entregas, controle de frota, alertas e comandos remotos para lacres inteligentes.

## Problema

O processo atual depende de anotações em pranchetas e posterior digitação em planilhas. Isso favorece erros de identificação, perda de rastreabilidade, devolução de cilindros diferentes, descadastros incorretos, dificuldade de auditoria e ausência de informação confiável sobre custódia e localização.

## Proposta de valor

- registrar cada cilindro de forma individual;
- acelerar entrada, saída, entrega e devolução;
- manter histórico de custódia;
- reduzir trocas e baixas indevidas;
- acompanhar viagens e entregas;
- monitorar localização e geocercas;
- enviar comandos de bloqueio e desbloqueio;
- produzir evidências para auditoria.

## Usuários

| Usuário | Necessidade principal |
|---|---|
| Administrador FluxID | Gerenciar plataforma, tenants, suporte e liberações |
| Administrador do tenant | Gerenciar empresa, usuários, regras e ativos |
| Estoquista | Conferir entrada, saída e divergências |
| Gestor logístico | Planejar frota, viagem, paradas e cilindros |
| Motorista | Executar rota, ler cilindros e confirmar entregas |
| Técnico | Manutenção, diagnóstico e comandos autorizados |
| Auditor | Consultar histórico, eventos e evidências |

## Escopo do MVP

1. autenticação e multitenancy;
2. RBAC e RLS;
3. cadastro de cilindros, tipos e identificadores;
4. clientes, unidades e geocercas;
5. veículos e motoristas;
6. planejamento de viagens e paradas;
7. leitura QR Code e Data Matrix, com NFC quando suportado;
8. aplicativo de campo responsivo e instalável;
9. operação offline com sincronização;
10. telemetria e mapa;
11. comparação entre GPS do lacre e celular;
12. alertas;
13. comandos IoT assíncronos;
14. auditoria e relatórios essenciais;
15. simulador de hardware.

## Fora do MVP

- gateway BLE no veículo;
- automação financeira completa;
- otimização avançada por inteligência artificial;
- integração definitiva com hardware antes da validação mecânica;
- suporte inicial a iOS nativo;
- manutenção preditiva avançada.

## Decisões permanentes

- React, TypeScript, Vite e Tailwind CSS;
- PWA e Capacitor para aplicativo de campo Android;
- Supabase para Auth, PostgreSQL, PostGIS, Storage, Realtime e Edge Functions;
- conectividade configurável com Supabase local ou na rede local e fallback controlado para o Supabase gerenciado na nuvem;
- serviço IoT independente em Node.js e TypeScript;
- estados de negócio separados de estados físicos;
- nenhum cilindro é excluído fisicamente;
- comandos somente são concluídos após confirmação do dispositivo;
- specs e documentação em português brasileiro;
- SDD com Spec Kit e TDD;
- GitHub Flow com main protegida.

O fallback entre instâncias Supabase não pressupõe replicação automática. Esquema, autenticação, sincronização idempotente e resolução de conflitos devem ser definidos e testados antes de habilitar o modo automático em produção.

## Máquina de estados resumida

Cadastro, estoque, reservado, carregamento, transporte, parada, cliente, recolhimento, retorno, recebimento e estoque. Estados laterais: manutenção, quarentena, divergente, extraviado, inativo e baixado.

## Indicadores de sucesso

- percentual de cilindros com identificação válida;
- tempo médio de conferência;
- divergências por operação;
- entregas confirmadas com evidência;
- telemetria válida durante viagens;
- comandos confirmados dentro do SLA;
- redução de ajustes manuais;
- adoção pelos operadores;
- disponibilidade e falhas de sincronização.

## Restrições

- cobertura móvel variável;
- GPS sujeito a imprecisão;
- PWA com limitações de segundo plano;
- hardware ainda sujeito a validação;
- tratamento de localização de trabalhadores;
- requisitos regulatórios de gases, transporte e telecomunicações.

## Memória para desenvolvimento

Este documento é a referência estável do produto. Mudanças que alterem visão, escopo do MVP, personas, decisões permanentes ou regras fundamentais devem atualizar este documento por pull request e registrar a decisão em ADR quando houver impacto arquitetural.

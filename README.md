# FluxID

Plataforma de Identidade e Rastreabilidade de cilindros de gases medicinais e industriais.

Este pacote reúne a constituição, metodologia, visão, especificações e fundação técnica do FluxID.

---

## Pré-requisitos

- **Node.js**: `24.21.0` (ou LTS equivalente)
- **NPM**: `12.1.0`
- **Docker**: instalado e em execução (para instância local do Supabase via CLI)
- **Supabase CLI**: `2.117.0` (gerenciado como dependência e instalado localmente)

---

## Instalação e Execução

### 1. Clonar e instalar dependências
```bash
git clone <url-do-repositorio>
cd fluxid
npm ci
```
> O comando `npm ci` garante a instalação reproduzível e determinística a partir do `package-lock.json`. O projeto utiliza TypeScript 7 com compatibilidade do parser `@typescript-eslint` mantida via `overrides` declarados no `package.json`.

### 2. Configurar variáveis de ambiente
Copie o modelo de variáveis públicas:
```bash
cp .env.example .env.local
```
Edite `.env.local` conforme o modo desejado (`auto`, `local`, `lan` ou `cloud`). Nunca versione segredos nem chaves privadas.

As variáveis sem o prefixo `VITE_` (`INVITATION_REDIRECT_URL`, `AVATAR_UPLOADS_PER_HOUR`, `RETENTION_JOB_SECRET`, credenciais de SMTP) são exclusivas das Edge Functions: configure-as nos segredos do Supabase, nunca no cliente. O `.env.example` traz apenas os nomes, sem valores.

### 3. Iniciar Supabase local (opcional/desenvolvimento)
```bash
supabase start
supabase status
```

### 4. Executar em desenvolvimento
```bash
npm run dev
```
Acesse a aplicação no navegador em `http://localhost:3000`.

---

## Validação e Qualidade

Todos os comandos de verificação de qualidade do projeto:

```bash
# Verificação de tipos TypeScript estrita
npm run typecheck

# Análise estática com ESLint
npm run lint

# Execução dos testes unitários e de contrato
npm run test

# Relatório de cobertura de testes (mínimo 85% linhas/funções, 80% branches)
npm run test:coverage

# Testes end-to-end com Playwright (desktop, tablet, mobile 360px)
npm run test:e2e

# Build de produção e geração PWA
npm run build
```

---

## Navegação por permissão (Spec 004)

O shell tem um menu de navegação que mostra só as telas que a pessoa autenticada pode usar: Visão geral e Meu perfil para todos; Pessoas do tenant, Papéis e permissões e Auditoria do tenant conforme as permissões no tenant ativo; Organizações e Auditoria da plataforma conforme as permissões globais. O menu é conveniência de interface: esconder um item não protege nada, e o servidor decide o acesso a cada tela.

A entrada tem painel de marca (logotipo, assinatura e três destaques), mostrar e ocultar a senha e a mesma moldura nas telas de recuperação e de verificação em duas etapas. A página inicial é a **Visão geral**, com indicadores, mapa reservado, gráficos de movimentação e de situação, alertas, cilindros recentes e medidas operacionais. Todos os números são **dados de exemplo**, marcados "Exemplo" em cada bloco, vindos de uma fonte única substituível, e a página não lê dado real de nenhuma organização. A barra superior reúne a organização ativa e o menu da pessoa ("Meu perfil" e "Sair").

Para isso o servidor ganhou uma consulta somente leitura das próprias permissões: a Edge Function `query-permissions` (`supabase/functions/query-permissions/`), que chama a função de banco `public.get_actor_permissions` (só `service_role`) e devolve apenas códigos de permissão (`tenant` e `global`), sem auditoria e sem dados de outros tenants. Nenhuma regra de acesso, papel ou permissão mudou.

Como a lista de funções servidas é fixada na inicialização, depois de atualizar a branch rode `npx supabase stop` e `npx supabase start` para a função nova ser servida. O catálogo de telas e as regras do menu estão em `src/domain/navigation/`, e o estado do menu em `src/app/navigation/`.

---

## Cilindros, identificadores, estoque e histórico (Spec 006)

A primeira entrega de dados de domínio: cada organização cadastra e mantém os próprios cilindros, com identificadores (QR Code, Data Matrix, etiqueta NFC e número gravado no casco), testes hidrostáticos, entrada no estoque e um histórico imutável. As telas são **Cilindros** (lista, cadastro, detalhe e histórico) e **Entrada no estoque**, visíveis pelo menu conforme as permissões `cylinder.read` e `cylinder.stock_in`.

- **Código para conferência.** No detalhe do cilindro, "Mostrar código" gera no navegador o QR Code ou o Data Matrix do valor de cada identificador ativo (biblioteca `bwip-js`, carregada só ao pedir).
- **Nada é excluído.** Cilindro, identificador, teste e evento nunca são apagados: o cilindro é inativado com justificativa, o identificador é desativado e a correção de um teste é uma retificação. O banco recusa a exclusão para qualquer papel.
- **Mapas.** O formulário e o detalhe da unidade mostram o ponto no mapa; a Visão geral ocupa 80% com o mapa das unidades com coordenadas e 20% com os indicadores empilhados. Leaflet com blocos do OpenStreetMap, carregado sob demanda; sem conexão, aviso no lugar do mapa.
- **Todo acesso passa pelo servidor.** O cliente só chama as Edge Functions `query-cylinders` e `manage-cylinders`, que conferem sessão, vínculo, papel e permissão a cada chamada. Cada ação sensível grava o evento de histórico e a auditoria na mesma transação.
- **Entrada no estoque idempotente.** Cada leitura leva uma chave de operação; repetir a mesma operação (duplo clique, nova tentativa, resposta perdida) não cria outro evento. Escritas exigem conexão e nunca são enfileiradas offline.
- **Situação do teste calculada.** Em dia, a vencer (30 dias ou menos), vencido, reprovado ou sem teste, sempre derivada dos registros e do dia de hoje em São Paulo; o limite de 30 dias existe uma só vez no domínio e uma só vez no SQL.
- **Permissões novas:** `cylinder.read`, `cylinder.write`, `cylinder.deactivate`, `cylinder.identifier`, `cylinder.stock_in`, `cylinder.test` e `cylinder.history`, entregues ao administrador do tenant, ao operador de estoque, ao operador técnico e ao novo papel auditor (`tenant_auditor`). O contrato completo está em `specs/006-cilindros-e-estoque/`.

Depois de atualizar a branch, rode `npx supabase db reset` e, para as funções novas serem servidas, `npx supabase stop` e `npx supabase start`. A medição de desempenho com 50 mil cilindros usa `npm run test:live` (banco e funções) e `npm run test:desempenho:cilindros` (navegador em conexão 4G).

---

## Clientes, unidades, geocercas, veículos e motoristas (Spec 007)

Cada organização mantém o próprio cadastro operacional. As telas são **Clientes** (com contatos e unidades), **Geocercas**, **Veículos** e **Motoristas**, visíveis pelo menu conforme as permissões do papel.

- **Endereço pelo CEP.** A unidade preenche o endereço a partir do CEP; a consulta (ViaCEP) é feita pela Edge Function `lookup-postal-code`, que envia só o CEP. Se a consulta falhar, o endereço é digitado à mão.
- **Geocercas.** Círculo (centro e raio) ou polígono (vértices), validados no banco com PostGIS; há consulta "quais geocercas contêm este ponto".
- **Documentos protegidos.** CPF, CNPJ e CNH completos ficam em tabelas sem política de leitura; as telas mostram só o valor mascarado e a revelação é uma ação auditada (`reveal_document`).
- **Nada é excluído.** Cliente, unidade, geocerca, veículo e motorista são inativados com justificativa (a inativação do cliente é uma cascata atômica, com prévia) e podem ser reativados. Todo evento vai para um histórico imutável, na mesma transação da auditoria.
- **Anonimização irreversível.** Pedida com justificativa e exige verificação em duas etapas (aal2), conferida na função e no banco. Ela sobrescreve os dados pessoais; cópias de segurança e logs da plataforma não são reescritos, e o endereço e as geocercas de cliente pessoa física permanecem.
- **Cadastro e edição em modal.** Os formulários abrem sobre a lista ou o detalhe, sem recarregar a página; Escape, "Cancelar" e o Voltar do navegador fecham, e o endereço (por exemplo `/veiculos/novo`) continua valendo como link direto.
- **Coordenadas pelo endereço (integração temporária, só do protótipo).** A Edge Function `geocode-address` busca latitude e longitude no Nominatim (OpenStreetMap) somente quando a pessoa clica em "Buscar coordenadas" e concorda com o aviso de envio a um serviço externo. Saem só logradouro, número, cidade, estado, CEP e país; cadastro de pessoa física é bloqueado por padrão. Ela é controlada pelas variáveis `GEOCODING_*` do servidor (ver `docs/geocodificacao-prototipo.md`), tem cache por organização de 30 dias e limite global de 1 requisição por segundo. A pessoa pode corrigir o ponto no mapa e confirma o endereço e o ponto antes de gravar; a unidade guarda a origem e quem confirmou. A reconfirmação do motorista na primeira entrega fica para a Fase 4. Se a busca falha, o cadastro segue sem ela.
- **Todo acesso passa pelo servidor.** O cliente só chama `query-registry`, `manage-registry`, `lookup-postal-code` e `geocode-address`. Escritas exigem conexão e nunca são enfileiradas offline.

Depois de atualizar a branch, rode `npx supabase db reset` e, para as funções novas serem servidas, `npx supabase stop` e `npx supabase start`. A medição de desempenho das listas com o volume de referência usa `npm run test:live` e `npm run test:desempenho:registro` (navegador em conexão 4G). O contrato completo está em `specs/007-clientes-geocercas-frota/`.

---

## Viagens, paradas, carga e entrega (Spec 008)

A tela **Viagens** planeja e acompanha cada saída, do planejamento à entrega, sempre dentro da organização ativa.

- **Planejamento.** Data, veículo, motorista e de uma a trinta paradas, cada uma com uma unidade de cliente e seus cilindros. Um cilindro só pode estar em uma viagem aberta (reserva atômica no banco); a capacidade do veículo, o teste hidrostático e os cadastros inativos são conferidos no servidor.
- **Carregamento e saída.** Conferência manual de cada cilindro, retirada com justificativa (exceção) e início da viagem, que tira os cilindros do estoque e os deixa "em trânsito" e **bloqueados (lógico)**. A trava física do lacre e a confirmação do dispositivo ficam para a Fase 6.
- **Entrega.** Chegada à parada (em qualquer ordem, com aviso), entrega por cilindro, nome e função do recebedor (visíveis só a quem tem `trip.recipient`), posição opcional com aviso de geocerca e correção que não apaga o registro original.
- **Desbloqueio, devolução e encerramento.** Desbloqueio lógico (o excepcional exige segundo fator e justificativa), devolução ao estoque, cancelamento e conclusão, com texto claro do que falta.
- **Consulta.** Lista com busca, filtros por situação, período, veículo, motorista, cliente e custódia, histórico imutável da viagem sem dado pessoal e o bloco "Viagens" nos detalhes de cilindro e de unidade. A lista e o detalhe de cilindros mostram a custódia (na organização, em trânsito, no cliente).
- **Todo acesso passa pelo servidor.** O cliente só chama `query-trips` e `manage-trips`; cada comando leva um `request_id` e repetir o mesmo pedido não duplica nada. Escritas exigem conexão e nunca são enfileiradas offline (a fila é da Fase 5).

Depois de atualizar a branch, rode `npx supabase db reset` e, para as funções novas serem servidas, `npx supabase stop` e `npx supabase start`. As medições de volume usam `tests/support/sql/trips-volume-semear.sql` e `trips-volume-limpar.sql`.

---

## Governança de IA por ciclo

Ao final de cada ciclo Spec Kit, depois dos testes e antes do commit, gere e valide o Registro de Uso de IA:

```bash
node scripts/governanca-ia/instalar-hooks.mjs
npm run ia:registro -- --spec 001 --ciclo 01 --titulo "Fundação técnica do FluxID"
npm run ia:validar
```

Os registros ficam em `docs/governanca-ia/registros/` e são versionados junto com a implementação e os testes do ciclo.
Interações que não encerram um ciclo Spec Kit não geram RIA automaticamente.

---

## Conectividade do Supabase

O sistema possui modos `local`, `lan`, `cloud` e `auto`. No modo automático, a ordem de prioridade vigente é nuvem, rede local e dispositivo local. As restrições de fallback, autenticação, promoção e sincronização estão documentadas em `docs/arquitetura-conectividade-supabase.md`.

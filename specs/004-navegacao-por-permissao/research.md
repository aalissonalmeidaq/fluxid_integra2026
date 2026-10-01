# Pesquisa: Navegação por permissão

Decisões da Fase 0. Nenhum item ficou como "NEEDS CLARIFICATION"; as cinco ambiguidades da spec foram resolvidas em `/speckit-clarify` (seção Clarifications).

## 1. Onde fica a consulta de permissões

- **Decisão**: função de banco `public.get_actor_permissions(p_actor, p_session, p_organization)` (`security definer`, só `service_role`), chamada pela Edge Function `query-permissions`.
- **Justificativa**: é o padrão já usado por `query_audit_events`, `list_tenant_access` e `global_actor_context`. A sessão vigente (`user_sessions`), o vínculo, a organização, o papel e a permissão são avaliados no momento da chamada por `private.actor_has_permission`, e o cliente nunca vê tabelas de papéis ou de vínculos. A função não grava auditoria (RF-023).
- **Alternativas**: (a) ler `role_permissions` pelo cliente com RLS: expõe a estrutura de papéis e exige novas políticas; (b) decodificar permissões do JWT: ficam desatualizadas até renovar o token e violam RF-016; (c) reaproveitar `list_tenant_access`: exige `tenant.manage` e devolve papéis e atribuições (RF-002 proíbe).

## 2. Formato da resposta

- **Decisão**: `{ kind: 'listed', tenant: string[], global: string[] }`, só códigos.
- **Justificativa**: o menor conjunto que decide os sete itens. Não há papéis, pessoas, nomes, versões nem identificadores, então não há o que vazar (RF-002, MS-005).
- **Alternativas**: devolver os itens do menu prontos (acopla o servidor à interface e à ordem das telas); devolver booleanos por tela (o servidor passaria a conhecer o catálogo de telas do cliente).

## 3. Tenant que não é da pessoa

- **Decisão**: `tenant: []`, sem erro e sem distinguir "não existe" de "não é seu".
- **Justificativa**: nenhum dado do outro tenant é devolvido nem confirmado; o menu cai para Início e Meu perfil com um comportamento só. Atende CA-002 sem criar oráculo de existência.
- **Alternativa**: `ACCESS_DENIED` 403. Rejeitada porque obriga o menu a tratar um erro de autorização como estado normal (quando um vínculo é bloqueado ou o tenant é suspenso) e dá um sinal a mais ao atacante.

## 4. Permissões globais

- **Decisão**: `global` reúne os códigos que a pessoa tem na organização proprietária (`platform.manage`, `audit.read`).
- **Justificativa**: a Spec 002 já autoriza Organizações por `platform.manage` (`global_actor_context`) e a auditoria da plataforma por `audit.read` na organização `owner` (`query_audit_events`). O papel `admin_fluxid` tem `platform.manage`, `audit.read` e `profile.read`, sem `tenant.manage` (teste `002_rbac_invariants`), e por isso ser global não concede itens do tenant (decisão do clarify).
- **Alternativa**: o servidor deduzir "é perfil global". Rejeitada: seria uma regra nova de acesso.

## 5. Atualização e navegação por âncora

- **Decisão**: o aplicativo não tem roteador; cada tela é uma carga de página por `<a href>`. A consulta roda em cada carga, a cada 60 s com a aba visível e online, e ao mudar o tenant ativo.
- **Justificativa**: cumpre RF-016 sem tempo real e sem biblioteca nova (RNF-003). O Supabase Realtime exigiria publicar mudanças de papel no cliente e ampliaria a superfície de segurança.
- **Alternativas**: Realtime (rejeitada no clarify); apenas ao navegar (a pessoa parada numa tela não veria a mudança).

## 6. Cache offline

- **Decisão**: `sessionStorage`, chave por hash curto de (pessoa, tenant), valor `{ codes, savedAt }`, lido só offline ou em falha de rede, limpo no logout, na expiração e na troca de pessoa.
- **Justificativa**: escopo de aba e de sessão (RF-020); sobrevive a recarregar a página no PWA offline, que é a navegação por âncora. Não contém credencial nem dado pessoal.
- **Alternativas**: memória (perde o menu a cada recarga offline); IndexedDB ou `localStorage` (persistem além da sessão; descartadas no clarify).

## 7. Cabeçalho e "Meu perfil"

- **Decisão**: remover o link "Meu perfil" do cabeçalho e deixá-lo no menu.
- **Justificativa**: evita dois controles para a mesma tela e um nome acessível duplicado; só muda o seletor dos testes (CA-007).

## 8. Breakpoint

- **Decisão**: menu fixo a partir de 768 px, usando `pontosDeQuebra.tablet` e o prefixo `tablet:` já definidos nos tokens; abaixo disso, painel recolhido (clarify).

## 9. Padrão de interação do painel móvel

- **Decisão**: botão de divulgação (`aria-expanded`, `aria-controls`) e painel não modal, em vez de diálogo.
- **Justificativa**: o menu não bloqueia o resto da página nem prende o foco; Escape fecha e devolve o foco ao botão (RA-005, RA-006). O foco ao abrir vai ao primeiro item, como a spec pede.
- **Alternativa**: `Dialog` do design system (modal). Rejeitada: prende o foco e esconde o resto da página, o que é desproporcional para uma lista de navegação.

## 10. Dependências

- **Decisão**: nenhuma nova (RNF-003). Ícones: reutilizar os 30 do catálogo da Spec 003; a escolha por item é uma tarefa, sem desenhar ícone novo.

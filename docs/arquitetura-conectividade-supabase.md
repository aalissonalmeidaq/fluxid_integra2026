# Arquitetura de conectividade do Supabase

## Objetivo

O FluxID usa o projeto Supabase gerenciado na nuvem como destino preferencial e recorre a uma instância homologada na rede local ou, por último, a uma instância local quando os destinos anteriores estiverem tecnicamente indisponíveis.

Esta decisão define o contrato arquitetural vigente a partir da Spec 002 e substitui a prioridade definida pela Spec 001, sem apagar seu histórico. A motivação, os riscos e a migração estão registrados em [ADR-001](./decisoes-arquiteturais/ADR-001-prioridade-cloud-e-sincronizacao-segura.md).

## Modos

| Modo | Comportamento |
|---|---|
| `auto` | Tenta, nesta ordem, nuvem, rede local e dispositivo local. |
| `local` | Usa apenas a instância no mesmo dispositivo. |
| `lan` | Usa apenas a instância homologada na rede local. |
| `cloud` | Usa apenas o projeto gerenciado na nuvem. |

Em navegadores e celulares, `127.0.0.1` aponta para o próprio dispositivo. Um servidor executado em outro equipamento deve ser informado por DNS ou endereço da rede local em `VITE_SUPABASE_LAN_URL`.

## Resolução em modo automático

1. validar a configuração sem registrar chaves;
2. realizar uma verificação curta, cancelável e somente de leitura no destino cloud;
3. verificar LAN somente quando cloud falhar por indisponibilidade técnica elegível;
4. verificar local somente quando cloud e LAN falharem por indisponibilidade técnica elegível;
5. criar no máximo um cliente ativo e invalidar o anterior em troca controlada;
6. informar ao usuário qual modo está ativo e quando ocorreu fallback;
7. permitir repetição manual e repetição automática com backoff limitado, reiniciando cada ciclo por cloud;
8. quando conectado por LAN ou local, reavaliar cloud periodicamente sem interromper operação em andamento;
9. promover cloud somente após sincronizar saída, sincronizar entrada, confirmar sessão, tenant e consistência mínima.

Uma falha de autenticação, autorização ou RLS não caracteriza indisponibilidade e não pode provocar fallback. Somente falhas de rede, timeout ou indisponibilidade comprovada do serviço permitem avançar para o próximo destino.

## Consistência e autenticação

Instâncias local, LAN e cloud são projetos distintos. Trocar apenas a URL não replica dados nem transfere sessões de autenticação.

Antes de habilitar o modo `auto` em produção, o projeto deve possuir:

- migrations idênticas em todos os destinos;
- estratégia de sincronização e resolução de conflitos aprovada;
- identificadores globais e operações idempotentes;
- fila de escrita offline com reprocessamento auditável;
- políticas RLS equivalentes e testadas com dois tenants;
- estratégia explícita para login e renovação de sessão em cada instância;
- telemetria do destino selecionado, fallback e sincronização;
- testes que impeçam escrita duplicada em dois destinos.

O cliente nunca deve enviar a mesma mutação simultaneamente para instâncias diferentes. A sincronização usa outbox, UUID, chave de idempotência, versão confirmada pelo servidor, cursor de entrada e processo dedicado, sequencial, auditável e observável. Timestamps do dispositivo são evidência auxiliar, não autoridade definitiva de ordenação.

Projetos Supabase distintos não compartilham automaticamente usuários, sessões ou chaves de assinatura. Uma sessão não pode ser reutilizada em outro destino por simples troca de URL. A estratégia de identidade entre cloud, LAN e local exige decisão operacional própria antes de habilitar autenticação degradada em produção.

## Inicialização e sincronização da PWA

1. carregar apenas app shell e configuração pública, abrir a base local e inspecionar a outbox;
2. resolver `cloud → lan → local` sem fallback por falha de segurança, domínio ou configuração;
3. quando cloud estiver disponível, enviar a outbox antes de buscar alterações remotas;
4. confirmar cada item no servidor antes de removê-lo da fila;
5. aplicar alterações posteriores ao último cursor e avançar o cursor somente após conclusão;
6. confirmar sessão, tenant e consistência mínima antes de liberar a área operacional;
7. em conflito crítico, preservar as versões local e remota e exigir resolução de domínio ou ator autorizado.

O modo degradado somente libera capacidades explicitamente classificadas como `offline-safe`. Operações de identidade, sessão, convite, RBAC, auditoria sensível e administração permanecem bloqueadas sem confirmação de uma fronteira confiável. As capacidades operacionais de Specs futuras ainda precisam de classificação de produto.

## Segurança e implantação

- O frontend usa somente chaves publicáveis, diferentes para cada projeto.
- Chaves secretas e `service_role` nunca usam prefixo `VITE_` e nunca chegam ao navegador.
- A pilha iniciada pelo Supabase CLI serve apenas para desenvolvimento e testes e não deve ser exposta como serviço de produção na LAN.
- Uma instalação Supabase permanente na rede local deve ser tratada como ambiente self-hosted, endurecido, monitorado, com backup e HTTPS.
- O projeto cloud permanece independente do MCP local e não deve receber escrita administrativa automática do agente.

## Variáveis

O contrato completo e sem valores reais está em `.env.example`. Cada endpoint possui URL e chave publicável próprias.

## Teste em outro aparelho da rede (somente desenvolvimento)

Com `npm run dev:rede`, o servidor do Vite aceita conexões da rede local. Quando a página é aberta por um endereço que não é a própria máquina (por exemplo, um celular), o destino `local` passa a apontar para a mesma origem da página, no caminho `/supabase-local`, e o próprio Vite repassa essas chamadas ao Supabase CLI desta máquina (`server.proxy` em `vite.config.ts`). Assim o Supabase CLI **não é exposto à rede**: só a porta 3000 precisa estar liberada no firewall. A troca só acontece em desenvolvimento (`import.meta.env.DEV`), nunca no build de produção, e não altera a chave publicável. Não use esta pilha como servidor de produção na rede local.

## Critérios de aceitação futuros

- selecionar corretamente cada modo explícito;
- preferir cloud no modo `auto`;
- usar LAN somente diante de indisponibilidade elegível de cloud e local somente diante de indisponibilidade elegível de cloud e LAN;
- não fazer fallback em erros de autenticação, RLS ou validação;
- preservar operações pendentes durante perda de conectividade;
- impedir duplicação de escrita;
- exibir o modo ativo e registrar a transição para auditoria.
- sincronizar saída antes da entrada e promover cloud somente depois da convergência segura.

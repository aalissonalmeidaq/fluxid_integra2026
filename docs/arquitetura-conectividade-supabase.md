# Arquitetura de conectividade do Supabase

## Objetivo

O FluxID deve operar com uma instância Supabase no dispositivo ou na rede local e usar o projeto Supabase gerenciado na nuvem quando os destinos locais configurados não estiverem disponíveis.

Esta decisão define o contrato arquitetural. A implementação, a infraestrutura e os testes de failover pertencem a um ciclo Spec Kit próprio.

## Modos

| Modo | Comportamento |
|---|---|
| `auto` | Tenta, nesta ordem, dispositivo local, rede local e nuvem. |
| `local` | Usa apenas a instância no mesmo dispositivo. |
| `lan` | Usa apenas a instância homologada na rede local. |
| `cloud` | Usa apenas o projeto gerenciado na nuvem. |

Em navegadores e celulares, `127.0.0.1` aponta para o próprio dispositivo. Um servidor executado em outro equipamento deve ser informado por DNS ou endereço da rede local em `VITE_SUPABASE_LAN_URL`.

## Resolução em modo automático

1. validar a configuração sem registrar chaves;
2. realizar uma verificação curta e somente de leitura no destino local;
3. se configurado, verificar o destino da rede local;
4. usar a nuvem apenas quando os destinos anteriores estiverem indisponíveis;
5. fixar o destino escolhido durante a sessão para evitar alternância repetitiva;
6. informar ao usuário qual modo está ativo e quando ocorreu fallback;
7. reavaliar a conectividade somente em um ponto controlado de reconexão.

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

O cliente nunca deve enviar a mesma mutação simultaneamente para a instância local e para a nuvem. A sincronização deve usar um processo dedicado, idempotente e observável.

## Segurança e implantação

- O frontend usa somente chaves publicáveis, diferentes para cada projeto.
- Chaves secretas e `service_role` nunca usam prefixo `VITE_` e nunca chegam ao navegador.
- A pilha iniciada pelo Supabase CLI serve apenas para desenvolvimento e testes e não deve ser exposta como serviço de produção na LAN.
- Uma instalação Supabase permanente na rede local deve ser tratada como ambiente self-hosted, endurecido, monitorado, com backup e HTTPS.
- O projeto cloud permanece independente do MCP local e não deve receber escrita administrativa automática do agente.

## Variáveis

O contrato completo e sem valores reais está em `.env.example`. Cada endpoint possui URL e chave publicável próprias.

## Critérios de aceitação futuros

- selecionar corretamente cada modo explícito;
- preferir local e LAN no modo `auto`;
- usar cloud somente diante de indisponibilidade elegível;
- não fazer fallback em erros de autenticação, RLS ou validação;
- preservar operações pendentes durante perda de conectividade;
- impedir duplicação de escrita;
- exibir o modo ativo e registrar a transição para auditoria.

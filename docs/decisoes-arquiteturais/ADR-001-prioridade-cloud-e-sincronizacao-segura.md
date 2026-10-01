# ADR-001 — Prioridade cloud e sincronização segura

- **Status**: aceita para planejamento; implementação pendente
- **Data**: 29/09/2026
- **Spec que introduz a alteração**: `002-autenticacao-multitenancy-rbac`
- **Substitui**: prioridade automática definida na Spec 001

## Contexto

A Spec 001 entregou um resolvedor determinístico `local → LAN → cloud`, fixado durante a sessão. Na revisão do planejamento da Spec 002, a operação do produto passou a exigir cloud como fonte preferencial, continuidade degradada por LAN/local e retorno controlado à cloud com sincronização.

Os destinos são projetos Supabase distintos. Eles não compartilham automaticamente dados, usuários, sessões, chaves JWT ou estado transacional. Trocar apenas URL e chave pode causar identidade inválida, perda ou duplicação de escrita e vazamento entre tenants.

## Decisão anterior

No modo `auto`, tentar dispositivo local, depois LAN e, por último, cloud. Manter o destino escolhido até reconexão controlada. Essa decisão permanece registrada nos artefatos históricos e na validação da Spec 001.

## Nova decisão

No modo `auto`, executar ciclos sequenciais na ordem:

```text
CLOUD → LAN → LOCAL
```

Fallback só ocorre por indisponibilidade técnica classificada. Falhas de autenticação, autorização, RLS, tenant, validação, integridade ou configuração encerram o ciclo como bloqueio.

Quando LAN ou local estiver ativo, a aplicação pode reavaliar cloud com backoff limitado. O retorno à cloud não interrompe operação em andamento: pausa novas mutações, estabiliza a operação corrente, envia a outbox de forma idempotente, recebe alterações posteriores ao cursor, confirma sessão, tenant e consistência e só então substitui o cliente ativo. Nunca há escrita simultânea em destinos diferentes.

## Justificativa

- cloud passa a ser a fonte operacional preferencial e reduz janelas de divergência;
- LAN/local preservam continuidade apenas quando cloud estiver tecnicamente indisponível;
- push antes de pull evita descartar alterações locais ainda não confirmadas;
- idempotência, versionamento e cursor tornam repetição e retomada verificáveis;
- a promoção coordenada evita trocar sessão ou tenant no meio de uma operação.

## Impacto

- o resolvedor, os testes e a documentação implementados na Spec 001 precisarão de alteração futura;
- a PWA precisará de base local, outbox, cursores, coordenação de sincronização e tela de inicialização;
- cada ambiente requer URL e chave publicável próprias, com LAN configurável e sem endereço fixo no código;
- RLS e schema compatíveis precisam existir em todos os destinos operacionais;
- operações de identidade e autorização não podem ser consideradas sincronizáveis como dados comuns;
- contratos e futuras tasks devem separar resolução, cliente ativo, push, pull, conflito e promoção.

## Riscos

- divergência de schema ou catálogo de permissões entre destinos;
- sessões incompatíveis entre projetos Supabase;
- duplicação por repetição sem chave idempotente;
- conflito ou perda por ordenação baseada somente no relógio do dispositivo;
- vazamento de cache/outbox na troca de tenant;
- bloqueio prolongado da inicialização e sincronização em rede instável;
- exposição indevida de uma pilha Supabase CLI como serviço operacional.

## Estratégia de migração

1. atualizar contratos e testes para `cloud → LAN → local` antes do código;
2. alterar a ordenação do ambiente e o resolvedor em TDD;
3. introduzir gerenciador que mantenha exatamente um cliente ativo e suporte cancelamento;
4. implantar persistência local segregada por tenant, outbox e cursores;
5. implementar push idempotente, pull incremental e conflitos antes de habilitar promoção automática;
6. validar RLS e compatibilidade com Tenant A e Tenant B em cada destino aplicável;
7. habilitar reavaliação e promoção de cloud somente após os gates de sincronização;
8. registrar esta decisão no RIA do ciclo de implementação antes do commit de encerramento.

Até a migração ser implementada e aprovada, o código existente continua refletindo a Spec 001 e não satisfaz esta ADR.

## Decisões complementares da Spec 002

- Auth é independente por projeto; o destino exige sessão própria e nenhum segredo ou token é replicado.
- A allowlist `offline-safe` da Spec 002 é vazia; domínios futuros definirão suas próprias operações.
- Conflitos críticos preservam ambas as versões e bloqueiam escrita automática até resolução autorizada.
- Os padrões são probe de 3 segundos, três ciclos em 2/4/8 segundos, cinco tentativas por item, recuperação da inicialização em 30 segundos e reavaliação da cloud após 60 segundos com jitter de até 10%.

## Consequências

Positivas: cloud torna-se autoridade preferencial; fallback fica restrito a indisponibilidade; sincronização e promoção passam a ter critérios verificáveis.

Negativas: aumenta a complexidade de estado, persistência, testes e operação; LAN/local não podem ser habilitados produtivamente sem estratégia de identidade, segurança, backup e observabilidade aprovada.

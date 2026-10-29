# Desempenho da Spec 015

Medições de 27/10/2026 no Supabase local (PostgreSQL 17.6, Docker no Windows 11). O ambiente local estima tendência e regressão, não a
capacidade de produção.

## Ensaio de ponta a ponta (T103)

Script: `scripts/tracking/medir-desempenho.mjs`. Ele passa pelas mesmas Edge Functions do aplicativo, com a pessoa motorista e o
administrador da demonstração. Foram duas execuções seguidas, e as duas atenderam todas as metas.

| Meta | Critério | Resultado |
|---|---|---|
| Fila de 480 posições (RF-007h, CS-016) | 480 posições acumuladas, em lotes de até 100, gravadas uma vez; reenvio sem duplicar | 480 gravadas em 370–400 ms; 480 reconhecidas como duplicadas no reenvio |
| Atualização visível (CS-001) | p95 ≤ 10 s do envio até o aviso no canal `tracking:<empresa>` e a posição aparecer na consulta da viagem | p95 101–118 ms, p50 90–93 ms, em 20 amostras |
| Relatório de 10.000 linhas (CS-006) | Consulta e exportação até `ready` em ≤ 30 s | Consulta: 111–315 ms. Exportação até `ready`: 366–434 ms |

Para rodar de novo:

```sh
FLUXID_PUBLISHABLE_KEY=<chave publicável de "npx supabase status"> node scripts/tracking/medir-desempenho.mjs
```

O script só aceita endereço local e inicia a viagem 3 da demonstração. A pessoa motorista da viagem precisa ter conta vinculada. Na
demonstração, a viagem 3 é da motorista sem conta, então, para este ensaio, ela foi atribuída localmente ao motorista com conta. Os
10.000 alertas sintéticos ficam no banco até o próximo `db reset`, porque o histórico de lacres só aceita inclusão. Cada execução usa
um dia novo.

## Índices (T104)

Consultas analisadas com `EXPLAIN (ANALYZE, BUFFERS)`:

| Consulta | Índice usado | Execução |
|---|---|---|
| Histórico da viagem: página de 200, mais recente primeiro | `mobile_positions_trip_time_idx` (empresa, viagem, observação), só índice | 0,11 ms, 6 blocos |
| Leitura do lacre mais recente para a comparação de proximidade | `seal_positions_device_read_idx` (lacre, leitura) | 2,1 ms |
| Lote de e-mail vencido | `email_notification_outbox_due_idx` (parcial) quando há volume; leitura direta com a fila vazia | 0,03 ms |
| Sessões da viagem e ocorrências do período | Tabelas pequenas, leitura direta é mais barata | < 0,1 ms |
| Relatório de alertas de um dia com 10.000 linhas | Antes: leitura da tabela inteira (527 blocos). Depois: `seal_alerts_org_opened_idx`, só índice (52 blocos) | 2,9 ms → 0,8 ms |

**Ajuste feito:** todas as fontes de relatório filtram por empresa e período, mas os índices existentes seguiam a empresa com situação,
viagem ou cilindro. Com anos de histórico, o recorte por período leria a tabela inteira. A migração
`20261022100700_report_period_indexes.sql` cria índices (empresa, data do recorte) para alertas, ocorrências de proximidade, eventos de
custódia, entregas, coletas e viagens; o de viagens usa a mesma expressão do filtro, `coalesce(started_at, created_at)`. A empresa fica
sempre na frente, então o isolamento por tenant e as políticas RLS não mudam. O teste `supabase/tests/015_report_indexes.test.sql`
confere os seis índices e o uso do índice de alertas no recorte por período.

**Limites desta medição:** o banco local tem poucas posições (cerca de 2 mil do celular e 500 dos lacres). Os planos de histórico e de
proximidade já usam índice, mas os tempos absolutos com milhões de posições precisam ser confirmados no ambiente de nuvem antes da
operação em escala.

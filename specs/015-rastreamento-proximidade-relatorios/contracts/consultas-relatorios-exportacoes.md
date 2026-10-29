# Contrato — Consultas, relatórios e exportações

## Tipos

`trips | telemetry_availability | proximity | alerts | deliveries | custody`.

Filtros canônicos: `from`, `to`, `trip_id`, `vehicle_id`, `driver_id`, `cylinder_id`, `seal_id`, `status`, `origin`, `quality`. Período usa ISO 8601 com offset/UTC; IDs vazios e filtros desconhecidos são recusados. A URL do cliente usa esses nomes, sem coordenadas ou dados pessoais livres.

## Consulta

A leitura é decidida no servidor pela matriz abaixo. As permissões não se substituem e a aplicação não amplia acesso por a pessoa conseguir abrir a área de relatórios:

| Tipo | Permissão de consulta |
|---|---|
| `trips` | `trip.read` |
| `telemetry_availability` | `tracking.read` |
| `proximity` | `tracking.read` |
| `alerts` | `seal.read` |
| `deliveries` | `trip.read` |
| `custody` | `cylinder.history` |

Em todos os tipos, vínculo ativo com o tenant e acesso aos registros-base continuam obrigatórios. `report.export` autoriza somente materializar/baixar o recorte que a pessoa já pode consultar; não concede nenhuma permissão de leitura. Operações:

- `query_report_summary(type, filters)`
- `query_report_rows(type, filters, cursor, limit<=200, snapshot_at)`

Resposta:

```json
{
  "report_type": "proximity",
  "organization": { "id": "uuid", "display_name": "Empresa" },
  "criteria": { "from": "...", "to": "...", "status": ["open"] },
  "generated_at": "2026-10-22T15:00:00Z",
  "snapshot_at": "2026-10-22T15:00:00Z",
  "totals": [{ "key": "occurrences", "value": 3, "meaning": "Ocorrências no recorte" }],
  "rows": [],
  "next_cursor": null
}
```

O cursor é opaco e representa `(occurred_at,id)`. `snapshot_at` mantém resumo/páginas coerentes. Respostas deixam explícito `measured | aggregated | unavailable | inconclusive`.

## Solicitar exportação

Permissão independente: `report.export`.

`request_report_export(type, filters, snapshot_at, request_id)` cria ou recupera o mesmo job somente quando a pessoa possui `report.export` e a permissão de consulta da matriz para `type`. Sempre cria job; o processamento começa logo após a criação, e recortes de até 10.000 linhas devem chegar a `ready` em até 30 s. Saída: `export_id`, `status`, `row_count` quando conhecido, `expires_at` quando pronto.

Estados: `queued -> processing -> ready -> expired` ou `processing -> failed`. Arquivo parcial nunca aparece como `ready`.

## Consultar e baixar

- O claim/processamento revalida vínculo, `report.export` e a permissão de consulta do tipo antes de ler registros; se alguma autorização foi perdida, encerra o job com falha sanitizada e não cria arquivo.
- `get_report_export(export_id)` revalida tenant, solicitante, `report.export` e a permissão de consulta do tipo.
- `authorize_report_download(export_id, request_id)` repete as mesmas verificações, registra obtenção e devolve URL assinada de vida curta apenas para `ready` não expirado.

Perder permissão, vínculo ou trocar tenant bloqueia status e download, mesmo que a URL anterior expire depois. O bucket é privado e o caminho não é previsível externamente.

## CSV

- UTF-8 com BOM opcional documentado, delimitador consistente e cabeçalhos em português;
- datas apresentadas localmente no horário de Brasília (`DD/MM/AAAA HH:MM:SS`, reconhecido como data pelas planilhas em português), com a coluna `Fuso horário`; situações, detecção, tipos, severidade, plataforma e eventos por extenso, com as mesmas palavras da tela, e código desconhecido mantido como veio (validação humana de 27/10/2026);
- mesmo snapshot, filtros, totais e linhas da consulta;
- valores textuais iniciados por `=`, `+`, `-`, `@`, tab ou CR são neutralizados antes da citação CSV;
- sem HTML, macro, hyperlink ativo ou fórmula;
- identifica empresa, tipo, geração e critérios em colunas/arquivo auxiliar tabular sem coordenadas além do necessário ao relatório.

## Auditoria e erros

Registrar solicitação, conclusão/falha, autorização de download, tipo, período, hash/filtros resumidos, contagem e responsável. Não registrar linhas, coordenadas, conteúdo ou URL assinada.

Erros: `INVALID_FILTER`, `INVALID_PERIOD`, `ACCESS_DENIED`, `NOT_FOUND`, `SNAPSHOT_EXPIRED`, `EXPORT_FAILED`, `EXPORT_EXPIRED`, `VERSION_CONFLICT`, `UNAVAILABLE`.

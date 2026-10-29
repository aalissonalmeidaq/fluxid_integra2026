# Contrato — Permissões e papéis

Quatro permissões novas, independentes entre si (RF-037, RF-009a). Nenhuma implica outra, e nenhuma é concedida por possuir `trip.read`, `seal.read` ou `tenant.manage`. Todas têm escopo `tenant` e são delegáveis dentro da empresa.

| Código | Id | Finalidade | Crítica |
|---|---|---|---|
| `tracking.read` | `...53` | Consultar acompanhamento, histórico, ocorrências de proximidade e a regra vigente | não |
| `report.export` | `...54` | Solicitar e baixar exportações; não amplia a leitura de nenhum relatório | não |
| `notification_category.manage` | `...55` | Liberar ou retirar categorias de aviso por e-mail da empresa | não |
| `proximity_rule.manage` | `...56` | Alterar a regra de proximidade da empresa, com justificativa | **sim** |

O id completo é `40000000-0000-0000-0000-0000000000NN`.

## Papéis padrão

| Papel | Permissões da Spec 015 |
|---|---|
| `tenant_admin` | `tracking.read`, `report.export`, `notification_category.manage`, `proximity_rule.manage` |
| `logistics_manager` | `tracking.read`, `report.export` |
| `tenant_auditor` | `tracking.read`, `report.export` |
| `stock_operator` | nenhuma |
| `technical_operator` | nenhuma |
| `driver` | nenhuma |

O motorista não precisa de `tracking.read` para coletar: iniciar a sessão e enviar posições exigem vínculo de motorista com a viagem (contrato de rastreamento). O papel Master da plataforma recebe as quatro, como todas as permissões ativas.

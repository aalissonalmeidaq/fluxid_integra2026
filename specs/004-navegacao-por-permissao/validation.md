# Validação — Spec 004

## Medições (T046)

Data: 01/10/2026. Ambiente: Windows 11, Node.js 24.21.0, Chromium do Playwright 1.63.0, backend simulado. Comando: `npx playwright test tests/e2e/medicao-shell.spec.ts --project=desktop-chromium`. A linha de base foi medida com o mesmo comando em uma cópia limpa do commit `af0ff69`, na mesma máquina.

| Medida | Linha de base | Com o menu | Limite |
|---|---|---|---|
| Shell da tela de entrada, mediana de 10 amostras | 123 ms | 127 ms | 158 ms (RNF-001, MS-006) |
| Shell autenticado ("Sair" visível ao recarregar), mediana de 20 amostras | 86 ms | 89 ms (+3,5%) | 20% sobre a linha de base |
| Menu visível ao recarregar, mediana | não existe | 93 ms | sem limite próprio |
| Consulta de permissões, p95 de 40 amostras (backend simulado) | não existe | 5 ms | 1 s |

Os valores variam entre execuções (as amostras têm picos de 140 ms nas duas versões); a comparação vale pela mediana e pelo limite de 158 ms.

## Validação humana (T049, MS-007)

Executada por Alisson Almeida em 01/10/2026, seguindo o roteiro 6 de [quickstart.md](./quickstart.md). Amostra: os três perfis do roteiro (administrador de tenant, operador técnico e Master do ambiente local). Ambiente: Chrome no Windows, com o menu conferido em 360 px e em desktop. Duração: cerca de 15 minutos. Resultado: aprovado, sem ressalvas.

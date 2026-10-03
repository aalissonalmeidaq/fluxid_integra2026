# Contrato: fonte de dados de exemplo

**Atende**: RF-016, RF-017, RF-032, RN-001, RN-004, RNF-004, CA-009

## Porta

`OverviewSource` expõe `load(blockId)`, que devolve o conteúdo tipado do bloco ou rejeita. É a **única** origem de números e textos da Visão geral; os componentes recebem dados prontos e nunca contêm valores.

| Resultado | Estado do bloco |
|---|---|
| Conteúdo com itens | `ready` |
| Conteúdo sem itens | `empty` |
| Rejeição | `error` (com "Tentar de novo") |
| Pendente | `loading` |

## Implementação inicial

`sampleOverviewSource` resolve em memória, sem rede, sem `fetch`, sem cliente Supabase e sem leitura de tenant, pessoa, sessão ou armazenamento. O resultado é o mesmo para qualquer pessoa e qualquer organização.

## Regras de conteúdo

1. Português brasileiro; números, percentuais e datas no padrão pt-BR.
2. Vocabulário do PRD (cilindro, lacre, geocerca, teste hidrostático, custódia).
3. Nenhum texto afirma que uma entrega, um comando ou uma trava aconteceu (RN-004).
4. Identificadores fictícios e inequivocamente de exemplo.
5. Série e categorias coerentes: a soma da rosca fecha o total; a tabela dos gráficos traz os mesmos valores do desenho.

## Troca por dados reais

A spec dos cilindros fornece outra implementação de `OverviewSource` pelo `OverviewSourceProvider`, mantendo os blocos, os estados e a marca. Enquanto a fonte for a de exemplo, a marca "Exemplo" é obrigatória; ao trocar por dados reais, a regra de rotulagem é revista nessa spec (RN-001).

## Verificações

- Teste de unidade da fonte: formato pt-BR, somas, ausência de termos de estado físico e de identificadores reais.
- Teste da página: nenhuma chamada de rede, mesmo conteúdo para duas pessoas e dois tenants (CA-009).
- Teste dos blocos com fonte falsa para `loading`, `empty`, `error` e `retry`.

# Checklist de qualidade da especificação: Clientes, unidades, geocercas, veículos e motoristas

**Finalidade**: validar a completude e a qualidade da especificação antes do planejamento
**Criada em**: 06/10/2026
**Funcionalidade**: [spec.md](../spec.md)

## Qualidade do conteúdo

- [x] Sem detalhes de implementação desnecessários. Ressalva: PostGIS, ViaCEP, Edge Function (descrita como "servidor") e service worker aparecem porque a pessoa responsável os decidiu ou porque são restrições do produto, como a Spec 006 já fazia com `bwip-js` e `BarcodeDetector`; nenhum requisito depende de linguagem, framework ou estrutura de código.
- [x] Focada em valor para a pessoa usuária e em necessidade de negócio
- [x] Escrita no padrão das specs do repositório (português, termos de domínio do PRD)
- [x] Todas as seções obrigatórias preenchidas

## Completude dos requisitos

- [x] Nenhum marcador [NEEDS CLARIFICATION] restante (as dúvidas viraram decisões assumidas, listadas em "Clarifications" para confirmação em `/speckit-clarify`)
- [x] Requisitos testáveis e sem ambiguidade (limites numéricos: raio 25 m a 5 000 m, 3 a 100 vértices, 30 dias, 10 contatos, 5 s)
- [x] Critérios de sucesso mensuráveis
- [x] Critérios de sucesso sem detalhes de implementação (MS-001 a MS-008)
- [x] Todos os cenários de aceitação definidos (9 histórias)
- [x] Casos de borda identificados
- [x] Escopo claramente delimitado ("Fora do escopo")
- [x] Dependências e premissas identificadas

## Prontidão da funcionalidade

- [x] Todos os requisitos funcionais têm critério de aceitação (RF ↔ histórias e CA)
- [x] As histórias cobrem os fluxos principais (cliente, unidade e CEP, geocerca, veículo, motorista, inativação, histórico, anonimização, acessibilidade)
- [x] A funcionalidade atende aos resultados mensuráveis
- [x] Nenhum detalhe de implementação vaza para os requisitos além das restrições já citadas

## Pontos a confirmar na clarificação

- Efeito cascata da inativação do cliente (RF-035).
- Máscara de CPF/CNH e a permissão "ver documentos" (RF-029 a RF-031).
- Limites de raio e de vértices (premissa 6) e o algoritmo do CNPJ alfanumérico (premissa 9).
- Volumes de referência dos testes de desempenho (RNF-001 a RNF-003).

## Notas

- Os itens abertos acima não bloqueiam `/speckit-clarify` nem `/speckit-plan`.

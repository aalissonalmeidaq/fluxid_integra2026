# Contrato: verificações automáticas

**Atende**: CA-001 a CA-013, MS-001 a MS-009

| Critério | Verificação | Onde roda | Falha quando |
|---|---|---|---|
| CA-001 | axe (WCAG 2.2 A e AA) em cada tela, em 360, 768 e 1920 px | Playwright | houver violação crítica ou grave; moderadas e leves entram no relatório sem bloquear |
| CA-002 | `contraste-dos-tokens` | Vitest | qualquer par permitido ficar abaixo de 4,5:1 (texto normal) ou 3:1 (texto grande e componente) |
| CA-003 | medição do tamanho de cada controle interativo | Playwright | algum controle (exceto link em linha) tiver menos de 44 por 44 px |
| CA-004 | registro das requisições de rede ao abrir cada tela | Playwright | houver requisição a domínio diferente de `localhost` e `127.0.0.1` |
| CA-005 | `scrollWidth` igual a `clientWidth` em 360, 768 e 1920 px e com zoom de 200% (viewport equivalente a 320 px) | Playwright | houver rolagem horizontal |
| CA-006 | percurso só por teclado e verificação do contraste do foco | Playwright | alguma função não for operável, o foco ficar invisível ou houver armadilha |
| CA-007 | suítes da Spec 002 (unidade, contrato, banco, ao vivo, E2E) | Vitest e Playwright | qualquer verificação de comportamento falhar |
| CA-008 | comparação de capturas (`maxDiffPixelRatio: 0.001`) | Playwright, Chromium, Linux | a diferença passar de 0,1% sem aprovação |
| CA-009 | emulação de `prefers-reduced-motion: reduce` e leitura de `document.getAnimations()` | Playwright | restar animação contínua em execução |
| CA-010 | `catalogo-completo` | Vitest | componente sem documentação completa |
| CA-011 | emulação de `forced-colors: active` e verificação de borda e visibilidade dos controles | Playwright | controle ficar invisível ou indistinguível |
| CA-012 | contagem de ícones, tamanhos, estados e variantes, e razão 3:1 de cada estado | Vitest | faltar ícone, tamanho ou estado, ou razão menor que 3:1; 16 px é revisado no catálogo |
| CA-013 | `escalas-no-codigo` e `escalas-no-navegador` | Vitest e Playwright | medida, tamanho ou peso fora das escalas |

## Execução

- `npm run test`: tokens, contraste, escalas, ícones, componentes e catálogo.
- `npm run test:e2e`: acessibilidade, reflow, teclado, rede, cores forçadas e movimento reduzido nas três larguras (os projetos do Playwright cobrem 360 px, tablet e desktop; o de 1920 px é adicionado).
- `npm run test:visual`: capturas contra a linha de base (somente Chromium).
- `npm run catalogo:build`: constrói o catálogo; o CI o serve em outra porta e roda axe e capturas nele.
- O CI roda todas no Linux; o `quality.yml` ganha o passo do catálogo e do teste visual.

## Validação humana (MS-008)

Alisson Almeida avalia fidelidade das telas, do logotipo e dos ícones às pranchas, a legibilidade do símbolo de 16 px, a leitura por tecnologia assistiva das tabelas em cartão e a linha de base visual. O resultado (amostra, ambiente, duração e decisão) vai para o RIA, sem inventar informação.

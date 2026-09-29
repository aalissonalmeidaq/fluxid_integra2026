# Sistema de design oficial do FluxID

> Este é o ponto de partida para toda tela do produto. Uma especificação de página pode complementar estas regras, mas não pode contrariar a identidade, a acessibilidade ou os tokens definidos aqui.

## Identidade

- **Marca:** FluxID
- **Slogan:** Rastreabilidade que protege. Inteligência que conecta.
- **Personalidade:** segura, inteligente e conectada.
- **Contexto:** rastreabilidade e gestão de cilindros de gases medicinais e industriais.

O visual deve comunicar operação confiável, leitura rápida de dados e conexão entre pessoas, cilindros e locais. A interface não redesenha a marca: logotipo, ícones proprietários e demais artefatos oficiais devem ser reutilizados como fornecidos pela equipe.

## Direção visual

- Fundos claros como padrão, com superfícies brancas e cinza-gelo.
- Azul para navegação, informação e confiança; verde para confirmação e disponibilidade; ciano para conectividade e dados em tempo real.
- Dashboards legíveis, mapas e localização quando a funcionalidade exigir, sem elementos decorativos que disputem atenção com a operação.
- Ícones lineares de uma única família, acompanhados de texto quando o significado não for óbvio.
- Layout mobile-first, sem rolagem horizontal de 360 px a desktop amplo.
- Não usar ficção científica, efeitos de distorção, elementos de jogo, interfaces simulando painel de controle ou qualquer linguagem visual de especulação financeira.

## Tokens de cor

| Papel | Valor | Uso |
|---|---:|---|
| Azul profundo | `#1249BB` | marca, navegação e ações principais |
| Azul royal | `#1766D9` | estados ativos e interação |
| Azul ciano | `#23AFE5` | conectividade e informação complementar |
| Verde vivo | `#37D20A` | sucesso e disponibilidade confirmada |
| Verde escuro | `#159B19` | sucesso com contraste reforçado |
| Navy | `#163B72` | títulos, textos de alta ênfase e superfícies institucionais |
| Branco | `#FFFFFF` | superfícies principais |
| Cinza-gelo | `#F3F7FA` | fundo da aplicação e áreas secundárias |
| Grafite | `#26384A` | texto de corpo e ícones |

Não usar cor como único indicador de estado: todo alerta inclui texto e, quando aplicável, ícone e semântica acessível.

## Tipografia e espaçamento

- **Fonte principal:** Montserrat. Use uma fonte de sistema compatível até que o carregamento oficial esteja configurado.
- Texto de corpo: 16 px ou maior, linha de pelo menos 1,5.
- Hierarquia: um `h1` por tela, seguido de `h2` e `h3` sem saltos.
- Escala de espaçamento: 4, 8, 12, 16, 24, 32, 48 e 64 px.
- Raios discretos: 6 a 12 px. Sombras apenas sutis para separar superfícies.

## Componentes e comportamento

- Botões e controles de toque têm ao menos 44 × 44 px, com rótulo claro e estado desabilitado perceptível.
- Ação principal: azul profundo; confirmação: verde escuro; ação secundária: contorno azul; ação destrutiva usa cor e texto explícitos.
- Campos usam rótulo visível, ajuda e erro próximo ao campo. O foco usa anel de alto contraste.
- Estados de conectividade, carregamento, vazio, erro, offline, sincronização e permissão negada são previstos desde o desenho.
- Transições são curtas e funcionais. `prefers-reduced-motion` desativa animações que não sejam essenciais.

## Acessibilidade e validação

- Atender WCAG 2.2 AA, contraste mínimo de 4,5:1 para texto normal e foco sempre visível.
- A navegação por teclado segue a ordem visual e oferece link para pular ao conteúdo principal.
- Nunca prender o foco; todo controle pode ser acionado por teclado.
- Validar em 360 px, tablet e desktop, com testes automatizados de axe para violações críticas e graves.

## Lista de entrega para telas

- [ ] Usa os tokens e a tipografia definidos neste arquivo.
- [ ] Mantém foco, contraste, estados e alvos de toque acessíveis.
- [ ] É responsiva de 360 px a desktop amplo.
- [ ] Explica estados operacionais com texto, não só com cor.
- [ ] Reutiliza os artefatos oficiais da marca sem recriá-los.

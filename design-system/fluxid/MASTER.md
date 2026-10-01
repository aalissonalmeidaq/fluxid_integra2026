# Sistema de design oficial do FluxID

> Este é o ponto de partida para toda tela do produto. Uma especificação de página pode complementar estas regras, mas não pode contrariar a identidade, a acessibilidade ou os tokens. A fonte única dos valores é o código: `src/design-system/tokens.ts`. O catálogo de componentes (`npm run catalogo:dev`) mostra cada token, componente, ícone e versão do logotipo, com variantes, estados e orientação de uso.

## Identidade

- **Marca:** FluxID
- **Slogan:** Rastreabilidade que protege. Inteligência que conecta.
- **Pilares:** Seguro, Inteligente e Conectado.
- **Contexto:** rastreabilidade e gestão de cilindros de gases medicinais e industriais.
- **Referências normativas:** as seis pranchas de identidade em `specs/003-design-system-telas/referencias/` (visão geral, variações da marca, iconografia, layout, cores e tipografia).

O visual comunica operação confiável, leitura rápida de dados e conexão entre pessoas, cilindros e locais.

## Onde está cada coisa

| O quê | Onde |
|---|---|
| Tokens (cores, tipografia, espaçamento, raios, sombras, gradientes, grade, containers) | `src/design-system/tokens.ts` (fonte única); `tokens.css` é gerado por `npm run tokens:gerar` |
| Contraste e combinações permitidas | `src/design-system/contrast.ts` e `verificar-contraste.ts`; testes em `src/design-system/tokens.test.ts` |
| Componentes | `src/design-system/components/`; documentação em `src/design-system/docs/` |
| Ícones (30) | `src/design-system/icons/` |
| Logotipo e símbolo | arquivos oficiais em `src/design-system/brand/oficial/`; componentes em `src/design-system/brand/`; versões derivadas por `scripts/design-system/gerar-variacoes-da-marca.mjs`; favicon e ícones da PWA por `scripts/design-system/gerar-icones-pwa.mjs` |
| Catálogo navegável | `catalogo/` (build separado, só desenvolvimento e CI, fora do pacote de produção) |
| Importação nas telas | `import { Button, TextField } from '@/design-system'` |

## Regras que valem para toda tela

- Use somente componentes e tokens do padrão. Cor literal, valor arbitrário do Tailwind e medida fora da escala são barrados por `tests/contract/escalas-no-codigo.test.ts`. Exceção precisa ser registrada na página Exceções do catálogo.
- **Cores:** fundos claros por padrão (branco e cinza-gelo). O ciano e o verde vivo da prancha são decorativos; para texto e ícones use `ciano-acessivel`, `verde-acessivel` e `verde-escuro`. Texto normal exige 4,5:1 e texto grande e componentes, 3:1. Nada depende só da cor.
- **Tipografia:** Montserrat (300 a 800) hospedada no aplicativo; escala 64, 48, 36, 24, 16 e 12 px; um `h1` por tela, sem saltos de nível.
- **Espaçamento:** 4, 8, 16, 24, 32, 48 e 64 px. Grade de 12 colunas no desktop, 8 no tablet e 4 no mobile; containers de 720, 960 e 1200 px.
- **Responsividade:** de 360 px a desktop amplo, sem rolagem horizontal, inclusive com zoom de 200%. Tabelas viram cartões em largura estreita.
- **Controles:** alvo de toque de 44 por 44 px, rótulo visível, ajuda e erro ligados ao campo, foco visível de 3 px.
- **Estados:** carregamento, vazio, erro, offline, sincronização e permissão negada previstos desde o desenho, com os componentes de estado do padrão. Nenhuma tela mostra sucesso que o servidor não confirmou.
- **Movimento:** `prefers-reduced-motion` desativa toda animação contínua; cores forçadas mantêm bordas e estados distinguíveis.
- **Marca:** o logotipo e o símbolo são os arquivos oficiais da equipe de marca (`src/design-system/brand/oficial/`); as versões que a marca não enviou são derivadas deles sem redesenho. Os 30 ícones são redesenhados a partir da prancha de iconografia. Respeite a área de proteção, a largura mínima digital de 120 px e os fundos aprovados; não distorça, recolora, gire, aplique sombras nem troque a tipografia.
- Não usar ficção científica, efeitos de distorção, elementos de jogo, interfaces simulando painel de controle ou linguagem visual de especulação financeira.

## Lista de entrega para telas

- [ ] Usa só os componentes e os tokens do design system (`@/design-system`).
- [ ] Mantém foco, contraste, estados e alvos de toque acessíveis.
- [ ] É responsiva de 360 px a desktop amplo, sem rolagem horizontal.
- [ ] Explica estados operacionais com texto, não só com cor.
- [ ] Reutiliza o logotipo e os ícones do padrão, sem recriá-los.
- [ ] Passa nas verificações de acessibilidade (axe), de escalas e de rede (nenhuma requisição de terceiros).

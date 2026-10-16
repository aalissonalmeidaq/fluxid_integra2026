# Contrato: conteúdo e links da landing

Contrato de **conteúdo** (não é API de rede). Fonte única: `src/pages/landing/landing-content.ts`. Testado em `tests/contract/landing-links.test.ts`.

## Links de materiais (lista fechada)

| id | Título | Destino |
|---|---|---|
| `documentos` | Documentos do projeto | https://drive.google.com/drive/folders/1YLRicnjdatuBTYKyWaMewX0AQ3SbIH0a?usp=drive_link |
| `repositorio-sistema` | Repositório do sistema | https://github.com/aalissonalmeidaq/fluxid_integra2026 |
| `repositorio-api` | Repositório da API | https://github.com/NatBaracho/APIEsp32 |
| `evidencias` | Evidências | https://drive.google.com/drive/folders/1OKMqN2ZkS4g5TztreFCycmmGjT9zEni5?usp=sharing |
| `canal-youtube` | Canal do YouTube | https://www.youtube.com/channel/UCdPUZsu3yPHOae_sGLkX1oQ |
| `video-pitch` | Vídeo do pitch | https://www.youtube.com/watch?v=VBYOPnadE9M |
| `video-prototipo-fisico` | Vídeo do protótipo físico | https://www.youtube.com/watch?v=oZAnkLHkd2k |
| `video-prototipo-sistema` | Vídeo do protótipo do sistema | https://youtu.be/j7Qnq4MC9ZE |

## Regras verificadas por teste

1. A lista tem exatamente estes 8 itens, com `id` e `url` únicos.
2. Toda `url` é `https://` e de um dos domínios permitidos.
3. Todo link externo renderiza `target="_blank"` e `rel="noopener noreferrer"`, mais o texto acessível "abre em nova aba".
4. Nenhum `iframe`, `script` ou recurso de terceiros é renderizado na abertura (RNF-007).
5. Cada funcionalidade tem `origem` entre `002` e `010`.
6. Nenhum texto contém número de clientes, depoimento, preço nem "em breve" para recurso não entregue. Exceção (16/10/2026): os valores dos planos, que ficam só em `PLANOS` (em números: limite de cilindros, implantação e mensalidade), são formatados pela página e aparecem com a nota de que são valores de referência.
7. Nenhum valor que lembre segredo (chave, token, `service_role`) existe no módulo.

## Vídeos em destaque (faixa "em ação")

A faixa logo depois da abertura repete, como palco grande, os vídeos `video-pitch` e `video-prototipo-sistema` (constante `DESTAQUES_EM_ACAO`, derivada da lista acima: mesmo endereço, título e descrição). Por isso a página tem 10 links externos e 8 destinos distintos; os dois extras ficam só na faixa "em ação". Nenhum player nem imagem de terceiros.

## Links internos

| Ação | Destino | Condição |
|---|---|---|
| Ver o sistema em ação (abertura) | `#em-acao` | sempre |
| Entrar no sistema | `/login` | sessão não autenticada ou em verificação |
| Abrir o sistema | `/visao-geral` | sessão autenticada |
| Âncoras do cabeçalho | `#funcionalidades`, `#offline`, `#seguranca`, `#materiais` | sempre |

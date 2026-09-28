# Governança do uso de IA

Esta pasta mantém a trilha auditável do uso de inteligência artificial no FluxID e os artefatos entregáveis à organização do INTEGRA SENAI.

## Padrão oficial

Os documentos DOCX existentes em `registros/` definem o padrão de conteúdo. Todo novo RIA deve preservar:

- identificador sequencial `RIA-NNN`;
- data, hora e fuso da interação;
- ferramenta de IA utilizada;
- objetivo e síntese sanitizada do prompt;
- resposta ou resultado produzido pela IA;
- análise crítica da equipe;
- validação humana e decisão `utilizado`, `adaptado` ou `descartado`;
- justificativa da decisão;
- fontes verificadas;
- decisões e dados pendentes;
- responsável e data da revisão;
- checklist final de uso responsável.

## Regra de redação

Os textos dos registros devem soar como se uma pessoa de verdade os tivesse escrito naturalmente. A revisão deve manter o sentido original, remover palavras robóticas, frases repetitivas e linguagem polida em excesso, deixando o relato claro, conversacional e autêntico. Essa adaptação não autoriza inventar fatos, omitir limitações, alterar evidências ou atribuir à equipe decisões que ela não confirmou.

Quando a IA produzir código, o campo `Resposta gerada pela IA` deve resumir o resultado e fornecer um link que permita à equipe revisar a mudança. Use preferencialmente o pull request, inclusive em modo draft. Se o PR ainda não existir no momento do registro, informe o link do repositório ou da branch e deixe explícita a pendência de adicionar o PR antes do merge. O link não pode conter credenciais, tokens ou parâmetros sensíveis.

O Markdown é a fonte versionável dos novos registros. O DOCX é o formato de apresentação e entrega e deve reproduzir o mesmo conteúdo, sem substituir silenciosamente o arquivo-fonte.

## Quando gerar um registro

Cada ciclo Spec Kit concluído gera exatamente um novo RIA, depois da aprovação dos testes e antes do commit que encerra o ciclo. Conversas exploratórias, auditorias e manutenções que não encerram um ciclo Spec Kit não geram um RIA automaticamente.

O mesmo commit de encerramento deve conter implementação, testes, novo registro e atualização de `indice.md`. O gerador inclui o novo item como `Pendente de validação`; a revisão humana deve substituí-lo pela decisão final antes do commit.

## Convenção

`registros/RIA-NNN-slug.md`

- `NNN`: sequência global com três dígitos, continuando os DOCX históricos;
- `slug`: título curto do ciclo.

## Uso no encerramento de um ciclo

```bash
git add src tests specs
npm run ia:registro -- --spec 001 --ciclo 01 --titulo "Cadastro de cilindros" --link-validacao "https://github.com/organizacao/repositorio/pull/123"
git add docs/governanca-ia
npm run ia:validar
git commit -m "feat(ativos): conclui cadastro de cilindros"
```

Nunca copie segredos, credenciais, dados pessoais desnecessários ou prompts confidenciais para um RIA. Registre somente uma síntese sanitizada, escrita de forma natural e revisada por uma pessoa.

# Guia de validação: Fundação técnica

Este guia descreve o resultado esperado depois da implementação da Spec 001. Ele não autoriza conexões remotas destrutivas.

## Pré-requisitos

- Node.js 24.21.0;
- npm 12 ou compatível com o lockfile;
- Docker Desktop em execução para cenários locais;
- variáveis preenchidas em `.env.local`, sem versionar o arquivo;
- `supabase/config.toml` existente.

## Instalação reproduzível

```powershell
npm ci
```

Resultado esperado: dependências instaladas estritamente a partir de `package-lock.json`.

## Supabase local

```powershell
npx --no-install supabase start
npx --no-install supabase status
```

Resultado esperado: serviços locais saudáveis. Não usar `--linked`, `db push` ou qualquer comando remoto neste guia.

## Execução

```powershell
npm run dev
```

Resultado esperado: shell do FluxID visível, sem telas de negócio, com estado e destino de conectividade apresentados sem exibir chaves.

## Gates automatizados

```powershell
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run test:e2e
npm run build
```

Resultados esperados:

- todos os comandos terminam com código zero;
- cobertura global mínima de 85% para linhas/funções e 80% para branches;
- resolvedor com todos os cenários de modo, prioridade e falha cobertos;
- nenhuma violação crítica de acessibilidade;
- artefato de produção e manifest PWA válidos.

## Medições obrigatórias

### Preparação em até 15 minutos

1. use um checkout limpo, com Node.js, npm e Docker já instalados;
2. inicie o cronômetro imediatamente antes de `npm ci`;
3. execute a instalação e `npm run dev` conforme este guia;
4. encerre o cronômetro quando o marco principal do shell estiver visível;
5. registre em `validation.md` o sistema operacional, uma descrição não identificável do hardware, a duração e o resultado, sem copiar variáveis de ambiente ou saídas com credenciais.

Resultado esperado: duração total menor ou igual a 15 minutos.

### Shell utilizável em até 2 segundos

O cenário E2E de `tests/e2e/app-shell.spec.ts` deve usar o build de produção servido localmente, o projeto Chromium desktop, um contexto novo e doubles para o Supabase. A medição começa na navegação e termina quando o marco principal fica visível e operável.

Resultado esperado: duração menor ou igual a 2.000 ms, sem incluir probes ou serviços externos.

## Cenários manuais controlados

1. `local`: somente o endpoint local é consultado.
2. `lan`: somente o endpoint LAN é consultado.
3. `cloud`: somente o endpoint cloud é consultado.
4. `auto` com local saudável: local é selecionado.
5. `auto` com local indisponível e LAN saudável: LAN é selecionada.
6. `auto` com local e LAN indisponíveis: cloud é selecionada e o modo degradado é informado.
7. resposta 401 ou 403: estado bloqueado, sem fallback.
8. nenhum endpoint disponível: estado offline, sem travar o shell.

Use doubles de teste ou ambientes descartáveis para simular falhas. Não desligue nem altere infraestrutura compartilhada.

## Validação responsiva e PWA

- validar larguras de 360 px, tablet e desktop amplo;
- navegar por teclado e conferir foco visível;
- verificar que o estado não depende apenas de cor;
- instalar a PWA em navegador compatível;
- iniciar a PWA sem rede e confirmar que o shell abre com estado offline;
- confirmar que respostas de dados não foram adicionadas ao cache do service worker.

## Encerramento do ciclo

Somente depois de todos os testes aprovados: preparar código e testes, gerar o RIA no padrão do projeto, incluir link do pull request ou branch para revisão humana, validar o gate e então criar o commit de encerramento.

# Guia de validação rápida: Landing page institucional

## Pré-requisitos

- Dependências instaladas (`npm ci`).
- Para os E2E: `npm run build` antes (o Playwright reaproveita servidor na porta 4173).
- Para as capturas visuais: Docker (Linux) e `npm run test:visual:atualizar`.

## 1. Conferir a landing no navegador

```bash
npm run build && npm run preview
```

Abra `http://localhost:4173/`. Esperado:
1. Abertura escura com o mascote, a chamada principal e o botão "Entrar no sistema" visíveis sem rolar, em 360 px e em 1440 px.
2. "Entrar no sistema" leva a `/login`.
3. Com sessão ativa, o botão vira "Abrir o sistema" e leva a `/visao-geral`.
4. A seção "Materiais do projeto" abre os 8 destinos em nova aba (veja [contracts/conteudo-e-links.md](contracts/conteudo-e-links.md)).

## 2. Testes automatizados

```bash
npx vitest run src/pages/landing tests/contract/landing-links.test.ts tests/contract/rota-raiz.test.ts
npx playwright test tests/e2e/landing --project=desktop-chromium --project=mobile-360-chromium --project=tablet-768 --project=desktop-1920
```

Esperado: tudo verde, sem violação séria ou crítica do axe.

## 3. Teclado e movimento

- Tab do topo ao rodapé: "Pular para o conteúdo" primeiro, foco sempre visível, ordem lógica.
- Ative "reduzir movimento" no sistema: nenhuma animação; todas as seções aparecem imediatamente.

## 4. Desempenho e pacote

```bash
npm run build
```

Confira `dist/assets/index-*.js` até 609.747 bytes e as imagens da primeira dobra até 250 KB. Meça LCP e CLS em 4G simulado (script de medição desta spec, no padrão das anteriores).

## 5. PWA

- Instale o app e abra: deve iniciar em `/visao-geral` (login se não houver sessão).
- Sem conexão, no navegador com o app instalado: `/` abre a landing, e os links externos mostram "precisa de conexão".

## 6. Regressão da migração de `/`

```bash
npx vitest run
npx playwright test --project=desktop-chromium
```

Nenhum teste pode mais assumir a Visão geral em `/`.

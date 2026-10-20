# Linha de base: Spec 013

**Data**: 18/10/2026 | **Branch**: `feat/013-aprovacao-lacres-master`, a partir da `main` no commit `fd44055` (merge do PR #47; a Spec 012 entrou pelo PR #43). Issue: #48.

Medido no Windows 11, com o Supabase local em Docker, antes de qualquer código desta spec.

## Suítes das Specs 001 a 012 (T003)

| Etapa | Resultado |
|---|---|
| `npm run lint` | sem avisos |
| `npm run typecheck` | sem erros |
| `npx vitest run` | 392 arquivos, **5.760 testes, todos passaram** |
| `npx supabase db reset` | todas as migrations e o seed aplicados |
| `npx supabase test db` | 115 arquivos, **3.019 testes, todos passaram** |
| `pio test -e native` | 57 testes nativos, todos passaram |
| `pio run -e esp32c3` | compilou; RAM 12,3% (40.332 de 327.680 bytes), flash 69,0% (904.918 de 1.310.720 bytes) |

O firmware rodou no contêiner `fluxid-pio:6.1.16` (PlatformIO 6.1.16), com o repositório inteiro montado, porque o `platformio.ini` lê os exemplos de `../tests/fixtures/seal-protocol`:

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "X:/projetos/fluxid:/w" -w /w/firmware fluxid-pio:6.1.16 sh -c "pio test -e native && pio run -e esp32c3"
```

A flash medida aqui (69,0%) é menor que a da Spec 012 (83,1%) e a do `research.md`, item 10 (86,2% com o portal). A comparação que vale para o limite de 95% é a do build final desta spec (T056), feito do mesmo jeito.

## Pacote de entrada

`dist/assets/index-*.js`: **605.934 bytes**. Limite desta spec: mais 5%, **636.230 bytes**; a tela `/admin/lacres` entra em chunk `React.lazy`.

## Arquivos alheios à spec

Ficam fora dos commits desta spec, com `git add` explícito: `.agents/skills/impeccable/`, `.claude/agents/`, `.claude/settings.local.json`, `.codex/` e `.tmp/`.

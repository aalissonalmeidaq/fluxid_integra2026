# Contrato: rotas e PWA

## Rotas

| Caminho | Tela | Acesso |
|---|---|---|
| `/` | Landing page | pública, para qualquer sessão; sem chamada de rede para renderizar |
| `/visao-geral` | Visão geral (antes em `/`) | autenticada, mesmas regras de hoje |
| `/login` | Login (cai na Visão geral protegida, que exibe o login) | pública, como hoje |
| `/recuperar-senha/confirmar` | Confirmação de recuperação | pública, como hoje |
| demais rotas | inalteradas | inalteradas |

Regras:
- `/` não passa por `ProtectedRoute`, `TenantGate` nem `AppShell`.
- Rota desconhecida continua caindo no desvio final (Visão geral protegida).
- `/?recovery=1` deixa de ser a entrada da recuperação; o botão "Solicitar novo link" usa `/login?recovery=1`.
- `screenByPath('/visao-geral')` devolve a tela `inicio`; `screenByPath('/')` devolve `undefined`.

## PWA

| Item | Valor |
|---|---|
| `manifest.start_url` | `/visao-geral` (era `/`) |
| `manifest.scope` | inalterado |
| `navigateFallback` | `/index.html` (inalterado); a landing abre offline com o app instalado |
| Precache | chunk da landing, CSS e imagens leves; PNG de reserva fora do precache |
| Cabeçalhos da Vercel | inalterados (`vercel.json`) |

## Metadados (em `index.html`)

`<title>`, `description`, `og:title`, `og:description`, `og:image` (1200x630), `og:locale=pt_BR`, `twitter:card=summary_large_image`. Sem rastreadores.

## Orçamento de desempenho

| Medida | Limite |
|---|---|
| `dist/assets/index-*.js` | até 609.747 bytes (597.791 + 2%) |
| Imagens da primeira dobra | até 250 KB |
| LCP em 4G simulado | até 2,5 s |
| CLS | abaixo de 0,1 |

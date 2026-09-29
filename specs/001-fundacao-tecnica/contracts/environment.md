# Contrato de ambiente

## Variáveis públicas

| Variável | Obrigatoriedade | Regra |
|---|---|---|
| `VITE_SUPABASE_CONNECTION_MODE` | Obrigatória | `auto`, `local`, `lan` ou `cloud` |
| `VITE_SUPABASE_LOCAL_URL` | Condicional | URL do Supabase CLI no mesmo dispositivo |
| `VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY` | Condicional | Chave publicável correspondente |
| `VITE_SUPABASE_LAN_URL` | Condicional | URL HTTPS da instância LAN homologada |
| `VITE_SUPABASE_LAN_PUBLISHABLE_KEY` | Condicional | Chave publicável correspondente |
| `VITE_SUPABASE_CLOUD_URL` | Condicional | URL HTTPS do projeto gerenciado |
| `VITE_SUPABASE_CLOUD_PUBLISHABLE_KEY` | Condicional | Chave publicável correspondente |
| `VITE_SUPABASE_PROBE_TIMEOUT_MS` | Opcional | Inteiro entre 250 e 10.000; padrão 2.000 |

Em modo explícito, o par URL/chave do modo escolhido é obrigatório. Em `auto`, pelo menos um par completo deve existir; pares incompletos são erro de configuração.

## Variáveis privadas

Nenhuma chave secreta faz parte do contrato do frontend. `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, senhas de banco e tokens de acesso não podem usar prefixo `VITE_`.

`SUPABASE_PROJECT_REF` pode ser usado por ferramentas locais e CI, mas não participa da seleção em runtime.

## Saída da validação

A validação retorna configuração tipada ou uma lista de erros por nome de variável. Mensagens e logs nunca incluem o valor das chaves.

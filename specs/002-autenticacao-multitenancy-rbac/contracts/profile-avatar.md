# Contrato: perfil e avatar

## Perfil

Leitura própria: usuário autenticado. Leitura de terceiro: somente ator com permissão de consultar usuários em organização compartilhada e ativa.

Campos editáveis pelo titular: `display_name`, `locale` e avatar. E-mail, estado, organizações, papéis e permissões não são editáveis por este contrato.

Validação: nome entre 2 e 100 caracteres após normalização; locale `pt-BR` nesta Spec.

## Avatar

- Bucket privado `avatars`.
- JPEG, PNG ou WebP; máximo 2 MB.
- Extensão e MIME devem concordar com bytes reais.
- SVG, arquivos animados não homologados, conteúdo corrompido e caminho arbitrário são rejeitados.
- Caminho é gerado a partir do `user_id` e identificador do objeto.

Fluxo de substituição:

1. validar sessão, autorização, tamanho, MIME e conteúdo;
2. gravar novo objeto em caminho canônico;
3. atualizar `profiles.avatar_path`;
4. excluir o objeto anterior somente após confirmação da referência nova;
5. se a atualização falhar, remover o novo objeto e preservar o anterior.

Leitura: URL assinada de curta duração ou download autenticado; nunca URL pública permanente. Proprietário e atores autorizados no escopo do tenant podem ler.

Erros públicos: `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `INVALID_FILE_CONTENT`, `ACCESS_DENIED`, `UPLOAD_FAILED` e `SERVICE_UNAVAILABLE`.

## Leitura de perfis (RLS)

`public.profiles` tem uma única política de SELECT para `authenticated`, `profiles_read`. Ela exige sessão ativa e vale
para o próprio perfil ou para quem tem `profile.read` em um tenant ativo compartilhado com a pessoa
(`private.can_read_profile_of`). Políticas permissivas duplicadas para o mesmo papel e ação são proibidas
(advisor 0006, `multiple_permissive_policies`). Teste: `supabase/tests/002_profiles_policies.test.sql`.

# Contrato: entrada renovada e painel de marca

**Atende**: RF-001 a RF-007, RF-024 a RF-029, RA-001, RA-005, RA-007

## Estrutura do DOM (sem sessão)

```text
<a> Pular para o conteúdo principal          (primeiro item de Tab)
[barra de conexão existente]
<main id="main-content" tabindex="-1">
  <div AuthLayout>
    <aside BrandPanel>   h1 = logotipo (nome acessível "FluxID"), selo "Ambiente seguro" (< 1024 px), chamada, frase de apoio e 3 destaques (ícones aria-hidden)
    <section aria-labelledby="login-title">   dentro de um cartão com logotipo decorativo (alt vazio) e selo (≥ 1024 px)
      <h2 id="login-title">Bem-vindo de volta</h2>   + subtítulo "Acesse sua conta para continuar"
      [Alert de sessão expirada / encerrada / saída segura]
      <form>  E-mail · Senha [Mostrar senha] · [Alert de erro] · Esqueci minha senha (à direita) · Entrar
```

- Um só `h1` (logotipo) e um só `main`; as telas de recuperação de senha usam o mesmo `AuthLayout`.
- O painel é decorativo para tecnologia assistiva, exceto o logotipo e os textos (RA-007).
- Sem barra superior, sem menu e sem consulta de permissões enquanto não houver sessão.
- Com a sessão em `mfa_required`, a verificação em duas etapas usa o mesmo `AuthLayout` (painel de marca, um só `h1`), sem barra superior, menu nem consulta de permissões. Quando a pessoa já autenticada é levada à verificação por uma rota que exige AAL2, a tela permanece no shell autenticado.

## Responsividade

| Largura | Comportamento |
|---|---|
| A partir de 1024 px | Duas colunas: painel de marca e formulário lado a lado |
| Abaixo de 1024 px | Uma coluna: faixa de marca no alto e formulário logo abaixo, sem rolagem horizontal desde 320 px |

## Comportamento preservado (Spec 002)

Validação, mensagens, foco, limite de sessões, expiração, bloqueio por tentativas e segundo fator permanecem **sem alteração de comportamento**. Texto do link de recuperação: "Esqueci minha senha" (existente). Sem login social, "Lembrar de mim", cadastro público ou canal de suporte (RF-004).

## Estado de conexão

Acima de 768 px, na barra de conexão existente, no alto. Abaixo de 768 px, em texto discreto no fim da página, acima do rodapé; o aviso de offline continua no alto (RF-006).

## Campo de senha

- Oculta por padrão. O botão tem nome acessível "Mostrar senha" ou "Ocultar senha" e `aria-pressed` com o estado.
- Alternar mantém o foco e o valor; o botão tem alvo de 44 por 44 px e foco visível.
- A senha nunca é registrada, gravada nem enviada fora do login existente (RF-033).

## Estados

Carregamento do botão "Entrando…", erro, offline e rede lenta como hoje; o estado de conexão existente continua visível (RF-006).

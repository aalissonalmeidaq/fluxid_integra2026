// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const config = read('supabase/config.toml');

const templates = [
  { name: 'recovery', file: 'supabase/templates/recovery.html', validity: /1 hora/, subject: /Recupere seu acesso ao FluxID/ },
  { name: 'invite', file: 'supabase/templates/invitation.html', validity: /72 horas/, subject: /Você foi convidado para o FluxID/ },
] as const;

describe.each(templates)('template transacional de $name', ({ name, file, validity, subject }) => {
  const html = read(file);

  it('está em português brasileiro e informa a validade contratada', () => {
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toMatch(validity);
    expect(html).toMatch(/uma vez|único/i);
  });

  it('usa somente o link de confirmação fornecido pelo serviço de identidade', () => {
    expect(html.match(/\{\{[^}]*\}\}/g)).toEqual(['{{ .ConfirmationURL }}']);
  });

  it('não embute segredo, URL fixa, token nem credencial', () => {
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/token|senha:|password|service_role|apikey|secret/i);
  });

  it('está registrado no config.toml com assunto em português', () => {
    const block = config.split(`[auth.email.template.${name}]`)[1]?.split(/\n\[/)[0] ?? '';
    expect(block).toMatch(subject);
    expect(block).toContain(`content_path = "./${file}"`);
  });
});

describe('template de convite: estados reais de entrega', () => {
  const html = read('supabase/templates/invitation.html');

  it('não afirma que a pessoa já tem acesso: o vínculo só ativa após a aceitação', () => {
    expect(html).toMatch(/aceitar/i);
    expect(html).not.toMatch(/você (já )?tem acesso|acesso liberado|acesso concedido/i);
  });

  it('orienta a ignorar a mensagem quando o convite não era esperado', () => {
    expect(html).toMatch(/ignore esta mensagem/i);
  });
});

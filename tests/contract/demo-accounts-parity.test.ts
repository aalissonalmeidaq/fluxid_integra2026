// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifesto from '../../src/domain/demo/acessos-demonstracao.json';

// Spec 014 (RF-002, RF-004; research.md, item 1): o seed local tem um arquivo próprio, porque o SQL não lê JSON. Este teste reprova
// qualquer diferença entre o seed e a fonte única: o manifesto inline e os 5 usuários inseridos no Auth.
const ROOT = process.cwd();
const seed = fs.readFileSync(path.join(ROOT, 'supabase/seeds/demonstracao.sql'), 'utf8');

describe('seed da demonstração × fonte única', () => {
  it('o manifesto inline é exatamente o JSON', () => {
    const inline = /\$manifesto\$([\s\S]*?)\$manifesto\$/.exec(seed)?.[1];
    expect(inline, 'o seed precisa do manifesto entre $manifesto$').toBeDefined();
    expect(JSON.parse(inline!)).toEqual(manifesto);
  });

  it('chama demo_restore nas duas fases, markers antes de state', () => {
    const markers = seed.indexOf("'markers'");
    const state = seed.indexOf("'state'");
    expect(seed).toMatch(/public\.demo_restore\(/);
    expect(markers).toBeGreaterThan(-1);
    expect(state).toBeGreaterThan(markers);
  });

  it('insere no Auth só os 5 usuários do JSON, com o mesmo id, e-mail e senha', () => {
    const usuarios = [...seed.matchAll(/\('00000000-0000-0000-0000-000000000000','([0-9a-f-]{36})','authenticated','authenticated','([^']+)',crypt\('([^']+)',gen_salt\('bf'\)\)/g)]
      .map(([, id, email, senha]) => ({ id, email, senha }));
    expect(usuarios).toEqual(manifesto.accounts.map((conta) => ({ id: conta.user_id, email: conta.email, senha: conta.password })));
  });

  it('o seed entra depois do seed principal no config.toml', () => {
    const config = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8');
    expect(config).toMatch(/sql_paths\s*=\s*\["\.\/seed\.sql",\s*"\.\/seeds\/demonstracao\.sql"\]/);
  });
});

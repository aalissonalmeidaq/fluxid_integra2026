// Gera src/design-system/tokens.css (tema estrito) a partir de src/design-system/tokens.ts.
// Uso: npm run tokens:gerar. O Node 24 lê TypeScript sem compilar (remoção de tipos).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gerarTokensCss } from '../../src/design-system/gerar-css.ts';

const pasta = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/design-system');
fs.writeFileSync(path.join(pasta, 'tokens.css'), gerarTokensCss());
console.log('Tokens gerados: tokens.css');

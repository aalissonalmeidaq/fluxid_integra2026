// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FORBIDDEN_SECRET_PATTERNS = [
  /VITE_.*SECRET/i,
  /VITE_.*SERVICE_ROLE/i,
  /VITE_.*PASSWORD/i,
  /VITE_.*PRIVATE_KEY/i,
  /VITE_.*ADMIN/i,
];

export function validateNoClientSecrets(keys: string[]): string[] {
  const violations: string[] = [];
  for (const key of keys) {
    for (const pattern of FORBIDDEN_SECRET_PATTERNS) {
      if (pattern.test(key)) {
        violations.push(key);
      }
    }
  }
  return violations;
}

const ROOT = process.cwd();

// --- Utilitários de varredura ---------------------------------------------------------------------------------------
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.html', '.css', '.md', '.sql', '.toml', '.yml', '.yaml', '.txt', '.svg', '.webmanifest', '.example', '.env']);

function walk(directory: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

// Arquivos versionados ou versionáveis: o que o Git veria, sem o que o .gitignore exclui.
function versionableFiles(): string[] {
  try {
    const output = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return output.split('\0').filter(Boolean).map((file) => path.join(ROOT, file)).filter((file) => fs.existsSync(file));
  } catch {
    return [];
  }
}

const isText = (file: string) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()) || path.basename(file).startsWith('.env');

// Decodifica o corpo de um JWT; devolve nulo quando a cadeia não é um JWT legível.
function jwtClaims(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    return payload ? JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

// Tokens com papel privilegiado em qualquer lugar do texto.
function privilegedJwts(content: string): string[] {
  return (content.match(JWT_PATTERN) ?? []).filter((token) => {
    const role = jwtClaims(token)?.role;
    return role === 'service_role' || role === 'supabase_admin';
  });
}

// Valores sintéticos aceitos em arquivos versionáveis, cada um com sua justificativa:
//  - Local-only-NNN!: senhas dos usuários sintéticos do seed local, inexistentes fora do ambiente de desenvolvimento;
//  - JBSWY3DPEHPK3PXP: segredo TOTP de exemplo da RFC 6238 usado em mocks e testes, sem valor de acesso;
//  - segredo-da-rotina-de-retencao: segredo fictício do teste de contrato da rotina de retenção;
//  - Senha-/Nova-/Outra-: senhas fictícias digitadas em testes de interface.
const SYNTHETIC_VALUES = [/^Local-only-\d{3}!$/, /^JBSWY3DPEHPK3PXP$/, /^segredo-da-rotina-de-retencao$/, /^(Senha|Nova-|Outra-)/i];

const PRIVATE_KEY_PEM = /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/;
const SECRET_KEY_FORMAT = /sb_secret_[A-Za-z0-9_-]{10,}/;

describe('Contrato de Segurança: Segredos no Cliente (Client Secrets Contract)', () => {
  it('rejeita variáveis confidenciais com prefixo VITE_', () => {
    const maliciousKeys = [
      'VITE_SUPABASE_SERVICE_ROLE_KEY',
      'VITE_DATABASE_PASSWORD',
      'VITE_JWT_SECRET',
      'VITE_ADMIN_TOKEN',
      'VITE_PRIVATE_KEY',
    ];

    const violations = validateNoClientSecrets(maliciousKeys);
    expect(violations).toEqual(maliciousKeys);
  });

  it('permite variáveis públicas legítimas', () => {
    const validKeys = [
      'VITE_SUPABASE_CONNECTION_MODE',
      'VITE_SUPABASE_LOCAL_URL',
      'VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY',
      'VITE_SUPABASE_PROBE_TIMEOUT_MS',
    ];

    const violations = validateNoClientSecrets(validKeys);
    expect(violations).toHaveLength(0);
  });

  it('assegura que .env.example não contém segredos nem chaves com prefixo VITE_', () => {
    const envExamplePath = path.resolve(process.cwd(), '.env.example');
    if (fs.existsSync(envExamplePath)) {
      const content = fs.readFileSync(envExamplePath, 'utf-8');
      const lines = content.split('\n');
      const keys = lines
        .map((l: string) => l.trim())
        .filter((l: string) => l && !l.startsWith('#') && l.includes('='))
        .map((l: string) => l.split('=')[0]?.trim() || '');

      const violations = validateNoClientSecrets(keys);
      expect(violations).toHaveLength(0);
    }
  });

  it('o .env.example traz as variáveis do servidor sem valores e nenhuma chave privilegiada', () => {
    const content = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf-8');
    expect(privilegedJwts(content)).toEqual([]);
    expect(content).not.toMatch(SECRET_KEY_FORMAT);
    expect(content).not.toMatch(PRIVATE_KEY_PEM);
    // Segredos de servidor só podem aparecer como nome de variável sem valor, nunca com prefixo VITE_.
    for (const line of content.split('\n')) {
      // Nomes terminados em _URL descrevem endereços públicos (ex.: destino do link de recuperação), não segredos.
      const match = /^\s*([A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PASSWORD|PRIVATE)[A-Z0-9_]*(?<!_URL))\s*=(.*)$/.exec(line);
      if (match) expect(match[2]!.trim(), `a variável ${match[1]} não deve trazer valor`).toBe('');
    }
  });
});

// Arquivos que CITAM padrões de credencial justamente para recusá-los; o teste abaixo comprova que são detectores.
const SECRET_DETECTORS = ['src/config/environment.ts', 'src/infrastructure/observability/audit-logger.ts'];

describe('Contrato de Segurança: código do cliente', () => {
  const clientFiles = () => walk(path.join(ROOT, 'src')).filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file));

  it('nenhum arquivo do cliente referencia credencial privilegiada nem variável de servidor', () => {
    const offenders: string[] = [];
    for (const file of clientFiles()) {
      const relative = path.relative(ROOT, file).replace(/\\/g, '/');
      if (SECRET_DETECTORS.includes(relative)) continue;
      const content = fs.readFileSync(file, 'utf8');
      if (/service_role|SERVICE_ROLE|SUPABASE_SECRET|sb_secret_|supabase_admin/i.test(content) || privilegedJwts(content).length > 0) {
        offenders.push(relative);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('as exceções são detectores: só usam os padrões para recusar, nunca para montar credenciais', () => {
    for (const relative of SECRET_DETECTORS) {
      const content = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      expect(content, relative).toMatch(/\.test\(/);
      expect(privilegedJwts(content), relative).toEqual([]);
      expect(content, relative).not.toMatch(/createClient\([^)]*service_role/i);
    }
  });

  it('o cliente só lê variáveis públicas do ambiente (prefixo VITE_)', () => {
    const offenders: string[] = [];
    for (const file of clientFiles()) {
      const content = fs.readFileSync(file, 'utf8');
      for (const match of content.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g)) {
        if (!/^VITE_/.test(match[1]!) && !['MODE', 'DEV', 'PROD', 'BASE_URL', 'SSR'].includes(match[1]!)) offenders.push(`${path.relative(ROOT, file)}: ${match[1]}`);
      }
      if (/process\.env/.test(content)) offenders.push(`${path.relative(ROOT, file)}: process.env`);
    }
    expect(offenders).toEqual([]);
  });

  it('o cliente só importa do servidor as regras puras compartilhadas, nunca funções com credenciais', () => {
    const allowed = new Set(['supabase/functions/_shared/profile-rules.ts']);
    const offenders: string[] = [];
    for (const file of clientFiles()) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/from\s+'([^']*supabase\/functions[^']*)'/g)) {
        const target = match[1]!.replace(/^(\.\.\/)+/, '');
        if (!allowed.has(target)) offenders.push(`${path.relative(ROOT, file)} -> ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('as regras compartilhadas com o servidor não dependem de ambiente nem de rede', () => {
    const content = fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/profile-rules.ts'), 'utf8');
    expect(content).not.toMatch(/\bimport\s|Deno\.|process\.|fetch\(|createClient|env\(/);
  });
});

describe('Contrato de Segurança: logs', () => {
  it('nenhum log do cliente ou das funções imprime credenciais, tokens ou dados de requisição', () => {
    const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'supabase/functions'))]
      .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file));
    const offenders: string[] = [];
    for (const file of files) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        if (/console\.(log|info|debug|warn|error|trace)\(/.test(line) && /password|senha|token|secret|authorization|bearer|service_role|apikey|refresh|credential|request\.|body\b/i.test(line)) {
          offenders.push(`${path.relative(ROOT, file)}:${index + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('as funções servidor não repassam mensagens internas de erro ao cliente', () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(ROOT, 'supabase/functions')).filter((candidate) => /handler\.ts$/.test(candidate))) {
      const content = fs.readFileSync(file, 'utf8');
      if (/\.message\b[^\n]*json\(|json\([^\n]*(?:error|err|e)\.(?:message|stack)/.test(content)) offenders.push(path.relative(ROOT, file));
    }
    expect(offenders).toEqual([]);
  });
});

// A varredura lê todos os arquivos versionáveis e fica mais lenta com a instrumentação de cobertura; o padrão de 5 s é curto.
describe('Contrato de Segurança: artefatos versionáveis', { timeout: 60_000 }, () => {
  const files = versionableFiles().filter(isText);

  it('há arquivos para varrer', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('nenhum arquivo contém chave privilegiada, chave secreta ou chave privada PEM', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (privilegedJwts(content).length > 0 || SECRET_KEY_FORMAT.test(content) || PRIVATE_KEY_PEM.test(content)) offenders.push(path.relative(ROOT, file));
    }
    // O código que implementa a própria varredura cita os padrões; todo o resto deve estar limpo.
    expect(offenders.filter((file) => !/client-secrets\.test\.ts$/.test(file))).toEqual([]);
  });

  it('nenhum arquivo versionável traz senha fixa fora do padrão sintético dos testes locais', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (/\.(md|lock)$/.test(file) || /package-lock\.json$/.test(file)) continue;
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        for (const match of line.matchAll(/(?:password|senha|secret|passwd)["']?\s*[:=]\s*["']([^"'\s]{8,})["']/gi)) {
          const value = match[1]!;
          const synthetic = SYNTHETIC_VALUES.some((pattern) => pattern.test(value)) || /^\$\{/.test(value) || /env\(/.test(value);
          if (!synthetic) offenders.push(`${path.relative(ROOT, file)}:${index + 1}`);
        }
      });
    }
    expect(offenders.filter((entry) => !/client-secrets\.test\.ts/.test(entry))).toEqual([]);
  });

  it('o .gitignore protege arquivos de ambiente locais e as chaves', () => {
    const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    expect(ignore).toMatch(/^\.env\*?$|^\.env\.local$|^\.env\.\*/m);
  });

  it('nenhum arquivo de ambiente com valores (.env.local e similares) está versionável', () => {
    const tracked = versionableFiles().map((file) => path.relative(ROOT, file).replace(/\\/g, '/'));
    expect(tracked.filter((file) => /(^|\/)\.env(\.[a-z]+)?$/i.test(file) && !/\.example$/.test(file))).toEqual([]);
  });
});

describe('Contrato de Segurança: bundle entregue ao navegador', () => {
  let outDir = '';
  let bundleFiles: string[] = [];

  beforeAll(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxid-bundle-'));
    // Build de produção real, com o mesmo Vite do projeto, em diretório temporário.
    execFileSync(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, stdio: 'pipe', timeout: 240_000 });
    bundleFiles = walk(outDir).filter((file) => isText(file) || /\.(js|css|html|map)$/.test(file));
  }, 300_000);

  afterAll(() => {
    if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('gera os arquivos do bundle', () => {
    expect(bundleFiles.some((file) => file.endsWith('.js'))).toBe(true);
    expect(bundleFiles.some((file) => file.endsWith('index.html'))).toBe(true);
  });

  it('nenhum arquivo do bundle carrega chave privilegiada, chave secreta ou chave privada', () => {
    const offenders: string[] = [];
    for (const file of bundleFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (privilegedJwts(content).length > 0) offenders.push(`${path.relative(outDir, file)}: JWT privilegiado`);
      if (SECRET_KEY_FORMAT.test(content)) offenders.push(`${path.relative(outDir, file)}: sb_secret_`);
      if (PRIVATE_KEY_PEM.test(content)) offenders.push(`${path.relative(outDir, file)}: chave privada`);
      if (/SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY/.test(content)) offenders.push(`${path.relative(outDir, file)}: variável de servidor`);
    }
    expect(offenders).toEqual([]);
  });

  it('o bundle não contém os segredos reais do ambiente local nem do ambiente do processo', () => {
    const secrets: string[] = [];
    for (const [key, value] of Object.entries(process.env)) {
      if (value && value.length >= 16 && /SECRET|SERVICE_ROLE|PASSWORD|PRIVATE|TOKEN/i.test(key) && !/^VITE_/.test(key)) secrets.push(value);
    }
    for (const name of ['.env.local', '.env']) {
      const file = path.join(ROOT, name);
      if (!fs.existsSync(file)) continue;
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const match = /^\s*([A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PASSWORD|PRIVATE)[A-Z0-9_]*)\s*=\s*(.{16,})$/.exec(line);
        if (match) secrets.push(match[2]!.trim().replace(/^["']|["']$/g, ''));
      }
    }
    const offenders: string[] = [];
    for (const file of bundleFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const secret of secrets) if (content.includes(secret)) offenders.push(path.relative(outDir, file));
    }
    expect(offenders).toEqual([]);
  });

  it('os únicos JWT embutidos no bundle não têm papel privilegiado', () => {
    for (const file of bundleFiles) {
      const tokens = fs.readFileSync(file, 'utf8').match(JWT_PATTERN) ?? [];
      for (const token of tokens) expect(['service_role', 'supabase_admin']).not.toContain(jwtClaims(token)?.role);
    }
  });

  it('o bundle não referencia as Edge Functions de gestão com credencial embutida', () => {
    for (const file of bundleFiles.filter((candidate) => candidate.endsWith('.js'))) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/x-retention-secret|RETENTION_JOB_SECRET|PASSWORD_RECOVERY_REDIRECT_URL/);
    }
  });
});

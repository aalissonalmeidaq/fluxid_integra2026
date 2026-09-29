import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
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
});

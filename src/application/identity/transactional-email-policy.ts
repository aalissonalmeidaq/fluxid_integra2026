export type DeploymentEnvironment = 'development' | 'staging' | 'production';
export type EmailTarget = 'local' | 'lan' | 'cloud';
export type TransactionalEmailMode = { kind: 'local_capture' | 'supabase_default' | 'approved_smtp' };

export function resolveTransactionalEmailMode(input: {
  environment: DeploymentEnvironment;
  target: EmailTarget;
  smtpConfigured: boolean;
}): TransactionalEmailMode {
  if (input.environment === 'development' && input.target === 'local') return { kind: 'local_capture' };
  if (input.environment === 'staging') return input.smtpConfigured ? { kind: 'approved_smtp' } : { kind: 'supabase_default' };
  if (input.environment === 'production' && input.smtpConfigured && input.target !== 'local') return { kind: 'approved_smtp' };
  if (input.environment === 'production' && input.target === 'local') {
    throw new Error('Captura local não é permitida em produção.');
  }
  throw new Error('SMTP homologado é obrigatório neste destino.');
}

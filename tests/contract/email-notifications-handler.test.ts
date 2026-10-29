// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { buildEmailMessage, createFakeEmailProvider, type EmailItem, type EmailProvider } from '../../supabase/functions/email-notifications/email-provider';
import { createEmailNotificationsHandler, type EmailGateway } from '../../supabase/functions/email-notifications/handler';

// Spec 015 (T089; US6, RF-033, RF-035; contracts/avisos-email.md): a função de envio só trabalha com o segredo do Vault e com um provedor
// escolhido; sem provedor, não reclama nada. Cada item vira uma mensagem mínima (empresa, categoria, instante, severidade, identificador e
// link autenticado), sem coordenada, endereço, token ou observação. Erro transitório e tempo esgotado viram nova tentativa; erro
// permanente vira falha com código sanitizado. O banco e o provedor são falsos.
const APP = 'https://app.fluxid.example';
const ITEM: EmailItem = {
  id: 'e1000000-0000-4000-8000-000000000001', category: 'seal_high_critical', transition: 'opened', to: 'gestor@example.invalid',
  organization: 'Tenant A', occurred_at: '2026-10-22T15:04:00Z', severity: 'critical', kind: 'seal_broken', identifier: 'CIL-008',
  path: '/alertas/a1000000-0000-4000-8000-000000000001',
};

function gateway(items: unknown[], code = 'OK'): EmailGateway & { report: ReturnType<typeof vi.fn>; claim: ReturnType<typeof vi.fn> } {
  return { claim: vi.fn(async () => ({ code, items })), report: vi.fn(async () => undefined) };
}
const post = (secret: string | null = 's3cr3t') =>
  new Request('http://localhost/email-notifications', { method: 'POST', headers: secret ? { 'x-email-notifications-secret': secret } : {}, body: '{}' });

describe('mensagem mínima', () => {
  it('assunto com categoria e empresa; corpo com instante, severidade, identificador e link autenticado', () => {
    const message = buildEmailMessage(ITEM, APP);
    expect(message.to).toBe('gestor@example.invalid');
    expect(message.subject).toBe('FluxID · Alerta alto ou crítico de lacre · Tenant A');
    expect(message.text).toContain('CIL-008');
    expect(message.text).toContain('Crítica');
    expect(message.text).toContain('22/10/2026 12:04');
    expect(message.text).toContain(`${APP}/alertas/a1000000-0000-4000-8000-000000000001`);
    expect(message.text).toContain(`${APP}/perfil`);
  });

  it('campos fora da lista nunca entram na mensagem', () => {
    const leaky = { ...ITEM, latitude: -7.2314, longitude: -39.3101, address: 'Praça da Sé, 1', token: 'abc.def', close_note: 'segredo' } as EmailItem;
    const message = buildEmailMessage(leaky, APP);
    expect(`${message.subject}\n${message.text}`).not.toMatch(/-7\.23|-39\.31|Praça|abc\.def|segredo/);
  });

  // Validação humana (27/10/2026): o e-mail dizia só "alerta alto ou crítico"; quem recebe precisa saber qual foi, como na tela.
  it('alerta de lacre diz o tipo, com as palavras da tela; tipo desconhecido não aparece cru', () => {
    expect(buildEmailMessage(ITEM, APP).text).toContain('Alerta: Lacre rompido');
    expect(buildEmailMessage({ ...ITEM, category: 'seal_recovered', transition: 'recovered', kind: 'no_comm' }, APP).text).toContain('Alerta: Sem comunicação');
    expect(buildEmailMessage({ ...ITEM, kind: 'tipo_novo' }, APP).text).not.toMatch(/Alerta:|tipo_novo/);
    expect(buildEmailMessage({ ...ITEM, category: 'proximity_confirmed', kind: 'proximity_separation', path: '/rastreamento/ocorrencias/x' }, APP).text)
      .not.toContain('Alerta:');
  });

  it('afastamento e recuperação têm texto próprio', () => {
    expect(buildEmailMessage({ ...ITEM, category: 'proximity_confirmed', kind: 'proximity_separation', path: '/rastreamento/ocorrencias/x' }, APP).text)
      .toContain('afastou do celular do motorista');
    expect(buildEmailMessage({ ...ITEM, category: 'seal_recovered', transition: 'recovered' }, APP).subject).toContain('Lacre recuperado');
  });
});

describe('função de envio', () => {
  it('sem o segredo, recusa sem reclamar', async () => {
    const db = gateway([]);
    const response = await createEmailNotificationsHandler(db, createFakeEmailProvider(), { appUrl: APP })(post(null));
    expect(response.status).toBe(401);
    expect(db.claim).not.toHaveBeenCalled();
  });

  it('sem provedor escolhido, não reclama nada', async () => {
    const db = gateway([ITEM]);
    const response = await createEmailNotificationsHandler(db, null, { appUrl: APP })(post());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'PROVIDER_UNAVAILABLE' });
    expect(db.claim).not.toHaveBeenCalled();
  });

  it('segredo recusado pelo banco é 401', async () => {
    const response = await createEmailNotificationsHandler(gateway([], 'ACCESS_DENIED'), createFakeEmailProvider(), { appUrl: APP })(post());
    expect(response.status).toBe(401);
  });

  it('envia e relata enviado com a referência do provedor', async () => {
    const db = gateway([ITEM]);
    const provider = createFakeEmailProvider();
    const response = await createEmailNotificationsHandler(db, provider, { appUrl: APP })(post());
    expect(await response.json()).toEqual({ sent: 1, retry: 0, failed: 0 });
    expect(provider.sent).toHaveLength(1);
    expect(db.report).toHaveBeenCalledWith('s3cr3t', [{ id: ITEM.id, outcome: 'sent', provider_ref: 'fake-1' }]);
  });

  it('erro transitório, exceção e tempo esgotado viram nova tentativa; erro permanente vira falha sanitizada', async () => {
    const items = ['1', '2', '3', '4'].map((n) => ({ ...ITEM, id: `e1000000-0000-4000-8000-00000000000${n}` }));
    const outcomes: Array<() => ReturnType<EmailProvider['send']>> = [
      async () => ({ ok: false, permanent: false, code: 'PROVIDER_UNAVAILABLE' }),
      async () => { throw new Error('rede caiu com gestor@example.invalid'); },
      () => new Promise(() => undefined),
      async () => ({ ok: false, permanent: true, code: 'caixa inexistente: gestor@example.invalid' }),
    ];
    let call = 0;
    const provider: EmailProvider = { send: () => outcomes[call++]!() };
    const db = gateway(items);
    const response = await createEmailNotificationsHandler(db, provider, { appUrl: APP, timeoutMs: 20 })(post());
    expect(await response.json()).toEqual({ sent: 0, retry: 3, failed: 1 });
    expect(db.report.mock.calls[0]![1]).toEqual([
      { id: items[0]!.id, outcome: 'retry', error_code: 'PROVIDER_UNAVAILABLE' },
      { id: items[1]!.id, outcome: 'retry', error_code: 'PROVIDER_UNAVAILABLE' },
      { id: items[2]!.id, outcome: 'retry', error_code: 'PROVIDER_TIMEOUT' },
      { id: items[3]!.id, outcome: 'failed', error_code: 'DELIVERY_REJECTED' },
    ]);
    expect(JSON.stringify(db.report.mock.calls)).not.toContain('@');
  });

  it('item malformado vira falha sem chamar o provedor', async () => {
    const provider = createFakeEmailProvider();
    const db = gateway([{ ...ITEM, to: 'sem-arroba' }, { ...ITEM, id: 'e1000000-0000-4000-8000-000000000009', path: 'https://outro.site' }]);
    await createEmailNotificationsHandler(db, provider, { appUrl: APP })(post());
    expect(provider.sent).toHaveLength(0);
    expect(db.report.mock.calls[0]![1].map((r: { outcome: string }) => r.outcome)).toEqual(['failed', 'failed']);
  });

  it('o provedor falso pode simular recusa permanente para os testes ao vivo', async () => {
    const provider = createFakeEmailProvider('rejected');
    expect(await provider.send(buildEmailMessage(ITEM, APP))).toEqual({ ok: false, permanent: true, code: 'DELIVERY_REJECTED' });
  });
});

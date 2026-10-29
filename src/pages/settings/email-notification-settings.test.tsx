import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TrackingTransport } from '@/application/tracking/tracking-ports';
import { EmailNotificationService } from '@/application/tracking/email-notification-service';
import { EmailCategoriesScreen, EmailDeliveriesPanel, EmailPreferencesScreen } from './email-notification-settings';

// Spec 015 (T090; US6, RF-032, RF-035): liberação das categorias pelo administrador, escolha própria (só o liberado e permitido, com o
// motivo do que não está disponível) e o estado dos avisos no detalhe do alerta, que nunca muda o alerta. Tudo por teclado e anunciado.
function backend(responses: { status: number; body: unknown }[]) {
  const call = vi.fn(async () => (responses.length > 1 ? responses.shift()! : responses[0]!));
  return { service: new EmailNotificationService({ call } as TrackingTransport), call };
}
const CATS = (enabled: string[]) => ['proximity_confirmed', 'seal_high_critical', 'seal_recovered'].map((category) => ({ category, enabled: enabled.includes(category) }));
const PREFS = [
  { category: 'proximity_confirmed', allowed: true, enabled: false, reason: null },
  { category: 'seal_high_critical', allowed: false, enabled: false, reason: 'no_permission' },
  { category: 'seal_recovered', allowed: false, enabled: false, reason: 'not_released' },
];

describe('liberação das categorias', () => {
  it('começa com tudo desligado, libera e anuncia a nova versão', async () => {
    const { service, call } = backend([{ status: 200, body: { code: 'FOUND', version: 0, categories: CATS([]) } },
      { status: 200, body: { code: 'UPDATED', version: 1, categories: CATS(['proximity_confirmed']) } }]);
    render(<EmailCategoriesScreen service={service} organizationId="org-a" online />);
    const group = await screen.findByRole('group', { name: 'Categorias liberadas para a empresa' });
    // Validação humana (27/10/2026): retirar uma categoria desliga a escolha das pessoas, e a tela avisa antes de salvar.
    expect(screen.getByText(/Retirar uma categoria desliga a escolha de quem optou/)).toBeInTheDocument();
    const proximity = within(group).getByRole('checkbox', { name: /Afastamento confirmado/ });
    expect(proximity).not.toBeChecked();
    fireEvent.click(proximity);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar categorias' }));
    expect(await screen.findByText('Categorias salvas. Cada pessoa ainda precisa escolher receber.')).toBeInTheDocument();
    expect(call).toHaveBeenLastCalledWith('manage-tracking', expect.objectContaining({ categories: ['proximity_confirmed'], version: 0 }));
  });

  it('conflito de versão recarrega e explica', async () => {
    const { service } = backend([{ status: 200, body: { code: 'FOUND', version: 0, categories: CATS([]) } },
      { status: 409, body: { code: 'VERSION_CONFLICT' } }, { status: 200, body: { code: 'FOUND', version: 2, categories: CATS(['seal_recovered']) } }]);
    render(<EmailCategoriesScreen service={service} organizationId="org-a" online />);
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar categorias' }));
    expect(await screen.findByText(/Outra pessoa alterou as categorias/)).toBeInTheDocument();
    expect(await screen.findByRole('checkbox', { name: /Lacre recuperado/ })).toBeChecked();
  });

  it('sem conexão, não salva e diz por quê', async () => {
    const { service } = backend([{ status: 200, body: { code: 'FOUND', version: 0, categories: CATS([]) } }]);
    render(<EmailCategoriesScreen service={service} organizationId="org-a" online={false} />);
    expect(await screen.findByText(/Sem conexão/)).toBeInTheDocument();
  });
});

describe('escolha própria', () => {
  it('só o liberado e permitido fica disponível; o resto explica o motivo e fica desabilitado', async () => {
    const { service, call } = backend([{ status: 200, body: { code: 'FOUND', categories: PREFS } },
      { status: 200, body: { code: 'UPDATED', categories: [{ ...PREFS[0], enabled: true }, PREFS[1], PREFS[2]] } }]);
    render(<EmailPreferencesScreen service={service} organizationId="org-a" online />);
    const proximity = await screen.findByRole('checkbox', { name: /Afastamento confirmado/ });
    const seal = screen.getByRole('checkbox', { name: /Alerta alto ou crítico de lacre/ });
    expect(seal).toBeDisabled();
    expect(seal).toHaveAccessibleDescription('Sua conta não lê os alertas desta categoria.');
    expect(screen.getByRole('checkbox', { name: /Lacre recuperado/ })).toHaveAccessibleDescription('A empresa ainda não liberou esta categoria.');
    fireEvent.click(proximity);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar escolhas' }));
    expect(await screen.findByText('Escolhas salvas.')).toBeInTheDocument();
    expect(call).toHaveBeenLastCalledWith('manage-tracking', expect.objectContaining({ operation: 'set_my_email_preferences', categories: ['proximity_confirmed'] }));
  });

  it('sem nada liberado, explica que não há aviso disponível', async () => {
    const { service } = backend([{ status: 200, body: { code: 'FOUND', categories: PREFS.map((p) => ({ ...p, allowed: false, reason: 'not_released' })) } }]);
    render(<EmailPreferencesScreen service={service} organizationId="org-a" online />);
    expect(await screen.findByText(/Nenhum aviso por e-mail está disponível para você/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar escolhas' })).toBeNull();
  });
});

describe('estado dos avisos no alerta', () => {
  it('mostra situação, horário e motivo da falha, e diz que o alerta não muda', async () => {
    const { service } = backend([{ status: 200, body: { code: 'FOUND', items: [
      { category: 'seal_high_critical', transition: 'opened', status: 'sent', updated_at: '2026-10-22T15:05:00Z', sent_at: '2026-10-22T15:05:00Z', error_code: null },
      { category: 'seal_recovered', transition: 'recovered', status: 'failed', updated_at: '2026-10-22T16:00:00Z', sent_at: null, error_code: 'DELIVERY_REJECTED' },
    ] } }]);
    render(<EmailDeliveriesPanel service={service} organizationId="org-a" alertId="a1" />);
    const list = await screen.findByRole('list', { name: 'Avisos por e-mail deste alerta' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText(/Abertura: Enviado/)).toBeInTheDocument();
    expect(within(list).getByText(/Recuperação: Falhou — o provedor recusou o envio/)).toBeInTheDocument();
    expect(screen.getByText('Uma falha no e-mail não altera, não encerra e não duplica o alerta.')).toBeInTheDocument();
  });

  it('sem avisos, diz isso; sem permissão, não mostra nada', async () => {
    const empty = backend([{ status: 200, body: { code: 'FOUND', items: [] } }]);
    const { unmount } = render(<EmailDeliveriesPanel service={empty.service} organizationId="org-a" alertId="a1" />);
    expect(await screen.findByText('Nenhum aviso por e-mail foi gerado para este alerta.')).toBeInTheDocument();
    unmount();
    const denied = backend([{ status: 403, body: { code: 'ACCESS_DENIED' } }]);
    const { container } = render(<EmailDeliveriesPanel service={denied.service} organizationId="org-a" alertId="a1" />);
    await vi.waitFor(() => expect(denied.call).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

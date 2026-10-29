import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TrackingTransport } from '@/application/tracking/tracking-ports';
import { ProximityRuleService } from '@/application/tracking/proximity-rule-service';
import { ProximityRuleScreen } from './proximity-rule-settings';

// Spec 015 (T041c; RF-009, RF-009a, RF-040): tela da regra. Todos com tracking.read veem a regra vigente e as faixas; só quem administra
// a regra edita, com justificativa obrigatória; erros ficam junto do campo e o resultado é anunciado; tudo por teclado.
const RULE = { id: 'r1', version: 1, distance_m: 100, max_age_s: 120, max_accuracy_m: 50, valid_from: '2026-10-22T12:00:00Z' };
function backend(responses: { status: number; body: unknown }[]) {
  const call = vi.fn(async () => responses.length > 1 ? responses.shift()! : responses[0]!);
  return { service: new ProximityRuleService({ call } as TrackingTransport), call };
}

describe('tela da regra de proximidade', () => {
  it('mostra a regra vigente com as faixas, só para leitura sem a permissão de administrar', async () => {
    render(<ProximityRuleScreen service={backend([{ status: 200, body: { code: 'FOUND', rule: RULE } }]).service} organizationId="org-a" canManage={false} online />);
    expect(await screen.findByText('Versão 1')).toBeInTheDocument();
    expect(screen.getByText(/Afastamento acima de 100 m/)).toBeInTheDocument();
    expect(screen.getByText(/posições com até 2 minutos/)).toBeInTheDocument();
    expect(screen.getByText(/precisão de até 50 m/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar nova regra' })).toBeNull();
    expect(screen.getByText(/Só quem administra a regra pode alterá-la/)).toBeInTheDocument();
  });

  it('administrador altera com justificativa e vê a nova versão anunciada', async () => {
    const { service, call } = backend([{ status: 200, body: { code: 'FOUND', rule: RULE } },
      { status: 200, body: { code: 'UPDATED', rule: { ...RULE, version: 2, distance_m: 200 } } }]);
    render(<ProximityRuleScreen service={service} organizationId="org-a" canManage online />);
    const distance = await screen.findByLabelText('Distância máxima (m)');
    // Validação humana (27/10/2026): "tempo" no lugar de "idade", termo mais claro para quem administra.
    expect(screen.getByLabelText('Tempo máximo da posição (s)')).toBeInTheDocument();
    // O rótulo diz o que o número é (um limite de erro), e a prévia mostra a regra com os valores digitados antes de salvar.
    expect(screen.getByLabelText('Precisão de até (m)')).toBeInTheDocument();
    fireEvent.change(distance, { target: { value: '200' } });
    expect(screen.getByText(/Com estes valores: afastamento acima de 200 m/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Rota rural com sinal fraco.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova regra' }));
    expect(await screen.findByText('Regra atualizada: versão 2. Ela vale para as próximas comparações.')).toBeInTheDocument();
    expect(call).toHaveBeenLastCalledWith('manage-tracking', expect.objectContaining({ distance_m: 200, justification: 'Rota rural com sinal fraco.' }));
  });

  it('valores fora das faixas e justificativa curta: erros junto de cada campo, sem enviar', async () => {
    const { service, call } = backend([{ status: 200, body: { code: 'FOUND', rule: RULE } }]);
    render(<ProximityRuleScreen service={service} organizationId="org-a" canManage online />);
    fireEvent.change(await screen.findByLabelText('Distância máxima (m)'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'curta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova regra' }));
    expect(await screen.findByText('Use um número inteiro entre 50 e 500.')).toBeInTheDocument();
    expect(screen.getByText('Explique a mudança com 10 a 500 caracteres.')).toBeInTheDocument();
    expect(screen.getByLabelText('Distância máxima (m)')).toHaveAttribute('aria-invalid', 'true');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('sem conexão: mostra a regra carregada e desabilita salvar com o motivo', async () => {
    const { service } = backend([{ status: 200, body: { code: 'FOUND', rule: RULE } }]);
    const view = render(<ProximityRuleScreen service={service} organizationId="org-a" canManage online />);
    await screen.findByText('Versão 1');
    view.rerender(<ProximityRuleScreen service={service} organizationId="org-a" canManage online={false} />);
    expect(screen.getByRole('button', { name: 'Salvar nova regra' })).toBeDisabled();
    expect(screen.getByText('Sem conexão: a regra só pode ser alterada online.')).toBeInTheDocument();
  });

  it('falha ao carregar oferece tentar de novo', async () => {
    const { service, call } = backend([{ status: 500, body: {} }, { status: 200, body: { code: 'FOUND', rule: RULE } }]);
    render(<ProximityRuleScreen service={service} organizationId="org-a" canManage online />);
    fireEvent.click(await screen.findByRole('button', { name: /Tentar novamente/ }));
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Versão 1')).toBeInTheDocument();
  });
});

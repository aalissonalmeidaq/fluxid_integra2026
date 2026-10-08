import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryOutcome } from '@/application/registry/registry-service';
import { RevealDocument } from './reveal-document';

// Documento fictício gerado para a suíte.
const CPF = '52998224725';

const setup = (outcome: RegistryOutcome<string> = { kind: 'success', value: CPF }, props: { canReveal?: boolean } = {}) => {
  const reveal = vi.fn(async () => outcome);
  const view = render(<RevealDocument label="CPF" masked="***.***.***-25" canReveal={props.canReveal ?? true} reveal={reveal} format={(value) => `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6, 9)}-${value.slice(9)}`} />);
  return { reveal, ...view };
};

describe('RevealDocument (RF-030, RF-031)', () => {
  it('sem a permissão não há botão e o documento fica mascarado', () => {
    const { reveal } = setup(undefined, { canReveal: false });
    expect(screen.getByText('***.***.***-25')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revelar CPF' })).not.toBeInTheDocument();
    expect(reveal).not.toHaveBeenCalled();
  });

  it('"Revelar" mostra o valor formatado, anuncia uma vez e troca o botão por "Ocultar"', async () => {
    const { reveal } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Revelar CPF' }));
    expect(await screen.findByText('529.982.247-25')).toBeInTheDocument();
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('CPF revelado. Ele fica visível até você ocultar.');
    expect(screen.queryByText('***.***.***-25')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ocultar CPF' })).toBeInTheDocument();
  });

  it('"Ocultar" remove o valor da tela e anuncia', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Revelar CPF' }));
    await screen.findByText('529.982.247-25');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar CPF' }));
    expect(screen.queryByText('529.982.247-25')).not.toBeInTheDocument();
    expect(screen.getByText('***.***.***-25')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('CPF oculto.');
    expect(document.body.innerHTML).not.toContain(CPF);
  });

  it('o valor some ao sair da tela (desmontar) e ao ocultar a página', async () => {
    const { unmount } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Revelar CPF' }));
    await screen.findByText('529.982.247-25');
    window.dispatchEvent(new Event('pagehide'));
    await waitFor(() => expect(screen.queryByText('529.982.247-25')).not.toBeInTheDocument());
    unmount();
    expect(document.body.innerHTML).not.toContain(CPF);
  });

  it('nunca vai para localStorage, sessionStorage, URL nem histórico', async () => {
    localStorage.clear();
    sessionStorage.clear();
    setup();
    const before = window.location.href;
    fireEvent.click(screen.getByRole('button', { name: 'Revelar CPF' }));
    await screen.findByText('529.982.247-25');
    expect(JSON.stringify({ ...localStorage })).not.toContain(CPF);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(CPF);
    expect(window.location.href).toBe(before);
    expect(window.location.href).not.toContain(CPF);
  });

  it('remontar o componente (recarregar a tela ou trocar de organização) volta ao mascarado', async () => {
    const first = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Revelar CPF' }));
    await screen.findByText('529.982.247-25');
    first.unmount();
    setup();
    expect(screen.getByText('***.***.***-25')).toBeInTheDocument();
    expect(screen.queryByText('529.982.247-25')).not.toBeInTheDocument();
  });

  it.each([
    [{ kind: 'access_denied' } as const, /não tem permissão/],
    [{ kind: 'offline' } as const, /Sem conexão/],
    [{ kind: 'anonymized_record' } as const, /anonimizados/],
    [{ kind: 'unknown' } as const, /Não foi possível revelar/],
  ])('falha %j vira mensagem e o documento continua mascarado', async (outcome, texto) => {
    setup(outcome);
    fireEvent.click(screen.getByRole('button', { name: 'Revelar CPF' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(texto));
    expect(screen.getByText('***.***.***-25')).toBeInTheDocument();
  });
});

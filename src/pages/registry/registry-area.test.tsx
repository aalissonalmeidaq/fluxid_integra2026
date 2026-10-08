import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RegistryArea } from './registry-area';

describe('RegistryArea', () => {
  it('rota sem tela registrada mostra o estado "Página não encontrada", sem quebrar', () => {
    render(<RegistryArea route={{ area: 'customers', kind: 'not_found' }} />);
    expect(screen.getByText('Página não encontrada')).toBeInTheDocument();
  });

  it('as rotas de cadastro e edição abrem um modal; as demais, não', () => {
    // Os formulários e as telas de trás pedem o servidor; sem serviço eles mostram o estado de erro, o que basta para ver o modal.
    const { unmount } = render(<RegistryArea route={{ area: 'vehicles', kind: 'new' }} />);
    expect(screen.getByRole('dialog', { name: 'Cadastrar veículo' })).toBeInTheDocument();
    unmount();
    render(<RegistryArea route={{ area: 'customers', kind: 'not_found' }} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

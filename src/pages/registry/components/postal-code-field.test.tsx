import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PostalAddressView, PostalCodeService, PostalLookupOutcome } from '@/application/registry/postal-code-service';
import { PostalCodeField } from './postal-code-field';

const ADDRESS: PostalAddressView = { postalCode: '01001000', street: 'Praça da Sé', district: 'Sé', city: 'São Paulo', state: 'SP', ibgeCode: '3550308' };

function setup(outcome: PostalLookupOutcome, props: { online?: boolean; value?: string } = {}) {
  const lookup = vi.fn().mockResolvedValue(outcome);
  const service = { lookup } as unknown as PostalCodeService;
  const onAddress = vi.fn();
  const onFound = vi.fn();
  const onChange = vi.fn();
  render(<PostalCodeField value={props.value ?? '01001-000'} onChange={onChange} organizationId="org" service={service} online={props.online ?? true} onAddress={onAddress} onFound={onFound} />);
  return { lookup, onAddress, onFound, onChange };
}

describe('PostalCodeField (RF-008 a RF-012)', () => {
  it('"Buscar CEP" consulta só o CEP normalizado e entrega o endereço e o foco', async () => {
    const { lookup, onAddress, onFound } = setup({ kind: 'found', address: ADDRESS });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar CEP' }));
    await waitFor(() => expect(onAddress).toHaveBeenCalledWith(ADDRESS));
    expect(lookup).toHaveBeenCalledWith('org', '01001000');
    expect(onFound).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Endereço preenchido pelo CEP');
  });

  it('ao sair do campo com 8 dígitos busca uma vez só', async () => {
    const { lookup } = setup({ kind: 'found', address: ADDRESS });
    const campo = screen.getByLabelText('CEP');
    fireEvent.blur(campo);
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
    fireEvent.blur(campo);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('com CEP incompleto não busca e avisa junto do campo', () => {
    const { lookup } = setup({ kind: 'found', address: ADDRESS }, { value: '0100' });
    fireEvent.blur(screen.getByLabelText('CEP'));
    expect(lookup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Buscar CEP' }));
    expect(screen.getByRole('status')).toHaveTextContent('Informe um CEP com 8 dígitos');
  });

  it.each([
    [{ kind: 'not_found' } as const, /CEP não encontrado/],
    [{ kind: 'unavailable' } as const, /Não foi possível buscar/],
    [{ kind: 'denied' } as const, /não tem permissão/],
    [{ kind: 'rate_limited', retryAfterSeconds: 30 } as const, /Tente de novo em 30 segundos/],
  ])('resultado %j não preenche nada e leva à digitação do endereço', async (outcome, texto) => {
    const { onAddress, onFound } = setup(outcome);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar CEP' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(texto));
    expect(onAddress).not.toHaveBeenCalled();
    expect(onFound).not.toHaveBeenCalled();
    expect(screen.getByLabelText('CEP')).toBeEnabled();
  });

  it('sem conexão não chama o serviço e o botão fica desabilitado', () => {
    const { lookup } = setup({ kind: 'found', address: ADDRESS }, { online: false });
    expect(screen.getByRole('button', { name: 'Buscar CEP' })).toBeDisabled();
    fireEvent.blur(screen.getByLabelText('CEP'));
    expect(lookup).not.toHaveBeenCalled();
  });

  it('mostra o estado de busca em andamento e avisa quando termina', async () => {
    let resolver: (outcome: PostalLookupOutcome) => void = () => undefined;
    const lookup = vi.fn().mockReturnValue(new Promise<PostalLookupOutcome>((resolve) => { resolver = resolve; }));
    render(<PostalCodeField value="01001000" onChange={() => undefined} organizationId="org" service={{ lookup } as unknown as PostalCodeService} online onAddress={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar CEP' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Buscando o endereço');
    resolver({ kind: 'not_found' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('CEP não encontrado'));
  });

  it('digitar atualiza o valor do CEP', () => {
    const { onChange } = setup({ kind: 'not_found' }, { value: '' });
    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '01001' } });
    expect(onChange).toHaveBeenCalledWith('01001');
  });
});

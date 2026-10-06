import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IdentifierSymbol } from './identifier-symbol';

describe('símbolo do identificador (RF-044)', () => {
  it('começa fechado e, ao pedir, abre o diálogo com o QR Code, o texto alternativo e o valor', async () => {
    render(<IdentifierSymbol kind="qr_code" value="QR-1" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar código' }));
    const dialog = await screen.findByRole('dialog', { name: 'QR Code do identificador' });
    const image = await within(dialog).findByRole('img', { name: 'QR Code do valor QR-1' });
    expect(image.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(within(dialog).getByText('QR-1')).toBeInTheDocument();
  });

  it('gera o Data Matrix, fecha por "Fechar" e por Escape e devolve o foco ao botão', async () => {
    render(<IdentifierSymbol kind="data_matrix" value="DM-9" />);
    const button = screen.getByRole('button', { name: 'Mostrar código' });
    fireEvent.click(button);
    expect(await screen.findByRole('img', { name: 'Data Matrix do valor DM-9' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(button).toHaveFocus();
    fireEvent.click(button);
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('não oferece nada para NFC nem para o número do casco', () => {
    const { container } = render(<><IdentifierSymbol kind="nfc_tag" value="N" /><IdentifierSymbol kind="hull_number" value="H" /></>);
    expect(container).toBeEmptyDOMElement();
  });
});

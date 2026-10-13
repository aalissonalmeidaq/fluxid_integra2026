import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { applyReading, EMPTY_POSITION_DRAFT, type PositionDraft } from '@/domain/field/position-draft';
import type { PositionReading } from '@/domain/field/position-quality';
import type { GeolocationReader } from '@/infrastructure/field/geolocation-reader';
import { ReaderError, type ReaderErrorKind } from '@/infrastructure/field/reader-error';
import { PositionField, type PositionFieldProps } from './position-field';
import { usePositionReader } from './use-position-reader';

// RF-009 a RF-015, RN-003, RN-004, CA-003, CA-005: "Usar minha posição" lê o aparelho uma vez por toque; a origem registrada sempre bate com o
// dado; precisão ruim só avisa; permissão negada e falhas mantêm o formulário e as alternativas manuais; nada é guardado no aparelho.
const READING: PositionReading = { latitude: -23.55052, longitude: -46.633309, accuracyM: 12.4, readAt: Date.UTC(2026, 9, 13, 15, 29, 30) };

function fakeReader(over: { supported?: boolean; reading?: PositionReading; fail?: ReaderErrorKind } = {}): GeolocationReader & { read: ReturnType<typeof vi.fn> } {
  const { supported = true, reading = READING, fail } = over;
  return { isSupported: () => supported, read: vi.fn(async () => { if (fail) throw new ReaderError(fail); return reading; }) } as never;
}

function Harness({ reader, initial = EMPTY_POSITION_DRAFT, allowSiteAddress = true, onDraft }: { reader: GeolocationReader; initial?: PositionDraft; allowSiteAddress?: boolean; onDraft?: (draft: PositionDraft) => void }): React.JSX.Element {
  const [draft, setDraft] = useState(initial);
  const position = usePositionReader(reader);
  const props: PositionFieldProps = { draft, onChange: (next) => { setDraft(next); onDraft?.(next); }, position, allowSiteAddress };
  return <PositionField {...props} />;
}
const renderField = (over: Parameters<typeof Harness>[0]) => render(<Harness {...over} />);
const useButton = () => screen.getByRole('button', { name: /Usar minha posição|Tentar de novo/ });

describe('leitura da posição', () => {
  it('lê o aparelho uma vez por toque, preenche as coordenadas e mostra a precisão e a origem em texto', async () => {
    const reader = fakeReader();
    renderField({ reader });
    fireEvent.click(useButton());
    await waitFor(() => expect((screen.getByLabelText('Latitude') as HTMLInputElement).value).toBe('-23.550520'));
    expect((screen.getByLabelText('Longitude') as HTMLInputElement).value).toBe('-46.633309');
    expect(reader.read).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/precisão cerca de 12 m/)).toBeInTheDocument();
    expect(screen.getByText('Origem: GPS')).toBeInTheDocument();
  });

  it('precisão pior que 100 m avisa em texto e não bloqueia nada', async () => {
    renderField({ reader: fakeReader({ reading: { ...READING, accuracyM: 450 } }) });
    fireEvent.click(useButton());
    expect(await screen.findByText('Precisão baixa (cerca de 450 m). Você pode salvar mesmo assim.')).toBeInTheDocument();
    expect(screen.getByLabelText('Latitude')).not.toBeDisabled();
  });

  it('precisão boa não mostra o aviso', async () => {
    renderField({ reader: fakeReader() });
    fireEvent.click(useButton());
    await screen.findByText('Origem: GPS');
    expect(screen.queryByText(/Precisão baixa/)).toBeNull();
  });

  it('editar o número à mão depois da leitura passa a origem para "informada"', async () => {
    renderField({ reader: fakeReader() });
    fireEvent.click(useButton());
    await screen.findByText('Origem: GPS');
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-23.55' } });
    expect(screen.getByText('Origem: informada')).toBeInTheDocument();
    expect(screen.queryByText(/precisão cerca/)).toBeNull();
  });

  it('coordenadas digitadas valem como "informada" e a ausência de posição não tem origem', () => {
    renderField({ reader: fakeReader() });
    expect(screen.queryByText(/^Origem:/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-23.5' } });
    expect(screen.getByText('Origem: informada')).toBeInTheDocument();
  });
});

describe('confirmação antes de substituir coordenadas digitadas', () => {
  const typed: PositionDraft = { latitude: '-23.5', longitude: '-46.6', atSiteAddress: false, gps: null };

  it('pede confirmação e só lê depois que a pessoa aceita', async () => {
    const reader = fakeReader();
    renderField({ reader, initial: typed });
    fireEvent.click(useButton());
    expect(screen.getByText('Substituir as coordenadas digitadas pela posição lida pelo aparelho?')).toBeInTheDocument();
    expect(reader.read).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Substituir' }));
    await waitFor(() => expect((screen.getByLabelText('Latitude') as HTMLInputElement).value).toBe('-23.550520'));
    expect(screen.getByText('Origem: GPS')).toBeInTheDocument();
  });

  it('"Manter as digitadas" não lê nada e preserva o que a pessoa escreveu', () => {
    const reader = fakeReader();
    renderField({ reader, initial: typed });
    fireEvent.click(useButton());
    fireEvent.click(screen.getByRole('button', { name: 'Manter as digitadas' }));
    expect(reader.read).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Latitude') as HTMLInputElement).value).toBe('-23.5');
    expect(screen.queryByText(/Substituir as coordenadas/)).toBeNull();
  });

  it('uma nova leitura sobre a anterior do GPS não pergunta nada', async () => {
    const reader = fakeReader();
    renderField({ reader, initial: applyReading(EMPTY_POSITION_DRAFT, READING) });
    fireEvent.click(useButton());
    await waitFor(() => expect(reader.read).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Substituir as coordenadas/)).toBeNull();
  });
});

describe('quando a posição não vem', () => {
  it.each([
    ['denied', /A permissão de localização foi negada/],
    ['unavailable', /Não foi possível obter a posição agora/],
    ['timeout', /A leitura da posição demorou demais/],
  ] as const)('%s: explica o motivo, oferece "Tentar de novo" e mantém as alternativas manuais', async (kind, message) => {
    renderField({ reader: fakeReader({ fail: kind }) });
    fireEvent.click(useButton());
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    // As alternativas manuais seguem completas: digitar as coordenadas ou marcar o endereço da unidade.
    expect(screen.getByLabelText('Latitude')).not.toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Entrega no endereço da unidade' })).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-23.5' } });
    expect((screen.getByLabelText('Latitude') as HTMLInputElement).value).toBe('-23.5');
  });

  it('"Tentar de novo" lê outra vez', async () => {
    const reader = fakeReader({ fail: 'timeout' });
    renderField({ reader });
    fireEvent.click(useButton());
    await screen.findByText(/demorou demais/);
    reader.read.mockResolvedValueOnce(READING);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await screen.findByText('Origem: GPS');
    expect(screen.queryByText(/demorou demais/)).toBeNull();
  });

  it('sem suporte a localização, explica e mostra só o caminho manual', () => {
    renderField({ reader: fakeReader({ supported: false }) });
    expect(screen.getByText('Localização indisponível neste aparelho. Digite as coordenadas.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Usar minha posição' })).toBeNull();
    expect(screen.getByLabelText('Latitude')).toBeInTheDocument();
  });

  it('enquanto lê, mostra o andamento em texto e não trava os campos', async () => {
    const reader = fakeReader();
    let finish: (reading: PositionReading) => void = () => undefined;
    reader.read.mockImplementationOnce(() => new Promise<PositionReading>((resolve) => { finish = resolve; }));
    renderField({ reader });
    fireEvent.click(useButton());
    expect(await screen.findByText('Lendo a posição…')).toBeInTheDocument();
    expect(screen.getByLabelText('Latitude')).not.toBeDisabled();
    await act(async () => { finish(READING); await Promise.resolve(); });
    await screen.findByText('Origem: GPS');
  });
});

describe('"no endereço da unidade" (só na entrega)', () => {
  it('marcar limpa as coordenadas e a leitura do GPS e a origem passa a ser o endereço da unidade', async () => {
    renderField({ reader: fakeReader() });
    fireEvent.click(useButton());
    await screen.findByText('Origem: GPS');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Entrega no endereço da unidade' }));
    expect((screen.getByLabelText('Latitude') as HTMLInputElement).value).toBe('');
    expect(screen.getByLabelText('Latitude')).toBeDisabled();
    expect(screen.getByText('Origem: endereço da unidade')).toBeInTheDocument();
  });

  it('digitar uma coordenada desmarca o endereço da unidade', () => {
    renderField({ reader: fakeReader(), initial: { latitude: '', longitude: '', atSiteAddress: false, gps: null } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Entrega no endereço da unidade' }));
    expect(screen.getByLabelText('Latitude')).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Entrega no endereço da unidade' }));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-23.5' } });
    expect(screen.getByRole('checkbox', { name: 'Entrega no endereço da unidade' })).not.toBeChecked();
  });

  it('na chegada (allowSiteAddress desligado) a opção não existe', () => {
    renderField({ reader: fakeReader(), allowSiteAddress: false });
    expect(screen.queryByRole('checkbox', { name: 'Entrega no endereço da unidade' })).toBeNull();
  });
});

describe('erros e privacidade', () => {
  it('mostra o erro de cada campo em texto', () => {
    const position = { supported: true, status: 'idle' as const, read: vi.fn(), refreshIfStale: vi.fn(), clearStatus: vi.fn() };
    render(<PositionField draft={EMPTY_POSITION_DRAFT} onChange={() => undefined} position={position} allowSiteAddress errors={{ latitude: 'A latitude vai de −90 a 90.', position: 'Leia de novo.' }} />);
    expect(screen.getByText('A latitude vai de −90 a 90.')).toBeInTheDocument();
    expect(screen.getByText('Leia de novo.')).toBeInTheDocument();
  });

  it('não guarda nada no aparelho', async () => {
    const set = vi.fn();
    vi.stubGlobal('localStorage', { setItem: set });
    vi.stubGlobal('sessionStorage', { setItem: set });
    renderField({ reader: fakeReader() });
    fireEvent.click(useButton());
    await screen.findByText('Origem: GPS');
    expect(set).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('usePositionReader.refreshIfStale', () => {
  it('leitura recente do GPS segue como está, sem ler de novo', async () => {
    const reader = fakeReader();
    const { result } = renderHook(() => usePositionReader(reader));
    const draft = applyReading(EMPTY_POSITION_DRAFT, { ...READING, readAt: Date.now() - 30_000 });
    expect(await result.current.refreshIfStale(draft)).toBe(draft);
    expect(reader.read).not.toHaveBeenCalled();
  });

  it('leitura com mais de 2 minutos é descartada e lida de novo', async () => {
    const reader = fakeReader();
    const { result } = renderHook(() => usePositionReader(reader));
    const draft = applyReading(EMPTY_POSITION_DRAFT, { ...READING, readAt: Date.now() - 121_000 });
    const fresh = await result.current.refreshIfStale(draft);
    expect(reader.read).toHaveBeenCalledTimes(1);
    expect(fresh?.gps?.readAt).toBe(READING.readAt);
  });

  it('se a nova leitura falha, devolve nulo e diz o motivo', async () => {
    const reader = fakeReader({ fail: 'denied' });
    const { result } = renderHook(() => usePositionReader(reader));
    const draft = applyReading(EMPTY_POSITION_DRAFT, { ...READING, readAt: Date.now() - 121_000 });
    let fresh: PositionDraft | null = draft;
    await act(async () => { fresh = await result.current.refreshIfStale(draft); });
    expect(fresh).toBeNull();
    await waitFor(() => expect(result.current.status).toBe('denied'));
  });

  it('coordenadas digitadas nunca ficam velhas', async () => {
    const reader = fakeReader();
    const { result } = renderHook(() => usePositionReader(reader));
    const typed: PositionDraft = { latitude: '-23.5', longitude: '-46.6', atSiteAddress: false, gps: null };
    expect(await result.current.refreshIfStale(typed)).toBe(typed);
    expect(reader.read).not.toHaveBeenCalled();
  });
});

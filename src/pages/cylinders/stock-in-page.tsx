import React, { useEffect, useRef, useState } from 'react';
import type { CylinderOutcome, CylinderService } from '@/application/cylinders/cylinder-service';
import type { StockInResult } from '@/application/cylinders/cylinder-views';
import { OperationKey } from '@/application/cylinders/operation-key';
import { usePermissions } from '@/app/navigation/permissions-context';
import { normalizeIdentifier } from '@/domain/cylinders/identifier';
import { Alert, Button, Card, ErrorState, TextField } from '@/design-system';
import { AccessGate } from './components/access-gate';
import { CameraScanButton } from './components/camera-scan-button';
import { useCylinderService } from './use-cylinder-service';

type Feedback =
  | { kind: 'stocked'; result: StockInResult }
  | { kind: 'error'; title?: string; message: string; registerLink?: boolean }
  | { kind: 'unknown' }
  | { kind: 'info'; message: string };

export interface StockInViewProps {
  organizationId: string;
  service: CylinderService | null;
  online: boolean;
  // Oferece "Cadastrar cilindro" quando o identificador não existe, só a quem tem `cylinder.write`.
  canCreate: boolean;
}

const time = (date: Date): string => date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function StockInView({ organizationId, service, online, canCreate }: StockInViewProps): React.JSX.Element {
  const [value, setValue] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastReading, setLastReading] = useState<{ value: string; at: Date } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // A chave só muda depois de uma resposta definitiva; um resultado desconhecido reaproveita a mesma chave (RF-014).
  const key = useRef(new OperationKey());
  const pendingValue = useRef<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const finish = (reading: string): void => {
    key.current.settle();
    pendingValue.current = null;
    setValue('');
    setFieldError(undefined);
    setLastReading({ value: reading, at: new Date() });
    inputRef.current?.focus();
  };

  const handle = (outcome: CylinderOutcome<StockInResult>, reading: string): void => {
    if (outcome.kind === 'success') {
      setFeedback({ kind: 'stocked', result: outcome.value });
      return finish(reading);
    }
    switch (outcome.kind) {
      case 'unknown':
        // Mantém o valor e a chave: repetir não duplica.
        pendingValue.current = reading;
        return setFeedback({ kind: 'unknown' });
      case 'offline':
        pendingValue.current = reading;
        return setFeedback({ kind: 'info', message: 'Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.' });
      case 'already_in_stock':
        setFeedback({ kind: 'error', message: 'Este cilindro já está em estoque. Nada foi alterado.' });
        return finish(reading);
      case 'cylinder_inactive':
        setFeedback({ kind: 'error', message: 'Este cilindro está inativo e não pode entrar no estoque.' });
        return finish(reading);
      case 'not_found':
        if (outcome.deactivatedOwner) {
          setFeedback({ kind: 'error', title: 'Identificador desativado', message: `Este identificador foi desativado e pertencia ao cilindro ${outcome.deactivatedOwner.serialNumber}. Ele não identifica nenhum cilindro ativo.` });
        } else {
          setFeedback({ kind: 'error', title: 'Cilindro não encontrado', message: 'Nenhum cilindro desta organização usa este identificador.', registerLink: true });
        }
        return finish(reading);
      case 'idempotency_conflict':
        setFeedback({ kind: 'error', message: 'Esta leitura não pôde ser concluída. Leia o identificador de novo.' });
        return finish(reading);
      case 'access_denied':
      case 'mfa_required':
        return setFeedback({ kind: 'error', message: 'Você não tem permissão para registrar entradas no estoque.' });
      case 'invalid':
        return setFieldError('Informe o valor do identificador.');
      default:
        return setFeedback({ kind: 'error', message: 'Não foi possível registrar a entrada agora. Tente de novo.' });
    }
  };

  const submit = async (event?: React.FormEvent<HTMLFormElement>, scanned?: string): Promise<void> => {
    event?.preventDefault();
    if (!service || !online || inFlight.current) return;
    const reading = normalizeIdentifier(scanned ?? value);
    if (reading === '') {
      setFieldError('Informe o valor do identificador.');
      inputRef.current?.focus();
      return;
    }
    // Outro identificador depois de um resultado desconhecido não pode reaproveitar a chave anterior.
    if (pendingValue.current !== null && pendingValue.current !== reading) key.current.settle();
    inFlight.current = true;
    setBusy(true);
    setFieldError(undefined);
    setFeedback(null);
    const outcome = await service.stockIn(organizationId, reading, key.current.current());
    inFlight.current = false;
    setBusy(false);
    handle(outcome, reading);
  };

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;

  return (
    <section aria-labelledby="stock-in-title" className="flex flex-col gap-6">
      <div>
        <p className="text-legenda font-semibold uppercase text-azul-profundo">Estoque</p>
        <h2 id="stock-in-title" className="mt-1 text-h2 font-bold text-navy">Entrada no estoque</h2>
        <p className="mt-1 text-corpo">Digite, cole ou leia o identificador do cilindro. Um leitor que age como teclado envia com Enter e a tela fica pronta para a próxima leitura.</p>
      </div>

      {!online && <Alert variant="informacao">Sem conexão. Registrar a entrada exige conexão e nada é guardado neste aparelho.</Alert>}

      <Card>
        <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
          <TextField
            ref={inputRef}
            label="Identificador"
            name="identifier"
            value={value}
            onChange={(event) => { setValue(event.target.value); if (fieldError) setFieldError(undefined); }}
            maxLength={200}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            help="QR Code, Data Matrix, etiqueta NFC ou número do casco."
            error={fieldError}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!online} loading={busy} loadingLabel="Registrando…">Registrar entrada</Button>
            {online && <CameraScanButton onRead={(scanned) => { setValue(scanned); void submit(undefined, scanned); }} />}
          </div>
        </form>
      </Card>

      {feedback?.kind === 'stocked' && (
        <Alert variant={feedback.result.warning ? 'alerta' : feedback.result.replayed ? 'informacao' : 'sucesso'} title={feedback.result.replayed ? 'Leitura repetida' : 'Entrada registrada'}>
          <p>
            {feedback.result.replayed
              ? `Esta leitura já tinha sido registrada: nada foi duplicado. Cilindro ${feedback.result.cylinder.serialNumber} está em estoque.`
              : `Cilindro ${feedback.result.cylinder.serialNumber} está em estoque.`}
          </p>
          {feedback.result.warning === 'hydro_expired' && <p className="font-semibold">Atenção: o teste hidrostático deste cilindro está vencido. A entrada foi registrada mesmo assim.</p>}
          {feedback.result.warning === 'hydro_rejected' && <p className="font-semibold">Atenção: o teste hidrostático deste cilindro está reprovado. A entrada foi registrada mesmo assim.</p>}
        </Alert>
      )}
      {feedback?.kind === 'error' && (
        <Alert variant="erro" {...(feedback.title ? { title: feedback.title } : {})}>
          <p>{feedback.message}</p>
          {feedback.registerLink && canCreate && <a className="font-semibold underline" href="/cilindros/novo">Cadastrar cilindro</a>}
        </Alert>
      )}
      {feedback?.kind === 'unknown' && (
        <Alert variant="erro" title="Resultado desconhecido">
          <p>Não foi possível confirmar se a entrada foi registrada. Repita com o mesmo identificador: se ela já tinha sido registrada, nada será duplicado.</p>
          <Button variant="secundario" className="mt-2" onClick={() => void submit()}>Tentar de novo</Button>
        </Alert>
      )}
      {feedback?.kind === 'info' && <Alert variant="informacao">{feedback.message}</Alert>}

      {lastReading && <p className="text-corpo text-texto-secundario">Última leitura: {lastReading.value} às {time(lastReading.at)}.</p>}
    </section>
  );
}

export function StockInPage(): React.JSX.Element {
  const { service, organizationId, online } = useCylinderService();
  const { permissions } = usePermissions();
  return (
    <AccessGate permission="cylinder.stock_in">
      <StockInView key={organizationId} organizationId={organizationId} service={service} online={online} canCreate={permissions?.tenant.includes('cylinder.write') ?? false} />
    </AccessGate>
  );
}

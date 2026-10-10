import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TripService } from '@/application/trips/trip-service';
import type { CylinderOutcome, CylinderService } from '@/application/cylinders/cylinder-service';
import type { CylinderDetail, IdentifierView, TestView } from '@/application/cylinders/cylinder-views';
import { usePermissions } from '@/app/navigation/permissions-context';
import {
  IDENTIFIER_KINDS, IDENTIFIER_KIND_LABELS, INACTIVATION_REASONS, INACTIVATION_REASON_LABELS, type InactivationReason,
} from '@/domain/cylinders/cylinder-types';
import { validateIdentifierForm } from '@/domain/cylinders/cylinder-validation';
import { formatDate } from '@/domain/cylinders/format';
import { Alert, Button, Card, ErrorState, Loading, Select, TextField } from '@/design-system';
import { TripsOfBlock } from '@/pages/trips/components/trips-of-block';
import { useTripService } from '@/pages/trips/use-trip-service';
import { AccessGate } from './components/access-gate';
import { HistoryList } from './components/history-list';
import { CameraScanButton } from './components/camera-scan-button';
import { HydrostaticTestForm } from './components/hydrostatic-test-form';
import { HydrostaticTests } from './components/hydrostatic-tests';
import { IdentifierList } from './components/identifier-list';
import { ReasonDialog } from './components/reason-dialog';
import { CustodyInfo } from './components/custody-info';
import { IdentifierWarning, StatusBadges } from './components/status-badges';
import { typeLabel } from './type-label';
import { useCylinderService } from './use-cylinder-service';

// O que a pessoa pode fazer neste cilindro. A tela só oferece a ação; a decisão final é sempre do servidor (RF-039).
// `trips` (trip.read) mostra o bloco "Viagens" do cilindro (Spec 008, RF-027).
export interface DetailAbilities { write: boolean; deactivate: boolean; identifier: boolean; test: boolean; history: boolean; trips?: boolean }

export interface CylinderDetailViewProps {
  organizationId: string;
  service: CylinderService | null;
  online: boolean;
  cylinderId: string;
  can: DetailAbilities;
  // Serviço das viagens, para o bloco "Viagens"; sem ele o bloco não aparece.
  tripService?: TripService | null;
}

type Load = 'loading' | 'ready' | 'not_found' | 'error';
type Dialog =
  | { kind: 'inactivate'; trigger: HTMLElement }
  | { kind: 'reactivate'; trigger: HTMLElement }
  | { kind: 'deactivate_identifier'; identifier: IdentifierView; trigger: HTMLElement }
  | { kind: 'transfer'; trigger: HTMLElement };

const NO_PERMISSION = 'Você não tem permissão para esta ação.';
const OFFLINE = 'Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.';
const UNKNOWN = 'Não foi possível confirmar se a ação foi concluída. Recarregue a tela antes de tentar de novo.';

function failureMessage(outcome: Exclude<CylinderOutcome<unknown>, { kind: 'success' }>): string {
  switch (outcome.kind) {
    case 'access_denied':
    case 'mfa_required': return NO_PERMISSION;
    case 'offline': return OFFLINE;
    case 'justification_required': return 'Explique o motivo com pelo menos 5 caracteres.';
    case 'already_inactive': return 'Este cilindro já estava inativo. Recarregue a tela.';
    case 'cylinder_inactive': return 'Este cilindro está inativo.';
    case 'identifier_conflict': return 'Este valor está ativo em outro cilindro. Desative-o lá antes de reaproveitá-lo.';
    case 'identifier_unavailable': return 'Este valor já foi usado e desativado. Use "Reutilizar identificador desativado".';
    case 'not_found': return 'Registro não encontrado nesta organização.';
    case 'invalid': return Object.values(outcome.fields ?? {})[0] ?? 'Revise os dados informados.';
    default: return UNKNOWN;
  }
}

function Block({ id, title, children }: { id: string; title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h3 id={id} className="text-h3 font-semibold text-navy">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <dt className="text-legenda text-texto-secundario">{label}</dt>
      <dd className="break-words text-corpo text-grafite">{children}</dd>
    </div>
  );
}

export function CylinderDetailView({ organizationId, service, online, cylinderId, can, tripService = null }: CylinderDetailViewProps): React.JSX.Element {
  const [detail, setDetail] = useState<CylinderDetail | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [testForm, setTestForm] = useState<{ mode: 'register' } | { mode: 'rectify'; test: TestView } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addValues, setAddValues] = useState({ kind: '', value: '' });
  const [addError, setAddError] = useState<{ kind?: string; value?: string; banner?: string }>({});
  const [adding, setAdding] = useState(false);
  const [extraError, setExtraError] = useState<string | undefined>();
  const [historyVersion, setHistoryVersion] = useState(0);
  const addFormRef = useRef<HTMLFormElement>(null);

  const apply = useCallback((outcome: Awaited<ReturnType<CylinderService['get']>>): void => {
    if (outcome.kind === 'success') { setDetail(outcome.value); setLoad('ready'); }
    else setLoad(outcome.kind === 'not_found' ? 'not_found' : 'error');
  }, []);

  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void service.get(organizationId, cylinderId).then((outcome) => { if (active) apply(outcome); });
    return () => { active = false; };
  }, [service, organizationId, cylinderId, apply]);

  useEffect(() => {
    if (addError.kind || addError.value) addFormRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [addError]);

  const retry = async (): Promise<void> => {
    if (!service) return;
    setLoad('loading');
    apply(await service.get(organizationId, cylinderId));
  };

  // Recarrega o detalhe sem trocar a tela por "carregando": o resultado de uma ação aparece no lugar, anunciado uma vez.
  const refresh = async (message: string): Promise<void> => {
    if (!service) return;
    setTestForm(null);
    setDialog(null);
    setDialogError(null);
    setExtraError(undefined);
    setNotice(message);
    setHistoryVersion((version) => version + 1);
    apply(await service.get(organizationId, cylinderId));
  };

  const runDialog = async (action: () => Promise<CylinderOutcome<unknown>>, success: string): Promise<void> => {
    setDialogBusy(true);
    setDialogError(null);
    const outcome = await action();
    setDialogBusy(false);
    if (outcome.kind === 'success') return refresh(success);
    if (outcome.kind === 'already_inactive') { setDialogError(failureMessage(outcome)); return; }
    setDialogError(failureMessage(outcome));
  };

  const addIdentifier = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!service || adding || !online) return;
    setNotice(null);
    const parsed = validateIdentifierForm(addValues);
    if (!parsed.ok) return setAddError({ ...(parsed.errors.kind ? { kind: parsed.errors.kind } : {}), ...(parsed.errors.value ? { value: parsed.errors.value } : {}) });
    setAddError({});
    setAdding(true);
    const outcome = await service.addIdentifier(organizationId, { cylinderId, ...parsed.value });
    setAdding(false);
    if (outcome.kind === 'success') {
      setAddOpen(false);
      setAddValues({ kind: '', value: '' });
      return refresh('Identificador acrescentado.');
    }
    if (outcome.kind === 'identifier_conflict') return setAddError({ value: 'Este identificador já está vinculado a outro cilindro.' });
    if (outcome.kind === 'identifier_unavailable') return setAddError({ value: 'Este identificador foi usado e desativado. Use "Reutilizar identificador desativado".' });
    if (outcome.kind === 'invalid') return setAddError({ value: failureMessage(outcome) });
    setAddError({ banner: failureMessage(outcome) });
  };

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  if (load === 'not_found') return <ErrorState variant="sem-permissao" title="Cilindro não encontrado" message="Ele não existe nesta organização." />;
  if (load === 'error') return <ErrorState title="Não foi possível carregar o cilindro" message="Tente novamente em instantes." onRetry={() => void retry()} />;
  if (load === 'loading' || !detail) return <Loading variant="pagina" busy label="Carregando o cilindro…" />;

  const { cylinder } = detail;
  const activeIdentifiers = detail.identifiers.filter((identifier) => identifier.status === 'active').length;
  const inactive = cylinder.status === 'inactive';

  return (
    <article aria-labelledby="cyl-detail-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-start tablet:justify-between">
        <div className="flex min-w-0 flex-col gap-4">
          <p className="text-legenda font-semibold uppercase text-azul-profundo"><a className="underline" href="/cilindros">Cilindros</a></p>
          <h2 id="cyl-detail-title" className="break-words text-h2 font-bold text-navy">Cilindro {cylinder.serialNumber}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadges status={cylinder.status} stockStatus={cylinder.stockStatus} hydroStatus={detail.hydroStatus} />
            <IdentifierWarning activeCount={activeIdentifiers} />
            <CustodyInfo status={cylinder.custodyStatus} site={cylinder.custodySite} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can.write && !inactive && (
            <a className="inline-flex min-h-alvo items-center justify-center rounded-controle border border-azul-profundo bg-branco px-4 text-corpo font-semibold text-azul-profundo hover:bg-info-fundo" href={`/cilindros/${cylinder.id}/editar`}>
              Editar
            </a>
          )}
          {can.deactivate && !inactive && (
            <Button variant="secundario" onClick={(event) => { setNotice(null); setDialogError(null); setDialog({ kind: 'inactivate', trigger: event.currentTarget }); }}>Inativar cilindro</Button>
          )}
          {can.deactivate && inactive && (
            <Button variant="secundario" onClick={(event) => { setNotice(null); setDialogError(null); setDialog({ kind: 'reactivate', trigger: event.currentTarget }); }}>Reativar cilindro</Button>
          )}
        </div>
      </div>

      {notice && <Alert variant="sucesso">{notice}</Alert>}

      <Card>
        <div className="flex flex-col gap-8">
          <Block id="cyl-data-title" title="Dados do cilindro">
            {inactive && (
              <p className="text-corpo font-semibold text-grafite">
                Este cilindro está inativo. Motivo: {cylinder.inactivationReason ? INACTIVATION_REASON_LABELS[cylinder.inactivationReason] : '—'}.
              </p>
            )}
            <dl className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
              <Fact label="Número de série">{cylinder.serialNumber}</Fact>
              <Fact label="Tipo">{typeLabel(cylinder.type)}</Fact>
              <Fact label="Fabricante">{cylinder.manufacturer ?? '—'}</Fact>
              <Fact label="Ano de fabricação">{cylinder.manufactureYear ?? '—'}</Fact>
              <Fact label="Pressão de trabalho">{cylinder.workingPressureBar === null ? '—' : `${cylinder.workingPressureBar} bar`}</Fact>
              <Fact label="Observações">{cylinder.notes ?? '—'}</Fact>
            </dl>
          </Block>

          <Block id="cyl-ids-title" title="Identificadores">
            <IdentifierWarning activeCount={activeIdentifiers} />
            {can.identifier && !inactive && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secundario" aria-expanded={addOpen} onClick={() => { setNotice(null); setAddOpen((open) => !open); }}>Acrescentar identificador</Button>
                <Button variant="secundario" onClick={(event) => { setNotice(null); setDialogError(null); setExtraError(undefined); setDialog({ kind: 'transfer', trigger: event.currentTarget }); }}>Reutilizar identificador desativado</Button>
              </div>
            )}
            {addOpen && can.identifier && !inactive && (
              <form ref={addFormRef} noValidate onSubmit={(event) => void addIdentifier(event)} className="flex flex-col gap-4 rounded-card border border-borda-suave p-4">
                <h4 className="text-h3 font-semibold text-navy">Acrescentar identificador</h4>
                {!online && <Alert variant="informacao">{OFFLINE}</Alert>}
                {addError.banner && <Alert variant="erro">{addError.banner}</Alert>}
                <div className="grid gap-4 tablet:grid-cols-2">
                  <Select label="Tipo do identificador" name="kind" value={addValues.kind} onChange={(event) => setAddValues((current) => ({ ...current, kind: event.target.value }))} error={addError.kind}>
                    <option value="" disabled>Selecione o tipo</option>
                    {IDENTIFIER_KINDS.map((kind) => <option key={kind} value={kind}>{IDENTIFIER_KIND_LABELS[kind]}</option>)}
                  </Select>
                  <TextField label="Valor do identificador" name="value" value={addValues.value} onChange={(event) => setAddValues((current) => ({ ...current, value: event.target.value }))} maxLength={200} autoComplete="off" error={addError.value} />
                </div>
                <CameraScanButton onRead={(scanned) => setAddValues((current) => ({ ...current, value: scanned }))} />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={!online} loading={adding} loadingLabel="Salvando…">Salvar identificador</Button>
                  <Button variant="secundario" onClick={() => setAddOpen(false)}>Cancelar</Button>
                </div>
              </form>
            )}
            <IdentifierList
              identifiers={detail.identifiers}
              {...(can.identifier ? {
                renderActions: (identifier: IdentifierView) => (identifier.status === 'active' ? (
                  <Button variant="secundario" className="self-start" aria-label={`Desativar identificador ${identifier.value}`}
                    onClick={(event) => { setNotice(null); setDialogError(null); setDialog({ kind: 'deactivate_identifier', identifier, trigger: event.currentTarget }); }}>
                    Desativar
                  </Button>
                ) : null),
              } : {})}
            />
          </Block>

          <Block id="cyl-tests-title" title="Testes hidrostáticos">
            {can.test && !inactive && !testForm && (
              <Button variant="secundario" className="self-start" onClick={() => { setNotice(null); setTestForm({ mode: 'register' }); }}>Registrar teste</Button>
            )}
            {testForm && (
              <HydrostaticTestForm
                key={testForm.mode === 'rectify' ? testForm.test.id : 'novo'}
                mode={testForm.mode}
                {...(testForm.mode === 'rectify' ? { initial: testForm.test } : {})}
                online={online}
                onSubmit={(value, justification) => (testForm.mode === 'rectify'
                  ? service.rectifyTest(organizationId, { ...value, testId: testForm.test.id, justification })
                  : service.registerTest(organizationId, { ...value, cylinderId }))}
                onDone={() => void refresh(testForm.mode === 'rectify' ? 'Retificação registrada. O registro original continua no histórico.' : 'Teste hidrostático registrado.')}
                onCancel={() => setTestForm(null)}
              />
            )}
            <HydrostaticTests
              tests={detail.tests}
              {...(can.test && !inactive ? {
                renderActions: (test: TestView) => (test.superseded ? null : (
                  <Button variant="secundario" className="self-start" aria-label={`Retificar teste de ${formatDate(test.performedOn)}`} onClick={() => { setNotice(null); setTestForm({ mode: 'rectify', test }); }}>Retificar</Button>
                )),
              } : {})}
            />
          </Block>

          {can.trips && tripService && (
            <Block id="cyl-trips-title" title="Viagens">
              <TripsOfBlock organizationId={organizationId} service={tripService} subject={{ kind: 'cylinder', id: cylinderId }} />
            </Block>
          )}

          {can.history && (
            <Block id="cyl-history-title" title="Histórico">
              <HistoryList key={historyVersion} organizationId={organizationId} cylinderId={cylinderId} service={service} />
            </Block>
          )}
        </div>
      </Card>

      {dialog?.kind === 'inactivate' && (
        <ReasonDialog
          title="Inativar cilindro"
          confirmLabel="Confirmar inativação"
          description="O cilindro sai do estoque e das buscas de padrão ativo. Nada é excluído: o histórico e os identificadores continuam."
          busy={dialogBusy}
          error={dialogError}
          returnFocusTo={dialog.trigger}
          onCancel={() => setDialog(null)}
          onConfirm={(justification, form) => void runDialog(
            () => service.inactivate(organizationId, { cylinderId, reason: String(form.get('reason')) as InactivationReason, justification }),
            'Cilindro inativado. Ele saiu do estoque e o histórico foi preservado.',
          )}
        >
          <Select label="Motivo da inativação" name="reason" defaultValue="written_off">
            {INACTIVATION_REASONS.map((reason) => <option key={reason} value={reason}>{INACTIVATION_REASON_LABELS[reason]}</option>)}
          </Select>
        </ReasonDialog>
      )}
      {dialog?.kind === 'reactivate' && (
        <ReasonDialog
          title="Reativar cilindro"
          confirmLabel="Confirmar reativação"
          description="O cilindro volta ativo e fora do estoque: uma nova entrada precisa ser registrada."
          busy={dialogBusy}
          error={dialogError}
          returnFocusTo={dialog.trigger}
          onCancel={() => setDialog(null)}
          onConfirm={(justification) => void runDialog(() => service.reactivate(organizationId, { cylinderId, justification }), 'Cilindro reativado. Registre uma nova entrada no estoque.')}
        />
      )}
      {dialog?.kind === 'deactivate_identifier' && (
        <ReasonDialog
          title={`Desativar identificador ${dialog.identifier.value}`}
          confirmLabel="Confirmar desativação"
          description="O identificador deixa de identificar o cilindro, mas continua listado e no histórico. Reutilizá-lo exige uma transferência."
          busy={dialogBusy}
          error={dialogError}
          returnFocusTo={dialog.trigger}
          onCancel={() => setDialog(null)}
          onConfirm={(justification) => void runDialog(
            () => service.deactivateIdentifier(organizationId, { identifierId: dialog.identifier.id, justification }),
            'Identificador desativado. Ele continua no histórico do cilindro.',
          )}
        />
      )}
      {dialog?.kind === 'transfer' && (
        <ReasonDialog
          title="Reutilizar identificador desativado"
          confirmLabel="Confirmar transferência"
          description="Transfere um identificador desativado para este cilindro. A operação é atômica e fica no histórico dos dois cilindros e na auditoria."
          busy={dialogBusy}
          error={dialogError}
          returnFocusTo={dialog.trigger}
          onCancel={() => setDialog(null)}
          onConfirm={(justification, form) => {
            const value = String(form.get('value') ?? '').trim();
            if (value === '') return setExtraError('Informe o valor do identificador desativado.');
            if (form.get('confirmed') !== 'on') return setExtraError('Confirme a transferência para continuar.');
            setExtraError(undefined);
            void runDialog(
              () => service.transferIdentifier(organizationId, { value, targetCylinderId: cylinderId, justification }),
              'Identificador transferido para este cilindro.',
            );
          }}
        >
          <TextField label="Valor do identificador desativado" name="value" autoComplete="off" maxLength={200} error={extraError?.startsWith('Informe') ? extraError : undefined} />
          <label className="flex min-h-alvo items-center gap-2 text-corpo">
            <input type="checkbox" name="confirmed" className="size-6" />
            <span>Confirmo a transferência deste identificador para este cilindro.</span>
          </label>
          {extraError?.startsWith('Confirme') && <p className="text-legenda font-medium text-erro">{extraError}</p>}
        </ReasonDialog>
      )}
    </article>
  );
}

export function CylinderDetailPage({ cylinderId }: { cylinderId: string }): React.JSX.Element {
  const { service, organizationId, online } = useCylinderService();
  const { service: tripService } = useTripService();
  const { permissions } = usePermissions();
  const has = (code: string): boolean => permissions?.tenant.includes(code) ?? false;
  return (
    <AccessGate permission="cylinder.read">
      <CylinderDetailView
        key={`${organizationId}:${cylinderId}`}
        organizationId={organizationId}
        service={service}
        online={online}
        cylinderId={cylinderId}
        tripService={tripService}
        can={{ write: has('cylinder.write'), deactivate: has('cylinder.deactivate'), identifier: has('cylinder.identifier'), test: has('cylinder.test'), history: has('cylinder.history'), trips: has('trip.read') }}
      />
    </AccessGate>
  );
}

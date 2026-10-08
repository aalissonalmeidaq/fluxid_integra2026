import { fail, ok, type Json, type OperationContext, type RegistryMock, type Reply } from './mock-registry';

// Anonimização do backend simulado (Spec 007, US8): irreversível, sem apagar linha alguma, só em registro inativo (exceto o contato),
// com motivo, justificativa e confirmação. O segundo fator é conferido por `RegistryMock.handle` (operações com `mfa: true`).
// As regras de banco de verdade (campos substituídos, gatilhos, vazamento) são provadas no pgTAP e na suíte `.live`.

const REASONS = ['data_subject_request', 'retention_expired', 'other'];
const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim().length >= 5 ? value.trim() : null);

function precheck(body: Json): Reply | null {
  if (body.confirmed !== true) return fail('CONFIRMATION_REQUIRED', 400);
  if (typeof body.reason !== 'string' || !REASONS.includes(body.reason)) return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'reason', message: 'Motivo desconhecido.' }] });
  if (asText(body.justification) === null) return fail('JUSTIFICATION_REQUIRED', 400);
  return null;
}

function anonymizeDriver({ org, body, mock }: OperationContext): Reply {
  const refused = precheck(body);
  if (refused) return refused;
  const driver = mock.drivers.find((candidate) => candidate.id === body.driver_id && candidate.organization_id === org);
  if (!driver) return fail('NOT_FOUND', 404);
  if (driver.anonymized_at) return fail('ALREADY_ANONYMIZED', 409);
  if (driver.version !== body.expected_version) return fail('VERSION_CONFLICT', 409);
  if (driver.status !== 'inactive') return fail('ACTIVE_RECORD', 409);
  const when = mock.now().toISOString();
  const wasLinked = driver.linked_user_id !== null;
  Object.assign(driver, { full_name: 'Motorista anonimizado', phone: null, linked_user_id: null, cpf_display: 'anonimizado', cnh_display: 'anonimizado', anonymized_at: when, version: (driver.version as number) + 1 });
  mock.driverDocuments.set(String(driver.id), { cpf: null, cnh: null });
  if (wasLinked) mock.appendEvent('driver', driver.id as string, org, 'driver_user_unlinked', asText(body.justification), { by_anonymization: true });
  mock.appendEvent('driver', driver.id as string, org, 'person_anonymized', asText(body.justification), { fields: ['full_name', 'cpf', 'cnh_number', 'phone'], reason: body.reason });
  return ok('ANONYMIZED', { anonymized_at: when, version: driver.version });
}

function anonymizeCustomer({ org, body, mock }: OperationContext): Reply {
  const refused = precheck(body);
  if (refused) return refused;
  const customer = mock.customers.find((candidate) => candidate.id === body.customer_id && candidate.organization_id === org);
  if (!customer) return fail('NOT_FOUND', 404);
  if (customer.anonymized_at) return fail('ALREADY_ANONYMIZED', 409);
  if (customer.person_type !== 'individual') return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'customer_id', message: 'Só cliente pessoa física.' }] });
  if (customer.version !== body.expected_version) return fail('VERSION_CONFLICT', 409);
  if (customer.status !== 'inactive') return fail('ACTIVE_RECORD', 409);
  const when = mock.now().toISOString();
  const contacts = mock.contacts.filter((contact) => contact.customer_id === customer.id && !contact.anonymized_at);
  for (const contact of contacts) Object.assign(contact, { name: 'Contato anonimizado', role: null, phone: null, email: null, is_primary: false, anonymized_at: when });
  const sites = mock.sites.filter((site) => site.customer_id === customer.id);
  for (const site of sites) {
    Object.assign(site, {
      name: `Unidade anonimizada ${String(site.id).slice(0, 8)}`, number: 'S/N', complement: null, receiving_contact_name: null, receiving_contact_phone: null, receiving_days: [],
      receiving_from: null, receiving_to: null, access_instructions: null, latitude: null, longitude: null, anonymized_at: when,
    });
  }
  Object.assign(customer, { legal_name: 'Cliente anonimizado', trade_name: null, notes: null, document_display: 'anonimizado', document_key: null, anonymized_at: when, version: (customer.version as number) + 1 });
  mock.appendEvent('customer', customer.id as string, org, 'person_anonymized', asText(body.justification), { fields: ['legal_name', 'trade_name', 'notes', 'document', 'contacts', 'sites'], reason: body.reason });
  return ok('ANONYMIZED', { anonymized_at: when, version: customer.version, affected: { contacts: contacts.length, sites: sites.length } });
}

function anonymizeContact({ org, body, mock }: OperationContext): Reply {
  const refused = precheck(body);
  if (refused) return refused;
  const contact = mock.contacts.find((candidate) => candidate.id === body.contact_id && candidate.organization_id === org);
  if (!contact) return fail('NOT_FOUND', 404);
  if (contact.anonymized_at) return fail('ALREADY_ANONYMIZED', 409);
  const when = mock.now().toISOString();
  Object.assign(contact, { name: 'Contato anonimizado', role: null, phone: null, email: null, is_primary: false, anonymized_at: when });
  mock.appendEvent('customer', contact.customer_id as string, org, 'contact_anonymized', asText(body.justification), { fields: ['name', 'role', 'phone', 'email'], reason: body.reason });
  return ok('ANONYMIZED', { anonymized_at: when });
}

export function registerAnonymizationOperations(mock: RegistryMock): void {
  mock.register('anonymize_driver', { kind: 'manage', permission: 'driver.anonymize', mfa: true, run: anonymizeDriver });
  mock.register('anonymize_customer', { kind: 'manage', permission: 'customer.anonymize', mfa: true, run: anonymizeCustomer });
  mock.register('anonymize_contact', { kind: 'manage', permission: 'customer.anonymize', mfa: true, run: anonymizeContact });
}

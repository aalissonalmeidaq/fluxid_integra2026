import { createOperationsHandler, type OperationSpec, type OperationsGateway, type Rule } from '../_shared/operations.ts';

export type { OperationsGateway } from '../_shared/operations.ts';

// Comandos do lacre (Spec 012, contracts/operacoes-servidor.md): sempre auditados e atômicos no banco, todos com `request_id`
// (idempotência). NÃO existe operação de exclusão (RF-041): qualquer operação desconhecida é recusada e auditada como negada. A borda
// valida o formato; as regras (vínculo, comandos, segundo fator, redes) são do banco. A chave do dispositivo e a senha de rede passam
// por aqui, então nada de corpo ou resposta é registrado. Cada história acrescenta as suas operações.
const requestId: [Rule, string] = [{ t: 'uuid' }, 'p_request'];
const justification: Rule = { t: 'text', max: 500, nullable: true, optional: true };
const alert = (): Record<string, [Rule, string]> => ({ request_id: requestId, alert_id: [{ t: 'uuid' }, 'p_alert'] });

export const MANAGE_SEAL_OPERATIONS: Record<string, OperationSpec> = {
  // US6: reconhecer e encerrar alertas (a observação de 5 a 500 é conferida no banco, NOTE_REQUIRED).
  acknowledge_alert: { rpc: 'acknowledge_alert', action: 'seal.alert_acknowledge', fields: alert() },
  close_alert: { rpc: 'close_alert', action: 'seal.alert_close', fields: { ...alert(), note: [{ t: 'text', max: 500, nullable: true, optional: true }, 'p_note'] } },
  // US6: notificações deste aparelho. O endereço e as chaves vêm do navegador (PushManager); nada disso é registrado.
  push_subscribe: {
    rpc: 'push_subscribe', action: 'seal.push_subscribe',
    fields: {
      request_id: requestId,
      endpoint: [{ t: 'text', max: 1000, pattern: /^https:\/\// }, 'p_endpoint'],
      p256dh: [{ t: 'text', max: 200 }, 'p_p256dh'],
      auth: [{ t: 'text', max: 100 }, 'p_auth'],
      label: [{ t: 'text', max: 80, nullable: true, optional: true }, 'p_label'],
    },
  },
  push_unsubscribe: { rpc: 'push_unsubscribe', action: 'seal.push_unsubscribe', fields: { request_id: requestId, endpoint: [{ t: 'text', max: 1000 }, 'p_endpoint'] } },
  // US2: travar e destravar pelo cilindro, sempre com justificativa (5 a 500, conferida no banco). Sem segundo
  // fator desde a Spec 013 (RF-021).
  request_lock: { rpc: 'request_lock', action: 'seal.command_manual', fields: { request_id: requestId, cylinder_id: [{ t: 'uuid' }, 'p_cylinder'], justification: [justification, 'p_justification'] } },
  request_unlock: { rpc: 'request_unlock', action: 'seal.unlock_exceptional', fields: { request_id: requestId, cylinder_id: [{ t: 'uuid' }, 'p_cylinder'], justification: [justification, 'p_justification'] } },
  // US5: dados do dispositivo e vínculo. Spec 013 (RF-018): o cadastro manual, a chave nova e a desativação saíram da borda (as funções
  // do banco ficam para os testes e os lacres da Spec 012); o lacre chega pelo Master e o tenant o devolve à plataforma.
  update_device: {
    rpc: 'update_device', action: 'seal.device_update',
    fields: {
      request_id: requestId, device_id: [{ t: 'uuid' }, 'p_device'], expected_version: [{ t: 'int', min: 1 }, 'p_expected_version'],
      label: [{ t: 'text', max: 60 }, 'p_label'], report_interval_s: [{ t: 'int', min: 30, max: 900 }, 'p_report_interval_s'],
    },
  },
  return_device: { rpc: 'return_device', action: 'seal.device_return', fields: { request_id: requestId, device_id: [{ t: 'uuid' }, 'p_device'], justification: [justification, 'p_justification'] } },
  bind_seal: { rpc: 'bind_seal', action: 'seal.bind', fields: { request_id: requestId, device_id: [{ t: 'uuid' }, 'p_device'], cylinder_id: [{ t: 'uuid' }, 'p_cylinder'] } },
  unbind_seal: { rpc: 'unbind_seal', action: 'seal.unbind', fields: { request_id: requestId, device_id: [{ t: 'uuid' }, 'p_device'], justification: [justification, 'p_justification'] } },
  // US7: redes Wi-Fi. A senha (8 a 63, ou rede aberta) segue só para o banco, que a guarda no Vault; esta borda nunca a registra. Com viagem
  // ou vigilância, o banco exige `confirm_risk` (WIFI_RISK_NOT_CONFIRMED).
  wifi_add: {
    rpc: 'wifi_add', action: 'seal.wifi_add',
    fields: {
      request_id: requestId, device_id: [{ t: 'uuid' }, 'p_device'], ssid: [{ t: 'text', max: 32 }, 'p_ssid'],
      password: [{ t: 'text', max: 63, nullable: true, optional: true }, 'p_password'], open: [{ t: 'bool', optional: true }, 'p_open'],
      confirm_risk: [{ t: 'bool', optional: true }, 'p_confirm_risk'],
    },
  },
  wifi_remove: {
    rpc: 'wifi_remove', action: 'seal.wifi_remove',
    fields: { request_id: requestId, device_id: [{ t: 'uuid' }, 'p_device'], ssid: [{ t: 'text', max: 32 }, 'p_ssid'], confirm_risk: [{ t: 'bool', optional: true }, 'p_confirm_risk'] },
  },
  wifi_reset: {
    rpc: 'wifi_reset', action: 'seal.wifi_reset',
    fields: { request_id: requestId, device_id: [{ t: 'uuid' }, 'p_device'], justification: [justification, 'p_justification'], confirm_risk: [{ t: 'bool', optional: true }, 'p_confirm_risk'] },
  },
};

export function createManageSealsHandler(gateway: OperationsGateway, operations: Record<string, OperationSpec> = MANAGE_SEAL_OPERATIONS) {
  return createOperationsHandler(gateway, operations, { prefix: 'seal' });
}

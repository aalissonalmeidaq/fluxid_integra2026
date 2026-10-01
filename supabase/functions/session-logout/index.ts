import { createLogoutGateway } from '../_shared/gateways.ts';
import { createSessionLogoutHandler } from './handler.ts';

export default {
  fetch: (request: Request): Promise<Response> => createSessionLogoutHandler(createLogoutGateway())(request),
};

import { createLoginGateway } from '../_shared/gateways.ts';
import { createSessionLoginHandler } from './handler.ts';

export default {
  fetch: (request: Request): Promise<Response> => createSessionLoginHandler(createLoginGateway())(request),
};

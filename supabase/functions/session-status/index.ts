import { createStatusGateway } from '../_shared/gateways.ts';
import { createSessionStatusHandler } from './handler.ts';

export default {
  fetch: (request: Request): Promise<Response> => createSessionStatusHandler(createStatusGateway())(request),
};

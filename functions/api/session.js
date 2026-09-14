import { createApiHandlers } from '../../src/http/api.js';
export const onRequestPost = createApiHandlers().session;

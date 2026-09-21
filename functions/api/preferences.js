import { createApiHandlers } from '../../src/http/api.js';
export const onRequestGet = createApiHandlers().preferences;
export const onRequestPut = createApiHandlers().preferences;

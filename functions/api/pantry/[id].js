import { createApiHandlers } from '../../../src/http/api.js';
const handlers = createApiHandlers();
export const onRequestGet = handlers.pantry;
export const onRequestPut = handlers.pantry;
export const onRequestDelete = handlers.pantry;

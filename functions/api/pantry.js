import { createApiHandlers } from '../../src/http/api.js';
const handlers = createApiHandlers();
export const onRequestGet = handlers.pantry;
export const onRequestPost = handlers.pantry;

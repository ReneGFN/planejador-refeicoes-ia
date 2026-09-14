import { createApiHandlers } from '../../../../src/http/api.js';
const handlers = createApiHandlers();
export const onRequestGet = handlers.pantryDeduction;
export const onRequestPost = handlers.pantryDeduction;

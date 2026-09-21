import { createApiHandlers } from '../../../src/http/api.js';

const handlers = createApiHandlers();
export const onRequestGet = handlers.mealLogs;
export const onRequestPut = handlers.mealLogs;
export const onRequestDelete = handlers.mealLogs;

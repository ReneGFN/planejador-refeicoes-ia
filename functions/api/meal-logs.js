import { createApiHandlers } from '../../src/http/api.js';

const handlers = createApiHandlers();
export const onRequestGet = handlers.mealLogs;
export const onRequestPost = handlers.mealLogs;

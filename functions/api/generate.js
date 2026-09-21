import { createApiHandlers } from '../../src/http/api.js';
// Desabilitado no ambiente publicado até validar cotas e integração real.
export const onRequestPost = createApiHandlers().generate;

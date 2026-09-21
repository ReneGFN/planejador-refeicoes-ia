import { ContractError } from '../contracts/generation.js';

const SAFE_PATH = /^[a-z][a-z0-9_.-]{0,119}$/u;

// O caminho é útil para diagnosticar incompatibilidades entre cliente e servidor,
// mas nunca deve sair no corpo HTTP nem carregar conteúdo enviado pelo usuário.
export function contractFailureEvent(error, operation) {
  if (!(error instanceof ContractError)) return null;
  return {
    event: 'contract_failure',
    operation: typeof operation === 'string' && /^[a-z_]{1,40}$/u.test(operation) ? operation : 'unknown',
    field: typeof error.path === 'string' && SAFE_PATH.test(error.path) ? error.path : 'unknown',
  };
}

export function observeContractFailure(error, operation, write = console.log) {
  const event = contractFailureEvent(error, operation);
  if (event) write(JSON.stringify(event));
  return event;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractError } from '../src/contracts/generation.js';
import { contractFailureEvent, observeContractFailure } from '../src/http/contract-observability.js';

test('observabilidade de contrato: registra somente operação e campo fechado', () => {
  const entries = [];
  const error = new ContractError('meal_log.eaten_at', 'timestamp enviado pelo usuário não é válido');
  const event = observeContractFailure(error, 'api', entry => entries.push(entry));
  assert.deepEqual(event, { event: 'contract_failure', operation: 'api', field: 'meal_log.eaten_at' });
  assert.deepEqual(JSON.parse(entries[0]), event);
  assert.equal(entries[0].includes(error.message), false);
});

test('observabilidade de contrato: erros não contratuais e caminhos inseguros não são expostos', () => {
  assert.equal(contractFailureEvent(new Error('privado'), 'api'), null);
  const event = contractFailureEvent(new ContractError('meal log.valor', 'privado'), 'api');
  assert.deepEqual(event, { event: 'contract_failure', operation: 'api', field: 'unknown' });
});

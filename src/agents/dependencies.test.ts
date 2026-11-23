import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODEL_CONFIGS } from '../state/defaults';
import { estimateCalls, getDownstream } from './dependencies';

test('getDownstream mengembalikan graf revisi deterministik BP 8.2', () => {
  assert.deepEqual(getDownstream(['scriptwriter']), ['scriptwriter', 'visual', 'packaging']);
  assert.deepEqual(getDownstream(['visual']), ['visual']);
  assert.deepEqual(getDownstream(['packaging']), ['packaging']);
  assert.deepEqual(getDownstream(['packaging', 'visual']), ['visual', 'packaging']);
});

test('estimateCalls menghitung baseline 6 (tanpa riset) dan 8 (dengan riset) serta worstCase 18 (BP 8.5)', () => {
  const withoutResearch = estimateCalls({ includeResearch: false }, DEFAULT_MODEL_CONFIGS);
  assert.equal(withoutResearch.researchCalls, 0);
  assert.equal(withoutResearch.complianceCallsPerPass, 2); // default compliance useSearch + two_step
  assert.equal(withoutResearch.baselineCalls, 6); // 0 + 1 + 1 + 1 + 2 + 1
  assert.equal(withoutResearch.maxRevisionCallsPerRound, 5); // 1 + 1 + 1 + 2
  assert.equal(withoutResearch.worstCaseCalls, 16); // 6 + 5*2

  const withResearch = estimateCalls({ includeResearch: true }, DEFAULT_MODEL_CONFIGS);
  assert.equal(withResearch.researchCalls, 2); // researcher useSearch + two_step
  assert.equal(withResearch.baselineCalls, 8); // 2 + 1 + 1 + 1 + 2 + 1
  assert.equal(withResearch.worstCaseCalls, 18); // 8 + 5*2
});

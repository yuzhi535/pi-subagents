import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContinuationTask, shouldContinueContext } from '../../src/runtime/continuation.ts';

test('does not continue without a known context window', () => {
  const decision = shouldContinueContext({ contextTokens: 90_000 }, { threshold: 0.85, maxContinuations: 2 });
  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.reason, 'unknown-window');
});

test('continues when context is over threshold', () => {
  const decision = shouldContinueContext({ contextTokens: 86, contextWindow: 100 }, { threshold: 0.85, maxContinuations: 2 });
  assert.equal(decision.shouldContinue, true);
  assert.equal(decision.reason, 'over-threshold');
});

test('caps continuation count', () => {
  const decision = shouldContinueContext({ contextTokens: 99, contextWindow: 100, continuationCount: 2 }, { threshold: 0.85, maxContinuations: 2 });
  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.reason, 'max-continuations');
});

test('prevents duplicate trigger', () => {
  const decision = shouldContinueContext({ contextTokens: 99, contextWindow: 100, alreadyTriggered: true }, { threshold: 0.85, maxContinuations: 2 });
  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.reason, 'already-triggered');
});

test('builds a continuation task with original task context', () => {
  const task = buildContinuationTask({ kind: 'subagent', name: 'x', agent: 'coder', task: 'fix bug', lastOutput: 'edited file' });
  assert.match(task, /fix bug/);
  assert.match(task, /edited file/);
  assert.match(task, /Proceed now/);
});

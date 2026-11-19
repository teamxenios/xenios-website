import assert from 'node:assert/strict';
import test from 'node:test';
import { runQualification } from './harness.mjs';

// These are safety assertions, not assertions that the current implementation
// is known to fail. Run only under Root's explicit shared-host allocation.
test('actual coordinator preserves claim and interrupted-write invariants', { timeout: 120_000 }, async t => {
  const receipt = await runQualification({
    outputFile: process.env.COORDINATION_QUALIFICATION_RECEIPT || undefined,
    subjectRoot: process.env.COORDINATION_QUALIFICATION_SUBJECT || undefined,
  });
  t.diagnostic('Complete receipt: ' + receipt.outputFile);
  assert.notEqual(receipt.status, 'HARNESS_OR_ENVIRONMENT_FAILURE', receipt.error);
  assert.equal(receipt.allOwnedChildrenExited, true);
  assert.equal(receipt.subjectSourceUnchangedAfterRun, true);
  await t.test('serialized positive control has one owner and matching lease', () => {
    assert.equal(receipt.scenarios[0].invariantPassed, true);
  });
  await t.test('overlapping same-snapshot claims have exactly one acknowledged winner', () => {
    const scenario = receipt.scenarios.find(item => item.id === 'same-snapshot-overlapping-claims');
    assert.equal(scenario.sameOwnershipSnapshot, true);
    assert.equal(scenario.sameTaskBoardSnapshot, true);
    assert.equal(scenario.successfulClaims, 1,
      'Two successful acknowledgements for one overlapping path are not safe even if one stale write erased the other lease.');
    assert.equal(scenario.finalState.consistent, true);
  });
  await t.test('interrupted task write remains consistent through resume and retry', () => {
    const scenario = receipt.scenarios.find(item => item.id === 'interrupted-task-write-resume');
    assert.equal(scenario.afterTaskWrite.consistent, true,
      'A durable claimed task must not exist without its corresponding durable lease.');
    assert.equal(scenario.finalState.consistent, true);
  });
});

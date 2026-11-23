import assert from 'node:assert/strict';
import { EXACT, UNMAPPED, RETRY } from './product-studio-fixture.mjs';

// Pinned PageSession.navigate(false) resets loaded, not its observation arrays.
export function navigateWholeRun(page, url) {
  return page.navigate(url, { resetRecords: false });
}
export function assertWholeRun(page, counts) {
  assert(Array.isArray(page?.networkBoundaryViolations) && Array.isArray(page?.network), 'MISSING_WHOLE_RUN_OBSERVATIONS');
  assert.equal(page.networkBoundaryViolations.length, 0, 'WHOLE_RUN_BOUNDARY_VIOLATION');
  assert(page.network.every(r => r.method === 'GET' || r.method === 'HEAD'), 'WHOLE_RUN_BROWSER_WRITE');
  assert.equal(counts?.writesRefused, 0, 'FINAL_REFUSED_WRITE');
  assert.equal(counts?.unexpectedReads, 0, 'FINAL_UNEXPECTED_READ');
  assert.deepEqual(counts?.preview, { [EXACT]: 2, [UNMAPPED]: 2, [RETRY]: 4 }, 'FINAL_PAIR_CENSUS');
}

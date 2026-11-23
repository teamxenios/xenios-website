import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { navigateWholeRun, assertWholeRun } from './product-studio-observation.mjs';
import { EXACT, UNMAPPED, RETRY } from './product-studio-fixture.mjs';
const counts = () => ({ writesRefused: 0, unexpectedReads: 0, preview: { [EXACT]: 2, [UNMAPPED]: 2, [RETRY]: 4 } });
const page = () => ({ network: [], networkBoundaryViolations: [], loaded: true,
  async navigate(_url, { resetRecords = true } = {}) {
    this.loaded = false;
    if (resetRecords) { this.network = []; this.networkBoundaryViolations = []; }
    this.network.push({ method: 'GET' }); this.loaded = true;
  } });
test('first-phase violation survives clean later navigation and refuses final acceptance', async () => {
  const p = page(); p.networkBoundaryViolations.push({ kind: 'first-phase-blocked' });
  await navigateWholeRun(p, '/first'); await navigateWholeRun(p, '/clean');
  assert.equal(p.loaded, true); assert.equal(p.network.length, 2);
  assert.throws(() => assertWholeRun(p, counts()), /WHOLE_RUN_BOUNDARY_VIOLATION/);
  // Causal negative control: the old default really erases the same history.
  const old = page(); old.networkBoundaryViolations.push({ kind: 'first-phase-blocked' });
  await old.navigate('/clean'); assert.doesNotThrow(() => assertWholeRun(old, counts()));
});
test('earlier browser write survives clean later navigation', async () => {
  const p = page(); p.network.push({ method: 'POST' }); await navigateWholeRun(p, '/clean');
  assert.throws(() => assertWholeRun(p, counts()), /WHOLE_RUN_BROWSER_WRITE/);
});
test('exact whole-run positive census passes', () => assert.doesNotThrow(() => assertWholeRun(page(), counts())));
for (const key of ['writesRefused', 'unexpectedReads']) test('late ' + key + ' refuses final acceptance', () => {
  const c = counts(); c[key]++; assert.throws(() => assertWholeRun(page(), c));
});
for (const key of [EXACT, UNMAPPED, RETRY]) test('late wrong census ' + key + ' refuses final acceptance', () => {
  const c = counts(); c.preview[key]++; assert.throws(() => assertWholeRun(page(), c), /FINAL_PAIR_CENSUS/);
});
test('missing final evidence fails closed', () => assert.throws(() => assertWholeRun(null, null)));
test('actual driver preserves all navigations and checks census after browser close', () => {
  const source = readFileSync(new URL('../product-studio-browser.mjs', import.meta.url), 'utf8');
  assert(!/page\.navigate\(/.test(source));
  assert.equal(source.match(/navigateWholeRun\(page, origin \+ PAGE\)/g)?.length, 2);
  assert(source.indexOf('assertWholeRun(page, final?.counts)') > source.indexOf('await browser.close()'));
});

// Explicit future qualification only. Importing does not launch a browser.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve, join, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './lib/chrome.mjs';
import { CdpConnection, PageSession, sleep } from './lib/cdp.mjs';
import { inventoryDirectory, inventorySha256 } from './lib/immutable-dist.mjs';
import { SOURCE, TREE, PRODUCT, EXACT, UNMAPPED, RETRY, DETAIL, PAGE, TOKEN,
  fixtureOrigin, syntheticSession } from './lib/product-studio-fixture.mjs';

import { navigateWholeRun, assertWholeRun } from './lib/product-studio-observation.mjs';

import { assertHostedDist } from './lib/hosted-preview-dist.mjs';
import { createRequestLifecycle, DENIAL_PROBE } from './lib/product-studio-lifecycle.mjs';

const hash = b => createHash('sha256').update(b).digest('hex');
const panelSource = `document.getElementById('product-catalog-preview-heading')?.closest('section')`;
async function within(promise, ms) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('FIXTURE_TIMEOUT')), ms); })]); }
  finally { clearTimeout(timer); }
}
export async function runProductStudioBrowser({ origin, dist, out }) {
  const keep = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'HOME',
    'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA', 'PATHEXT', 'PLAYWRIGHT_BROWSERS_PATH', 'XR_EVIDENCE_CHROME']);
  for (const key of Object.keys(process.env)) if (!keep.has(key.toUpperCase())) delete process.env[key];
  origin = fixtureOrigin(origin); dist = realpathSync(dist); out = resolve(out);
  out = join(realpathSync(dirname(out)), basename(out));
  const repo = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
  const inside = (file, root) => file.toLowerCase() === root.toLowerCase()
    || file.toLowerCase().startsWith(root.toLowerCase() + sep);
  assert(!existsSync(out), 'fresh external evidence directory required');
  assert(!inside(out, dist) && !inside(out, repo), 'evidence must be outside repository and dist');
  const provenance = assertHostedDist(dist, SOURCE, TREE);
  assert.equal(provenance.candidateSha, SOURCE); assert.equal(provenance.sourceTree, TREE);
  const inventoryHash = () => inventorySha256(inventoryDirectory(dist, new Set(['evidence-provenance.json'])));
  assert.equal(inventoryHash(), provenance.distInventorySha256);
  const get = async path => {
    const r = await fetch(origin + path, { method: 'GET', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(5000) });
    assert.equal(r.status, 200); assert.equal(r.url, origin + path);
    const chunks = []; let size = 0;
    for await (const chunk of r.body) { size += chunk.length; assert(size < 2_000_000); chunks.push(Buffer.from(chunk)); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  const fixture = await get('/__product_studio_fixture');
  assert.equal(fixture.kind, 'PRODUCT_STUDIO_LOCAL_SYNTHETIC_ONLY');
  assert.equal(fixture.source, SOURCE); assert.equal(fixture.tree, TREE); assert(fixture.immutableDist);
  assert.deepEqual(fixture.provenance, provenance);
  const fixtureSourceInventory = ['scripts/preview-product-studio.ts', 'scripts/evidence/product-studio-browser.mjs',
    'scripts/evidence/lib/product-studio-fixture.mjs', 'scripts/evidence/lib/product-studio-fixture.test.mjs',
    'scripts/evidence/lib/product-studio-observation.mjs', 'scripts/evidence/lib/product-studio-observation.test.mjs',
    'scripts/evidence/lib/hosted-preview-dist.mjs', 'scripts/evidence/lib/hosted-preview-import.mjs',
    'scripts/evidence/lib/hosted-preview-css.mjs', 'scripts/evidence/lib/hosted-preview-import.test.mjs',
    'scripts/evidence/lib/product-studio-lifecycle.mjs', 'scripts/evidence/lib/product-studio-lifecycle.test.mjs',
    'scripts/evidence/import-hosted-product-studio.mjs']
    .map(path => { const bytes = readFileSync(join(repo, path)); return { path, bytes: bytes.length, sha256: hash(bytes) }; });
  mkdirSync(out); const observations = [], captures = [];
  const result = { kind: 'PRODUCT_STUDIO_SYNTHETIC_BROWSER_OBSERVATION', source: SOURCE, tree: TREE,
    sourceRole: 'HOSTED_STATIC_SUBSET_IMPORTED_WITHOUT_BUILD', provenanceProfile: provenance.kind, fixtureSourceInventory, runtimeSourceBindings: fixture.runtimeSourceBindings,
    scope: 'Actual compiled ProductAdminDetail/AdminScreen/preview plus actual server guard/registrar/core with loopback synthetic identity and data. Not live authentication, real catalog, publication or production proof.',
    status: 'NOT_RUN', observations, captures, authentication: 'INERT_LOCAL_PRESET_SESSION_NO_STAFF_LOGIN',
    startedAt: new Date().toISOString(), failure: null };
  let browser, conn, page;
  const lifecycle = createRequestLifecycle(origin), navigationDiagnostics = [];
  result.navigationDiagnostics = navigationDiagnostics;
  const navigate = async (phase, action) => {
    lifecycle.phase(phase);
    navigationDiagnostics.push({ when: 'before', ...lifecycle.snapshot(page) });
    try { await action(); }
    finally { navigationDiagnostics.push({ when: 'after-or-failed', ...lifecycle.snapshot(page) }); }
  };
  const deadline = Date.now() + 120_000;
  class FixtureConnection extends CdpConnection {
    onMessage(message) {
      // Observe every flat session, including worker targets, without changing
      // the original dispatch, boundary checks or authoritative inflight map.
      try { lifecycle.cdp(message); } catch { result.diagnosticObservationFailed = true; }
      return super.onMessage(message);
    }
    send(method, params = {}, sessionId, options = {}) {
      return super.send(method, params, sessionId, { ...options,
        timeoutMs: Math.max(1, Math.min(options.timeoutMs ?? 10_000, deadline - Date.now())) });
    }
  }
  const wait = async (expression, label) => {
    for (let i = 0; i < 80; i++) { if (await page.evaluate(expression)) return; await sleep(100); }
    throw Error('FIXTURE_CONDITION_' + label);
  };
  const select = id => page.evaluate(`(() => { const s=document.querySelector('#preview-exact-variant'); if(!s)throw Error('SELECT_MISSING'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(id)});s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  const capture = async (name, width, expected, absent = null) => {
    const sample = await page.evaluate(`(() => {const p=${panelSource};if(!p) return null; const text=p.innerText;
      const a=p.querySelector('article'); return {text,selected:p.querySelector('select')?.value,article:Boolean(a),
        contained:p.scrollWidth<=p.clientWidth+1,width:p.clientWidth,documentWidth:document.documentElement.scrollWidth};})()`);
    assert(sample?.text.includes(expected), name + ': intended preview missing');
    const selected = name === 'exact-A' ? EXACT : name === 'unmapped-B' ? UNMAPPED : RETRY;
    assert.equal(sample.selected, selected, name + ': selected variant changed');
    assert.equal(sample.article, name === 'exact-A' || name === 'recovered-C', name + ': incorrect preview visibility');
    if (absent) assert(!sample.text.includes(absent), name + ': prior variant remained');
    assert(!sample.text.includes('SYNTHETIC PRIVATE DRAFT'), 'draft leaked into approved preview');
    assert(sample.contained, 'preview horizontal overflow');
    await page.evaluate(`(${panelSource}).scrollIntoView({block:'center'})`);
    const image = await page.screenshot({ fullPage: false });
    assert(image.bytes.length > 24 && image.bytes.length < 8_000_000);
    assert.equal(image.bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const dimensions = { width: image.bytes.readUInt32BE(16), height: image.bytes.readUInt32BE(20) };
    assert.equal(dimensions.width, width); assert.equal(dimensions.height, 900);
    const file = `${name}-${width}.png`; writeFileSync(join(out, file), image.bytes, { flag: 'wx' });
    captures.push({ file, bytes: image.bytes.length, sha256: hash(image.bytes), width,
      dimensions, screenshotCoverage: image.coverage ?? null, personallyReviewed: false });
    observations.push({ name, width, ...sample });
  };
  try {
    browser = await launchChromium(); conn = new FixtureConnection(browser.wsUrl);
    await within(conn.open(), 10_000); page = await PageSession.create(conn);
    await page.enforceNetworkBoundary(origin);
    await navigate('signed-out', () => navigateWholeRun(page, origin + PAGE));
    await wait(`Boolean(document.querySelector('[data-testid="form-adminx-signin"]'))`, 'SIGNED_OUT_GUARD');
    assert.equal(await page.evaluate(`Boolean(${panelSource})`), false);
    let status = await get('/__product_studio_fixture'); assert.equal(status.counts.productReads, 0);
    // A synthetic invalid bearer is refused by the real application guard.
    lifecycle.phase('invalid-bearer');
    const denial = await page.evaluate(`(${DENIAL_PROBE})(${JSON.stringify(DETAIL)})`);
    assert.equal(denial.bodyDrained, true);
    // Keep the same bounded idle/paint rule; do not carry an unread probe into
    // the authenticated navigation or forgive a pending request.
    await page.settle();
    assert.equal(denial.status, 401); status = await get('/__product_studio_fixture'); assert.equal(status.counts.productReads, 0);
    observations.push({ name: 'actual-guard-denial', signedOutPanelAbsent: true, invalidBearerStatus: 401, productReads: 0 });
    // The existing canonical SDK reads this inert local fixture session. No
    // signInWithPassword/Auth-token POST, privileged self-registration or real
    // session is exercised or implied. It is removed before browser close.
    const storageKey = 'sb-127-auth-token';
    await page.evaluate(`localStorage.setItem(${JSON.stringify(storageKey)},${JSON.stringify(JSON.stringify(syntheticSession()))})`);
    for (const width of [1440, 375]) {
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
      await navigate(`authenticated-${width}`, () => navigateWholeRun(page, origin + PAGE));
      await wait(`Boolean(document.querySelector('#preview-exact-variant'))`, 'ACTUAL_PRODUCT_DETAIL');
      await page.evaluate(`(${panelSource}).scrollIntoView({block:'center'})`);
      assert.equal(await page.evaluate(`document.querySelector('#preview-exact-variant').value`), '');
      const before = (await get('/__product_studio_fixture')).counts.preview;
      await select(EXACT); await wait(`(${panelSource})?.innerText.includes('Synthetic reviewed summary A.')`, 'EXACT_A');
      await capture('exact-A', width, 'Synthetic reviewed summary A.', 'Synthetic reviewed summary C.');
      await select(UNMAPPED); await wait(`(${panelSource})?.innerText.includes('No reviewed exact catalog binding.')`, 'UNMAPPED_B');
      assert.equal(await page.evaluate(`Boolean((${panelSource}).querySelector('article'))`), false);
      await capture('unmapped-B', width, 'No reviewed exact catalog binding.', 'Synthetic reviewed summary A.');
      await select(RETRY); await wait(`(${panelSource})?.innerText.includes('The reviewed catalog could not be confirmed.')`, 'UNAVAILABLE_C');
      await sleep(250);
      assert.equal((await get('/__product_studio_fixture')).counts.preview[RETRY] - before[RETRY], 1, 'unavailable state auto-retried');
      await capture('unavailable-C', width, 'Retry without changing the product.', 'Synthetic reviewed summary A.');
      await page.evaluate(`(() => {const p=${panelSource}; const b=[...p.querySelectorAll('button')].find(b=>b.textContent==='Retry preview');if(!b||b.disabled)throw Error('RETRY_MISSING');b.click();return true;})()`);
      await wait(`(${panelSource})?.innerText.includes('Synthetic reviewed summary C.')`, 'RETRY_RECOVERED_C');
      assert.equal(await page.evaluate(`document.querySelector('#preview-exact-variant').value`), RETRY);
      await capture('recovered-C', width, 'Synthetic reviewed summary C.', 'Synthetic reviewed summary A.');
      status = await get('/__product_studio_fixture');
      assert.equal(status.counts.preview[EXACT] - before[EXACT], 1);
      assert.equal(status.counts.preview[UNMAPPED] - before[UNMAPPED], 1);
      assert.equal(status.counts.preview[RETRY] - before[RETRY], 2);
      assert.equal(status.counts.writesRefused, 0); assert.equal(status.counts.unexpectedReads, 0);
      observations.push({ name: 'exact-request-census', width, previewDeltas: { exact: 1, unmapped: 1, retry: 2 } });
    }
    assert.equal(page.networkBoundaryViolations.length, 0);
    assert(page.network.every(r => r.method === 'GET' || r.method === 'HEAD'), 'unexpected browser write');
    assert.equal(captures.length, 8);
    result.status = 'PASS_SYNTHETIC_BROWSER_ONLY'; result.browserVersion = browser.browserVersion;
  } catch (error) {
    result.status = 'FAIL'; result.failure = String(error.message).slice(0, 240);
    result.failureLifecycle = lifecycle.snapshot(page);
    result.serverAtFailure = await get('/__product_studio_fixture').then(s => ({
      counts: s.counts, lifecycle: s.lifecycle, bootstrap: s.bootstrap,
    })).catch(() => null);
    result.domAtFailure = page ? await within(page.evaluate(`({readyState:document.readyState,
      signedOut:Boolean(document.querySelector('[data-testid="form-adminx-signin"]')),
      panel:Boolean(${panelSource}),variantSelect:Boolean(document.querySelector('#preview-exact-variant'))})`), 1000).catch(() => null) : null;
  } finally {
    if (page) await within(page.evaluate(`localStorage.removeItem('sb-127-auth-token')`), 2000).catch(() => {});
    if (page) await within(page.close(), 2000).catch(() => {});
    if (conn) await within(conn.close(), 2000).catch(() => {});
    if (browser) await browser.close();
    const native = await get('/__native_preview').catch(() => null);
    const final = await get('/__product_studio_fixture').catch(() => null);
    result.fixtureCounts = final?.counts ?? null;
    result.finalServerLifecycle = final?.lifecycle ?? null;
    result.bootstrap = final?.bootstrap ?? null;
    result.finalBrowserLifecycle = lifecycle.snapshot(page);
    result.wholeRunBrowserCounts = { requests: page?.network?.length ?? null, violations: page?.networkBoundaryViolations?.length ?? null };
    try { assertWholeRun(page, final?.counts); }
    catch (error) { result.status = 'FAIL'; result.failure ??= String(error.message).slice(0, 240); }
    result.nativeBlockedExternalRequests = native?.blockedExternalRequests ?? null;
    if (result.diagnosticObservationFailed) { result.status = 'FAIL'; result.failure ??= 'DIAGNOSTIC_OBSERVATION_FAILED'; }
    if (!final?.immutableDist || inventoryHash() !== provenance.distInventorySha256 || native?.blockedExternalRequests !== 0) {
      result.status = 'FAIL'; result.failure ??= 'FINAL_ISOLATION_OR_BUILD_PARITY';
    }
    if (fixtureSourceInventory.some(f => { try { return hash(readFileSync(join(repo, f.path))) !== f.sha256; } catch { return true; } })) {
      result.status = 'FAIL'; result.failure ??= 'FIXTURE_SOURCE_CHANGED_DURING_RUN';
    }
    result.finishedAt = new Date().toISOString();
    result.bounds = { browserRuntimeMs: 120000, loopbackGetMs: 5000, maxCaptures: 8, retries: 0 };
    writeFileSync(join(out, 'product-studio-browser-result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  }
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [a, origin, b, dist, c, out] = process.argv.slice(2);
  assert(a === '--base-url' && b === '--dist-dir' && c === '--out-dir' && process.argv.length === 8, 'exact arguments required');
  const result = await runProductStudioBrowser({ origin, dist, out });
  console.log(JSON.stringify({ status: result.status, captures: result.captures.length, failure: result.failure }));
  if (result.status !== 'PASS_SYNTHETIC_BROWSER_ONLY') process.exitCode = 1;
}

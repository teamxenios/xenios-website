// PROPOSAL ONLY. One separately approved CI invocation; synthetic UI proof, never live backend.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { serveStaticProof, confinedFile } from './static-proof-server.mjs';
import { pathToFileURL } from 'node:url';

const root = path.resolve(process.argv[2]);
const home = path.resolve(process.argv[3]);
const output = home + '/browser-static-proof-2f4ff3e';
const artifactRoot = home + '/static-client-2f4ff3e';
const manifestPath = home + '/static-client-manifest-2f4ff3e.json';
const expectedTree = 'f0c655d4154fc56c78b2482399a6b47d86aa3496';
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const expected = '2f4ff3ebb69c3b3239fbf8e6f55f9eac66801097';
const git = 'git';
const port = 5239, origin = `http://127.0.0.1:${port}`;
const tracked = ['client/src/research/assisted-order/RequestIntentForm.tsx', 'client/src/research/assisted-order/RequestIntentForm.test.tsx', 'client/src/research/assisted-order/assisted-order.css'];
const report = { source: expected, start: new Date().toISOString(), scope: 'Real browser rendering the existing application with synthetic API fixtures only; NOT real authentication, persistence, staging, submission or release proof', checks: [], apiRequests: [], firstFailure: null, realBrowserZoom200: 'NOT RUN', cleanup: {} };
if (fs.existsSync(output)) throw new Error('Prior static browser receipt directory exists; no retry/overwrite');
fs.mkdirSync(output, { recursive: true });
let server, context, artifactFiles;
function checkpoint() { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
function fail(reason) { if (!report.firstFailure) report.firstFailure = reason; checkpoint(); }
function check(condition, description) { if (!condition) { fail(description); throw new Error(report.firstFailure); } report.checks.push(description); checkpoint(); }
function immutable() {
  assert.equal(process.version, 'v20.19.0');
  assert.equal(process.env.NODE_OPTIONS, '--max-old-space-size=1536');
  assert.equal(execFileSync(git, ['-c', 'core.longpaths=true', 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), expected);
  assert.equal(execFileSync(git, ['-c', 'core.longpaths=true', 'rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim(), expectedTree);
  assert.equal(sha256(fs.readFileSync(path.join(root, 'package-lock.json'))), 'd25eb6b816b616cfa1dc7b1769c14971b944e5385bfae9be41e75d1cf5e64f74');
  execFileSync(git, ['-c', 'core.longpaths=true', 'diff', '--exit-code', 'HEAD', '--', ...tracked], { cwd: root, stdio: 'pipe' });
}
function capacity() { return { availableMiB: Number(/^MemAvailable:\s+(\d+)/m.exec(fs.readFileSync('/proc/meminfo', 'utf8'))?.[1] ?? 0) / 1024, time: new Date().toISOString() }; }
function descendants() {
  const rows = fs.readdirSync('/proc').filter(name => /^\d+$/.test(name)).flatMap(name => {
    try { const stat = fs.readFileSync('/proc/' + name + '/stat', 'utf8'); const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' '); return [{ pid: Number(name), ppid: Number(fields[1]), start: fields[19] }]; } catch { return []; }
  });
  const ids = new Set([process.pid]);
  for (let i = 0; i < 20; i++) for (const row of rows) if (ids.has(row.ppid)) ids.add(row.pid);
  return rows.filter(row => row.pid !== process.pid && ids.has(row.pid));
}

function verifiedArtifact() {
  const build = JSON.parse(fs.readFileSync(home + '/static-build-receipt-2f4ff3e.json', 'utf8'));
  assert.equal(build.status, 'PASS_STATIC_CLIENT_BUILD');
  assert.equal(build.source, expected); assert.equal(build.tree, expectedTree); assert.equal(build.sourceUnchanged, true);
  const bytes = fs.readFileSync(manifestPath);
  assert.equal(sha256(bytes), build.artifactManifest.sha256);
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.source, expected); assert.equal(manifest.tree, expectedTree); assert.equal(manifest.runtime, 'v20.19.0');
  assert.equal(path.resolve(manifest.output).toLowerCase(), path.resolve(artifactRoot).toLowerCase());
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0 && manifest.files.length <= 20000);
  const files = new Map();
  for (const entry of manifest.files) {
    assert.ok(entry && typeof entry.path === 'string' && Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 && /^[a-f0-9]{64}$/.test(entry.sha256));
    assert.ok(!files.has(entry.path));
    const payload = fs.readFileSync(confinedFile(artifactRoot, entry.path));
    assert.equal(payload.length, entry.bytes); assert.equal(sha256(payload), entry.sha256);
    files.set(entry.path, entry);
  }
  const actual = [];
  function walk(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name), name = relative ? relative + '/' + entry.name : entry.name;
      assert.ok(!fs.lstatSync(full).isSymbolicLink(), 'Unexpected artifact symlink');
      if (entry.isDirectory()) walk(full, name);
      else { assert.ok(entry.isFile()); actual.push(name); }
    }
  }
  walk(artifactRoot);
  assert.deepEqual(actual.sort(), [...files.keys()].sort());
  assert.ok(files.has('index.html'));
  report.artifactManifest = { path: manifestPath, sha256: sha256(bytes), files: files.size };
  return files;
}

function item(variantId, specification, productId = 'synthetic-product-a') {
  return { productId, variantId, productName: productId === 'synthetic-product-a' ? 'Synthetic product A' : 'Synthetic product B', family: 'research_peptides_materials', channel: 'synthetic', specification, format: null, packBasis: null, minimumQuantity: 1, maximumQuantity: 100, quantityIncrement: 1, unitPriceCents: null, currency: 'USD', workflowMode: 'request_pricing', actionLabel: 'Add to request', accessNotice: null, researchUseOnly: true, catalogVersion: 'synthetic', priceVersion: null, sourceSelection: { family: 'synthetic', slug: 'synthetic', variantId }, selectableForReview: true, intentExclusion: null, clinicalReviewRequired: false, sourceDisplayState: 'request_access', sourceVariantDisplayState: 'request_access', sourceRefusal: null };
}
const items = [item('synthetic-variant-one', 'Synthetic variant one'), item('synthetic-variant-two', 'Synthetic variant two'), item('synthetic-variant-three', 'Synthetic variant three', 'synthetic-product-b')];
const pair = { kind: 'synthetic-policy', version: 'synthetic-v1' };
const config = { enabled: true, requiredAgreements: [{ ...pair, label: 'Synthetic fixture legal requirement' }], formAcknowledgments: [{ id: 'synthetic-ack', scope: 'always', kind: 'synthetic-ack', version: 'synthetic-v1', copy: 'Synthetic fixture acknowledgment; no real consent recorded.' }] };
const fixtures = new Map([
  ['/api/config', { metaPixelId: null, turnstileSiteKey: null, calendlyUrl: '', supabaseUrl: null, supabaseAnonKey: null }],
  ['/api/research/me', { configured: true, authed: false }],
  ['/api/research/early-access/session', { authenticated: true, openAccess: true, expiresAt: new Date(Date.now() + 3600000).toISOString() }],
  ['/api/research/early-access/agreements', { ok: true, accepted: true, required: [pair] }],
  ['/api/research/policies', { ok: true, policies: { 'research-use': { title: 'Synthetic fixture policy — not live', agreement: pair, updated: 'synthetic', sections: [{ heading: 'Synthetic', paragraphs: ['No real agreement or request is recorded by this test.'], bullets: [] }] } } }],
  ['/api/research/early-access/assisted-orders/config', { enabled: false }],
  ['/api/research/early-access/request-intents/config', config],
]);

try {
  checkpoint();
  immutable();
  artifactFiles = verifiedArtifact();
  // The listener is in this same owned Node process; no dev server/backend.
  server = await serveStaticProof({ root: artifactRoot, port, files: artifactFiles, onFailure: fail });
  report.server = { pid: process.pid, address: server.address, kind: 'builtin static manifest-confined HTTP; no backend' };
  checkpoint();
  report.beforeBrowser = capacity();
  check(report.beforeBrowser.availableMiB >= 2048, 'Fresh Linux resource floor immediately before browser');
  const tools = path.resolve(process.argv[4]);
  const playwrightPackage = JSON.parse(fs.readFileSync(path.join(tools, 'node_modules/playwright/package.json'), 'utf8'));
  check(playwrightPackage.version === '1.61.1', 'Pinned Playwright version remains 1.61.1');
  const { chromium } = await import(pathToFileURL(path.join(tools, 'node_modules/playwright/index.mjs')).href);
  check(chromium.executablePath().includes('chromium-1228/'), 'Pinned full Chromium revision is 1228');
  const extension = path.resolve(import.meta.dirname, 'zoom-extension');
  const profile = path.join(home, 'fresh-browser-profile');
  check(!fs.existsSync(profile), 'Browser profile is fresh');
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, timeout: 30000, serviceWorkers: 'block', acceptDownloads: false,
    proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1' },
    viewport: { width: 1280, height: 900 },
    args: ['--disable-background-networking', '--disable-extensions-except=' + extension, '--load-extension=' + extension]
  });
  report.browserVersion = context.browser()?.version() ?? 'unavailable';
  const zoomWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 10000 });
  check(zoomWorker.url().startsWith('chrome-extension://') && zoomWorker.url().endsWith('/background.js'), 'Exact local zoom-extension worker loaded');
  context.on('serviceworker', worker => {
    if (worker.url() !== zoomWorker.url()) fail('Unexpected application service worker');
  });
  checkpoint();
  await context.routeWebSocket('**/*', socket => {
    const url = new URL(socket.url());
    fail(`Blocked websocket ${url.origin}${url.pathname}`); socket.close();
  });
  await context.route('**/*', async route => {
    try {
      const request = route.request(), url = new URL(request.url());
      if (report.firstFailure) { await route.abort(); return; }
      if (url.origin !== origin) { fail(`Blocked off-origin ${url.origin}${url.pathname}`); await route.abort(); return; }
      if (request.method() !== 'GET') { fail(`Blocked non-GET ${request.method()} ${url.pathname}`); await route.abort(); return; }
      if (url.pathname.startsWith('/api/')) {
        report.apiRequests.push({ method: request.method(), path: url.pathname, synthetic: true });
        if (url.pathname === '/api/research/early-access/request-intents/catalog') {
          const filtered = url.searchParams.get('search') === 'no-match' ? [] : items;
          await route.fulfill({ json: { items: filtered, total: filtered.length, page: Number(url.searchParams.get('page') ?? 1), pageSize: Number(url.searchParams.get('pageSize') ?? 24), families: ['research_peptides_materials'], channels: [], workflowModes: [] } }); return;
        }
        if (!fixtures.has(url.pathname)) { fail(`Unlisted synthetic API ${url.pathname}`); await route.abort(); return; }
        await route.fulfill({ json: fixtures.get(url.pathname) }); return;
      }
      const decodedStatic = decodeURIComponent(url.pathname);
      const staticAllowed = decodedStatic === '/research/early-access/order-request' || decodedStatic === '/' || artifactFiles.has(decodedStatic.slice(1));
      if (!staticAllowed) { fail(`Unlisted local static ${url.pathname}`); await route.abort(); return; }
      await route.continue();
    } catch (error) { fail(`Network guard error: ${error.name}`); await route.abort().catch(() => {}); }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => fail(`Page error: ${error.message.slice(0, 300)}`));
  await page.goto(`${origin}/research/early-access/order-request`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByRole('button', { name: 'Add Synthetic product A to request', exact: true }).first().waitFor({ state: 'visible', timeout: 30000 });
  check(!report.firstFailure, 'Existing application mounted synthetic request form without forbidden requests');
  await page.getByRole('button', { name: 'Add Synthetic product A to request', exact: true }).first().click();
  await page.getByRole('button', { name: 'Add Synthetic product A to request', exact: true }).first().click();
  const summary = page.getByRole('complementary', { name: 'Selected request items' });
  check((await summary.textContent()).includes('1 products | 2 exact variants | 2 requested units'), 'Unique product/variant/unit counts rendered');
  const increase = page.getByRole('button', { name: 'Increase requested quantity for Synthetic product A', exact: true }).first();
  const decrease = page.getByRole('button', { name: 'Decrease requested quantity for Synthetic product A', exact: true }).first();
  const quantity = page.getByRole('spinbutton', { name: 'Requested quantity for Synthetic product A', exact: true }).first();
  check(await decrease.isDisabled(), 'Decrease disabled at canonical minimum');
  await quantity.fill('100');
  check(await increase.isDisabled(), 'Increase disabled at canonical maximum');
  await quantity.fill('1');
  await increase.focus(); await page.keyboard.press('Enter');
  check((await summary.textContent()).includes('3 requested units'), 'Keyboard activation increments selection');
  await decrease.click();
  check((await summary.textContent()).includes('2 requested units'), 'Decrease updates selected units');
  await increase.click();
  await page.getByRole('button', { name: 'Add Synthetic product B to request', exact: true }).click();
  check((await summary.textContent()).includes('2 products | 3 exact variants | 4 requested units'), 'Unique product count changes independently of variant count');
  await summary.getByRole('button', { name: 'Remove selected Synthetic product B Synthetic variant three', exact: true }).click();
  check((await summary.textContent()).includes('1 products | 2 exact variants | 3 requested units'), 'Summary removal preserves other selections');
  await page.getByLabel('Search catalog', { exact: true }).fill('no-match');
  await page.waitForFunction(() => document.querySelector('.xenios-order-cards')?.children.length === 0);
  const edit = page.getByRole('button', { name: 'Edit selected quantity for Synthetic product A Synthetic variant two', exact: true });
  await edit.focus(); await page.keyboard.press('Enter');
  await summary.getByRole('spinbutton').fill('4');
  check((await summary.textContent()).includes('6 requested units'), 'Off-page inline quantity edit preserves other selection');
  await page.getByRole('button', { name: 'Done editing quantity', exact: true }).click();
  await page.getByLabel('Search catalog', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Increase requested quantity for Synthetic product A', exact: true }).first().waitFor();
  report.viewports = [];
  for (const width of [320, 360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await increase.click();
    check((await summary.textContent()).includes('7 requested units'), `Increase usable at ${width}px`);
    await decrease.click();
    check((await summary.textContent()).includes('6 requested units'), `Decrease usable at ${width}px`);
    await page.screenshot({ path: path.join(output, `viewport-${width}.png`), fullPage: true });
    const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, quantityTargets: [...document.querySelectorAll('.xenios-order-quantity button:not(.xenios-order-link)')].map(element => { const bounds = element.getBoundingClientRect(); return { width: bounds.width, height: bounds.height }; }) }));
    report.viewports.push(metrics);
    check(metrics.scrollWidth <= width + 1 && metrics.bodyWidth <= width + 1, `No horizontal overflow at ${width}px`);
    check(metrics.quantityTargets.length > 0 && metrics.quantityTargets.every(target => target.width >= 44 && target.height >= 44), `44px quantity targets at ${width}px`);
    check(!report.firstFailure, `Network guard remains clear at ${width}px`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  const beforeZoom = await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio }));
  report.realBrowserZoom200 = await zoomWorker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ url: 'http://127.0.0.1:5239/*' });
    if (tabs.length !== 1 || !Number.isInteger(tabs[0].id)) throw new Error('Expected exactly one synthetic app tab');
    const id = tabs[0].id;
    await chrome.tabs.setZoomSettings(id, { mode: 'automatic', scope: 'per-tab' });
    await chrome.tabs.setZoom(id, 2);
    return { factor: await chrome.tabs.getZoom(id), settings: await chrome.tabs.getZoomSettings(id) };
  });
  check(report.realBrowserZoom200.factor === 2 && report.realBrowserZoom200.settings.mode === 'automatic', 'Browser API confirms actual automatic 200% tab zoom');
  await page.waitForFunction(width => innerWidth <= width * 0.55, beforeZoom.width);
  const zoomMetrics = await page.evaluate(() => ({
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
    dpr: devicePixelRatio, targets: [...document.querySelectorAll('.xenios-order-quantity button:not(.xenios-order-link)')].map(element => {
      const r = element.getBoundingClientRect(); return { width: r.width, height: r.height };
    })
  }));
  report.realBrowserZoom200.metrics = zoomMetrics;
  report.realBrowserZoom200.before = beforeZoom;
  check(zoomMetrics.scrollWidth <= zoomMetrics.width + 1 && zoomMetrics.bodyWidth <= zoomMetrics.width + 1, 'No horizontal overflow at real 200% zoom');
  check(zoomMetrics.targets.length > 0 && zoomMetrics.targets.every(r => r.width >= 44 && r.height >= 44), '44px controls retained at real 200% zoom');
  await increase.focus(); await page.keyboard.press('Enter');
  check((await summary.textContent()).includes('7 requested units'), 'Quantity control remains keyboard-operable at real 200% zoom');
  await page.screenshot({ path: path.join(output, 'zoom-200.png'), fullPage: true });
  check(await page.locator('input[type=password]').count() === 0, 'No password field in synthetic guest view');
  check(await page.evaluate(() => sessionStorage.length) === 0, 'No request marker/contact persistence introduced before submission');
  check(report.apiRequests.every(request => request.method === 'GET'), 'No actual or synthetic submission attempted');
  report.status = 'PASS_CI_SYNTHETIC_VIEWPORTS_AND_REAL_ZOOM';
} catch (error) {
  fail(error.message); report.status = 'FAIL';
  process.exitCode = 1;
} finally {
  const owned = descendants();
  try { await context?.close(); report.cleanup.contextClosed = Boolean(context); } catch { report.cleanup.contextClosed = false; report.status = 'FAIL'; process.exitCode = 1; }
  try { await server?.close(); report.cleanup.serverClosed = Boolean(server); } catch { report.cleanup.serverClosed = false; report.status = 'FAIL'; process.exitCode = 1; }
  report.cleanup.observedOwnedProcesses = owned;
  report.cleanup.survivors = owned.filter(row => {
    try { const stat = fs.readFileSync('/proc/' + row.pid + '/stat', 'utf8'); return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] === row.start; } catch { return false; }
  });
  if (report.cleanup.survivors.length) { report.status = 'FAIL'; process.exitCode = 1; }
  try { immutable(); report.sourceUnchanged = true; } catch { report.sourceUnchanged = false; report.status = 'FAIL'; process.exitCode = 1; }
  if (report.firstFailure) { report.status = 'FAIL'; process.exitCode = 1; }
  report.end = new Date().toISOString();
  checkpoint();
  console.log(JSON.stringify(report));
}


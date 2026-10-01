// Private partnership receipt preview. Never imported by or deployed with Xenios.
// README: use the full private Node 20.19.0 binary below, with no preload/env.
// 1. After a clean successful pinned npm build, create a NEW receipt:
//    node partnership-preview.mjs --create-receipt --repo ABS_REPO --dist ABS_REPO/dist
//      --receipt ABS_SCRATCH/partnership-preview-receipt.json
//      --build-result ABS_SCRATCH/QUALIFICATION_BUILD-result.json
//      --source-sha c0e25c73a0d789829ea213e2ee040c68e06f0a75
//      --source-tree 1771d18bad91b89e95414bebb8b574dc32729687
// 2. Start separately with the same repo/dist/receipt/source arguments and --port 0.
// 3. Open the emitted /partners#inquiry URL in a fresh browser origin. Fill the
//    exact SYNTHETIC_DRAFT printed at READY; select research_organization.
//    Submit, then edit draft email/pathway/context during the 15-second delay.
//    The received summary/email/pathway must remain the ORIGINAL submitted data.
// 4. Stop with SIGINT/SIGTERM; retain READY/CONTACT/STOPPED logs and final integrity.
// Only the actual production CLIENT/pageGate/static are exercised. This launcher
// never mounts real contact, auth, database, payment, notification, or mail routes.
// Synthetic success is not delivery/approval evidence; autoReplySent is false.
// No original catalog fixture or artificial workflow authority is mounted.
// Node network denial is in-process, not an OS sandbox. CSP restricts browser
// subresources, not external top-level links/mail handlers: do not activate them.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import dgram from 'node:dgram';

const SOURCE_SHA_EXPECTED = 'c0e25c73a0d789829ea213e2ee040c68e06f0a75';
const SOURCE_TREE_EXPECTED = '1771d18bad91b89e95414bebb8b574dc32729687';
const PINNED_NODE = 'C:/Users/sboad/.codex/tmp/node-v20.19.0-win-x64/node.exe';
const RUNTIME_PATHS = Object.freeze([
  'client/src/App.tsx',
  'client/src/research/b2b/PartnershipInquiryForm.tsx',
  'client/src/research/b2b/pathways.ts',
  'client/src/research/b2b/PartnerPathwaysPage.tsx',
  'client/src/lib/waitlist-service.ts',
  'server/static.ts',
]);
const CONTACT_DELAY_MS = 15_000;
const SYNTHETIC_DRAFT = Object.freeze({
  pathway: 'research_organization',
  name: 'Synthetic Partnership Contact',
  businessEmail: 'submitted@partnership-preview.invalid',
  organization: 'Synthetic Partnership Laboratory',
  role: 'Synthetic Operations Lead',
  website: 'https://partnership-preview.invalid',
  region: 'Synthetic Test Region',
  context: 'Synthetic browser-only partnership receipt fixture. No real organization, provider, pricing, account, procurement, clinical, or financial action is requested.',
});
const SYNTHETIC_SUMMARY = [
  'Xenios Research business inquiry',
  'Pathway: Research organizations',
  'Name: ' + SYNTHETIC_DRAFT.name,
  'Business email: ' + SYNTHETIC_DRAFT.businessEmail,
  'Organization: ' + SYNTHETIC_DRAFT.organization,
  'Role: ' + SYNTHETIC_DRAFT.role,
  'Website: ' + SYNTHETIC_DRAFT.website + '/',
  'Region / jurisdiction: ' + SYNTHETIC_DRAFT.region,
  '',
  'Business context:',
  SYNTHETIC_DRAFT.context,
  '',
  'This channel is not for clinical advice or patient, health, payment, credential, or secret information.',
].join('\n');
const SYNTHETIC_PAYLOAD = Object.freeze({
  name: SYNTHETIC_DRAFT.name,
  email: SYNTHETIC_DRAFT.businessEmail,
  persona: 'enterprise',
  subject: 'Xenios Research: Research organizations',
  message: SYNTHETIC_SUMMARY,
});
// These are non-runtime artifacts only. No arbitrary migration or executable
// application file can be admitted by a records/test-only successor.
const allowedNonRuntimePath = filename => filename.startsWith('.xenios/')
  || filename.startsWith('docs/')
  || /\.test\.[cm]?[jt]sx?$/u.test(filename)
  || filename.startsWith('supabase/verification/')
  || filename === 'supabase/MIGRATIONS.md';
const SHA256 = /^[a-f0-9]{64}$/u;
const scratchRoot = dirname(fileURLToPath(import.meta.url));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const canonicalHash = value => sha256(value.toString('utf8').replace(/\r\n/gu, '\n'));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const normalizedPath = value => resolve(value).replace(/\\/gu, '/').toLowerCase();
const fail = message => { throw new Error(message); };

function parseArgs() {
  const result = {};
  for (let index = 2; index < process.argv.length; index += 1) {
    const key = process.argv[index];
    if (key === '--help' || key === '--create-receipt') {
      if (result[key]) fail(`duplicate ${key}`);
      result[key] = true;
    } else if (['--repo', '--dist', '--receipt', '--build-result', '--port', '--source-sha', '--source-tree'].includes(key)) {
      if (result[key] !== undefined || !process.argv[index + 1] || process.argv[index + 1].startsWith('--')) fail(`invalid ${key}`);
      result[key] = process.argv[++index];
    } else fail(`unknown argument ${key}`);
  }
  return result;
}

function inventory(root) {
  const output = [];
  const visit = directory => {
    for (const name of readdirSync(directory).sort()) {
      const filename = join(directory, name);
      const stat = lstatSync(filename);
      if (stat.isSymbolicLink()) fail('distribution symlinks/reparse links are not permitted');
      if (stat.isDirectory()) visit(filename);
      else if (stat.isFile()) {
        const entry = relative(root, filename).replace(/\\/gu, '/');
        // This optional separate evidence receipt is not a production asset.
        if (entry === 'evidence-provenance.json') continue;
        const bytes = readFileSync(filename);
        output.push({ path: entry, bytes: bytes.length, sha256: sha256(bytes) });
      } else fail('distribution contains a non-regular file');
    }
  };
  visit(root);
  return output;
}

function sanitizeEnvironment() {
  // No application/provider/database/mail/payment variables survive. Do not
  // retain NODE_OPTIONS, NODE_PATH, TSX_IPC_PORT or any ambient .env loader.
  const keep = new Set(['APPDATA', 'COMMONPROGRAMFILES', 'COMMONPROGRAMFILES(X86)', 'COMSPEC', 'HOME', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'NUMBER_OF_PROCESSORS', 'PATH', 'PATHEXT', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'PROCESSOR_LEVEL', 'PROCESSOR_REVISION', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'SYSTEMDRIVE', 'SYSTEMROOT', 'TEMP', 'TMP', 'TMPDIR', 'TZ', 'USERPROFILE', 'WINDIR']);
  for (const key of Object.keys(process.env)) if (!keep.has(key.toUpperCase())) delete process.env[key];
  process.env.NODE_ENV = 'production';
  process.env.RESEARCH_PUBLIC = 'false';
  process.env.RESEARCH_INDEXABLE = 'false';
  process.env.RESEARCH_ACCESS_PASSWORD = randomBytes(32).toString('hex');
  process.env.RESEARCH_SESSION_SECRET = randomBytes(32).toString('hex');
  process.env.TSX_DISABLE_CACHE = '1';
}

function denyOutgoingNetwork() {
  // No HTTP/TCP/UDP client can leave this Node process. This is a defensive
  // harness restriction, not an OS sandbox or a claim about browser traffic.
  const blocked = () => fail('Partnership preview outgoing network is disabled');
  globalThis.fetch = async () => blocked();
  net.Socket.prototype.connect = blocked;
  net.connect = blocked;
  net.createConnection = blocked;
  tls.connect = blocked;
  http.request = blocked;
  http.get = blocked;
  https.request = blocked;
  https.get = blocked;
  dgram.Socket.prototype.send = blocked;
  syncBuiltinESMExports();
}

async function main() {
  const args = parseArgs();
  if (args['--help']) {
    console.log('Create receipt: node partnership-preview.mjs --create-receipt --repo ABS --dist ABS_DIST_ROOT --receipt ABS_NEW_JSON --build-result ABS_RUN_CHECK_RESULT_JSON');
    console.log('Both modes require --source-sha EXACT_SHA --source-tree EXACT_TREE');
    console.log('Start separately: node partnership-preview.mjs --repo ABS --dist ABS_DIST_ROOT --receipt ABS_JSON --port 0 plus both required source arguments');
    return;
  }
  const SOURCE_SHA = args['--source-sha'];
  const SOURCE_TREE = args['--source-tree'];
  const fixtureMode = 'synthetic_fixed_partnership_contact_only';
  if (SOURCE_SHA !== SOURCE_SHA_EXPECTED || SOURCE_TREE !== SOURCE_TREE_EXPECTED) fail('only the exact frozen partnership source SHA/tree is permitted');
  if (process.version !== 'v20.19.0' || normalizedPath(process.execPath) !== normalizedPath(PINNED_NODE)) fail('exact private Node v20.19.0 executable required');
  if (process.execArgv.length || process.env.NODE_OPTIONS || process.env.NODE_PATH) fail('launch plain pinned Node without preload, eval, NODE_OPTIONS or NODE_PATH');
  for (const name of ['--repo', '--dist', '--receipt']) if (!args[name] || !isAbsolute(args[name])) fail(`${name} requires an absolute path`);
  const repo = realpathSync(args['--repo']);
  const dist = realpathSync(args['--dist']);
  const receiptPath = resolve(args['--receipt']);
  if (!relative(scratchRoot, receiptPath) || relative(scratchRoot, receiptPath).startsWith('..') || isAbsolute(relative(scratchRoot, receiptPath))) fail('receipt must be a new/existing file inside this private scratch directory');
  if (normalizedPath(dist) !== normalizedPath(join(repo, 'dist'))) fail('--dist must be this checkout production dist root, not public/ or a development bundle');
  if (!existsSync(join(dist, 'public', 'index.html')) || !existsSync(join(dist, 'index.cjs'))) fail('production dist/public/index.html and dist/index.cjs required');
  sanitizeEnvironment();
  process.chdir(repo);
  const npmCli = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const npmVersion = execFileSync(process.execPath, [npmCli, '--version'], { encoding: 'utf8', windowsHide: true }).trim();
  if (npmVersion !== '10.8.2') fail('pinned adjacent npm 10.8.2 required');
  const git = (...values) => execFileSync('git', values, { cwd: repo, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const gitBytes = (...values) => execFileSync('git', values, { cwd: repo, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const currentHead = git('rev-parse', 'HEAD');
  const headTree = git('rev-parse', 'HEAD^{tree}');
  const RUNTIME_SHA256 = Object.freeze(Object.fromEntries(RUNTIME_PATHS.map(filename => [filename, canonicalHash(gitBytes('show', `${SOURCE_SHA}:${filename}`))])));
  if (git('rev-parse', `${SOURCE_SHA}^{tree}`) !== SOURCE_TREE) fail('frozen source tree mismatch');
  git('merge-base', '--is-ancestor', SOURCE_SHA, 'HEAD');
  if (git('status', '--porcelain=v2', '--untracked-files=all')) fail('preview receipt/start requires a clean checkout');
  // Source ancestry alone does not permit another runtime successor. Only
  // explicitly classified tests/verification/records may differ from source.
  const successors = git('diff', '--name-only', SOURCE_SHA, 'HEAD').split(/\r?\n/u).filter(Boolean);
  for (const filename of successors) {
    if (!allowedNonRuntimePath(filename)) fail(`unexpected post-source runtime change: ${filename}`);
  }
  const importedMiddlewareCanonicalSha256 = Object.fromEntries([
    'server/research/index.ts', 'server/research/seo/raw-http-document-policy.ts',
    'shared/research/paths.ts', 'shared/care/paths.ts',
  ].map(filename => [filename, canonicalHash(gitBytes('show', `${SOURCE_SHA}:${filename}`))]));
  const assertRuntime = () => {
    // Records-only HEAD movement is legitimate during browser evidence work.
    // Bind the actual imported/source bytes, not a mutable records pointer.
    for (const [filename, expected] of Object.entries({ ...RUNTIME_SHA256, ...importedMiddlewareCanonicalSha256 })) {
      if (canonicalHash(readFileSync(join(repo, filename))) !== expected) fail(`unexpected runtime hash: ${filename}`);
    }
  };
  for (const [filename, expected] of Object.entries(RUNTIME_SHA256)) if (canonicalHash(gitBytes('show', `${SOURCE_SHA}:${filename}`)) !== expected) fail(`frozen source blob differs: ${filename}`);
  assertRuntime();
  const lockSha256 = sha256(readFileSync(join(repo, 'package-lock.json')));
  const files = inventory(dist);
  if (!files.length) fail('empty production build');
  const inventorySha256 = sha256(JSON.stringify(files));
  const launcherSha256 = sha256(readFileSync(fileURLToPath(import.meta.url)));
  const provenance = {
    schemaVersion: 'xenios_partnership_private_preview_build_v1', fixtureMode,
    authorizationQualification: false, contactDeliveryQualification: false, syntheticContactOnly: true,
    launcherSha256, syntheticFixtureSha256: sha256(JSON.stringify(SYNTHETIC_PAYLOAD)), syntheticDelayMs: CONTACT_DELAY_MS,
    sourceSha: SOURCE_SHA, sourceTree: SOURCE_TREE, head: currentHead, headTree,
    nodeVersion: process.version, npmVersion, runtimeCanonicalSha256: RUNTIME_SHA256, importedMiddlewareCanonicalSha256,
    packageLockSha256: lockSha256, distInventorySha256: inventorySha256,
    distFileCount: files.length, fileInventory: files,
  };
  if (args['--create-receipt']) {
    if (!args['--build-result'] || !isAbsolute(args['--build-result']) || args['--port']) fail('receipt mode requires absolute --build-result and no --port');
    const resultPath = resolve(args['--build-result']);
    const resultBytes = readFileSync(resultPath);
    const result = JSON.parse(resultBytes);
    if (result.exitCode !== 0 || result.signal !== null || !/^[a-f0-9]{40}$/u.test(result.head ?? '') || result.finalHead !== result.head || result.tree !== git('rev-parse', `${result.head}^{tree}`) || result.dirtyAtStart !== '' || result.dirtyAtEnd !== '' || result.node !== process.version || result.npm !== npmVersion || normalizedPath(result.cwd ?? '') !== normalizedPath(repo) || normalizedPath(result.execPath ?? '') !== normalizedPath(process.execPath)) fail('build result is not a clean successful pinned build');
    git('merge-base', '--is-ancestor', SOURCE_SHA, result.head);
    git('merge-base', '--is-ancestor', result.head, currentHead);
    const afterBuild = git('diff', '--name-only', result.head, currentHead).split(/\r?\n/u).filter(Boolean);
    if (afterBuild.some(filename => !allowedNonRuntimePath(filename))) fail('launch HEAD differs from build HEAD outside explicitly classified non-runtime paths');
    for (const [filename, expected] of Object.entries({ ...RUNTIME_SHA256, ...importedMiddlewareCanonicalSha256 })) if (canonicalHash(gitBytes('show', `${result.head}:${filename}`)) !== expected) fail(`built runtime blob differs: ${filename}`);
    if (!Array.isArray(result.command) || result.command.length !== 4 || normalizedPath(result.command[0]) !== normalizedPath(process.execPath) || normalizedPath(result.command[1]) !== normalizedPath(npmCli) || result.command[2] !== 'run' || result.command[3] !== 'build') fail('build result must attest adjacent pinned npm run build');
    if (!Number.isFinite(Date.parse(result.startedAt)) || !Number.isFinite(Date.parse(result.finishedAt)) || Date.parse(result.finishedAt) < Date.parse(result.startedAt) || !SHA256.test(result.logSha256 ?? '')) fail('build timing/log digest missing');
    const logPath = resultPath.replace(/-result\.json$/u, '.log');
    if (logPath === resultPath || sha256(readFileSync(logPath)) !== result.logSha256) fail('successful build log bytes do not match recorded SHA256');
    // Refuse artifacts predating this build (small filesystem timestamp
    // tolerance only); the source and log bindings remain the primary proof.
    for (const filename of ['public/index.html', 'index.cjs']) if (lstatSync(join(dist, filename)).mtimeMs < Date.parse(result.startedAt) - 2000) fail('production output predates the successful build');
    const receipt = { ...provenance, buildHead: result.head, buildTree: result.tree, nonRuntimePathsAfterBuild: afterBuild, buildResultSha256: sha256(resultBytes), buildLogSha256: result.logSha256, buildCommand: result.command, builtAtUtc: result.finishedAt, recordedAtUtc: new Date().toISOString() };
    assertRuntime();
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify({ event: 'PARTNERSHIP_PREVIEW_RECEIPT_CREATED', receiptPath, receiptSha256: sha256(readFileSync(receiptPath)), launchHead: currentHead, buildHead: result.head, buildTree: result.tree, sourceSha: SOURCE_SHA, sourceTree: SOURCE_TREE, distInventorySha256: inventorySha256, distFileCount: files.length }));
    return;
  }
  if (args['--build-result'] || !/^(?:0|[1-9][0-9]{0,4})$/u.test(args['--port'] ?? '') || Number(args['--port']) > 65535 || (Number(args['--port']) !== 0 && Number(args['--port']) < 1024)) fail('launch requires explicit --port 0 or unused1024..65535; no --build-result');
  const receiptBytes = readFileSync(receiptPath);
  const receipt = JSON.parse(receiptBytes);
  for (const [key, expected] of Object.entries(provenance)) if (!same(receipt[key], expected)) fail(`build receipt mismatch: ${key}`);
  if (!SHA256.test(receipt.buildResultSha256 ?? '') || !SHA256.test(receipt.buildLogSha256 ?? '') || !Number.isFinite(Date.parse(receipt.builtAtUtc ?? ''))) fail('receipt lacks successful build evidence');
  if (!/^[a-f0-9]{40}$/u.test(receipt.buildHead ?? '') || git('rev-parse', `${receipt.buildHead}^{tree}`) !== receipt.buildTree) fail('receipt build revision is invalid');
  git('merge-base', '--is-ancestor', receipt.buildHead, currentHead);
  const actualRecordsDelta = git('diff', '--name-only', receipt.buildHead, currentHead).split(/\r?\n/u).filter(Boolean);
  if (!same(actualRecordsDelta, receipt.nonRuntimePathsAfterBuild) || actualRecordsDelta.some(filename => !allowedNonRuntimePath(filename))) fail('build/launch delta is not the exact classified non-runtime lineage');
  const snapshotParent = mkdtempSync(join(scratchRoot, 'partnership-preview-dist-'));
  const snapshot = join(snapshotParent, 'dist');
  let server;
  let cleaned = false;
  const clean = () => {
    if (cleaned) return;
    cleaned = true;
    const resolved = realpathSync(snapshotParent);
    if (dirname(resolved) !== realpathSync(scratchRoot) || !resolved.startsWith(join(realpathSync(scratchRoot), 'partnership-preview-dist-'))) fail('refusing unsafe preview cleanup target');
    rmSync(resolved, { recursive: true, force: true });
  };
  try {
    cpSync(dist, snapshot, { recursive: true, errorOnExist: true, force: false });
    if (!same(inventory(snapshot), files)) fail('isolated production snapshot differs');
    const assertSnapshot = () => { if (!same(inventory(snapshot), files)) fail('isolated production snapshot changed'); };
    const assetInventory = new Map(files.map(entry => [entry.path, entry]));
    const assertRequestedAsset = pathname => {
      const candidates = new Set(['public/index.html']);
      let decoded;
      try { decoded = decodeURIComponent(pathname); } catch { return; }
      const file = resolve(snapshot, 'public', `.${decoded}`);
      const entry = relative(snapshot, file).replace(/\\/gu, '/');
      if (assetInventory.has(entry)) candidates.add(entry);
      if (assetInventory.has(`${entry.replace(/\/$/u, '')}/index.html`)) candidates.add(`${entry.replace(/\/$/u, '')}/index.html`);
      if (pathname === '/favicon.ico') candidates.add('public/favicon.png');
      for (const name of candidates) {
        const expected = assetInventory.get(name);
        if (!expected || sha256(readFileSync(join(snapshot, name))) !== expected.sha256) fail('requested production asset changed');
      }
    };
    denyOutgoingNetwork();
    // Resolve dependencies from the verified checkout, never scratch/global.
    // No server import occurs before sanitation + network denial. In particular
    // never import server/index.ts or invoke any route registrar/worker/provider.
    const require = createRequire(join(repo, 'package.json'));
    const { register } = await import(pathToFileURL(require.resolve('tsx/esm/api')).href);
    const unregister = register({ tsconfig: join(repo, 'tsconfig.json') });
    const { researchPageGate } = await import(pathToFileURL(join(repo, 'server/research/index.ts')).href);
    const { serveStatic } = await import(pathToFileURL(join(repo, 'server/static.ts')).href);
    const express = require('express');
    const app = express();
    app.disable('x-powered-by');
    let listeningPort = null;
    const contactTimers = new Set();
    const contactCounts = { accepted: 0, completed: 0, interrupted: 0, refused: 0 };
    app.use((req, res, next) => {
      if (req.headers.host !== `127.0.0.1:${listeningPort}` || !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return res.status(403).type('text/plain').send('Loopback preview only.');
      const contactPost = req.method === 'POST' && req.originalUrl === '/api/contact';
      if (!contactPost && req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).set('Allow', 'GET, HEAD').json({ ok: false, code: 'preview_write_unavailable' });
      if (contactPost && (req.headers.origin !== `http://127.0.0.1:${listeningPort}` || req.headers.authorization
        || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(req.headers['content-type'] ?? '')
        || (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity'))) {
        contactCounts.refused++;
        return res.status(400).set('Cache-Control', 'no-store').json({ success: false, message: 'Only the exact same-origin synthetic JSON fixture is permitted.' });
      }
      try { assertRuntime(); assertRequestedAsset(req.path); } catch { return res.status(503).type('text/plain').send('Preview provenance changed.'); }
      // Explicit preview-only restriction, not a production CSP assertion.
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; worker-src 'self'");
      next();
    });
    app.use(researchPageGate);
    app.get('/api/config', (_req, res) => res.set('Cache-Control', 'no-store').json({ metaPixelId: null, turnstileSiteKey: null, calendlyUrl: '', supabaseUrl: null, supabaseAnonKey: null }));
    app.get('/api/research/me', (_req, res) => res.set('Cache-Control', 'no-store').json({ configured: true, authed: false, publicMode: false }));
    // Parse only the one synthetic endpoint, not an application-wide body.
    // Strict exact keys reject attachments, alternate addresses and free text.
    app.post('/api/contact', express.json({ type: 'application/json', limit: '4kb', strict: true, inflate: false }), (req, res) => {
      const body = req.body;
      const expectedKeys = Object.keys(SYNTHETIC_PAYLOAD).sort();
      if (!body || Array.isArray(body) || typeof body !== 'object'
        || !same(Object.keys(body).sort(), expectedKeys)
        || expectedKeys.some(key => body[key] !== SYNTHETIC_PAYLOAD[key])) {
        contactCounts.refused++;
        return res.status(400).set('Cache-Control', 'no-store').json({ success: false, message: 'This private preview accepts only the fixed synthetic fixture.' });
      }
      const ordinal = ++contactCounts.accepted;
      console.log(JSON.stringify({ event: 'PARTNERSHIP_PREVIEW_CONTACT_ACCEPTED', ordinal, fixtureSha256: provenance.syntheticFixtureSha256, synthetic: true, realDelivery: false, delayMs: CONTACT_DELAY_MS }));
      res.set('Cache-Control', 'no-store').set('X-Xenios-Preview', 'synthetic-contact-no-delivery');
      const timer = setTimeout(() => {
        contactTimers.delete(timer);
        if (res.destroyed || res.writableEnded) return;
        try { assertRuntime(); assertRequestedAsset('/partners'); } catch {
          return res.status(503).json({ success: false, message: 'Preview provenance changed.' });
        }
        contactCounts.completed++;
        console.log(JSON.stringify({ event: 'PARTNERSHIP_PREVIEW_CONTACT_COMPLETED', ordinal, synthetic: true, realDelivery: false, autoReplySent: false }));
        res.json({ success: true, autoReplySent: false, syntheticPreview: true });
      }, CONTACT_DELAY_MS);
      contactTimers.add(timer);
      res.once('close', () => {
        if (contactTimers.delete(timer)) {
          clearTimeout(timer);
          contactCounts.interrupted++;
          console.log(JSON.stringify({ event: 'PARTNERSHIP_PREVIEW_CONTACT_INTERRUPTED', ordinal, synthetic: true, realDelivery: false }));
        }
      });
    });
    app.use('/api', (_req, res) => res.status(404).set('Cache-Control', 'no-store').json({ ok: false, code: 'preview_api_unavailable' }));
    serveStatic(app, join(snapshot, 'public'));
    app.use((_error, _req, res, _next) => res.status(500).type('text/plain').send('Private preview failed.'));
    server = http.createServer(app);
    server.on('clientError', (_error, socket) => socket.destroy());
    await new Promise((complete, reject) => { server.once('error', reject); server.listen(Number(args['--port']), '127.0.0.1', complete); });
    const address = server.address();
    if (!address || typeof address === 'string' || address.address !== '127.0.0.1') fail('preview did not bind exact loopback');
    listeningPort = address.port;
    assertRuntime();
    assertSnapshot();
    console.log(JSON.stringify({
      event: 'PARTNERSHIP_PREVIEW_READY', url: `http://127.0.0.1:${listeningPort}/partners#inquiry`,
      pid: process.pid, nodeVersion: process.version, npmVersion, launchHead: currentHead, launchTree: headTree,
      buildHead: receipt.buildHead, buildTree: receipt.buildTree, sourceSha: SOURCE_SHA, sourceTree: SOURCE_TREE,
      runtimeCanonicalSha256: RUNTIME_SHA256, importedMiddlewareCanonicalSha256,
      distInventorySha256: inventorySha256, distFileCount: files.length,
      receiptSha256: sha256(receiptBytes), launcherSha256, snapshot,
      actualMiddleware: ['researchPageGate', 'serveStatic'], syntheticDraft: SYNTHETIC_DRAFT,
      suggestedUnsubmittedEdits: { businessEmail: 'unsent@partnership-preview.invalid', pathway: 'supplier_lab_fulfillment', context: 'This synthetic changed draft was never submitted and must not replace the accepted snapshot.' },
      contactDelayMs: CONTACT_DELAY_MS, syntheticFixtureSha256: provenance.syntheticFixtureSha256,
      authorizationQualification: false, contactDeliveryQualification: false,
      syntheticApis: ['GET /api/config', 'GET /api/research/me', 'POST /api/contact (fixed synthetic fixture only)'],
      restrictions: ['exact loopback host and socket', 'GET/HEAD plus one strict same-origin synthetic POST', 'disabled integrations', 'Node outgoing TCP/UDP/HTTP disabled', 'preview-only same-origin CSP', 'no attachments or arbitrary contact inputs'],
      limitations: ['not full production server composition', 'no Auth/commerce/SQL/email/payment services mounted',
        'contact success is synthetic UI state only; no inquiry is delivered or persisted', 'no real courtesy email is attempted; autoReplySent is false',
        'fixed 15-second delay is not production latency evidence', 'browser external top-level links/mail handlers are not OS-sandboxed; do not activate them',
        'use a fresh browser origin to avoid stale service-worker cache', 'full distribution inventory checked at start/end; requested assets checked before serving',
        'clean source/build lineage attested at receipt/start; selected imported/source bytes checked per request, not continuous attestation of every repository file',
        'preview CSP can suppress external subresources and is not a production CSP qualification'],
    }));
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      contactCounts.interrupted += contactTimers.size;
      for (const timer of contactTimers) clearTimeout(timer);
      contactTimers.clear();
      server.closeAllConnections();
      await new Promise(done => server.close(done));
      let finalIntegrity = 'pass';
      try { assertRuntime(); assertSnapshot(); } catch { finalIntegrity = 'failed'; process.exitCode = 1; }
      await unregister();
      clean();
      console.log(JSON.stringify({ event: 'PARTNERSHIP_PREVIEW_STOPPED', pid: process.pid, snapshotRemoved: true, finalIntegrity, syntheticContactCounts: contactCounts }));
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    process.once('exit', clean);
  } catch (error) {
    server?.closeAllConnections();
    server?.close();
    clean();
    throw error;
  }
}

main().catch(error => {
  console.error(JSON.stringify({ event: 'PARTNERSHIP_PREVIEW_REFUSED', message: error instanceof Error ? error.message : 'unknown error' }));
  process.exitCode = 1;
});


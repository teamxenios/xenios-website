// AUTHORED_UNRUN. Windows20.19/NTFS owned linked-Git fixtures ONLY.
// A fixture admission function is not Root approval, a user ACK or live authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonical, contentHash, observeOwner, createCorpusStore, resolveAuthority } from './corpus-store.mjs';
import { plan, SOURCE_PINS, SOURCE_COMMIT, REQUIRED_RECEIPTS } from './corpus-adoption.mjs';
import { publish, inspect, resume, PUBLICATION_BASE } from './corpus-adoption-publication.mjs';

const CODE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const json = x => Buffer.from(JSON.stringify(x, null, 2) + '\n');
const digest = x => contentHash(Buffer.from(canonical(x)));
const actor = 'owned-publication-fixture-worker';
function git(root, args) {
  const allowed = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'PATHEXT', 'TEMP', 'TMP'];
  const env = Object.fromEntries(allowed.filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: 'NUL', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' });
  return execFileSync('git', ['--no-optional-locks', '--no-replace-objects', '--no-lazy-fetch', '-C', root,
    '-c', 'core.hooksPath=' + path.join(root, 'empty-hooks'), '-c', 'init.templateDir=', ...args],
  { env, windowsHide: true, timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8').trim();
}
function bytePort(files) {
  const inventory = files.map(x => ({ path: x.path, bytes: x.bytes.length, sha256: contentHash(x.bytes) }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { files, inventory, sha256: digest(inventory) };
}
function ns(f) { return { platform: f.platform, hostId: f.hostId, bootId: f.bootId, fileSystem: f.fileSystem }; }
// Fixture-only diagnostic port. It cannot authorize, repair or extend a
// native observation. Re-throw the SAME refusal after attaching only the
// existing bounded receipt's diagnostic fields; never stderr text or identity.
function observeFixtureRuntime(f) {
  let receipt = null;
  try {
    return observeOwner(process.pid, f.root, { onReceipt(value) {
      const h = value.helperJson;
      receipt = { helperExitCode: value.helperExitCode, transportCode: value.transportCode,
        signal: value.signal, validation: value.validation,
        stdoutBytes: value.stdoutBytes, stderrBytes: value.stderrBytes,
        stdoutSha256: value.stdoutSha256, stderrSha256: value.stderrSha256,
        helperJson: h && typeof h === 'object' ? { code: h.code ?? null, stage: h.stage ?? null,
          exceptionType: h.exceptionType ?? null, hresult: h.hresult ?? null } : null };
    } });
  } catch (error) {
    if (receipt) { try { Object.defineProperty(error, 'ownedFixtureObserver', {
      value: { schemaVersion: 1, fixtureOnly: true, phase: 'request_for_runtime', receipt },
      enumerable: false }); } catch { /* Diagnostics never replace the refusal. */ } }
    throw error;
  }
}
function requestFor(f) {
  const at = new Date().toISOString(), session = { id: actor, tool: 'owned-synthetic-fixture', state: 'active',
    unknownHistory: ['retained', { originalBytesMatter: true }] };
  const roots = ['PROJECT_STATE.json', 'RELEASE_STATE.json', 'ROADMAP.json'].map(p => ({ path: p, bytes: json({ schemaVersion: 1, fixture: true }) }));
  const candidate = [...roots,
    { path: 'ACTIVE_TASKS.json', bytes: json({ schemaVersion: 1, tasks: [{ id: 'OWNED-PUBLICATION-TASK', state: 'ready', owner: null, paths: ['owned/a'], dependsOn: [] }] }) },
    { path: 'SESSION_REGISTRY.json', bytes: json({ schemaVersion: 1, sessions: [session] }) },
    { path: 'CODE_OWNERSHIP.json', bytes: json({ schemaVersion: 1, leases: [] }) },
    { path: 'sessions/' + actor + '.json', bytes: json(session) }];
  const original = candidate.map(x => ({ path: x.path, bytes: Buffer.from(x.bytes) }));
  original[0].bytes = Buffer.from('{"schemaVersion":1,"same":1,"same":2,"unknown":"retain"}\r\n');
  original.push({ path: 'notes/unknown.bin', bytes: Buffer.from([0, 255, 13, 10, 17]) });
  const directories = ['notes', 'sessions', 'empty-history'];
  for (const dir of directories) fs.mkdirSync(path.join(f.legacy, dir));
  for (const x of original) fs.writeFileSync(path.join(f.legacy, x.path), x.bytes);
  const preimage = { ...bytePort(original), directories };
  const sources = bytePort(Object.keys(SOURCE_PINS).map(p => ({ path: p, bytes: fs.readFileSync(path.join(CODE_ROOT, p)) })));
  const implementation = bytePort(['corpus-adoption.mjs', 'corpus-adoption.node-test.mjs'].map(p => ({
    path: 'scripts/agentic/' + p, bytes: fs.readFileSync(path.join(CODE_ROOT, 'scripts/agentic', p)) })));
  const target = bytePort(candidate), facts = observeFixtureRuntime(f), runtimeAt = new Date().toISOString();
  const req = { schemaVersion: 1, preimage, candidate: target,
    sources: { ...sources, baseCommit: SOURCE_COMMIT },
    implementation: { ...implementation, baseCommit: SOURCE_COMMIT, commit: PUBLICATION_BASE },
    authorityId: f.authorityId, targets: { repoRoot: f.main, gitCommonDirectory: f.common,
      legacyRoot: f.legacy, futureRoot: f.future, futureParent: f.root, bindingPath: f.binding,
      futureState: 'absent', bindingState: 'absent' },
    mappings: original.map(x => ({ original: { path: x.path, pointer: '', sha256: contentHash(x.bytes) },
      result: target.files.some(y => y.path === x.path) ? { path: x.path, pointer: '', sha256: contentHash(target.files.find(y => y.path === x.path).bytes) } : null,
      disposition: target.files.some(y => y.path === x.path) ? 'reviewed_afterimage' : 'archive_only', owner: 'owned-fixture-root', receiptId: 'fixture-mapping_decisions' })),
    writerInventory: [{ id: 'fixture-writer', actor, kind: 'synthetic-only-not-native-pickup', location: f.linked }],
    barrier: { id: f.barrierId, eventId: 'owned-fixture-no-user-ack', cutoff: runtimeAt },
    runtime: { nodeVersion: process.versions.node, namespace: ns(facts), owner: { pid: facts.pid, found: facts.found, birthId: facts.birthId },
      capturedAt: runtimeAt, localFixedDrive: true, producer: 'corpus-store.observeOwner', gitCommonDirectory: f.common,
      physicalPaths: [f.main, f.common, f.legacy, f.root].map(p => ({ path: p, realPath: p, noReparseOrAlias: true })) },
    requirements: Object.fromEntries(REQUIRED_RECEIPTS.map(k => [k, 'fixture-' + k])), receipts: [] };
  const first = plan(req), intentDigest = first.manifest.intentDigest;
  const receipts = REQUIRED_RECEIPTS.map(kind => ({ schemaVersion: 1, id: 'fixture-' + kind, kind, intentDigest, syntheticOnly: true }));
  Object.assign(receipts.find(x => x.kind === 'mapping_decisions'), { decidingOwners: ['owned-fixture-root'],
    resolutions: first.manifest.legacyFindings.map(x => ({ code: x.code, file: x.file, pointer: x.pointer })) });
  Object.assign(receipts.find(x => x.kind === 'native_actor_map'), { actorMappings: [{ session: actor,
    nativeActor: 'synthetic-fixture-not-authenticated-client', receiptReference: 'owned-fixture-only' }] });
  Object.assign(receipts.find(x => x.kind === 'handoff_acceptance'), { taskIds: [] });
  Object.assign(receipts.find(x => x.kind === 'writer_barrier'), { barrierId: f.barrierId, eventId: req.barrier.eventId,
    cutoff: runtimeAt, writers: [{ id: 'fixture-writer', actor, state: 'held_no_write', evidenceReceiptId: 'fixture-ack' }] });
  receipts.push({ schemaVersion: 1, id: 'fixture-ack', kind: 'writer_ack', intentDigest, actor,
    barrierId: f.barrierId, eventId: req.barrier.eventId, cutoff: runtimeAt, observedAt: runtimeAt,
    preimageSha256: preimage.sha256, disposition: 'held_no_write', supportedChannelReceipt: 'owned-fixture-no-user-ack' });
  req.receipts = receipts.map(x => { const b = json(x); return { id: x.id, kind: x.kind, bytes: b, sha256: contentHash(b) }; });
  const result = plan(req); assert.deepEqual(result.manifest.findings, [], 'Owned request must pass actual unchanged planner');
  return result;
}
function fixture(t) {
  assert.equal(process.platform, 'win32', 'Qualification requires actual native Windows; never skip to imply NTFS coverage.');
  assert.equal(process.versions.node, '20.19.0');
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'xenios-publication-owned-')));
  const nonce = randomUUID(), main = path.join(root, 'main'), linked = path.join(root, 'linked');
  const f = { root, nonce, main, linked, legacy: path.join(root, 'legacy'), future: path.join(root, 'future'),
    authorityId: randomUUID(), barrierId: randomUUID(), publicationId: randomUUID(), children: [] };
  fs.writeFileSync(path.join(root, 'fixture-owner.json'), json({ kind: 'owned-publication-fixture-only', root, nonce }));
  fs.writeFileSync(path.join(root, 'writer-window.txt'), 'open'); fs.mkdirSync(main); fs.mkdirSync(f.legacy);
  git(main, ['init', '--initial-branch=owned-main']); fs.writeFileSync(path.join(main, 'synthetic-only.json'), json({ nonce }));
  git(main, ['add', 'synthetic-only.json']); git(main, ['-c', 'user.name=Owned Synthetic Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '--no-gpg-sign', '-m', 'Owned fixture only']); git(main, ['worktree', 'add', '-b', 'owned-linked', linked]);
  f.common = fs.realpathSync.native(git(main, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  assert.equal(fs.realpathSync.native(git(linked, ['rev-parse', '--path-format=absolute', '--git-common-dir'])), f.common);
  f.binding = path.join(f.common, 'xenios-coordination', 'authority-binding.json');
  f.sourceCommit = process.env.XR_PUBLICATION_SOURCE ?? git(CODE_ROOT, ['rev-parse', 'HEAD']);
  f.plan = requestFor(f);
  t.after(async () => {
    for (const c of f.children) if (!c.exited) c.child.kill('SIGKILL');
    await Promise.all(f.children.map(c => c.done));
    const marker = JSON.parse(fs.readFileSync(path.join(root, 'fixture-owner.json')));
    assert.equal(marker.nonce, nonce); assert.equal(marker.root, root);
    assert(f.children.every(c => c.exited), 'Every owned child handle must close before fixture release.');
    // Retain interrupted/foreign fixture states and raw bytes, never recursively
    // delete a path or silently erase failing evidence.
    fs.writeFileSync(path.join(root, 'fixture-completion.json'), json({ root, nonce, fixtureOnly: true,
      allOwnedChildrenExited: true, children: f.children.map(c => ({ pid: c.child.pid, birth: c.birth ?? null,
        exitCode: c.exitCode, signal: c.signal, exited: c.exited })), retained: true }));
  });
  return f;
}
function options(f, extra = {}) {
  const executionSource = extra.sourceCommit ?? f.sourceCommit;
  return { sourceCommit: f.sourceCommit, publicationId: f.publicationId,
    admit(subject) {
      assert.equal(subject.planDigest, f.plan.digest); assert.equal(subject.sourceCommit, executionSource);
      assert.equal(subject.targets.futureRoot, f.future); assert.equal(subject.targets.gitCommonDirectory, f.common);
      const marker = JSON.parse(fs.readFileSync(path.join(f.root, 'fixture-owner.json')));
      assert.equal(marker.nonce, f.nonce);
      return { scope: 'owned-fixture-only', recheck() {
        if (fs.readFileSync(path.join(f.root, 'writer-window.txt'), 'utf8') !== 'open')
          throw Object.assign(new Error('fixture_window_closed'), { code: 'fixture_window_closed' });
      } };
    }, ...extra };
}
function interrupt(phase) { return value => { if (value.phase === phase) throw Object.assign(new Error('fixture interruption'), { code: 'fixture_interrupted' }); }; }
const rejects = (promise, expected) => assert.rejects(promise, e => e.code === expected);
const bindingAbsent = f => assert.equal(fs.existsSync(f.binding), false);
function pack(x) {
  if (Buffer.isBuffer(x)) return { rawOwnedFixtureBytes: x.toString('base64') };
  if (Array.isArray(x)) return x.map(pack);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, pack(v)]));
  return x;
}
function unpack(x) {
  if (x && typeof x === 'object' && Object.keys(x).length === 1 && typeof x.rawOwnedFixtureBytes === 'string') return Buffer.from(x.rawOwnedFixtureBytes, 'base64');
  if (Array.isArray(x)) return x.map(unpack);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, unpack(v)]));
  return x;
}
async function childPublisher(f, { stopAt = null, publicationId = f.publicationId } = {}) {
  const dataFile = path.join(f.root, 'child-input-' + randomUUID() + '.json');
  fs.writeFileSync(dataFile, json(pack({ root: f.root, nonce: f.nonce, main: f.main, common: f.common, future: f.future,
    publicationId, sourceCommit: f.sourceCommit, retainedRequest: f.plan.retainedRequest, stopAt })));
  const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'PATHEXT', 'TEMP', 'TMP'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
  const child = spawn(process.execPath, [SELF, '--owned-publication-child', dataFile],
    { cwd: f.main, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const c = { child, exited: false, outputBytes: 0, messages: [] }; f.children.push(c);
  c.done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 130000);
    child.once('error', e => { clearTimeout(timer); reject(e); });
    child.once('close', (exitCode, signal) => { clearTimeout(timer); Object.assign(c, { exited: true, exitCode, signal }); resolve(c); });
  });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', b => { c.outputBytes += b.length; if (c.outputBytes > 131072) child.kill('SIGKILL'); });
  child.on('message', x => { if (c.messages.length < 32) { c.messages.push(x); if (x.kind === 'ready') c.birth = x.facts.birthId; } });
  c.wait = async kind => {
    const until = Date.now() + 30000;
    while (Date.now() < until) {
      const found = c.messages.find(x => x.kind === kind); if (found) return found;
      assert(!c.exited, 'Owned child exited before ' + kind); await new Promise(r => setTimeout(r, 10));
    }
    assert.fail('Owned child did not report ' + kind);
  };
  await c.wait('ready'); return c;
}
async function childMain(file) {
  const f = unpack(JSON.parse(fs.readFileSync(file))); f.plan = plan(f.retainedRequest);
  const marker = JSON.parse(fs.readFileSync(path.join(f.root, 'fixture-owner.json')));
  assert.equal(marker.nonce, f.nonce); assert.equal(marker.root, fs.realpathSync.native(f.root));
  const facts = observeOwner(process.pid, f.root); process.send({ kind: 'ready', facts });
  await new Promise(resolve => process.once('message', x => { assert.equal(x.kind, 'go'); resolve(); }));
  try {
    const value = await publish(f.plan, options(f, { onProgress(x) {
      if (x.phase === f.stopAt) { process.send({ kind: 'stopped_at_owned_phase', phase: x.phase }); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000); }
    } }));
    process.send({ kind: 'result', ok: true, value }); process.exitCode = 0;
  } catch (e) { process.send({ kind: 'result', ok: false, code: e.code }); process.exitCode = 1; }
  process.disconnect();
}

if (process.argv[2] === '--owned-publication-child') {
  await childMain(process.argv[3]);
} else {
  test('absent or JSON-only admission refuses before any filesystem mutation', async t => {
    let mutations = 0;
    for (const name of ['mkdirSync', 'openSync', 'writeFileSync', 'linkSync', 'renameSync', 'unlinkSync', 'rmSync'])
      t.mock.method(fs, name, () => { mutations++; throw new Error('unexpected mutation'); });
    await rejects(publish({}, {}), 'trusted_action_port_required');
    await rejects(publish({}, { admit: true }), 'trusted_action_port_required');
    assert.equal(mutations, 0);
  });
  test('copied approved flags and ACK bytes are not an executable trusted action capability', async t => {
    const f = fixture(t); let calls = 0;
    const open = fs.openSync; t.mock.method(fs, 'openSync', (...args) => { if (args[1] === 'wx') calls++; return open(...args); });
    await rejects(publish(f.plan, options(f, { admit: () => ({ approved: true, authenticated: true, ack: f.plan.retainedRequest.receipts }) })), 'trusted_action_capability_required');
    assert.equal(calls, 0); bindingAbsent(f);
  });
  test('actual linked-Git NTFS publication selects exactly one authority and both worktrees read it', { timeout: 180000 }, async t => {
    const f = fixture(t), result = await publish(f.plan, options(f));
    assert.equal(result.state, 'INSTALLED_TRUSTED_READ_VERIFIED'); assert.equal(result.admissionPortScope, 'owned-fixture-only');
    assert.equal(result.externalApprovalVerified, false); assert.equal(result.liveAdoptionVerified, false);
    const a = resolveAuthority(f.main), b = resolveAuthority(f.linked); assert.equal(a.bindingHash, b.bindingHash);
    assert.equal(a.binding.authorityId, f.authorityId); assert.equal(a.root, f.future);
    const read = await createCorpusStore(f.linked).read(v => v.readJson('SESSION_REGISTRY.json'));
    assert.equal(read.coordination.revision, 0); assert.equal(read.result.sessions[0].id, actor);
    const linkedStat = fs.statSync(f.binding), preparedStat = fs.statSync(path.join(f.common, 'xenios-coordination', '.adoption-binding-' + f.publicationId + '.json'));
    assert.equal(linkedStat.ino, preparedStat.ino); assert.equal(linkedStat.dev, preparedStat.dev); assert(linkedStat.nlink >= 2);
  });
  test('raw CRLF, duplicate keys, unknown binary history and empty archive directories are conserved', { timeout: 180000 }, async t => {
    const f = fixture(t); await publish(f.plan, options(f));
    const archive = path.join(f.common, 'xenios-coordination', 'adoption-' + f.publicationId, 'archive');
    for (const x of f.plan.retainedRequest.preimage.files) {
      assert(fs.readFileSync(path.join(archive, x.path)).equals(x.bytes)); assert(fs.readFileSync(path.join(f.legacy, x.path)).equals(x.bytes));
    }
    assert(fs.statSync(path.join(archive, 'empty-history')).isDirectory());
    assert.equal(fs.existsSync(path.join(f.future, 'notes/unknown.bin')), false);
  });
  test('two actual publisher processes compete and exactly one exclusive installation wins', { timeout: 240000 }, async t => {
    const f = fixture(t), a = await childPublisher(f), b = await childPublisher(f, { publicationId: randomUUID() });
    a.child.send({ kind: 'go' }); b.child.send({ kind: 'go' }); await Promise.all([a.done, b.done]);
    const results = [a, b].map(c => c.messages.find(x => x.kind === 'result')); assert(results.every(Boolean));
    assert.equal(results.filter(x => x.ok).length, 1); assert.equal(results.filter(x => !x.ok).length, 1);
    const read = await createCorpusStore(f.linked).read(v => v.list('')); assert.equal(read.coordination.revision, 0);
  });
  test('actual preimage drift refuses before installation custody and never changes the live legacy bytes', { timeout: 180000 }, async t => {
    const f = fixture(t), file = path.join(f.legacy, 'PROJECT_STATE.json'), changed = Buffer.from('changed after approval\r\n'); fs.writeFileSync(file, changed);
    await rejects(publish(f.plan, options(f)), 'raw_preimage_byte_drift'); bindingAbsent(f);
    assert(fs.readFileSync(file).equals(changed)); assert.equal(fs.existsSync(path.join(f.common, 'xenios-coordination')), false);
  });
  test('a late writer closes the actual fixture admission window before binding publication', { timeout: 180000 }, async t => {
    const f = fixture(t);
    await rejects(publish(f.plan, options(f, { onProgress(x) { if (x.phase === 'image_verified') fs.writeFileSync(path.join(f.root, 'writer-window.txt'), 'late writer'); } })), 'fixture_window_closed');
    bindingAbsent(f); assert.equal(inspect(f.plan, options(f)).phase, 'prepared_unpublished');
  });
  test('foreign binding bytes are untouched and never replaced by a rename or link retry', { timeout: 180000 }, async t => {
    const f = fixture(t); fs.mkdirSync(path.dirname(f.binding)); const foreign = json({ authorityId: randomUUID(), foreign: true }); fs.writeFileSync(f.binding, foreign);
    await rejects(publish(f.plan, options(f)), 'foreign_or_unknown_binding'); assert(fs.readFileSync(f.binding).equals(foreign));
  });
  test('existing future entries without an owned identity remain preserved and cannot be adopted by resume', { timeout: 180000 }, async t => {
    const f = fixture(t);
    await rejects(publish(f.plan, options(f, { onProgress(x) { if (x.phase === 'archive_verified') { fs.mkdirSync(f.future); fs.writeFileSync(path.join(f.future, 'foreign.txt'), 'preserve'); } } })), 'EEXIST');
    await rejects(resume(f.plan, options(f)), 'future_creation_ownership_unknown');
    assert.equal(fs.readFileSync(path.join(f.future, 'foreign.txt'), 'utf8'), 'preserve'); bindingAbsent(f);
  });
  test('read-only inspection of prepared state acquires no mutex and performs no writes', { timeout: 180000 }, async t => {
    const f = fixture(t); await rejects(publish(f.plan, options(f, { onProgress: interrupt('binding_prepared') })), 'fixture_interrupted');
    let writes = 0;
    try {
    for (const name of ['mkdirSync', 'writeFileSync', 'linkSync', 'renameSync', 'unlinkSync']) t.mock.method(fs, name, () => { writes++; throw new Error('inspection mutated'); });
    const value = inspect(f.plan, options(f)); assert.equal(value.phase, 'prepared_unpublished'); assert.equal(value.trustedStoreReadVerified, false); assert.equal(writes, 0);
    } finally { t.mock.restoreAll(); }
  });
  test('an interrupted complete image resumes under renewed admission without rewriting HEAD', { timeout: 180000 }, async t => {
    const f = fixture(t); await rejects(publish(f.plan, options(f, { onProgress: interrupt('image_verified') })), 'fixture_interrupted');
    const head = path.join(f.future, '.coordination/HEAD.json'), before = fs.statSync(head), raw = fs.readFileSync(head);
    const value = await resume(f.plan, options(f)); assert.equal(value.trustedStoreReadVerified, true);
    assert.equal(fs.statSync(head).ino, before.ino); assert(fs.readFileSync(head).equals(raw));
  });
  test('a binding link committed before a thrown outcome is inspected then resumed without relinking', { timeout: 180000 }, async t => {
    const f = fixture(t), link = fs.linkSync; let injected = false;
    t.mock.method(fs, 'linkSync', (...args) => { const r = link(...args); if (args[1] === f.binding && !injected) { injected = true; throw Object.assign(new Error('lost result'), { code: 'fixture_outcome_lost' }); } return r; });
    await rejects(publish(f.plan, options(f)), 'fixture_outcome_lost'); t.mock.restoreAll();
    assert.equal(inspect(f.plan, options(f)).phase, 'binding_observed_requires_trusted_read');
    let links = 0; t.mock.method(fs, 'linkSync', (...args) => { links++; return link(...args); });
    assert.equal((await resume(f.plan, options(f))).trustedStoreReadVerified, true); assert.equal(links, 0);
  });
  test('partial genesis bytes are preserved and neither publication nor resume repairs them', { timeout: 180000 }, async t => {
    const f = fixture(t), open = fs.openSync, write = fs.writeFileSync, head = path.join(f.future, '.coordination/HEAD.json'); let fd = null;
    t.mock.method(fs, 'openSync', (...args) => { const value = open(...args); if (args[0] === head && args[1] === 'wx') fd = value; return value; });
    t.mock.method(fs, 'writeFileSync', (...args) => { if (args[0] === fd) { write(fd, Buffer.from('{"pro')); throw Object.assign(new Error('partial write'), { code: 'fixture_partial_write' }); } return write(...args); });
    await rejects(publish(f.plan, options(f)), 'fixture_partial_write'); t.mock.restoreAll();
    const partial = fs.readFileSync(head); await rejects(resume(f.plan, options(f)), 'publication_record_invalid');
    assert(fs.readFileSync(head).equals(partial)); bindingAbsent(f);
  });
  test('missing HEAD after its reserved genesis is never recreated', { timeout: 180000 }, async t => {
    const f = fixture(t); await rejects(publish(f.plan, options(f, { onProgress: interrupt('image_verified') })), 'fixture_interrupted');
    const head = path.join(f.future, '.coordination/HEAD.json'); fs.unlinkSync(head);
    await rejects(resume(f.plan, options(f)), 'genesis_outcome_unknown_preserved'); assert.equal(fs.existsSync(head), false); bindingAbsent(f);
  });
  test('a genuinely stopped installation process resumes only after actual PID absence in the same native boot', { timeout: 240000 }, async t => {
    const f = fixture(t), c = await childPublisher(f, { stopAt: 'image_verified' }); c.child.send({ kind: 'go' });
    await c.wait('stopped_at_owned_phase'); assert(typeof c.birth === 'string');
    await rejects(resume(f.plan, options(f, { recoveryId: randomUUID() })), 'installation_owner_not_proven_absent');
    c.child.kill('SIGKILL'); await c.done; assert(c.exited);
    const old = observeOwner(c.child.pid, f.root); assert.equal(old.found, false);
    const result = await resume(f.plan, options(f, { recoveryId: randomUUID() })); assert.equal(result.trustedStoreReadVerified, true);
    const lock = path.join(f.common, 'xenios-coordination', 'adoption-installation-lock');
    assert.deepEqual(fs.readdirSync(lock).sort(), ['owner-0000.json', 'owner-0001.json']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(lock, 'owner-0000.json'))).birthId, c.birth);
  });
  test('an advanced actual coordinator transaction is preserved and cannot be reset to revision zero', { timeout: 180000 }, async t => {
    const f = fixture(t); await publish(f.plan, options(f));
    await createCorpusStore(f.linked).mutate({ actor, command: 'owned-fixture-update', operationId: randomUUID(), expectedRevision: 0, input: { syntheticOnly: true } },
      draft => { draft.writeJson('PROJECT_STATE.json', { schemaVersion: 1, advanced: true }); return { fixture: true }; });
    const head = path.join(f.future, '.coordination/HEAD.json'), raw = fs.readFileSync(head), binding = fs.readFileSync(f.binding);
    const observation = inspect(f.plan, options(f)); assert.equal(observation.phase, 'held_for_explicit_recovery');
    assert.equal(observation.findings[0].code, 'advanced_authority_requires_existing_coordinator');
    await rejects(resume(f.plan, options(f)), 'advanced_authority_requires_existing_coordinator');
    assert(fs.readFileSync(head).equals(raw)); assert(fs.readFileSync(f.binding).equals(binding));
  });
  test('a wrong immutable publication source and invalid budget refuse without creating custody', { timeout: 180000 }, async t => {
    const f = fixture(t); await rejects(publish(f.plan, options(f, { sourceCommit: PUBLICATION_BASE })), 'publication_source_parent_mismatch');
    await rejects(publish(f.plan, options(f, { publicationId: null })), 'publication_identity_and_source_required');
    await rejects(publish(f.plan, options(f, { budgetMs: 120001 })), 'invalid_publication_budget');
    await rejects(publish(f.plan, options(f, { budgetMs: 1 })), 'publication_deadline');
    assert.equal(fs.existsSync(path.join(f.common, 'xenios-coordination')), false); bindingAbsent(f);
  });
  test('an actual NTFS directory junction is refused without touching its foreign target', { timeout: 180000 }, async t => {
    const f = fixture(t), target = path.join(f.root, 'foreign-junction-target'); fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'keep.txt'), 'keep'); fs.symlinkSync(target, f.future, 'junction');
    await rejects(publish(f.plan, options(f)), 'physical_alias_or_link');
    assert.equal(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8'), 'keep'); bindingAbsent(f);
    assert.equal(fs.existsSync(path.join(f.common, 'xenios-coordination')), false);
  });
  test('prepared binding drift is rejected before an exclusive binding link is created', { timeout: 180000 }, async t => {
    const f = fixture(t), prepared = path.join(f.common, 'xenios-coordination', '.adoption-binding-' + f.publicationId + '.json');
    await rejects(publish(f.plan, options(f, { onProgress(x) { if (x.phase === 'binding_prepared') fs.writeFileSync(prepared, json({ foreign: true })); } })), 'prepared_binding_drift');
    bindingAbsent(f); assert.deepEqual(JSON.parse(fs.readFileSync(prepared)), { foreign: true });
  });
  test('a real oversized preimage file refuses before copying or installation custody', { timeout: 180000 }, async t => {
    const f = fixture(t), file = path.join(f.legacy, 'notes/unknown.bin');
    fs.writeFileSync(file, Buffer.alloc(5 * 1024 * 1024 + 1, 17));
    await rejects(publish(f.plan, options(f)), 'invalid_bounded_file'); bindingAbsent(f);
    assert.equal(fs.statSync(file).size, 5 * 1024 * 1024 + 1);
    assert.equal(fs.existsSync(path.join(f.common, 'xenios-coordination')), false);
  });
  // These invoke the ACTUAL embedded producer primitive, never a copied parser.
  function ownedPrimitiveFixture(t) {
    assert.equal(process.platform, 'win32'); assert.equal(process.versions.node, '20.19.0');
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'xenios-fixed-json-owned-')));
    const marker = path.join(root, 'fixture-owner.json'), identity = json({ root, nonce: randomUUID(), fixtureOnly: true });
    fs.writeFileSync(marker, identity, { flag: 'wx' });
    t.after(() => {
      assert.equal(fs.lstatSync(root).isSymbolicLink(), false);
      assert.equal(fs.realpathSync.native(root), root); assert(fs.readFileSync(marker).equals(identity));
      fs.rmSync(root, { recursive: true, force: false });
    });
    const source = fs.readFileSync(path.join(CODE_ROOT, 'scripts/agentic/corpus-adoption-publication.mjs'), 'utf8');
    const match = /const REPARSE_SCRIPT = (\[[\s\S]*?\])\.join\(';'\);/.exec(source);
    assert(match, 'Actual fixed primitive must remain a literal string array');
    const pieces = JSON.parse(match[1]); assert(Array.isArray(pieces) && pieces.every(x => typeof x === 'string'));
    const script = pieces.join(';');
    function invoke(input, prefix = '') {
      return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', prefix + script],
        { windowsHide: true, timeout: 8000, maxBuffer: 64000, input, stdio: ['pipe', 'pipe', 'pipe'] });
    }
    function refuses(input) {
      let observed = null;
      try { invoke(input); } catch (error) {
        observed = { status: error.status, signal: error.signal ?? null, stdoutBytes: Buffer.from(error.stdout ?? '').length };
      }
      assert(observed && Number.isInteger(observed.status) && observed.status !== 0 && observed.signal === null,
        'Refusal must finish nonzero within the unchanged8s bound; timeout or startup failure is not proof');
      assert.equal(observed.stdoutBytes, 0, 'A refused input must emit no success protocol');
    }
    return { root, invoke, refuses };
  }
  test('actual typed Utility command bypasses shadow functions without warming discovery', { timeout: 60000 }, t => {
    const f = ownedPrimitiveFixture(t);
    const shadow = "function ConvertFrom-Json {throw 'untrusted_json_shadow'};function Get-Command {throw 'unexpected_lookup'};function Import-Module {throw 'unexpected_import'};";
    const observed = JSON.parse(f.invoke(json([f.root]), shadow).toString('utf8'));
    assert.deepEqual(observed, { schemaVersion: 1, noReparse: true, checked: 1 });
  });
  test('actual strict UTF8 probe preserves Unicode identity and refuses its NTFS junction', { timeout: 60000 }, t => {
    const f = ownedPrimitiveFixture(t), real = path.join(f.root, 'unicode-\u03a9-\ud83d\ude00'), junction = path.join(f.root, 'junction-\u03a9-\ud83d\ude00');
    fs.mkdirSync(real); fs.writeFileSync(path.join(real, 'keep.txt'), 'preserve');
    assert.deepEqual(JSON.parse(f.invoke(json([real])).toString('utf8')), { schemaVersion: 1, noReparse: true, checked: 1 });
    fs.symlinkSync(real, junction, 'junction'); f.refuses(json([junction]));
    assert.equal(fs.readFileSync(path.join(real, 'keep.txt'), 'utf8'), 'preserve');
  });
  test('actual strict UTF8 input and malformed JSON refuse without a success protocol', { timeout: 60000 }, t => {
    const f = ownedPrimitiveFixture(t), valid = json([path.join(f.root, 'UTF8_MARKER')]);
    const marker = Buffer.from('UTF8_MARKER'), at = valid.indexOf(marker); assert(at >= 0);
    // The surrounding JSON remains syntactically valid under replacement/ANSI
    // decoding. Only a strict decoder rejects these malformed UTF8 bytes.
    f.refuses(Buffer.concat([valid.subarray(0, at), Buffer.from([0xc3, 0x28]), valid.subarray(at + marker.length)]));
    f.refuses(Buffer.from('[', 'utf8'));
  });

}

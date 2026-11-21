// Authored only. Run after independent review in Root's isolated Node20.19 slot.
// Synthetic byte ports are NOT a native namespace, writer ACK or live adoption.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { plan, inspectPrepared, SOURCE_PINS, SOURCE_COMMIT, REQUIRED_RECEIPTS, LIMITS } from './corpus-adoption.mjs';
import { canonical, validateCorpus, initialHead } from './corpus-store.mjs';

const sha = b => createHash('sha256').update(b).digest('hex');
const digest = x => sha(Buffer.from(canonical(x)));
const bytes = x => Buffer.from(JSON.stringify(x, null, 2) + '\n');
const A = 'synthetic-worker-aa', T = 'SYNTHETIC-TASK-AA';
const AUTH = '11111111-1111-4111-8111-111111111111', BARRIER = '22222222-2222-4222-8222-222222222222';
const BOOT = '2026-11-18T00:00:00.000Z', AT = '2026-11-18T01:00:00.000Z';
// Known source text is compared in its committed LF representation, matching
// the existing source-receipt convention. Corpus/receipt/archive bytes are
// NEVER normalized. Actual loaded-code/Git provenance still belongs to Root.
const sourceBytes = Object.keys(SOURCE_PINS).map(path => ({ path,
  bytes: Buffer.from(fs.readFileSync(new URL('../../' + path, import.meta.url), 'utf8').replaceAll('\r\n', '\n')) }));
const implementationBytes = ['corpus-adoption.mjs', 'corpus-adoption.node-test.mjs'].map(leaf => ({
  path: 'scripts/agentic/' + leaf,
  bytes: Buffer.from(fs.readFileSync(new URL('./' + leaf, import.meta.url), 'utf8').replaceAll('\r\n', '\n')) }));
function entries() {
  const session = { id: A, tool: 'synthetic', state: 'paused', branch: 'fixture',
    unknownHistory: ['never normalize this', { at: BOOT }] };
  return [
    { path: 'PROJECT_STATE.json', bytes: Buffer.from('{"schemaVersion":1,"unknown":"retained"}\r\n') },
    ...['RELEASE_STATE.json', 'ROADMAP.json'].map(path => ({ path, bytes: bytes({ schemaVersion: 1 }) })),
    { path: 'ACTIVE_TASKS.json', bytes: bytes({ schemaVersion: 1,
      tasks: [{ id: T, state: 'ready', owner: null, paths: ['synthetic/a.txt'], dependsOn: [] }] }) },
    { path: 'SESSION_REGISTRY.json', bytes: bytes({ schemaVersion: 1, sessions: [session] }) },
    { path: 'CODE_OWNERSHIP.json', bytes: bytes({ schemaVersion: 1, leases: [] }) },
    { path: 'sessions/' + A + '.json', bytes: bytes(session) },
  ];
}
function port(files) {
  const inventory = files.map(x => ({ path: x.path, bytes: x.bytes.length, sha256: sha(x.bytes) }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { files, inventory, sha256: digest(inventory) };
}
function baseRequest() {
  const preimage = port(entries()), candidate = port(entries());
  const targets = { repoRoot: 'C:\\synthetic\\repo', gitCommonDirectory: 'C:\\synthetic\\common',
    legacyRoot: 'C:\\synthetic\\legacy', futureRoot: 'C:\\synthetic\\future', futureParent: 'C:\\synthetic',
    bindingPath: 'C:\\synthetic\\common\\xenios-coordination\\authority-binding.json', futureState: 'absent', bindingState: 'absent' };
  const namespace = { platform: 'win32', hostId: 'SYNTHETIC-NOT-A-HOST', bootId: BOOT, fileSystem: 'NTFS' };
  return { schemaVersion: 1, preimage, candidate,
    sources: { ...port(sourceBytes.map(x => ({ ...x, bytes: Buffer.from(x.bytes) }))), baseCommit: SOURCE_COMMIT },
    implementation: { ...port(implementationBytes.map(x => ({ ...x, bytes: Buffer.from(x.bytes) }))),
      baseCommit: SOURCE_COMMIT, commit: 'a'.repeat(40) },
    targets, authorityId: AUTH,
    mappings: preimage.files.map(x => ({ original: { path: x.path, pointer: '', sha256: sha(x.bytes) },
      result: { path: x.path, pointer: '', sha256: sha(candidate.files.find(y => y.path === x.path).bytes) },
      owner: 'synthetic-root', receiptId: 'receipt-mapping_decisions' })),
    writerInventory: [{ id: 'writer-aa', actor: A, kind: 'native-codex', location: targets.repoRoot }],
    barrier: { id: BARRIER, eventId: 'synthetic-event', cutoff: AT },
    runtime: { nodeVersion: '20.19.0', namespace, owner: { pid: 123, birthId: '2026-11-18T00:30:00.000Z', found: true },
      capturedAt: AT, localFixedDrive: true, producer: 'corpus-store.observeOwner', gitCommonDirectory: targets.gitCommonDirectory,
      physicalPaths: [targets.repoRoot, targets.gitCommonDirectory, targets.legacyRoot, targets.futureParent]
        .map(path => ({ path, realPath: path, noReparseOrAlias: true })) },
    requirements: Object.fromEntries(REQUIRED_RECEIPTS.map(k => [k, 'receipt-' + k])), receipts: [] };
}
function receipt(body) { const raw = bytes(body); return { id: body.id, kind: body.kind, bytes: raw, sha256: sha(raw) }; }
function complete(request = baseRequest()) {
  const initial = plan(request), intentDigest = initial.manifest.intentDigest;
  const bodies = REQUIRED_RECEIPTS.map(kind => ({ schemaVersion: 1, id: 'receipt-' + kind, kind, intentDigest,
    syntheticOnly: true }));
  Object.assign(bodies.find(x => x.kind === 'mapping_decisions'), { decidingOwners: ['synthetic-root'],
    resolutions: [] });
  Object.assign(bodies.find(x => x.kind === 'native_actor_map'), { actorMappings: [{ session: A,
    nativeActor: 'synthetic-not-an-authenticated-seat', receiptReference: 'synthetic-channel-event' }] });
  Object.assign(bodies.find(x => x.kind === 'handoff_acceptance'), { taskIds: [] });
  Object.assign(bodies.find(x => x.kind === 'writer_barrier'), { barrierId: BARRIER, eventId: 'synthetic-event', cutoff: AT,
    writers: [{ id: 'writer-aa', actor: A, state: 'held_no_write', evidenceReceiptId: 'ack-aa' }] });
  bodies.push({ schemaVersion: 1, id: 'ack-aa', kind: 'writer_ack', intentDigest, actor: A,
    barrierId: BARRIER, eventId: 'synthetic-event', cutoff: AT, observedAt: AT,
    preimageSha256: request.preimage.sha256, disposition: 'held_no_write', supportedChannelReceipt: 'synthetic-channel-event' });
  request.receipts = bodies.map(receipt); return request;
}
function alterReceipt(request, kind, callback) {
  const index = request.receipts.findIndex(x => x.kind === kind), body = JSON.parse(request.receipts[index].bytes);
  callback(body); request.receipts[index] = receipt(body); return request;
}
function replace(portValue, path, value) {
  return port(portValue.files.map(x => x.path === path ? { path, bytes: Buffer.isBuffer(value) ? value : bytes(value) } : x));
}
const codes = p => p.manifest.findings.map(x => x.code);
function blocked(request, code) {
  const p = plan(request); assert.equal(p.manifest.publishable, false);
  assert(codes(p).includes(code), JSON.stringify(codes(p))); return p;
}
function prepared(p, binding = 'absent') {
  const req = p.retainedRequest, files = req.candidate.files.map(x => ({ ...x, bytes: Buffer.from(x.bytes) }));
  const directories = ['sessions', 'handoffs', 'messages', '.coordination/transactions', '.coordination/operations',
    '.coordination/aborted', '.coordination/mutex-candidates'].map(path => ({ path, noReparseOrAlias: true,
      entries: path.startsWith('.coordination/') ? [] : files.filter(x => x.path.startsWith(path + '/')).map(x => x.path.slice(path.length + 1)) }));
  // Real pure strict-library HEAD fixture, never persisted/installed.
  const head = initialHead(new Map(files.map(x => [x.path, x.bytes])), AUTH);
  return { ...p, preparedObservation: { planDigest: p.digest, targets: req.targets,
    runtime: { nodeVersion: '20.19.0', producer: 'corpus-store.observeOwner', namespace: req.runtime.namespace,
      owner: req.runtime.owner, capturedAt: req.runtime.capturedAt,
      physicalPath: { path: req.targets.futureRoot, realPath: req.targets.futureRoot, noReparseOrAlias: true } },
    binding: binding === 'present' ? { state: 'present', bytes: bytes({ protocol: 1, authorityId: AUTH,
      nodeVersion: '20.19.0', corpusRoot: req.targets.futureRoot, gitCommonDirectory: req.targets.gitCommonDirectory,
      namespace: req.runtime.namespace }) } : { state: binding },
    image: { state: 'present', files, inventory: port(files).inventory }, headBytes: bytes(head), directories,
    rootEntries: [...files.filter(x => !x.path.includes('/')).map(x => x.path), 'sessions', 'handoffs', 'messages', '.coordination'],
    metadataEntries: ['HEAD.json', 'transactions', 'operations', 'aborted', 'mutex-candidates'] } };
}

test('owned in-memory fixture satisfies the actual unchanged strict corpus library', () => {
  assert.equal(validateCorpus(new Map(entries().map(x => [x.path, x.bytes]))), true);
  for (const x of sourceBytes) assert.equal(sha(x.bytes), SOURCE_PINS[x.path]);
});
test('complete descriptors are mechanical evidence only and never publication authority', () => {
  const p = plan(complete()); assert.deepEqual(p.manifest.findings, []);
  assert.equal(p.manifest.status, 'mechanically_complete_external_authentication_pending');
  assert.equal(p.manifest.publishable, false); assert.equal(p.manifest.authorityEstablished, false);
  assert.equal(p.manifest.observerOrStoreIoInvoked, false); assert.equal(p.manifest.legacyAdoptable, false);
});
test('repeat request has deterministic manifest digest and independent retained byte copies', () => {
  const req = complete(), a = plan(req), b = plan(req); assert.equal(a.digest, b.digest);
  assert.deepEqual(a.manifest, b.manifest);
  for (let i = 0; i < req.preimage.files.length; i++) {
    assert(a.retainedRequest.preimage.files[i].bytes.equals(req.preimage.files[i].bytes));
    assert.notEqual(a.retainedRequest.preimage.files[i].bytes, req.preimage.files[i].bytes);
  }
});
test('CRLF and unknown history survive raw archive; caller mutation cannot alter returned plan', () => {
  const req = complete(), p = plan(req), saved = Buffer.from(p.retainedRequest.preimage.files[0].bytes);
  req.preimage.files[0].bytes.fill(0); assert(p.retainedRequest.preimage.files[0].bytes.equals(saved));
  assert(saved.includes(Buffer.from('\r\n'))); assert(saved.includes(Buffer.from('unknown')));
});
test('explicit supplied afterimage is not generated and both original/result bytes are conserved', () => {
  const req = baseRequest(), changed = Buffer.from('{"schemaVersion":1,"unknown":"retained","reviewedNote":"explicit caller afterimage"}\n');
  req.candidate = replace(req.candidate, 'PROJECT_STATE.json', changed);
  const mapping = req.mappings.find(x => x.result.path === 'PROJECT_STATE.json'); mapping.result.sha256 = sha(changed);
  const p = plan(complete(req)); assert.deepEqual(p.manifest.findings, []);
  assert(p.retainedRequest.candidate.files.find(x => x.path === 'PROJECT_STATE.json').bytes.equals(changed));
  assert(p.retainedRequest.preimage.files.find(x => x.path === 'PROJECT_STATE.json').bytes.includes(Buffer.from('\r\n')));
  assert.equal(p.manifest.intent.effects.genesisProduced, false);
});
test('non-read-only mode refuses without changing supplied bytes', () => {
  const req = complete(); req.mode = 'publish'; blocked(req, 'unsupported_mode');
});
for (const kind of REQUIRED_RECEIPTS) test('missing external ' + kind + ' receipt remains unresolved', () => {
  const req = complete(); req.receipts = req.receipts.filter(x => x.kind !== kind);
  blocked(req, 'required_receipt_missing_' + kind);
});
test('source byte drift cannot pass a recomputed inventory as the pinned dependency', () => {
  const req = baseRequest(); req.sources.files[0].bytes = Buffer.concat([req.sources.files[0].bytes, Buffer.from('\n')]);
  req.sources = { ...port(req.sources.files), baseCommit: SOURCE_COMMIT };
  blocked(complete(req), 'dependency_pin_mismatch');
});
test('new implementation bytes and child source identity must be explicitly supplied', () => {
  const req = baseRequest(); req.implementation.commit = SOURCE_COMMIT;
  blocked(complete(req), 'implementation_source_receipt_required');
  const other = complete(); other.implementation.files[0].bytes.fill(0);
  blocked(other, 'raw_inventory_mismatch');
});
test('raw inventory detects changed bytes before a strict candidate can be accepted', () => {
  const req = complete(); req.candidate.files[0].bytes = Buffer.from('{}\n'); blocked(req, 'raw_inventory_mismatch');
});
test('null claim ID is refused by the real strict validator and the planner does not repair it', () => {
  const req = baseRequest(), board = JSON.parse(req.candidate.files.find(x => x.path === 'ACTIVE_TASKS.json').bytes);
  Object.assign(board.tasks[0], { state: 'claimed', owner: A, claimId: null });
  req.candidate = replace(req.candidate, 'ACTIVE_TASKS.json', board);
  assert.throws(() => validateCorpus(new Map(req.candidate.files.map(x => [x.path, x.bytes]))), e => e.code === 'orphan_or_mismatched_claim');
  const p = plan(complete(req)); assert(p.manifest.findings.length > 0);
  assert.equal(JSON.parse(p.retainedRequest.candidate.files.find(x => x.path === 'ACTIVE_TASKS.json').bytes).tasks[0].claimId, null);
});
test('duplicate legacy JSON members remain byte-preserved and a finding unless explicitly resolved', () => {
  const req = baseRequest(), raw = Buffer.from('{"same":1,"same":2}\n'); req.preimage = replace(req.preimage, 'PROJECT_STATE.json', raw);
  const p = plan(req); assert(p.manifest.legacyFindings.some(x => x.file === 'PROJECT_STATE.json'));
  assert(p.retainedRequest.preimage.files.find(x => x.path === 'PROJECT_STATE.json').bytes.equals(raw));
});
test('duplicate candidate JSON cannot hide behind JSON.parse last-value behavior', () => {
  const req = baseRequest(); req.candidate = replace(req.candidate, 'PROJECT_STATE.json', Buffer.from('{"a":1,"a":2}'));
  const p = plan(complete(req)); assert(codes(p).includes('candidate_ambiguous_duplicate_json_key'));
});
test('case-alias duplicate transport paths are refused rather than collapsed', () => {
  const req = baseRequest(); req.preimage = port([...req.preimage.files, { path: 'project_state.json', bytes: bytes({}) }]);
  blocked(complete(req), 'duplicate_or_aliased_inventory_path');
});
test('incomplete whole-file mapping cannot silently omit an original', () => {
  const req = baseRequest(); req.mappings.pop(); blocked(complete(req), 'incomplete_whole_file_mapping');
});
test('mapping hashes must bind actual bytes rather than a reviewed-looking descriptor', () => {
  const req = baseRequest(); req.mappings[0].original.sha256 = '0'.repeat(64); blocked(complete(req), 'mapping_hash_mismatch');
});
test('unresolved JSON pointer cannot be substituted by a whole-file receipt', () => {
  const req = baseRequest(); req.mappings[0].original.pointer = '/not-present'; blocked(complete(req), 'unresolved_mapping_pointer');
});
test('receipt byte hash and subject are separate requirements', () => {
  const req = complete(); req.receipts[0].bytes = Buffer.from('{}'); blocked(req, 'receipt_descriptor_mismatch');
  const other = complete(); alterReceipt(other, 'root_scope', x => { x.intentDigest = 'f'.repeat(64); });
  blocked(other, 'receipt_subject_mismatch');
});
test('duplicate and malformed receipt descriptors stay finite findings without dropping originals', () => {
  const req = complete(); req.receipts.push({ ...req.receipts[0], bytes: Buffer.from(req.receipts[0].bytes) });
  const p = blocked(req, 'duplicate_receipt_id'); assert.equal(p.retainedRequest.receipts.length, req.receipts.length);
  const other = complete(); other.receipts.push(null); blocked(other, 'receipt_descriptor_mismatch');
});
test('accessors and sparse ports refuse before invoking caller code or losing fields', () => {
  const req = baseRequest(); let called = 0;
  Object.defineProperty(req, 'hidden', { enumerable: true, get() { called++; return 'unsafe'; } });
  assert.throws(() => plan(req), e => e.code === 'accessor_port_refused'); assert.equal(called, 0);
  const other = baseRequest(); other.writerInventory = Array(2);
  assert.throws(() => plan(other), e => e.code === 'sparse_or_decorated_array_refused');
});
test('typed raw input and a look-alike metadata object do not share an intent digest', () => {
  const a = baseRequest(); a.unknown = Buffer.from('x');
  const b = baseRequest(); b.unknown = { type: 'buffer', bytes: 1, sha256: sha(Buffer.from('x')) };
  assert.notEqual(plan(complete(a)).manifest.intentDigest, plan(complete(b)).manifest.intentDigest);
});
test('changed requirement selection changes intent and cannot reuse old approvals', () => {
  const req = complete(), old = plan(req).manifest.intentDigest; req.requirements.root_scope = 'copied-reference';
  const p = plan(req); assert.notEqual(p.manifest.intentDigest, old); assert(codes(p).includes('receipt_subject_mismatch'));
});
test('copied booleans cannot manufacture authenticated approval or native connection', () => {
  const req = complete(); alterReceipt(req, 'root_scope', x => { x.authenticated = true; x.approved = true; });
  const p = plan(req); assert.equal(p.manifest.authorityEstablished, false); assert.equal(p.manifest.publishable, false);
  assert.match(p.manifest.externalBoundary, /do not authenticate/);
});
test('missing deciding owner and unknown native actor remain separate failures', () => {
  const req = complete(); alterReceipt(req, 'mapping_decisions', x => { x.decidingOwners = []; });
  blocked(req, 'mapping_receipt_coverage_missing');
  const other = complete(); alterReceipt(other, 'native_actor_map', x => { x.actorMappings = []; });
  blocked(other, 'native_actor_coverage_missing');
});
test('new writer after a barrier cannot inherit a copied ACK', () => {
  const req = complete(); req.writerInventory.push({ id: 'writer-bb', actor: 'another-seat', kind: 'manual', location: 'another-worktree' });
  const p = plan(req); assert(codes(p).includes('receipt_subject_mismatch')); assert(p.manifest.findings.length > 0);
});
test('late writer observation and missing supported-channel reference refuse', () => {
  const req = complete(); alterReceipt(req, 'writer_ack', x => { x.observedAt = '2026-11-18T02:00:00.000Z'; });
  blocked(req, 'writer_evidence_missing_or_late');
  const other = complete(); alterReceipt(other, 'writer_ack', x => { x.supportedChannelReceipt = ''; });
  blocked(other, 'writer_ack_unresolved');
});
test('stopped writer requires the exact inventoried PID and birth, not another dead process', () => {
  const req = baseRequest(); Object.assign(req.writerInventory[0], { pid: 777, birthId: '2026-11-18T00:20:00.000Z' });
  complete(req); alterReceipt(req, 'writer_barrier', x => { x.writers[0].state = 'stopped'; });
  const index = req.receipts.findIndex(x => x.kind === 'writer_ack'), ack = JSON.parse(req.receipts[index].bytes);
  req.receipts[index] = receipt({ ...ack, kind: 'writer_absence', pid: 778, priorBirthId: req.writerInventory[0].birthId,
    found: false, namespace: req.runtime.namespace }); blocked(req, 'writer_not_proven_stopped');
});
test('unsupported UNC/WSL and namespace/filesystem descriptors remain unsupported', () => {
  const req = baseRequest(); req.targets.futureRoot = '\\\\server\\share\\future'; blocked(complete(req), 'unsupported_physical_path');
  const other = baseRequest(); other.runtime.namespace.fileSystem = 'ext4'; blocked(complete(other), 'unsupported_runtime_descriptor');
});
test('target overlap and missing physical parent fence refuse without probe files', () => {
  const req = baseRequest(); req.targets.futureRoot = req.targets.legacyRoot; blocked(complete(req), 'target_namespace_overlap');
  const other = baseRequest(); other.runtime.physicalPaths.pop(); blocked(complete(other), 'physical_fence_unknown');
});
test('impossible calendar and unknown owner birth cannot become a current runtime', () => {
  const req = baseRequest(); req.runtime.namespace.bootId = '2026-02-30T00:00:00.000Z'; blocked(complete(req), 'unsupported_runtime_descriptor');
  const other = baseRequest(); other.runtime.owner.birthId = ''; blocked(complete(other), 'owner_birth_unknown');
});
test('native seven-digit UTC/offset timestamps retain exact text and 100ns chronology', () => {
  const req = baseRequest(); req.runtime.namespace.bootId = '2026-11-17T18:00:00.0000000-06:00';
  req.runtime.owner.birthId = '2026-11-18T00:30:00.0000001Z'; req.runtime.capturedAt = '2026-11-18T01:00:00.0000000Z';
  const p = plan(complete(req)); assert.deepEqual(p.manifest.findings, []);
  assert.equal(p.retainedRequest.runtime.owner.birthId, '2026-11-18T00:30:00.0000001Z');
  const late = baseRequest(); late.runtime.owner.birthId = '2026-11-18T01:00:00.0000001Z';
  blocked(complete(late), 'owner_birth_unknown');
});
test('missing externally allocated authority UUID does not trigger allocation', () => {
  const req = baseRequest(); req.authorityId = null; const p = blocked(complete(req), 'external_authority_uuid_required');
  assert.equal(p.retainedRequest.authorityId, null); assert.equal(p.manifest.intent.effects.idsAllocated, false);
});
test('oversized transport is refused before strict analysis without widening its bound', () => {
  const req = baseRequest(); req.preimage.files[0].bytes = Buffer.alloc(LIMITS.fileBytes + 1);
  assert.throws(() => plan(req), e => e.code === 'transport_byte_bound');
});
test('unobserved preparation is never interpreted as an absent binding', () => {
  const report = inspectPrepared(plan(complete())); assert.equal(report.phase, 'unobserved');
  assert.equal(report.installed, null); assert.equal(report.actualFilesystemObserved, false);
});
test('explicit absent preparation is scoped to the supplied observation', () => {
  const p = prepared(plan(complete())), parent = p.retainedRequest.targets.futureParent;
  p.preparedObservation.image = { state: 'absent' };
  p.preparedObservation.runtime.physicalPath = { path: parent, realPath: parent, noReparseOrAlias: true };
  const report = inspectPrepared(p);
  assert.equal(report.phase, 'observed_absent_unprepared'); assert.equal(report.installed, false);
});
test('real-library prepared HEAD/image can be inspected unpublished without creating it', () => {
  const p = prepared(plan(complete())), report = inspectPrepared(p);
  assert.deepEqual(report.findings, []); assert.equal(report.phase, 'prepared_unpublished_observation');
  assert.equal(report.installed, false); assert.equal(report.mutations, false);
});
test('matching binding still needs actual createCorpusStore trusted-read evidence', () => {
  const report = inspectPrepared(prepared(plan(complete()), 'present'));
  assert.equal(report.phase, 'coherent_binding_observed_requires_actual_trusted_store_read');
  assert.equal(report.installed, null); assert.equal(report.trustedStoreReadVerified, false);
});
test('foreign binding and unknown binding result refuse without replacing or retrying', () => {
  const p = prepared(plan(complete()), 'present'), binding = JSON.parse(p.preparedObservation.binding.bytes);
  binding.authorityId = BARRIER; p.preparedObservation.binding.bytes = bytes(binding);
  assert.equal(inspectPrepared(p).phase, 'held_for_explicit_recovery');
  assert.equal(inspectPrepared(prepared(plan(complete()), 'unknown')).findings[0].code, 'binding_outcome_unknown');
});
test('prepared observation from a different boot or unknown physical root stays held', () => {
  const p = prepared(plan(complete())); p.preparedObservation.runtime.namespace = { ...p.retainedRequest.runtime.namespace,
    bootId: '2026-11-17T00:00:00.000Z' };
  assert.equal(inspectPrepared(p).findings[0].code, 'prepared_runtime_unknown');
  const q = prepared(plan(complete())); q.preparedObservation.runtime.physicalPath.noReparseOrAlias = false;
  assert.equal(inspectPrepared(q).findings[0].code, 'prepared_physical_root_unknown');
});
test('advanced authority is preserved and never reset to revision zero', () => {
  const p = prepared(plan(complete()), 'present'), head = JSON.parse(p.preparedObservation.headBytes);
  head.revision = 1; head.operationReceipts = { [BARRIER]: 'f'.repeat(64) }; p.preparedObservation.headBytes = bytes(head);
  const report = inspectPrepared(p); assert.equal(report.findings[0].code, 'advanced_authority_requires_existing_coordinator_recovery');
  assert(report.retainedPreparedObservation.headBytes.equals(p.preparedObservation.headBytes));
});
test('partial metadata, pending transactions and extra roots are not coherent preparation', () => {
  const a = prepared(plan(complete())); a.preparedObservation.directories.pop();
  assert.equal(inspectPrepared(a).phase, 'held_for_explicit_recovery');
  const b = prepared(plan(complete())); b.preparedObservation.directories.find(x => x.path.endsWith('/transactions')).entries.push('unknown');
  assert.equal(inspectPrepared(b).findings[0].code, 'prepared_journal_requires_existing_recovery');
  const c = prepared(plan(complete())); c.preparedObservation.rootEntries.push('shadow-registry');
  assert.equal(inspectPrepared(c).findings[0].code, 'prepared_root_inventory_ambiguous');
});
test('prepared byte drift and duplicate metadata keys refuse while retaining original input', () => {
  const p = prepared(plan(complete())); p.preparedObservation.image.files[0].bytes = Buffer.from('{}');
  assert.equal(inspectPrepared(p).findings[0].code, 'prepared_image_drift');
  const q = prepared(plan(complete())); q.preparedObservation.headBytes = Buffer.from('{"protocol":1,"protocol":1}');
  assert.equal(inspectPrepared(q).findings[0].code, 'duplicate_json_member');
});
test('tampered plan manifest/digest cannot be used as recovery authority', () => {
  const p = plan(complete()); p.manifest.publishable = true;
  assert.throws(() => inspectPrepared(p), e => e.code === 'prepared_plan_identity_mismatch');
});
test('plan and inspector perform no implicit filesystem/process/network operations', t => {
  const req = complete(), p = prepared(plan(req)); let calls = 0;
  const denied = () => { calls++; throw new Error('unexpected side effect'); };
  for (const name of ['readFileSync', 'readdirSync', 'existsSync', 'lstatSync', 'realpathSync', 'mkdirSync', 'openSync',
    'writeFileSync', 'renameSync', 'linkSync', 'unlinkSync', 'rmSync']) t.mock.method(fs, name, denied);
  for (const name of ['execFileSync', 'execSync', 'spawn', 'spawnSync', 'execFile', 'exec']) t.mock.method(childProcess, name, denied);
  t.mock.method(globalThis, 'fetch', denied); syncBuiltinESMExports();
  try {
    assert.deepEqual(plan(req).manifest.findings, []);
    assert.equal(inspectPrepared(p).phase, 'prepared_unpublished_observation'); assert.equal(calls, 0);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});

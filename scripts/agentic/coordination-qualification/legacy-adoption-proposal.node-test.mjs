// Authored controls: run only in Root's independently approved hosted slot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonical } from '../corpus-store.mjs';
import { CONTRACT_PINS, IMPLEMENTATION_PATH, LIMITS, QUALIFIED_SOURCE,
  describeSnapshot, describeSources, prepareLegacyAdoptionProposal } from './legacy-adoption-proposal.mjs';

// These are fixed source reads, never live-corpus reads or writes. The planner
// receives byte buffers and has no source-loader or filesystem adapter.
const sourceBytes = [IMPLEMENTATION_PATH, ...Object.keys(CONTRACT_PINS)].map(path => ({ path,
  bytes: readFileSync(new URL('../../../' + path, import.meta.url)) }));
const A = 'worker-aa', B = 'worker-bb', T = 'LEGACY-TASK-AA', U = 'LEGACY-TASK-BB';
const ID1 = '11111111-1111-4111-8111-111111111111', ID2 = '22222222-2222-4222-8222-222222222222';
const SOURCE = 'a'.repeat(40);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const entry = (path, value) => ({ path, bytes: Buffer.from(JSON.stringify(value, null, 2) + '\n') });
const doc = (files, path) => JSON.parse(files.find(file => file.path === path).bytes.toString());
const put = (files, path, value) => files.map(file => file.path === path ? entry(path, value) : file);
function fixture() {
  const session = { id: A, tool: 'fixture', lane: 'old-lane', branch: 'old', state: 'paused',
    startedAt: '2020-01-01T00:00:00.000Z', unknownHistory: { untouched: true } };
  return [entry('PROJECT_STATE.json', { schemaVersion: 1 }), entry('RELEASE_STATE.json', { schemaVersion: 1 }),
    entry('ROADMAP.json', { schemaVersion: 1 }),
    entry('ACTIVE_TASKS.json', { schemaVersion: 1, tasks: [{ id: T, state: 'ready', owner: null, paths: ['owned/a'], dependsOn: [] }] }),
    entry('SESSION_REGISTRY.json', { schemaVersion: 1, sessions: [session] }),
    entry('CODE_OWNERSHIP.json', { schemaVersion: 1, leases: [] }), entry('sessions/' + A + '.json', session)];
}
function sources() { return { qualifiedCommit: QUALIFIED_SOURCE, implementationCommit: SOURCE,
  files: sourceBytes.map(file => ({ path: file.path, bytes: Buffer.from(file.bytes) })) }; }
function request(files = fixture(), source = sources()) {
  return { files, sources: source, expectedPreimageSha256: describeSnapshot(files).sha256,
    expectedSourceSha256: describeSources(source).sha256 };
}
const run = files => prepareLegacyAdoptionProposal(request(files));
const codes = result => result.proposal.findings.map(row => row.code);
function blocked(result, code) {
  assert.equal(result.proposal.adoptable, false); assert.equal(result.proposal.authorityAssigned, false);
  assert.equal(result.proposal.idsAllocated, false); assert.equal(result.proposal.afterimagesProduced, false);
  assert.ok(codes(result).includes(code), code + ': ' + codes(result).join(','));
}
function conserved(files, result) {
  const original = files.map(file => ({ path: file.path, hex: file.bytes.toString('hex') }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0);
  const retained = result.retainedSnapshot.map(file => ({ path: file.path, hex: file.bytes.toString('hex') }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0);
  assert.deepEqual(retained, original);
  for (const output of result.retainedSnapshot) assert.ok(!files.some(input => input.bytes === output.bytes));
}
function claimed(files = fixture(), { id = ID1, claimId = ID1, paths = ['owned/a'] } = {}) {
  const board = doc(files, 'ACTIVE_TASKS.json'); Object.assign(board.tasks[0], { state: 'claimed', owner: A, paths });
  if (claimId !== undefined) board.tasks[0].claimId = claimId;
  files = put(files, 'ACTIVE_TASKS.json', board);
  return put(files, 'CODE_OWNERSHIP.json', { schemaVersion: 1,
    leases: [{ id, task: T, session: A, paths, state: 'active', oldFields: { preserve: true } }] });
}

test('a compatible snapshot produces only a structural proposal, never adoption or Git attestation', () => {
  const files = fixture(), result = run(files); conserved(files, result);
  assert.deepEqual(result.proposal.findings, []);
  assert.equal(result.proposal.strictValidator, 'supplied_bytes_satisfy_frozen_structural_contract');
  assert.equal(result.proposal.status, 'reviewable_structural_proposal_only');
  assert.equal(result.proposal.adoptable, false);
  assert.equal(result.proposal.gitAndLoadedCodeProvenanceVerified, false);
  assert.equal(result.proposal.captureQuiescenceAndWriterAcksVerified, false);
});

test('manifest and proposal digests bind actual bytes with independent SHA256 recomputation', () => {
  const result = run(fixture());
  assert.equal(result.proposalSha256, sha(Buffer.from(canonical(result.proposal))));
  assert.equal(result.proposal.preimageSha256, sha(Buffer.from(canonical(result.proposal.preimage))));
  for (const item of result.proposal.preimage.files) {
    const file = result.retainedSnapshot.find(file => file.path === item.path);
    assert.equal(item.sha256, sha(file.bytes)); assert.equal(item.bytes, file.bytes.length);
  }
});

test('unknown fields, unsafe-to-reserialize numeric text, whitespace and CRLF remain exact', () => {
  let files = fixture();
  files = files.map(file => file.path === 'PROJECT_STATE.json' ? { path: file.path,
    bytes: Buffer.from('{ "schemaVersion":1,"unknown":{"huge":900719925474099312345,"negativeZero":-0,"raw":"x"} }\r\n') } : file);
  const result = run(files); conserved(files, result); assert.deepEqual(result.proposal.findings, []);
});

test('released stale history and unknown fields are not deleted or promoted', () => {
  let files = fixture(); const board = doc(files, 'ACTIVE_TASKS.json'); board.tasks[0].oldArchive = { state: 'stale', events: [1, 2] };
  files = put(files, 'ACTIVE_TASKS.json', board);
  files = put(files, 'CODE_OWNERSHIP.json', { schemaVersion: 1, leases: [{ id: ID1, task: T,
    session: A, state: 'released', paths: ['owned/a'], oldStatus: 'transferred-before-epoch' }] });
  const result = run(files); conserved(files, result); assert.deepEqual(result.proposal.findings, []);
  assert.equal(doc(result.retainedSnapshot, 'CODE_OWNERSHIP.json').leases[0].state, 'released');
});

test('input enumeration order does not change proposal or manifest', () => {
  const files = fixture(), first = run(files), second = run([...files].reverse());
  assert.deepEqual(first.proposal, second.proposal); assert.equal(first.proposalSha256, second.proposalSha256);
});

test('retained buffers are independent of caller mutation after planning', () => {
  const files = fixture(), result = run(files), preserved = result.retainedSnapshot.map(file => Buffer.from(file.bytes));
  for (const file of files) file.bytes.fill(0);
  result.retainedSnapshot.forEach((file, index) => assert.deepEqual(file.bytes, preserved[index]));
});

test('stale expected preimage refuses while preserving every changed byte', () => {
  const input = request(); input.files[0] = entry('PROJECT_STATE.json', { schemaVersion: 1, changed: true });
  const result = prepareLegacyAdoptionProposal(input); blocked(result, 'preimage_receipt_mismatch'); conserved(input.files, result);
});

test('stale expected source digest refuses and source buffers are retained independently', () => {
  const input = request(); input.sources.files[0].bytes = Buffer.concat([input.sources.files[0].bytes, Buffer.from('\n')]);
  const result = prepareLegacyAdoptionProposal(input); blocked(result, 'source_receipt_mismatch');
  conserved(input.files, result); assert.equal(result.retainedSources[0].bytes.equals(input.sources.files[0].bytes), true);
  assert.notEqual(result.retainedSources[0].bytes, input.sources.files[0].bytes);
});

test('a recomputed receipt cannot waive a changed frozen core contract', () => {
  const source = sources(); const target = source.files.find(file => file.path.endsWith('corpus-store.mjs'));
  target.bytes = Buffer.concat([target.bytes, Buffer.from('// changed\n')]);
  const result = prepareLegacyAdoptionProposal(request(fixture(), source)); blocked(result, 'qualified_contract_hash_mismatch');
});

test('contract source BOM changes are not erased by LF-only pin normalization', () => {
  const source = sources(); const target = source.files.find(file => file.path.endsWith('path-overlap.mjs'));
  target.bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), target.bytes]);
  blocked(prepareLegacyAdoptionProposal(request(fixture(), source)), 'qualified_contract_hash_mismatch');
});

test('unqualified source identity remains blocked even when its manifest digest matches', () => {
  const source = sources(); source.qualifiedCommit = 'b'.repeat(40);
  blocked(prepareLegacyAdoptionProposal(request(fixture(), source)), 'unsupported_source_identity');
});

test('missing implementation bytes cannot be claimed as source provenance', () => {
  const source = sources(); source.files = source.files.filter(file => file.path !== IMPLEMENTATION_PATH);
  blocked(prepareLegacyAdoptionProposal(request(fixture(), source)), 'implementation_source_bytes_missing');
});

test('source case aliases refuse instead of choosing a source', () => {
  const source = sources(); source.files.push({ path: IMPLEMENTATION_PATH.toUpperCase(), bytes: Buffer.from('alias') });
  blocked(prepareLegacyAdoptionProposal(request(fixture(), source)), 'windows_source_path_collision');
});

test('missing claim UUID is classified by pointer without allocating or copying a lease ID', () => {
  let files = claimed(); const board = doc(files, 'ACTIVE_TASKS.json'); delete board.tasks[0].claimId;
  files = put(files, 'ACTIVE_TASKS.json', board); const result = run(files); blocked(result, 'missing_task_claim_uuid'); conserved(files, result);
  assert.ok(result.proposal.classifications.some(row => row.pointer === '/tasks/0/claimId' && row.authorityAssigned === false));
  assert.equal(Object.hasOwn(doc(result.retainedSnapshot, 'ACTIVE_TASKS.json').tasks[0], 'claimId'), false);
});

test('invalid lease labels remain original bytes and require an owner decision', () => {
  const files = claimed(fixture(), { id: 'old-root-label' }), result = run(files); blocked(result, 'invalid_lease_uuid'); conserved(files, result);
  assert.equal(doc(result.retainedSnapshot, 'CODE_OWNERSHIP.json').leases[0].id, 'old-root-label');
});

test('a missing lease UUID remains missing', () => {
  let files = claimed(); const ownership = doc(files, 'CODE_OWNERSHIP.json'); delete ownership.leases[0].id;
  files = put(files, 'CODE_OWNERSHIP.json', ownership); const result = run(files); blocked(result, 'missing_lease_uuid'); conserved(files, result);
});

test('array-valued UUID lookalikes are invalid identities rather than string-coerced grants', () => {
  const files = claimed(fixture(), { id: [ID1], claimId: [ID1] }), result = run(files);
  blocked(result, 'invalid_task_claim_uuid'); blocked(result, 'invalid_lease_uuid'); conserved(files, result);
});

test('duplicate historical lease IDs retain both complete records', () => {
  let files = fixture(); files = put(files, 'CODE_OWNERSHIP.json', { schemaVersion: 1, leases: [
    { id: ID1, task: T, session: A, state: 'released', paths: ['owned/a'], note: 'first' },
    { id: ID1, task: T, session: A, state: 'released', paths: ['owned/a'], note: 'second' }] });
  const result = run(files); blocked(result, 'duplicate_lease_uuid'); conserved(files, result);
  assert.equal(doc(result.retainedSnapshot, 'CODE_OWNERSHIP.json').leases.length, 2);
});

test('unsupported task and lease states remain blocked and unchanged', () => {
  let files = claimed(); const board = doc(files, 'ACTIVE_TASKS.json'); board.tasks[0].state = 'blocked_external';
  files = put(files, 'ACTIVE_TASKS.json', board); const ownership = doc(files, 'CODE_OWNERSHIP.json'); ownership.leases[0].state = 'transferred';
  files = put(files, 'CODE_OWNERSHIP.json', ownership); const result = run(files);
  blocked(result, 'unsupported_task_state'); blocked(result, 'unsupported_lease_state'); conserved(files, result);
});

test('same-owner qualification/** and exact lease overlap is not exempt or auto-released', () => {
  let files = claimed(fixture(), { paths: ['scripts/agentic/coordination-qualification/**'] });
  const board = doc(files, 'ACTIVE_TASKS.json'); board.tasks.push({ id: U, owner: A, state: 'claimed',
    claimId: ID2, paths: ['scripts/agentic/coordination-qualification/new.mjs'], dependsOn: [] });
  files = put(files, 'ACTIVE_TASKS.json', board); const ownership = doc(files, 'CODE_OWNERSHIP.json'); ownership.leases.push({
    id: ID2, task: U, session: A, state: 'active', paths: [...board.tasks[1].paths], existingMetadata: 'do not discard' });
  files = put(files, 'CODE_OWNERSHIP.json', ownership); const result = run(files); blocked(result, 'active_lease_overlap'); conserved(files, result);
  assert.deepEqual(doc(result.retainedSnapshot, 'CODE_OWNERSHIP.json').leases.map(row => row.state), ['active', 'active']);
});

test('a released covered-by-existing duplicate preserves history without becoming active', () => {
  let files = claimed(fixture(), { paths: ['scripts/agentic/coordination-qualification/**'] });
  const ownership = doc(files, 'CODE_OWNERSHIP.json'); ownership.leases.push({ id: ID2, task: T, session: A,
    state: 'released', paths: ['scripts/agentic/coordination-qualification/new.mjs'], coveredByExisting: ID1 });
  files = put(files, 'CODE_OWNERSHIP.json', ownership); const result = run(files); conserved(files, result);
  assert.ok(!codes(result).includes('active_lease_overlap'));
  assert.equal(doc(result.retainedSnapshot, 'CODE_OWNERSHIP.json').leases[1].coveredByExisting, ID1);
});

test('exact task and lease path disagreement refuses without union or narrowing', () => {
  let files = claimed(); const board = doc(files, 'ACTIVE_TASKS.json'); board.tasks[0].paths.push('owned/b');
  files = put(files, 'ACTIVE_TASKS.json', board); const result = run(files); blocked(result, 'claim_lease_correspondence_required'); conserved(files, result);
});

test('noncanonical lease path spelling is preserved and blocked instead of rewritten', () => {
  const files = claimed(fixture(), { paths: ['owned/./a'] }), result = run(files);
  blocked(result, 'noncanonical_path_spelling'); conserved(files, result);
});

test('active lease on a nonclaimed task is not silently released', () => {
  let files = claimed(); const board = doc(files, 'ACTIVE_TASKS.json'); board.tasks[0].state = 'qa';
  files = put(files, 'ACTIVE_TASKS.json', board); const result = run(files); blocked(result, 'active_lease_on_nonclaimed_task'); conserved(files, result);
});

test('case-folded session identity collision refuses without selecting either actor', () => {
  let files = fixture(); const registry = doc(files, 'SESSION_REGISTRY.json'); registry.sessions.push({ ...registry.sessions[0], id: A.toUpperCase() });
  files = put(files, 'SESSION_REGISTRY.json', registry); files.push(entry('sessions/' + A.toUpperCase() + '.json', registry.sessions[1]));
  const result = run(files); blocked(result, 'session_id_collision'); blocked(result, 'windows_snapshot_path_collision'); conserved(files, result);
});

test('reserved device identities and parent traversal are refused without losing bytes', () => {
  let files = fixture(); const board = doc(files, 'ACTIVE_TASKS.json'); board.tasks[0].id = 'CON';
  files = put(files, 'ACTIVE_TASKS.json', board); files.push({ path: '../foreign.json', bytes: Buffer.from('retained only') });
  const result = run(files); blocked(result, 'invalid_task_id'); blocked(result, 'invalid_windows_snapshot_path'); conserved(files, result);
});

test('physical slash/dot/trailing aliases are blocked rather than normalized into authority', () => {
  const files = fixture(); files.push({ path: 'sessions/./' + A + '.json', bytes: Buffer.from('{}') },
    { path: 'sessions/' + A + '.json.', bytes: Buffer.from('{}') });
  const result = run(files); blocked(result, 'windows_snapshot_path_collision'); blocked(result, 'noncanonical_snapshot_path'); conserved(files, result);
});

test('exact duplicate file entries are retained, not overwritten by a Map', () => {
  const files = fixture(); files.push({ path: 'PROJECT_STATE.json', bytes: Buffer.from('{"different":true}') });
  const result = run(files); blocked(result, 'duplicate_snapshot_path'); conserved(files, result);
  assert.equal(result.retainedSnapshot.filter(row => row.path === 'PROJECT_STATE.json').length, 2);
});

test('JSON receipts, .gitkeep and legacy Markdown messages are retained as unsupported entries', () => {
  const files = fixture(); files.push({ path: 'handoffs/old.json', bytes: Buffer.from('{"old":true}') },
    { path: 'sessions/.gitkeep', bytes: Buffer.alloc(0) }, { path: 'messages/dispatch.md', bytes: Buffer.from('# old dispatch\n') });
  const result = run(files); blocked(result, 'unsupported_legacy_inventory_entry'); conserved(files, result);
  assert.equal(result.proposal.findings.filter(row => row.code === 'unsupported_legacy_inventory_entry').length, 3);
});

test('literal and escaped duplicate JSON member keys fail closed', () => {
  const files = fixture().map(file => file.path === 'ACTIVE_TASKS.json' ? { path: file.path,
    bytes: Buffer.from('{"tasks":[],"\\u0074asks":[{"id":"hidden"}]}') } : file);
  const result = run(files); blocked(result, 'ambiguous_duplicate_json_key'); conserved(files, result);
  assert.ok(result.proposal.findings.some(row => row.code === 'ambiguous_duplicate_json_key' && row.pointer === '/tasks'));
});

test('malformed JSON and invalid UTF8 never become an adoptable partial snapshot', () => {
  const files = fixture().map(file => file.path === 'ROADMAP.json' ? { path: file.path, bytes: Buffer.from([0xff]) }
    : file.path === 'RELEASE_STATE.json' ? { path: file.path, bytes: Buffer.from('{"x":}') } : file);
  const result = run(files); blocked(result, 'invalid_utf8'); blocked(result, 'invalid_json'); conserved(files, result);
});

test('missing roots and unindexed session files remain explicit blockers', () => {
  const files = fixture().filter(file => file.path !== 'ROADMAP.json'); files.push(entry('sessions/' + B + '.json', { id: B }));
  const result = run(files); blocked(result, 'missing_root_file'); blocked(result, 'unindexed_session_file'); conserved(files, result);
});

test('mirror disagreement preserves both registry and individual session evidence', () => {
  const files = put(fixture(), 'sessions/' + A + '.json', { id: A, staleNote: 'independent old bytes' });
  const result = run(files); blocked(result, 'session_mirror_mismatch'); conserved(files, result);
});

test('handoff bytes can be diagnosed without assigning a missing acceptor', () => {
  let files = fixture(); const body = Buffer.from('# real existing handoff\r\n'), board = doc(files, 'ACTIVE_TASKS.json');
  Object.assign(board.tasks[0], { state: 'done', handoff: { session: A, sha: SOURCE, file: '.xenios/handoffs/old.md',
    contentSha256: sha(body), bytes: body.length }, acceptedSha: SOURCE, acceptedBy: 'old-unregistered-reviewer' });
  files = put(files, 'ACTIVE_TASKS.json', board); files.push({ path: 'handoffs/old.md', bytes: body });
  const result = run(files); blocked(result, 'acceptor_identity_evidence_required'); conserved(files, result);
  assert.ok(!codes(result).includes('handoff_byte_binding_required'));
  assert.equal(doc(result.retainedSnapshot, 'ACTIVE_TASKS.json').tasks[0].acceptedBy, 'old-unregistered-reviewer');
});

test('mismatched handoff byte receipts and accepted source remain separate blockers', () => {
  let files = fixture(); const board = doc(files, 'ACTIVE_TASKS.json');
  Object.assign(board.tasks[0], { state: 'done', handoff: { session: A, sha: SOURCE, file: 'handoffs/old.md',
    contentSha256: '0'.repeat(64), bytes: 1 }, acceptedSha: 'b'.repeat(40), acceptedBy: A });
  files = put(files, 'ACTIVE_TASKS.json', board); files.push({ path: 'handoffs/old.md', bytes: Buffer.from('actual bytes') });
  const result = run(files); blocked(result, 'handoff_byte_binding_required'); blocked(result, 'acceptance_source_binding_required');
  blocked(result, 'independent_acceptance_required'); conserved(files, result);
});

test('message metadata is checked without exposing or changing its text', () => {
  const files = fixture(); files.push(entry('messages/old.json', { id: 'old-date-id', from: A, to: 'unknown', text: 'PRIVATE_OLD_BODY' }));
  const result = run(files); blocked(result, 'message_binding_required'); conserved(files, result);
  assert.ok(!JSON.stringify(result.proposal).includes('PRIVATE_OLD_BODY'));
});

test('depth and record-analysis limits are explicit finite refusals with byte conservation', () => {
  let files = fixture(); files = files.map(file => file.path === 'PROJECT_STATE.json' ? { path: file.path,
    bytes: Buffer.from('['.repeat(LIMITS.depth + 2) + '0' + ']'.repeat(LIMITS.depth + 2)) } : file);
  const registry = doc(files, 'SESSION_REGISTRY.json'); registry.sessions = Array.from({ length: LIMITS.records + 1 }, (_, i) => ({ id: 'old-' + i }));
  files = put(files, 'SESSION_REGISTRY.json', registry); const result = run(files);
  blocked(result, 'json_depth_limit'); blocked(result, 'record_analysis_limit'); conserved(files, result);
  assert.equal(result.proposal.analysisComplete, false);
});

test('transport size refusal leaves oversized caller bytes intact and creates no candidate', () => {
  const bytes = Buffer.alloc(LIMITS.fileBytes + 1, 7), before = sha(bytes);
  assert.throws(() => describeSnapshot([{ path: 'oversized.bin', bytes }]), error => error.code === 'input_byte_limit');
  assert.equal(sha(bytes), before);
});

test('unknown transport metadata is refused, never silently discarded as if bound', () => {
  const input = { path: 'PROJECT_STATE.json', bytes: Buffer.from('{}'), unboundCaptureClaim: 'not an attestation' };
  assert.throws(() => describeSnapshot([input]), error => error.code === 'invalid_entry_shape');
  assert.equal(input.unboundCaptureClaim, 'not an attestation'); assert.equal(input.bytes.toString(), '{}');
  const badSource = request(); badSource.sources = Object.assign(Object.create({ untrustedPrototype: true }), badSource.sources);
  assert.throws(() => prepareLegacyAdoptionProposal(badSource), error => error.code === 'invalid_source_container');
});

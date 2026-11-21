// Pure proposal/inspection over explicit byte ports. No filesystem, process,
// observer, binding, genesis, publisher, controller or network operation.
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { canonical, contentHash, validateCorpus, REQUIRED_NODE } from './corpus-store.mjs';
import { describeSnapshot, describeSources, prepareLegacyAdoptionProposal,
  QUALIFIED_SOURCE } from './coordination-qualification/legacy-adoption-proposal.mjs';

export const SOURCE_COMMIT = 'aae0858efbeacd3717aa72b54a1e62a82bf1a3e3';
export const SOURCE_PINS = Object.freeze({
  'scripts/agentic/corpus-store.mjs': 'ffdc42467acaf8eba7de1646aa94ce384152cc2e4dd702b7a040ba8f03ab4761',
  'scripts/agentic/path-overlap.mjs': 'd21608ebc88f3329c6d1e158961dbe182b4474de4da2aecd9256b3d880958f87',
  'scripts/agentic/corpus-owner-process.ps1': '8576469408aebf2c5b39f6a69db558e5c47e4ca06a47b1a9b8417169c7028406',
  'scripts/agentic/coordination-qualification/legacy-adoption-proposal.mjs': 'ccbfe596995614861421f4b43576ded760ee8d8c6bafa53cb4e5fbf4b0cc7098',
});
export const LIMITS = Object.freeze({ fileBytes: 5 * 1024 * 1024,
  totalBytes: 32 * 1024 * 1024, entries: 10_000, findings: 1_000, depth: 128, milliseconds: 120_000 });
export const REQUIRED_RECEIPTS = Object.freeze(['root_scope', 'mapping_decisions',
  'native_actor_map', 'handoff_acceptance', 'writer_barrier', 'runtime_namespace', 'source_qualification']);
const SHA = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const plain = x => x !== null && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype;
const hash = x => contentHash(Buffer.from(canonical(x)));
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const eq = (a, b) => canonical(a) === canonical(b);
function refuse(code) { throw Object.assign(new TypeError(code), { code }); }
function requireThat(value, code) { if (!value) refuse(code); }
function clone(value, budget = { bytes: 0, nodes: 0 }, depth = 0) {
  requireThat(depth <= LIMITS.depth && ++budget.nodes <= 100_000, 'metadata_bound');
  if (Buffer.isBuffer(value)) {
    budget.bytes += value.length;
    requireThat(value.length <= LIMITS.fileBytes && budget.bytes <= LIMITS.totalBytes, 'transport_byte_bound');
    return Buffer.from(value);
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    budget.bytes += Buffer.byteLength(value);
    requireThat(budget.bytes <= LIMITS.totalBytes, 'transport_byte_bound'); return value;
  }
  requireThat(Array.isArray(value) || plain(value), 'unsupported_port_value');
  requireThat(Object.getOwnPropertySymbols(value).length === 0, 'symbol_port_refused');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  requireThat(Object.values(descriptors).every(d => !d.get && !d.set), 'accessor_port_refused');
  if (Array.isArray(value)) {
    requireThat(Object.keys(value).length === value.length && Object.keys(value).every((k, i) => k === String(i)), 'sparse_or_decorated_array_refused');
    return value.map(x => clone(x, budget, depth + 1));
  }
  return Object.fromEntries(Object.entries(descriptors).map(([k, d]) => [k, clone(d.value, budget, depth + 1)]));
}
function inventory(entries) {
  requireThat(Array.isArray(entries) && entries.length <= LIMITS.entries, 'invalid_inventory_port');
  return entries.map(x => {
    requireThat(plain(x) && typeof x.path === 'string' && Buffer.isBuffer(x.bytes), 'invalid_byte_entry');
    requireThat(x.bytes.length <= LIMITS.fileBytes, 'file_byte_bound');
    return { path: x.path, bytes: x.bytes.length, sha256: contentHash(x.bytes) };
  }).sort((a, b) => compare(a.path, b.path) || compare(a.sha256, b.sha256));
}
// A strict metadata parser: JSON.parse alone would silently accept duplicate keys.
function json(bytes) {
  requireThat(Buffer.isBuffer(bytes) && bytes.length <= LIMITS.fileBytes, 'invalid_json_bytes');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { refuse('invalid_utf8'); }
  let at = 0;
  const ws = () => { while (at < text.length && /[\x20\t\r\n]/.test(text[at])) at++; };
  const string = () => {
    const start = at++; let closed = false;
    while (at < text.length) { const ch = text[at++]; if (ch === '\\') at++; else if (ch === '"') { closed = true; break; } }
    requireThat(closed, 'invalid_json');
    try { return JSON.parse(text.slice(start, at)); } catch { refuse('invalid_json'); }
  };
  function value(depth) {
    requireThat(depth <= LIMITS.depth, 'json_depth_bound'); ws(); const ch = text[at];
    if (ch === '"') { string(); return; }
    if (ch === '{' || ch === '[') {
      at++; ws(); const object = ch === '{', end = object ? '}' : ']', keys = new Set();
      if (text[at] === end) { at++; return; }
      for (;;) {
        if (object) { requireThat(text[at] === '"', 'invalid_json'); const key = string();
          requireThat(!keys.has(key), 'duplicate_json_member'); keys.add(key); ws(); requireThat(text[at++] === ':', 'invalid_json'); }
        value(depth + 1); ws(); const next = text[at++]; if (next === end) return;
        requireThat(next === ',', 'invalid_json'); ws();
      }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(at));
    requireThat(token, 'invalid_json'); at += token[0].length;
  }
  value(0); ws(); requireThat(at === text.length, 'invalid_json');
  try { return JSON.parse(text); } catch { refuse('invalid_json'); }
}
function instant(x) {
  if (typeof x !== 'string') return false;
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,7}))?(Z|[+-]\d\d:\d\d)$/.exec(x);
  if (!m) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (month < 1 || month > 12 || day < 1 || day > [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    || hour > 23 || minute > 59 || second > 59) return false;
  if (m[8] !== 'Z' && (Number(m[8].slice(1, 3)) > 23 || Number(m[8].slice(4)) > 59)) return false;
  return Number.isFinite(Date.parse(x));
}
// Preserve production observer's seven fractional digits. Compare 100ns ticks;
// Date.parse alone truncates the birth precision to milliseconds.
function ticks(x) {
  const fraction = /\.(\d{1,7})(?:Z|[+-]\d\d:\d\d)$/.exec(x)?.[1] ?? '';
  return BigInt(Date.parse(x)) * 10_000n + BigInt(fraction.padEnd(7, '0').slice(3) || '0');
}
function winPath(x) {
  requireThat(typeof x === 'string' && x.length <= 4096 && /^[A-Za-z]:\\/.test(x)
    && /^[\x20-\x7e]+$/.test(x) && !x.includes('/') && !/[\x00-\x1f*?~]/.test(x), 'unsupported_physical_path');
  const parts = x.slice(3).split('\\');
  requireThat(parts.length > 0 && parts.every(p => p && p.length <= 255 && !/[<>:"|]/.test(p)
    && !/[ .]$/.test(p) && !p.startsWith(' ') && !['.', '..'].includes(p)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9]|conin\$|conout\$)(?:\.|$)/i.test(p)), 'unsupported_physical_path');
  return x.toLowerCase();
}
function nested(a, b) { return a === b || a.startsWith(b + '\\') || b.startsWith(a + '\\'); }
function pointer(files, endpoint) {
  requireThat(plain(endpoint) && typeof endpoint.path === 'string' && typeof endpoint.pointer === 'string'
    && SHA.test(endpoint.sha256 ?? ''), 'invalid_mapping_endpoint');
  const matches = files.filter(x => x.path === endpoint.path);
  requireThat(matches.length === 1, 'ambiguous_mapping_file');
  if (endpoint.pointer === '') return contentHash(matches[0].bytes);
  requireThat(endpoint.pointer.startsWith('/') && !/~(?![01])/u.test(endpoint.pointer), 'invalid_mapping_pointer');
  let current = json(matches[0].bytes);
  for (const escaped of endpoint.pointer.slice(1).split('/')) {
    const key = escaped.replaceAll('~1', '/').replaceAll('~0', '~');
    requireThat(current !== null && typeof current === 'object' && Object.hasOwn(current, key), 'unresolved_mapping_pointer');
    if (Array.isArray(current)) requireThat(/^(?:0|[1-9]\d*)$/.test(key), 'ambiguous_mapping_pointer');
    current = current[key];
  }
  return hash(current);
}
function rawSummary(value) {
  if (Buffer.isBuffer(value)) return { type: 'buffer', bytes: value.length, sha256: contentHash(value) };
  if (Array.isArray(value)) return { type: 'array', values: value.map(rawSummary) };
  if (plain(value)) return { type: 'object', values: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rawSummary(v)])) };
  return { type: value === null ? 'null' : typeof value, value };
}

/**
 * Request byte ports: preimage/candidate {files,inventory,sha256}; sources
 * {baseCommit,files,inventory,sha256}; implementation {baseCommit,commit,
 * files,inventory,sha256} binds both new leaves supplied by the caller;
 * externally allocated authorityId;
 * targets, mappings, writerInventory, barrier, runtime and receipt descriptors.
 * Inventory digests use hash(canonical(inventory)). Bytes/unknowns are retained.
 * External receipt bodies bind intentDigest, avoiding a self-hashing approval.
 * The final manifest digest still needs actual out-of-band Root authorization.
 */
export function plan(request) {
  const began = performance.now();
  const input = clone(request), findings = []; let limited = false;
  const add = (code, pointer = '') => {
    if (findings.length >= LIMITS.findings - 1) { limited = true; return; }
    findings.push({ code, pointer });
  };
  const check = (fn, pointer = '') => { try { fn(); } catch (error) { add(error.code ?? 'invalid_port', pointer); } };
  const phase = () => {
    if (performance.now() - began > LIMITS.milliseconds) { limited = true; refuse('planning_budget_exceeded'); }
  };
  requireThat(plain(input), 'invalid_request');
  check(() => requireThat(input.schemaVersion === 1 && (input.mode ?? 'read-only') === 'read-only', 'unsupported_mode'));
  const groups = ['preimage', 'candidate', 'sources', 'implementation']; const manifests = {};
  let entryCount = 0;
  for (const group of groups) check(() => {
    phase(); const port = input[group]; requireThat(plain(port), 'missing_image_port');
    manifests[group] = inventory(port.files); entryCount += port.files.length;
    requireThat(eq(manifests[group], port.inventory) && hash(manifests[group]) === port.sha256, 'raw_inventory_mismatch');
    const folded = manifests[group].map(x => x.path.toLowerCase());
    requireThat(new Set(folded).size === folded.length, 'duplicate_or_aliased_inventory_path');
  }, '/' + group);
  const receipts = Array.isArray(input.receipts) ? input.receipts : [];
  entryCount += receipts.length;
  check(() => requireThat(entryCount <= LIMITS.entries, 'transport_entry_bound'));
  const dependencies = Object.entries(SOURCE_PINS).map(([path, sha256]) => ({ path, sha256 }));
  check(() => {
    requireThat(input.sources.baseCommit === SOURCE_COMMIT, 'unsupported_source_commit');
    requireThat(input.sources.files.length === dependencies.length, 'source_inventory_not_exact');
    for (const x of dependencies) requireThat(manifests.sources.some(y => y.path === x.path && y.sha256 === x.sha256), 'dependency_pin_mismatch');
  }, '/sources');
  check(() => {
    const p = input.implementation;
    requireThat(p?.baseCommit === SOURCE_COMMIT && /^[a-f0-9]{40}$/.test(p.commit ?? '')
      && p.commit !== SOURCE_COMMIT, 'implementation_source_receipt_required');
    requireThat(eq(manifests.implementation.map(x => x.path).sort(),
      ['scripts/agentic/corpus-adoption.mjs', 'scripts/agentic/corpus-adoption.node-test.mjs'].sort()), 'implementation_inventory_not_exact');
  }, '/implementation');
  let legacy = null;
  const legacySources = () => ({ qualifiedCommit: QUALIFIED_SOURCE, implementationCommit: SOURCE_COMMIT,
    files: input.sources.files.filter(x => x.path !== 'scripts/agentic/corpus-owner-process.ps1') });
  for (const group of ['preimage', 'candidate']) check(() => {
    phase(); const sources = legacySources(), files = input[group].files;
    const result = prepareLegacyAdoptionProposal({ files, sources,
      expectedPreimageSha256: describeSnapshot(files).sha256, expectedSourceSha256: describeSources(sources).sha256 });
    if (!result.proposal.analysisComplete) limited = true;
    if (group === 'preimage') legacy = result.proposal;
    else {
      requireThat(result.proposal.analysisComplete, 'candidate_analysis_incomplete');
      for (const f of result.proposal.findings) add('candidate_' + f.code, f.file + f.pointer);
      validateCorpus(new Map(files.map(x => [x.path, x.bytes])));
    }
  }, '/candidate');
  check(() => requireThat(UUID.test(input.authorityId ?? ''), 'external_authority_uuid_required'), '/authorityId');
  check(() => {
    const t = input.targets; requireThat(plain(t), 'target_port_required');
    const [repo, common, original, future, binding] = ['repoRoot', 'gitCommonDirectory', 'legacyRoot', 'futureRoot', 'bindingPath'].map(k => winPath(t[k]));
    requireThat(binding === common + '\\xenios-coordination\\authority-binding.json', 'binding_target_mismatch');
    requireThat(winPath(t.futureParent) === future.slice(0, future.lastIndexOf('\\')), 'future_parent_mismatch');
    requireThat(!nested(future, original) && !nested(future, common) && !nested(original, common)
      && future !== repo && !repo.startsWith(future + '\\'), 'target_namespace_overlap');
    requireThat(['absent', 'empty'].includes(t.futureState) && t.bindingState === 'absent', 'target_not_explicitly_unpublished');
  }, '/targets');
  const mappings = Array.isArray(input.mappings) ? input.mappings : [];
  check(() => {
    requireThat(mappings.length > 0 && mappings.length <= LIMITS.entries, 'mapping_ledger_required');
    const seen = new Set();
    for (const row of mappings) {
      requireThat(plain(row) && typeof row.owner === 'string' && row.owner.length > 0 && typeof row.receiptId === 'string', 'mapping_owner_receipt_required');
      requireThat(row.original !== null || row.result !== null, 'empty_mapping');
      for (const [key, group] of [['original', 'preimage'], ['result', 'candidate']]) if (row[key] !== null) {
        requireThat(pointer(input[group].files, row[key]) === row[key].sha256, 'mapping_hash_mismatch');
        const id = key + '\0' + row[key].path + '\0' + row[key].pointer;
        requireThat(!seen.has(id), 'duplicate_mapping_endpoint'); seen.add(id);
      }
      requireThat(row.result !== null || row.disposition === 'archive_only', 'unexplained_candidate_omission');
    }
    for (const [key, group] of [['original', 'preimage'], ['result', 'candidate']]) {
      for (const x of input[group].files) requireThat(seen.has(key + '\0' + x.path + '\0'), 'incomplete_whole_file_mapping');
    }
  }, '/mappings');
  check(() => {
    const rt = input.runtime;
    requireThat(plain(rt) && rt.nodeVersion === REQUIRED_NODE && rt.namespace?.platform === 'win32'
      && rt.namespace.fileSystem === 'NTFS' && typeof rt.namespace.hostId === 'string' && rt.namespace.hostId
      && instant(rt.namespace.bootId) && instant(rt.capturedAt) && rt.localFixedDrive === true, 'unsupported_runtime_descriptor');
    requireThat(eq(Object.keys(rt.namespace).sort(), ['platform', 'hostId', 'bootId', 'fileSystem'].sort()), 'unsupported_namespace_fields');
    requireThat(Number.isSafeInteger(rt.owner?.pid) && rt.owner.pid > 0 && instant(rt.owner.birthId)
      && rt.owner.found === true && ticks(rt.owner.birthId) >= ticks(rt.namespace.bootId) && ticks(rt.owner.birthId) <= ticks(rt.capturedAt), 'owner_birth_unknown');
    requireThat(rt.producer === 'corpus-store.observeOwner' && rt.gitCommonDirectory === input.targets.gitCommonDirectory,
      'runtime_source_or_common_mismatch');
    requireThat(Array.isArray(rt.physicalPaths), 'physical_fence_missing');
    const physical = [input.targets.repoRoot, input.targets.gitCommonDirectory, input.targets.legacyRoot, input.targets.futureParent];
    if (input.targets.futureState === 'empty') physical.push(input.targets.futureRoot);
    for (const path of physical) {
      const rows = rt.physicalPaths.filter(x => x.path === path);
      requireThat(rows.length === 1 && rows[0].noReparseOrAlias === true && rows[0].realPath === path, 'physical_fence_unknown');
    }
    requireThat(plain(input.barrier) && UUID.test(input.barrier.id ?? '') && typeof input.barrier.eventId === 'string'
      && input.barrier.eventId.length > 0 && instant(input.barrier.cutoff)
      && ticks(input.barrier.cutoff) >= ticks(rt.namespace.bootId) && ticks(input.barrier.cutoff) <= ticks(rt.capturedAt), 'barrier_identity_unknown');
  }, '/runtime');
  const effects = { readOnly: true, publishable: false, writes: false, idsAllocated: false,
    genesisProduced: false, bindingProduced: false, processOrNetworkCalls: false };
  const recovery = 'inspect_explicit_prepared_bytes_only; no deletion, overwrite, retry, reset or publisher';
  const committed = rawSummary(Object.fromEntries(Object.entries(input).filter(([k]) => !['receipts', 'preparedObservation'].includes(k))));
  const intent = { schemaVersion: 1, kind: 'corpus_adoption_intent_not_authority', committed, effects, recovery };
  const intentDigest = hash(intent), bodies = new Map();
  check(() => {
    requireThat(receipts.length <= LIMITS.entries, 'receipt_bound');
    for (const row of receipts) {
      requireThat(plain(row) && typeof row.id === 'string' && row.id && typeof row.kind === 'string'
        && Buffer.isBuffer(row.bytes) && SHA.test(row.sha256 ?? '') && contentHash(row.bytes) === row.sha256, 'receipt_descriptor_mismatch');
      requireThat(!bodies.has(row.id), 'duplicate_receipt_id'); const body = json(row.bytes);
      requireThat(body.schemaVersion === 1 && body.id === row.id && body.kind === row.kind
        && body.intentDigest === intentDigest, 'receipt_subject_mismatch'); bodies.set(row.id, { descriptor: row, body });
    }
  }, '/receipts');
  const required = kind => {
    const id = input.requirements?.[kind], found = bodies.get(id);
    requireThat(found?.descriptor.kind === kind, 'required_receipt_missing_' + kind); return found.body;
  };
  for (const kind of REQUIRED_RECEIPTS) check(() => required(kind), '/requirements/' + kind);
  check(() => {
    const d = required('mapping_decisions');
    requireThat(Array.isArray(d.decidingOwners), 'mapping_deciders_missing');
    for (const row of mappings) requireThat(row.receiptId === input.requirements.mapping_decisions && d.decidingOwners.includes(row.owner), 'mapping_receipt_coverage_missing');
    requireThat(legacy?.analysisComplete, 'legacy_analysis_incomplete');
    const resolutions = Array.isArray(d.resolutions) ? d.resolutions : [];
    for (const f of legacy.findings) requireThat(resolutions.some(x => x.code === f.code && x.file === f.file && x.pointer === f.pointer), 'unresolved_legacy_finding');
  }, '/decisions');
  check(() => {
    const files = new Map(input.candidate.files.map(x => [x.path, x.bytes]));
    const sessions = json(files.get('SESSION_REGISTRY.json')).sessions, tasks = json(files.get('ACTIVE_TASKS.json')).tasks;
    const actors = required('native_actor_map').actorMappings;
    requireThat(Array.isArray(actors) && actors.length === sessions.length && new Set(actors.map(x => x.session)).size === actors.length, 'native_actor_coverage_missing');
    for (const session of sessions) requireThat(actors.some(x => x.session === session.id && typeof x.nativeActor === 'string'
      && x.nativeActor.length > 0 && typeof x.receiptReference === 'string' && x.receiptReference.length > 0), 'native_actor_mapping_unknown');
    const ids = required('handoff_acceptance').taskIds, needed = tasks.filter(x => ['qa', 'done'].includes(x.state)).map(x => x.id).sort();
    requireThat(Array.isArray(ids) && eq([...ids].sort(), needed), 'handoff_acceptance_coverage_missing');
  }, '/external_decisions');
  check(() => {
    const writers = input.writerInventory, b = required('writer_barrier');
    requireThat(Array.isArray(writers) && writers.length > 0 && writers.length <= LIMITS.entries
      && new Set(writers.map(x => x.id)).size === writers.length, 'writer_inventory_required');
    requireThat(b.barrierId === input.barrier.id && b.eventId === input.barrier.eventId && b.cutoff === input.barrier.cutoff
      && Array.isArray(b.writers) && b.writers.length === writers.length && new Set(b.writers.map(x => x.id)).size === writers.length, 'writer_barrier_coverage_missing');
    for (const writer of writers) {
      requireThat(typeof writer.actor === 'string' && writer.actor && typeof writer.kind === 'string' && writer.kind
        && typeof writer.location === 'string' && writer.location, 'writer_identity_unknown');
      const row = b.writers.find(x => x.id === writer.id), ev = bodies.get(row?.evidenceReceiptId)?.body;
      requireThat(ev && row.actor === writer.actor && ev.actor === writer.actor && ev.barrierId === b.barrierId
        && ev.eventId === b.eventId && ev.cutoff === b.cutoff && ev.preimageSha256 === input.preimage.sha256
        && instant(ev.observedAt) && ticks(ev.observedAt) >= ticks(input.runtime.namespace.bootId) && ticks(ev.observedAt) <= ticks(b.cutoff), 'writer_evidence_missing_or_late');
      if (row.state === 'held_no_write') requireThat(ev.kind === 'writer_ack' && ev.disposition === 'held_no_write'
        && typeof ev.supportedChannelReceipt === 'string' && ev.supportedChannelReceipt, 'writer_ack_unresolved');
      else requireThat(row.state === 'stopped' && ev.kind === 'writer_absence' && Number.isSafeInteger(ev.pid) && ev.pid > 0
        && ev.pid === writer.pid && ev.priorBirthId === writer.birthId && instant(ev.priorBirthId)
        && ticks(ev.priorBirthId) >= ticks(input.runtime.namespace.bootId) && ticks(ev.priorBirthId) <= ticks(ev.observedAt)
        && ev.found === false && eq(ev.namespace, input.runtime.namespace), 'writer_not_proven_stopped');
    }
  }, '/writers');
  check(phase);
  if (limited) findings.push({ code: 'finite_analysis_limit', pointer: '' });
  findings.sort((a, b) => compare(canonical(a), canonical(b)));
  const manifest = { schemaVersion: 1, kind: 'corpus_adoption_read_only_plan', intent, intentDigest,
    status: findings.length ? 'blocked_pending_supplied_evidence' : 'mechanically_complete_external_authentication_pending',
    publishable: false, authorityEstablished: false, findings, analysisComplete: !limited,
    targets: Object.fromEntries(['repoRoot', 'gitCommonDirectory', 'legacyRoot', 'futureRoot', 'futureParent', 'bindingPath', 'futureState', 'bindingState']
      .map(key => [key, typeof input.targets?.[key] === 'string' ? input.targets[key] : null])),
    source: { baseCommit: SOURCE_COMMIT, implementationCommit: typeof input.implementation?.commit === 'string' ? input.implementation.commit : null },
    inventories: manifests, receiptInventory: receipts.map(x => plain(x) ? ({ id: x.id ?? null, kind: x.kind ?? null, sha256: x.sha256 ?? null })
      : ({ invalidDescriptor: true })).sort((a, b) => compare(String(a.id ?? ''), String(b.id ?? ''))),
    dependencies, legacyFindings: legacy?.findings ?? [], legacyAdoptable: false,
    archive: { allSuppliedPreimageBytesRetained: true, unknownFieldsHistoryAndDuplicates: 'preserved_as_raw_input_not_rewritten' },
    requiredExternalReceipts: REQUIRED_RECEIPTS.map(kind => ({ kind, id: input.requirements?.[kind] ?? null,
      state: bodies.has(input.requirements?.[kind]) ? 'bytes_bound_authenticity_unverified' : 'missing' })),
    writerInventoryCompletenessVerified: false, currentRuntimeVerified: false, loadedCodeProvenanceVerified: false,
    externalBoundary: 'Descriptor/hash/coverage checks do not authenticate authors, approval, ACKs, actual Git/NTFS, runtime, current quiescence or loaded source. Root must authenticate and authorize the final digest outside this module.',
    futurePublisherRequired: true, observerOrStoreIoInvoked: false };
  return { manifest, digest: hash(manifest), retainedRequest: input,
    diagnostics: { monotonicElapsedMs: performance.now() - began, hardOsDeadlineClaimed: false }, preparedObservation: null };
}

/** Explicit preparedObservation is caller-supplied immutable data, not a path to read. */
export function inspectPrepared(preparedPlan) {
  const input = clone(preparedPlan), rebuilt = plan(input.retainedRequest);
  requireThat(eq(input.manifest, rebuilt.manifest) && input.digest === rebuilt.digest, 'prepared_plan_identity_mismatch');
  const report = { schemaVersion: 1, kind: 'explicit_prepared_corpus_inspection', planDigest: input.digest,
    publishable: false, phase: 'unobserved', installed: null, trustedStoreReadVerified: false,
    actualFilesystemObserved: false, findings: [], mutations: false,
    retainedPreparedObservation: input.preparedObservation ?? null };
  const observation = input.preparedObservation;
  if (observation === null || observation === undefined) return report;
  try {
    requireThat(input.manifest.findings.length === 0 && input.manifest.analysisComplete, 'blocked_plan_cannot_qualify_preparation');
    requireThat(observation.planDigest === input.digest && eq(observation.targets, input.retainedRequest.targets), 'prepared_observation_subject_mismatch');
    const request = input.retainedRequest, runtime = observation.runtime;
    requireThat(runtime?.nodeVersion === REQUIRED_NODE && runtime.producer === 'corpus-store.observeOwner'
      && eq(runtime.namespace, request.runtime.namespace) && instant(runtime.capturedAt)
      && ticks(runtime.capturedAt) >= ticks(request.runtime.capturedAt)
      && runtime.owner?.found === true && Number.isSafeInteger(runtime.owner.pid) && runtime.owner.pid > 0
      && instant(runtime.owner.birthId) && ticks(runtime.owner.birthId) >= ticks(runtime.namespace.bootId)
      && ticks(runtime.owner.birthId) <= ticks(runtime.capturedAt), 'prepared_runtime_unknown');
    const observedPath = observation.image?.state === 'absent' ? request.targets.futureParent : request.targets.futureRoot;
    requireThat(runtime.physicalPath?.path === observedPath && runtime.physicalPath.realPath === observedPath
      && runtime.physicalPath.noReparseOrAlias === true, 'prepared_physical_root_unknown');
    if (observation.binding?.state === 'unknown') refuse('binding_outcome_unknown');
    requireThat(['absent', 'present'].includes(observation.binding?.state), 'binding_state_not_observed');
    if (observation.image?.state === 'absent') {
      requireThat(observation.binding.state === 'absent', 'binding_without_prepared_image');
      report.phase = 'observed_absent_unprepared'; report.installed = false; return report;
    }
    requireThat(observation.image?.state === 'present', 'prepared_image_unknown');
    const actual = inventory(observation.image.files);
    requireThat(eq(actual, input.manifest.inventories.candidate) && eq(actual, observation.image.inventory), 'prepared_image_drift');
    validateCorpus(new Map(observation.image.files.map(x => [x.path, x.bytes])));
    const roots = [...actual.filter(x => !x.path.includes('/')).map(x => x.path), 'sessions', 'handoffs', 'messages', '.coordination'].sort();
    requireThat(Array.isArray(observation.rootEntries) && eq([...observation.rootEntries].sort(), roots), 'prepared_root_inventory_ambiguous');
    requireThat(Array.isArray(observation.metadataEntries) && eq([...observation.metadataEntries].sort(),
      ['HEAD.json', 'transactions', 'operations', 'aborted', 'mutex-candidates'].sort()), 'prepared_metadata_inventory_ambiguous');
    const head = json(observation.headBytes);
    requireThat(head.protocol === 1 && head.authorityId === request.authorityId
      && Number.isSafeInteger(head.revision) && head.revision >= 0, 'prepared_head_identity_unknown');
    if (head.revision > 0 || Object.keys(head.operationReceipts ?? {}).length > 0) refuse('advanced_authority_requires_existing_coordinator_recovery');
    requireThat(eq(head.files, Object.fromEntries(actual.map(x => [x.path, x.sha256]))) && eq(head.operationReceipts, {}), 'prepared_head_image_mismatch');
    for (const name of ['sessions', 'handoffs', 'messages', '.coordination/transactions', '.coordination/operations', '.coordination/aborted', '.coordination/mutex-candidates']) {
      const rows = observation.directories?.filter(x => x.path === name);
      requireThat(rows?.length === 1 && rows[0].noReparseOrAlias === true && Array.isArray(rows[0].entries), 'prepared_directory_unknown');
      if (name.startsWith('.coordination/')) requireThat(rows[0].entries.length === 0, 'prepared_journal_requires_existing_recovery');
      else requireThat(eq([...rows[0].entries].sort(), actual.filter(x => x.path.startsWith(name + '/')).map(x => x.path.slice(name.length + 1)).sort()), 'prepared_directory_inventory_mismatch');
    }
    if (observation.binding.state === 'absent') { report.phase = 'prepared_unpublished_observation'; report.installed = false; return report; }
    const binding = json(observation.binding.bytes);
    requireThat(binding.protocol === 1 && binding.authorityId === request.authorityId && binding.nodeVersion === REQUIRED_NODE
      && binding.corpusRoot === request.targets.futureRoot && binding.gitCommonDirectory === request.targets.gitCommonDirectory
      && eq(binding.namespace, request.runtime.namespace), 'foreign_or_inconsistent_binding');
    report.phase = 'coherent_binding_observed_requires_actual_trusted_store_read';
  } catch (error) { report.phase = 'held_for_explicit_recovery'; report.findings.push({ code: error.code ?? 'invalid_prepared_observation' }); }
  return report;
}

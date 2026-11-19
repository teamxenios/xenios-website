// Offline, byte-preserving proposal only. No authority/binding/genesis writer.
import { Buffer } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canonical, contentHash, identifier, ROOT_FILES, validateCorpus,
  windowsPattern, windowsPathsOverlap } from '../corpus-store.mjs';

export const QUALIFIED_SOURCE = '57d420613925cfc582827045019f22ec4949bcac';
export const IMPLEMENTATION_PATH = 'scripts/agentic/coordination-qualification/legacy-adoption-proposal.mjs';
export const CONTRACT_PINS = Object.freeze({
  'scripts/agentic/corpus-store.mjs': 'ffdc42467acaf8eba7de1646aa94ce384152cc2e4dd702b7a040ba8f03ab4761',
  'scripts/agentic/path-overlap.mjs': 'd21608ebc88f3329c6d1e158961dbe182b4474de4da2aecd9256b3d880958f87',
});
export const LIMITS = Object.freeze({ files: 10_000, fileBytes: 5 * 1024 * 1024,
  totalBytes: 32 * 1024 * 1024, records: 2_000, depth: 128, findings: 1_000,
  pathComparisons: 100_000 });
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const validUuid = value => typeof value === 'string' && UUID.test(value);
const validSha = value => typeof value === 'string' && SHA.test(value);
const validCommit = value => typeof value === 'string' && COMMIT.test(value);
const TASK_STATES = new Set(['ready', 'claimed', 'qa', 'done', 'blocked', 'backlog']);
const LEASE_STATES = new Set(['active', 'handoff', 'released']);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const plain = value => value !== null && typeof value === 'object'
  && Object.getPrototypeOf(value) === Object.prototype;
const pointerPart = value => String(value).replaceAll('~', '~0').replaceAll('/', '~1');
const digest = value => contentHash(Buffer.from(canonical(value), 'utf8'));

function transportError(code) { const error = new TypeError(code); error.code = code; throw error; }
function copyEntries(entries) {
  if (!Array.isArray(entries) || entries.length > LIMITS.files) transportError('invalid_entry_container');
  let total = 0;
  for (const entry of entries) {
    if (!plain(entry) || Object.keys(entry).some(key => !['path', 'bytes'].includes(key))
      || typeof entry.path !== 'string' || entry.path.length > 4_096
      || !Buffer.isBuffer(entry.bytes)) transportError('invalid_entry_shape');
    total += entry.bytes.length;
    if (entry.bytes.length > LIMITS.fileBytes || total > LIMITS.totalBytes) transportError('input_byte_limit');
  }
  return entries.map(entry => ({ path: entry.path, bytes: Buffer.from(entry.bytes) }))
    .sort((a, b) => compare(a.path, b.path) || compare(contentHash(a.bytes), contentHash(b.bytes)));
}
const manifestOf = entries => entries.map(entry => ({ path: entry.path,
  bytes: entry.bytes.length, sha256: contentHash(entry.bytes) }));

/** Describes supplied bytes, not a filesystem capture or quiescence receipt. */
export function describeSnapshot(files) {
  const retained = copyEntries(files);
  const manifest = { schemaVersion: 1, kind: 'supplied_legacy_snapshot', files: manifestOf(retained) };
  return { manifest, sha256: digest(manifest) };
}

/** Git/loaded-code provenance is supplied by the caller, not established here. */
export function describeSources(sources) {
  if (!plain(sources) || Object.keys(sources).some(key => !['qualifiedCommit', 'implementationCommit', 'files'].includes(key))
    || typeof sources.qualifiedCommit !== 'string' || sources.qualifiedCommit.length > 128
    || typeof sources.implementationCommit !== 'string' || sources.implementationCommit.length > 128) transportError('invalid_source_container');
  const retained = copyEntries(sources.files);
  const manifest = { schemaVersion: 1, kind: 'supplied_source_receipts',
    qualifiedCommit: sources.qualifiedCommit, implementationCommit: sources.implementationCommit,
    files: manifestOf(retained) };
  return { manifest, sha256: digest(manifest) };
}

// JSON.parse alone accepts duplicate members. Scan grammar/decoded member keys
// before parsing, retaining the original bytes rather than reserializing values.
function readUnambiguousJson(bytes) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw Object.assign(new Error('invalid_utf8'), { code: 'invalid_utf8' }); }
  let at = 0;
  const number = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  const fail = (code, pointer = '') => { throw Object.assign(new Error(code), { code,
    pointer: pointer.length <= 1_024 ? pointer : '', pointerSha256: digest(pointer) }); };
  const space = () => { while (at < text.length && /[\x20\t\r\n]/.test(text[at])) at++; };
  function string() {
    const start = at++;
    while (at < text.length) {
      const char = text[at++];
      if (char === '"') {
        try { return JSON.parse(text.slice(start, at)); } catch { fail('invalid_json'); }
      }
      if (char === '\\') at++;
    }
    fail('invalid_json');
  }
  function value(depth, pointer) {
    if (depth > LIMITS.depth) fail('json_depth_limit', pointer);
    space();
    const char = text[at];
    if (char === '{') {
      at++; space(); const keys = new Set();
      if (text[at] === '}') { at++; return; }
      while (at < text.length) {
        space(); if (text[at] !== '"') fail('invalid_json', pointer);
        const key = string(), child = pointer + '/' + pointerPart(key);
        if (keys.has(key)) fail('ambiguous_duplicate_json_key', child);
        keys.add(key); space(); if (text[at++] !== ':') fail('invalid_json', pointer);
        value(depth + 1, child); space();
        if (text[at] === '}') { at++; return; }
        if (text[at++] !== ',') fail('invalid_json', pointer);
      }
      fail('invalid_json', pointer);
    }
    if (char === '[') {
      at++; space(); let index = 0;
      if (text[at] === ']') { at++; return; }
      while (at < text.length) {
        value(depth + 1, pointer + '/' + index++); space();
        if (text[at] === ']') { at++; return; }
        if (text[at++] !== ',') fail('invalid_json', pointer);
      }
      fail('invalid_json', pointer);
    }
    if (char === '"') { string(); return; }
    for (const literal of ['true', 'false', 'null']) if (text.startsWith(literal, at)) { at += literal.length; return; }
    number.lastIndex = at; const match = number.exec(text);
    if (!match) fail('invalid_json', pointer);
    at = number.lastIndex;
  }
  value(0, ''); space(); if (at !== text.length) fail('invalid_json');
  try { return JSON.parse(text); } catch { fail('invalid_json'); }
}

function namespacePath(value) {
  return ROOT_FILES.includes(value)
    || /^sessions\/[A-Za-z0-9._-]{2,100}\.json$/.test(value)
    || /^(?:handoffs\/[A-Za-z0-9._-]{1,245}\.md|messages\/[A-Za-z0-9._-]{1,245}\.json)$/.test(value);
}

// Discovery may exclude a pair only when its Windows-folded literal prefixes
// diverge before either pattern's first wildcard. The frozen matcher widens
// ancestors and inline ** segments; stopping BEFORE every * preserves both.
// The trie never decides overlap. All retained candidates use the frozen
// predicate below, in the original lease/path order.
function boundedPathCandidates(active) {
  const exhausted = Symbol('discovery_exhausted');
  let remaining = LIMITS.pathComparisons, disabled = false;
  const prefixes = new Map(), indexes = new Map();
  function spend() { if (remaining-- <= 0) throw exhausted; }
  function prefix(path) {
    if (prefixes.has(path)) return prefixes.get(path);
    spend();
    const result = [];
    for (const segment of windowsPattern(path).split('/')) {
      spend();
      if (segment.includes('*')) break;
      result.push(segment);
    }
    prefixes.set(path, result);
    return result;
  }
  function node() { spend(); return { children: new Map(), ends: [] }; }
  function index(lease) {
    if (indexes.has(lease)) return indexes.get(lease);
    const root = node(), queries = new Map();
    active[lease].paths.forEach((path, at) => {
      let current = root;
      for (const segment of prefix(path)) {
        spend();
        if (!current.children.has(segment)) current.children.set(segment, node());
        current = current.children.get(segment);
      }
      spend(); current.ends.push(at);
    });
    const result = { root, queries };
    indexes.set(lease, result);
    return result;
  }
  return (lease, path) => {
    if (disabled) return null;
    try {
      spend();
      const { root, queries } = index(lease), parts = prefix(path), key = parts.join('/');
      if (queries.has(key)) return queries.get(key);
      const candidates = [];
      const append = current => {
        for (const at of current.ends) { spend(); candidates.push(at); }
      };
      let current = root;
      for (const segment of parts) {
        append(current); spend(); current = current.children.get(segment);
        if (!current) break;
      }
      if (current) {
        const pending = [current];
        while (pending.length) {
          const next = pending.pop(); spend(); append(next);
          for (const child of next.children.values()) { spend(); pending.push(child); }
        }
      }
      candidates.sort((a, b) => a - b);
      spend(); queries.set(key, candidates);
      return candidates;
    } catch (error) {
      if (error !== exhausted) throw error;
      // An unfinished index/query is NEVER an empty candidate list. Discard
      // it and use the original bounded scan from this untouched path onward.
      disabled = true; prefixes.clear(); indexes.clear();
      return null;
    }
  };
}

/**
 * Returns private retained byte copies plus a non-authoritative, hash-bound
 * proposal. No rewritten records, IDs, afterimages, journal or binding exists.
 * Transport shape/size errors throw before copying; caller buffers stay intact.
 * Every semantic refusal returns all supplied snapshot/source bytes unchanged.
 */
export function prepareLegacyAdoptionProposal({ files, sources, expectedPreimageSha256, expectedSourceSha256 }) {
  if (!plain(sources)) transportError('invalid_source_container');
  const retainedSnapshot = copyEntries(files), retainedSources = copyEntries(sources?.files);
  const preimage = describeSnapshot(retainedSnapshot), source = describeSources({ ...sources, files: retainedSources });
  const findings = [], classifications = [];
  let limited = false;
  function finding(code, file = '', pointer = '', related = []) {
    if (findings.length >= LIMITS.findings) { limited = true; return; }
    findings.push({ code, file, pointer, related });
  }
  const classify = (code, file, pointer) => {
    if (classifications.length >= LIMITS.findings) { limited = true; return; }
    classifications.push({ code, file, pointer, decision: 'root_evidence_and_custody_decision_required',
      authorityAssigned: false });
  };
  if (!validSha(expectedPreimageSha256) || expectedPreimageSha256 !== preimage.sha256) finding('preimage_receipt_mismatch');
  if (!validSha(expectedSourceSha256) || expectedSourceSha256 !== source.sha256) finding('source_receipt_mismatch');
  if (source.manifest.qualifiedCommit !== QUALIFIED_SOURCE || !validCommit(source.manifest.implementationCommit)) finding('unsupported_source_identity');
  const sourcePaths = new Map(), foldedSourcePaths = new Set();
  for (const entry of retainedSources) {
    try {
      const folded = windowsPattern(entry.path);
      if (foldedSourcePaths.has(folded)) finding('windows_source_path_collision', entry.path);
      foldedSourcePaths.add(folded);
    } catch { finding('invalid_windows_source_path', entry.path); }
    if (sourcePaths.has(entry.path)) finding('duplicate_source_path', entry.path);
    else sourcePaths.set(entry.path, entry);
  }
  if (!sourcePaths.has(IMPLEMENTATION_PATH)) finding('implementation_source_bytes_missing', IMPLEMENTATION_PATH);
  for (const [file, expected] of Object.entries(CONTRACT_PINS)) {
    const bytes = sourcePaths.get(file)?.bytes;
    if (!bytes) { finding('qualified_contract_bytes_missing', file); continue; }
    try {
      const normalized = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replaceAll('\r\n', '\n');
      if (contentHash(Buffer.from(normalized)) !== expected) finding('qualified_contract_hash_mismatch', file);
    } catch { finding('qualified_contract_hash_mismatch', file); }
  }

  const entries = new Map(), windowsFiles = new Map(), documents = new Map();
  for (const entry of retainedSnapshot) {
    let normalized;
    try { normalized = windowsPattern(entry.path); }
    catch { finding('invalid_windows_snapshot_path', entry.path); }
    if (normalized && windowsFiles.has(normalized)) finding('windows_snapshot_path_collision', entry.path, '',
      [{ file: windowsFiles.get(normalized), pointer: '' }]);
    else if (normalized) windowsFiles.set(normalized, entry.path);
    if (entry.path.includes('\\') || entry.path.split('/').some(part => !part || part === '.'
      || part === '..' || /[ .]$/.test(part) || /[?*]/.test(part))) finding('noncanonical_snapshot_path', entry.path);
    if (!namespacePath(entry.path)) finding('unsupported_legacy_inventory_entry', entry.path);
    if (entries.has(entry.path)) { finding('duplicate_snapshot_path', entry.path); continue; }
    entries.set(entry.path, entry.bytes);
    if (entry.path.endsWith('.json')) {
      try { documents.set(entry.path, readUnambiguousJson(entry.bytes)); }
      catch (error) { finding(error.code ?? 'invalid_json', entry.path, error.pointer ?? ''); }
    }
  }
  for (const file of ROOT_FILES) if (!entries.has(file)) finding('missing_root_file', file);
  function records(file, key) {
    const root = documents.get(file);
    if (!plain(root) || !Array.isArray(root[key])) { finding('invalid_record_container', file, '/' + key); return []; }
    if (root[key].length > LIMITS.records) { finding('record_analysis_limit', file, '/' + key); limited = true; return []; }
    return root[key].map((record, index) => ({ record, file, pointer: '/' + key + '/' + index }));
  }
  const tasks = records('ACTIVE_TASKS.json', 'tasks'), sessions = records('SESSION_REGISTRY.json', 'sessions');
  const leases = records('CODE_OWNERSHIP.json', 'leases');
  function index(rows, kind) {
    const result = new Map(), folded = new Map();
    for (const row of rows) {
      if (!plain(row.record)) { finding('invalid_' + kind + '_record', row.file, row.pointer); continue; }
      const id = row.record.id;
      try { identifier(id); } catch { finding('invalid_' + kind + '_id', row.file, row.pointer + '/id'); continue; }
      if (folded.has(id.toLowerCase())) finding(kind + '_id_collision', row.file, row.pointer + '/id',
        [{ file: row.file, pointer: folded.get(id.toLowerCase()).pointer + '/id' }]);
      else folded.set(id.toLowerCase(), row);
      if (!result.has(id)) result.set(id, row);
    }
    return result;
  }
  const taskIndex = index(tasks, 'task'), sessionIndex = index(sessions, 'session');
  for (const row of sessions) {
    if (!plain(row.record) || !sessionIndex.has(row.record.id)) continue;
    const file = 'sessions/' + row.record.id + '.json';
    if (!entries.has(file)) finding('missing_session_mirror', row.file, row.pointer, [{ file, pointer: '' }]);
    else if (documents.has(file)) {
      try { if (canonical(documents.get(file)) !== canonical(row.record)) finding('session_mirror_mismatch', file); }
      catch { finding('session_mirror_mismatch', file); }
    }
  }
  for (const file of entries.keys()) if (file.startsWith('sessions/') && file.endsWith('.json')) {
    if (!sessionIndex.has(file.slice('sessions/'.length, -'.json'.length))) finding('unindexed_session_file', file);
  }
  function paths(row) {
    if (!Array.isArray(row.record.paths) || row.record.paths.length === 0 || row.record.paths.length > LIMITS.records) {
      finding('invalid_paths', row.file, row.pointer + '/paths'); return null;
    }
    const seen = new Set(); let valid = true;
    row.record.paths.forEach((value, i) => {
      try {
        const path = windowsPattern(value);
        if (value.includes('\\') || value.split('/').some(part => !part || part === '.' || /[ .]$/.test(part))) {
          finding('noncanonical_path_spelling', row.file, row.pointer + '/paths/' + i); valid = false;
        }
        if (seen.has(path)) { finding('duplicate_windows_path', row.file, row.pointer + '/paths/' + i); valid = false; }
        seen.add(path);
      }
      catch { finding('invalid_windows_path', row.file, row.pointer + '/paths/' + i); valid = false; }
    });
    return valid ? row.record.paths : null;
  }
  const active = [], leaseIds = new Map();
  for (const row of leases) {
    if (!plain(row.record)) { finding('invalid_lease_record', row.file, row.pointer); continue; }
    const lease = row.record;
    if (!validUuid(lease.id)) {
      const code = Object.hasOwn(lease, 'id') ? 'invalid_lease_uuid' : 'missing_lease_uuid';
      finding(code, row.file, row.pointer + '/id'); classify(code, row.file, row.pointer + '/id');
    } else if (leaseIds.has(lease.id)) finding('duplicate_lease_uuid', row.file, row.pointer + '/id');
    else leaseIds.set(lease.id, row);
    if (!LEASE_STATES.has(lease.state)) finding('unsupported_lease_state', row.file, row.pointer + '/state');
    if (!taskIndex.has(lease.task)) finding('unknown_lease_task', row.file, row.pointer + '/task');
    if (!sessionIndex.has(lease.session)) finding('unknown_lease_session', row.file, row.pointer + '/session');
    const normalizedPaths = paths(row);
    if (lease.state === 'active') active.push({ ...row, paths: normalizedPaths });
  }
  for (const row of tasks) {
    if (!plain(row.record)) continue;
    const task = row.record; const taskPaths = paths(row);
    if (!TASK_STATES.has(task.state)) finding('unsupported_task_state', row.file, row.pointer + '/state');
    if (task.owner != null && !sessionIndex.has(task.owner)) finding('unknown_task_owner', row.file, row.pointer + '/owner');
    if (!Array.isArray(task.dependsOn ?? []) || !(task.dependsOn ?? []).every(id => taskIndex.has(id))) finding('invalid_task_dependency', row.file, row.pointer + '/dependsOn');
    const claims = active.filter(lease => lease.record.task === task.id);
    if (task.state === 'claimed') {
      if (!validUuid(task.claimId)) {
        const code = Object.hasOwn(task, 'claimId') ? 'invalid_task_claim_uuid' : 'missing_task_claim_uuid';
        finding(code, row.file, row.pointer + '/claimId'); classify(code, row.file, row.pointer + '/claimId');
      }
      if (claims.length !== 1 || claims[0]?.record.id !== task.claimId || claims[0]?.record.session !== task.owner
        || !taskPaths || !claims[0]?.paths || canonical(taskPaths) !== canonical(claims[0].paths)) {
        finding('claim_lease_correspondence_required', row.file, row.pointer,
          claims.map(lease => ({ file: lease.file, pointer: lease.pointer })));
      }
    } else if (claims.length) finding('active_lease_on_nonclaimed_task', row.file, row.pointer,
      claims.map(lease => ({ file: lease.file, pointer: lease.pointer })));
    if (task.state === 'qa' || task.state === 'done') {
      const handoff = task.handoff;
      if (!plain(handoff)) finding('missing_handoff_binding', row.file, row.pointer + '/handoff');
      else {
        const rel = typeof handoff.file === 'string' ? handoff.file.replace(/^\.xenios\//, '') : '';
        if (!sessionIndex.has(handoff.session)) finding('unknown_handoff_session', row.file, row.pointer + '/handoff/session');
        if (!validCommit(handoff.sha)) finding('missing_or_invalid_handoff_source', row.file, row.pointer + '/handoff/sha');
        if (!rel.startsWith('handoffs/') || !namespacePath(rel) || !entries.has(rel)) finding('unresolved_handoff_file', row.file, row.pointer + '/handoff/file');
        else if (!validSha(handoff.contentSha256) || contentHash(entries.get(rel)) !== handoff.contentSha256
          || handoff.bytes !== entries.get(rel).length) finding('handoff_byte_binding_required', row.file, row.pointer + '/handoff');
      }
    }
    if (task.state === 'done') {
      if (!validCommit(task.acceptedSha) || task.acceptedSha !== task.handoff?.sha) finding('acceptance_source_binding_required', row.file, row.pointer + '/acceptedSha');
      if (!sessionIndex.has(task.acceptedBy)) finding('acceptor_identity_evidence_required', row.file, row.pointer + '/acceptedBy');
      if (task.acceptedBy && task.acceptedBy === task.handoff?.session) finding('independent_acceptance_required', row.file, row.pointer + '/acceptedBy');
    }
  }
  let comparisons = 0;
  const candidatesFor = boundedPathCandidates(active);
  overlap: for (let i = 0; i < active.length; i++) {
    pair: for (let j = i + 1; j < active.length; j++) {
      if (!active[i].paths || !active[j].paths) continue;
      for (const a of active[i].paths) {
        const candidates = candidatesFor(j, a);
        for (const at of candidates ?? active[j].paths.keys()) {
          if (++comparisons > LIMITS.pathComparisons) { finding('path_comparison_limit'); limited = true; break overlap; }
          if (windowsPathsOverlap(a, active[j].paths[at])) {
            finding('active_lease_overlap', active[i].file, active[i].pointer,
              [{ file: active[j].file, pointer: active[j].pointer }]);
            continue pair;
          }
        }
      }
    }
  }
  const messageIds = new Set();
  for (const [file, value] of documents) if (file.startsWith('messages/')) {
    if (!plain(value) || !validUuid(value.id) || messageIds.has(value.id)
      || !sessionIndex.has(value.from) || !(value.to === 'all' || sessionIndex.has(value.to)) || typeof value.text !== 'string') finding('message_binding_required', file);
    if (plain(value)) messageIds.add(value.id);
  }
  let strictValidator = 'not_run_blocked_input';
  if (findings.length === 0 && !limited) {
    try { validateCorpus(entries); strictValidator = 'supplied_bytes_satisfy_frozen_structural_contract'; }
    catch (error) { strictValidator = 'refused'; finding('strict_contract_refusal_' + (error.code ?? 'unknown')); }
  }
  if (limited) findings.push({ code: 'finite_analysis_limit', file: '', pointer: '', related: [] });
  const sortRows = rows => rows.sort((a, b) => compare(canonical(a), canonical(b)));
  const proposal = {
    schemaVersion: 1, kind: 'lossless_legacy_adoption_proposal_not_authority',
    status: findings.length ? 'blocked_pending_evidence_or_owner_decisions' : 'reviewable_structural_proposal_only',
    adoptable: false, authorityAssigned: false, idsAllocated: false, afterimagesProduced: false,
    preimage: preimage.manifest, preimageSha256: preimage.sha256,
    source: source.manifest, sourceSha256: source.sha256,
    gitAndLoadedCodeProvenanceVerified: false, captureQuiescenceAndWriterAcksVerified: false,
    findings: sortRows(findings), classifications: sortRows(classifications), analysisComplete: !limited,
    strictValidator, preservedSnapshotFiles: retainedSnapshot.length, preservedSourceFiles: retainedSources.length,
    boundary: 'supplied bytes only; no live inspection, mutation, acceptance, genesis, journal, binding or controller action',
  };
  return { proposal, proposalSha256: digest(proposal), retainedSnapshot, retainedSources };
}

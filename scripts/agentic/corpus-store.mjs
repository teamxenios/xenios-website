// One transaction/snapshot protocol over the existing corpus, not a registry.
// No implicit binding/bootstrap or live adoption. Windows/local NTFS and the
// explicitly bound boot/runtime only; mixed legacy writers are unsupported.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { overlaps } from './path-overlap.mjs';

export const CORPUS_PROTOCOL = 1;
export const REQUIRED_NODE = '20.19.0';
export const ROOT_FILES = Object.freeze(['PROJECT_STATE.json', 'RELEASE_STATE.json', 'ROADMAP.json',
  'ACTIVE_TASKS.json', 'SESSION_REGISTRY.json', 'CODE_OWNERSHIP.json']);
const LIMIT = 5 * 1024 * 1024, TOTAL_LIMIT = 32 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const META = '.coordination';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const normalize = value => path.resolve(value).toLowerCase();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function fail(code) { const error = new Error(code); error.code = code; throw error; }
function requireThat(condition, code) { if (!condition) fail(code); }
export function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  requireThat(value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype, 'invalid_canonical_value');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
export const contentHash = sha;
function decode(bytes) {
  requireThat(bytes.length <= LIMIT, 'corpus_file_too_large');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail('invalid_corpus_utf8'); }
}
function parsed(bytes) { try { return JSON.parse(decode(bytes)); } catch (error) { if (error.code) throw error; fail('invalid_corpus_json'); } }
function dataPath(rel) {
  return ROOT_FILES.includes(rel) || /^sessions\/[A-Za-z0-9._-]{2,100}\.json$/.test(rel)
    || /^(?:handoffs\/[A-Za-z0-9._-]{1,245}\.md|messages\/[A-Za-z0-9._-]{1,245}\.json)$/.test(rel);
}
function operationPath(rel) { return new RegExp('^operations/([a-f0-9-]{36})\\.json$').test(rel) && UUID.test(path.basename(rel, '.json')); }
function target(root, rel) {
  requireThat(typeof rel === 'string' && !rel.includes('\\') && !rel.split('/').some(part => !part || part === '..' || part === '.'), 'unsafe_corpus_path');
  const result = path.resolve(root, rel);
  requireThat(normalize(result).startsWith(normalize(root) + path.sep), 'unsafe_corpus_path');
  for (let current = result; normalize(current) !== normalize(root); current = path.dirname(current)) {
    if (fs.existsSync(current)) requireThat(!fs.lstatSync(current).isSymbolicLink(), 'symlink_corpus_path');
  }
  return result;
}
function readBytes(file) {
  const stat = fs.lstatSync(file);
  requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size <= LIMIT, 'invalid_corpus_file');
  return fs.readFileSync(file);
}
function diskHash(file) { return fs.existsSync(file) ? sha(readBytes(file)) : null; }
function atomic(file, bytes) {
  requireThat(Buffer.isBuffer(bytes) && bytes.length <= LIMIT, 'invalid_atomic_content');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.pending-' + crypto.randomUUID();
  const descriptor = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, file);
}
function listData(root, temporaryTargets = new Set()) {
  const names = [...ROOT_FILES];
  for (const directory of ['sessions', 'handoffs', 'messages']) {
    const absolute = target(root, directory);
    if (!fs.existsSync(absolute)) continue;
    requireThat(fs.lstatSync(absolute).isDirectory() && !fs.lstatSync(absolute).isSymbolicLink(), 'invalid_corpus_directory');
    for (const name of fs.readdirSync(absolute)) {
      const rel = directory + '/' + name;
      const suffix = rel.lastIndexOf('.pending-');
      if (suffix > 0 && UUID.test(rel.slice(suffix + 9)) && temporaryTargets.has(rel.slice(0, suffix))) continue;
      requireThat(dataPath(rel), 'unsupported_corpus_entry'); names.push(rel);
    }
  }
  requireThat(names.length <= 10_000, 'too_many_corpus_files');
  return names.sort();
}
function inventory(root) {
  const result = new Map(); let size = 0;
  for (const rel of listData(root)) {
    const bytes = readBytes(target(root, rel)); size += bytes.length;
    requireThat(size <= TOTAL_LIMIT, 'corpus_snapshot_too_large'); result.set(rel, bytes);
  }
  return result;
}
function unique(items, field, code) {
  requireThat(Array.isArray(items) && items.length <= 10_000, code);
  const ids = items.map(item => item?.[field]);
  requireThat(ids.every(id => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length, code);
}
export function validateCorpus(files) {
  let bytes = 0;
  requireThat(files.size <= 10_000, 'too_many_corpus_files');
  for (const [rel, content] of files) {
    requireThat(dataPath(rel) && Buffer.isBuffer(content) && content.length <= LIMIT, 'invalid_corpus_entry');
    bytes += content.length; requireThat(bytes <= TOTAL_LIMIT, 'corpus_snapshot_too_large');
  }
  for (const name of ROOT_FILES) requireThat(files.has(name), 'missing_root_file');
  const read = rel => parsed(files.get(rel));
  const board = read('ACTIVE_TASKS.json'), registry = read('SESSION_REGISTRY.json'), ownership = read('CODE_OWNERSHIP.json');
  ROOT_FILES.forEach(read);
  unique(board.tasks, 'id', 'duplicate_or_invalid_task');
  unique(registry.sessions, 'id', 'duplicate_or_invalid_session');
  unique(ownership.leases, 'id', 'duplicate_or_invalid_lease');
  for (const session of registry.sessions) {
    const rel = 'sessions/' + session.id + '.json';
    requireThat(dataPath(rel) && files.has(rel), 'missing_session_file');
    requireThat(canonical(read(rel)) === canonical(session), 'session_mirror_mismatch');
  }
  const actualSessions = [...files.keys()].filter(rel => rel.startsWith('sessions/'));
  requireThat(actualSessions.length === registry.sessions.length, 'unindexed_session_file');
  const tasks = new Map(board.tasks.map(task => [task.id, task]));
  const sessions = new Set(registry.sessions.map(session => session.id));
  const active = ownership.leases.filter(lease => lease.state === 'active');
  for (const task of board.tasks) {
    requireThat(/^[A-Za-z0-9._-]{2,100}$/.test(task.id) && ['ready', 'claimed', 'qa', 'done', 'blocked', 'backlog'].includes(task.state), 'unsupported_task_state');
    requireThat(Array.isArray(task.paths) && task.paths.length > 0 && new Set(task.paths).size === task.paths.length
      && task.paths.every(value => typeof value === 'string' && value && !/^(?:\/|[A-Za-z]:)/.test(value)
        && !value.replaceAll('\\', '/').split('/').includes('..')), 'invalid_task_paths');
    requireThat(Array.isArray(task.dependsOn ?? []) && (task.dependsOn ?? []).every(id => tasks.has(id)), 'invalid_task_dependency');
    if (task.owner != null) requireThat(sessions.has(task.owner), 'unknown_task_owner');
    const claims = active.filter(lease => lease.task === task.id);
    if (task.state === 'claimed') {
      requireThat(UUID.test(task.claimId ?? '') && claims.length === 1 && claims[0].id === task.claimId
        && claims[0].session === task.owner && canonical(claims[0].paths) === canonical(task.paths), 'orphan_or_mismatched_claim');
    } else requireThat(claims.length === 0, 'unsupported_active_lease_state');
    if (task.state === 'qa' || task.state === 'done') {
      const handoff = task.handoff, rel = handoff?.file?.replace(/^\.xenios\//, '');
      requireThat(handoff && sessions.has(handoff.session) && /^[a-f0-9]{40}$/.test(handoff.sha ?? '')
        && SHA.test(handoff.contentSha256 ?? '') && typeof rel === 'string' && rel.startsWith('handoffs/') && dataPath(rel) && files.has(rel)
        && sha(files.get(rel)) === handoff.contentSha256 && handoff.bytes === files.get(rel).length, 'invalid_handoff_binding');
    }
    if (task.state === 'done') requireThat(task.acceptedSha === task.handoff.sha && sessions.has(task.acceptedBy), 'invalid_acceptance');
  }
  for (const lease of ownership.leases) {
    requireThat(UUID.test(lease.id) && tasks.has(lease.task) && sessions.has(lease.session) && Array.isArray(lease.paths)
      && ['active', 'handoff', 'released'].includes(lease.state), 'invalid_lease_reference');
  }
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    requireThat(!active[i].paths.some(a => active[j].paths.some(b => overlaps(a, b))), 'overlapping_active_leases');
  }
  const messageIds = new Set();
  for (const [rel, bytes] of files) if (rel.startsWith('messages/')) {
    const value = parsed(bytes);
    requireThat(UUID.test(value.id ?? '') && sessions.has(value.from)
      && !messageIds.has(value.id) && (value.to === 'all' || sessions.has(value.to)) && typeof value.text === 'string', 'invalid_message_binding');
    messageIds.add(value.id);
  }
  return true;
}

export function observeOwner(pid, authorityRoot) {
  requireThat(process.platform === 'win32' && process.versions.node === REQUIRED_NODE, 'unsupported_runtime');
  try {
    const bytes = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
      fileURLToPath(new URL('./corpus-owner-process.ps1', import.meta.url)),
      '-OwnerProcessId', String(pid), '-AuthorityPath', authorityRoot],
    { windowsHide: true, timeout: 8_000, maxBuffer: 64_000, stdio: ['ignore', 'pipe', 'pipe'] });
    const value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
    requireThat(value.schemaVersion === 1 && value.available === true && value.platform === 'win32' && value.fileSystem === 'NTFS'
      && value.localFixedDrive === true && typeof value.hostId === 'string' && value.hostId
      && typeof value.bootId === 'string' && Number.isFinite(Date.parse(value.bootId))
      && value.pid === pid && typeof value.found === 'boolean'
      && (!value.found || typeof value.birthId === 'string' && Number.isFinite(Date.parse(value.birthId))), 'owner_observation_unavailable');
    return value;
  } catch { fail('owner_observation_unavailable'); }
}
function namespaceOf(facts) { return { platform: facts.platform, hostId: facts.hostId, bootId: facts.bootId, fileSystem: facts.fileSystem }; }
function gitCommon(repoRoot) {
  try {
    const value = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd: repoRoot, windowsHide: true, encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return fs.realpathSync(value);
  } catch { fail('git_common_directory_unavailable'); }
}
export function resolveAuthority(repoRoot) {
  const common = gitCommon(repoRoot), bindingFile = path.join(common, 'xenios-coordination', 'authority-binding.json');
  requireThat(fs.existsSync(bindingFile), 'authority_binding_required');
  const bindingBytes = readBytes(bindingFile), binding = parsed(bindingBytes);
  requireThat(binding.protocol === CORPUS_PROTOCOL && UUID.test(binding.authorityId ?? '')
    && binding.nodeVersion === REQUIRED_NODE && typeof binding.corpusRoot === 'string', 'unsupported_authority_binding');
  const root = fs.realpathSync(binding.corpusRoot);
  requireThat(normalize(root) === normalize(binding.corpusRoot) && normalize(fs.realpathSync(binding.gitCommonDirectory)) === normalize(common), 'authority_binding_mismatch');
  const facts = observeOwner(process.pid, root);
  requireThat(facts.found && canonical(binding.namespace) === canonical(namespaceOf(facts)), 'unsupported_runtime_namespace');
  const metadata = target(root, META);
  requireThat(fs.existsSync(metadata) && fs.lstatSync(metadata).isDirectory()
    && !fs.lstatSync(metadata).isSymbolicLink(), 'authority_not_initialized');
  for (const name of ['transactions', 'operations', 'aborted', 'mutex-candidates']) {
    requireThat(fs.existsSync(target(metadata, name)) && fs.lstatSync(target(metadata, name)).isDirectory(), 'authority_not_initialized');
  }
  for (const name of ['sessions', 'handoffs', 'messages']) {
    requireThat(fs.existsSync(target(root, name)) && fs.lstatSync(target(root, name)).isDirectory(), 'authority_not_initialized');
  }
  return { root, common, binding, bindingFile, bindingHash: sha(bindingBytes), metadata, facts };
}
export function initialHead(files, authorityId) {
  requireThat(UUID.test(authorityId), 'invalid_authority_id'); validateCorpus(files);
  return { protocol: CORPUS_PROTOCOL, authorityId, revision: 0,
    files: Object.fromEntries([...files].map(([rel, bytes]) => [rel, sha(bytes)])), operationReceipts: {} };
}
function readHead(context) {
  const bytes = readBytes(path.join(context.metadata, 'HEAD.json')), value = parsed(bytes);
  checkHead(context, value);
  return { bytes, value };
}
function checkHead(context, value) {
  requireThat(value.protocol === CORPUS_PROTOCOL && value.authorityId === context.binding.authorityId
    && Number.isSafeInteger(value.revision) && value.revision >= 0 && value.files && !Array.isArray(value.files)
    && value.operationReceipts && !Array.isArray(value.operationReceipts) && Object.keys(value.files).every(dataPath)
    && ROOT_FILES.every(name => SHA.test(value.files[name] ?? ''))
    && Object.values(value.files).every(value => SHA.test(value))
    && Object.entries(value.operationReceipts).every(([id, hash]) => UUID.test(id) && SHA.test(hash))
    && Object.keys(value.operationReceipts).length === value.revision, 'invalid_corpus_head');
}
function cleanState(context) {
  const head = readHead(context), files = inventory(context.root);
  requireThat(canonical(Object.fromEntries([...files].map(([rel, bytes]) => [rel, sha(bytes)]))) === canonical(head.value.files), 'corpus_hash_drift');
  const operations = fs.readdirSync(path.join(context.metadata, 'operations')).sort();
  requireThat(canonical(operations) === canonical(Object.keys(head.value.operationReceipts).map(id => id + '.json').sort()), 'operation_index_drift');
  const revisions = new Set();
  for (const [id, expected] of Object.entries(head.value.operationReceipts)) {
    requireThat(UUID.test(id) && SHA.test(expected) && diskHash(target(context.metadata, 'operations/' + id + '.json')) === expected, 'operation_receipt_drift');
    const receipt = parsed(readBytes(target(context.metadata, 'operations/' + id + '.json')));
    requireThat(receipt.protocol === CORPUS_PROTOCOL && receipt.operationId === id && typeof receipt.actor === 'string'
      && typeof receipt.command === 'string' && SHA.test(receipt.fingerprint ?? '')
      && Number.isSafeInteger(receipt.revision) && receipt.revision > 0 && receipt.revision <= head.value.revision
      && !revisions.has(receipt.revision), 'invalid_operation_receipt');
    canonical(receipt.result); revisions.add(receipt.revision);
  }
  validateCorpus(files); return { head, files };
}
function assertHeld(context, owner) {
  requireThat(diskHash(context.bindingFile) === context.bindingHash, 'authority_binding_changed');
  const file = path.join(context.metadata, 'mutex', 'owner-' + owner.token + '.json');
  requireThat(fs.existsSync(file) && canonical(parsed(readBytes(file))) === canonical(owner), 'coordination_mutex_lost');
}
async function acquire(context, timeoutMs = 3_000) {
  const token = crypto.randomUUID(), owner = { protocol: CORPUS_PROTOCOL, token, pid: process.pid,
    birthId: context.facts.birthId, namespace: namespaceOf(context.facts) };
  const candidate = target(context.metadata, 'mutex-candidates/' + token), marker = 'owner-' + token + '.json';
  fs.mkdirSync(candidate); atomic(path.join(candidate, marker), jsonBytes(owner));
  const mutex = path.join(context.metadata, 'mutex'), deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      requireThat(Date.now() < deadline, 'coordination_busy');
      let acquired = false;
      try { fs.renameSync(candidate, mutex); acquired = true; }
      catch (error) {
        requireThat(fs.existsSync(candidate), 'coordination_candidate_lost');
        // Normal release can remove the old directory after the failed rename.
        // Retry disappearance, without treating an unreadable owner as dead.
        if (!fs.existsSync(mutex)) { await sleep(25); continue; }
        let entries;
        try {
          const stat = fs.lstatSync(mutex);
          requireThat(stat.isDirectory() && !stat.isSymbolicLink(), 'invalid_coordination_mutex');
          entries = fs.readdirSync(mutex);
        } catch (inspectionError) { if (inspectionError.code === 'ENOENT') continue; throw inspectionError; }
        if (entries.length === 0) { try { fs.rmdirSync(mutex); } catch (e) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(e.code)) throw e; } continue; }
        requireThat(entries.length === 1 && /^owner-[a-f0-9-]{36}\.json$/.test(entries[0]), 'unknown_coordination_owner');
        const oldFile = path.join(mutex, entries[0]); let old;
        try { old = parsed(readBytes(oldFile)); } catch (e) { if (!fs.existsSync(oldFile)) continue; throw e; }
        requireThat(old.protocol === CORPUS_PROTOCOL && UUID.test(old.token ?? '') && entries[0] === 'owner-' + old.token + '.json'
          && Number.isSafeInteger(old.pid) && old.pid > 0 && typeof old.birthId === 'string'
          && Number.isFinite(Date.parse(old.birthId)) && Date.parse(old.birthId) >= Date.parse(owner.namespace.bootId)
          && Date.parse(old.birthId) <= Date.now()
          && canonical(old.namespace) === canonical(owner.namespace), 'unknown_coordination_owner');
        const observation = observeOwner(old.pid, context.root);
        requireThat(canonical(namespaceOf(observation)) === canonical(owner.namespace), 'owner_namespace_unknown');
        if (!observation.found || observation.birthId !== old.birthId) {
          // Exact immutable token path prevents a delayed reclaimer deleting a
          // replacement owner. Never recursively remove a mutex directory.
          try { fs.unlinkSync(oldFile); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
          try { fs.rmdirSync(mutex); } catch (e) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(e.code)) throw e; }
          continue;
        }
        if (Date.now() >= deadline) fail('coordination_busy');
        await sleep(25);
      }
      if (acquired) { assertHeld(context, owner); return owner; }
    }
  } finally {
    if (fs.existsSync(candidate)) {
      const own = path.join(candidate, marker); if (fs.existsSync(own)) fs.unlinkSync(own);
      fs.rmdirSync(candidate);
    }
  }
}
function unlock(context, owner) {
  assertHeld(context, owner);
  fs.unlinkSync(path.join(context.metadata, 'mutex', 'owner-' + owner.token + '.json'));
  try { fs.rmdirSync(path.join(context.metadata, 'mutex')); }
  catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error; }
}
function transactionDirectories(context) {
  const base = path.join(context.metadata, 'transactions'), names = fs.readdirSync(base);
  requireThat(names.length <= 1_000 && names.every(name => UUID.test(name)), 'invalid_transaction_directory');
  return names.map(name => ({ name, root: target(base, name) }));
}
function inspectTransaction(context, directory) {
  const prepareFile = path.join(directory.root, 'PREPARE.json'), commitFile = path.join(directory.root, 'COMMIT.json');
  requireThat(fs.lstatSync(directory.root).isDirectory() && !fs.lstatSync(directory.root).isSymbolicLink(), 'invalid_transaction_directory');
  const names = fs.readdirSync(directory.root);
  requireThat(names.length <= 100 && names.every(name => /^(PREPARE|COMMIT|APPLIED)\.json(?:\.pending-[a-f0-9-]{36})?$/.test(name)), 'unknown_journal_entry');
  names.forEach(name => readBytes(path.join(directory.root, name)));
  if (!fs.existsSync(prepareFile)) {
    requireThat(names.every(name => name.startsWith('PREPARE.json.pending-')), 'commit_without_prepare');
    return { ...directory, committed: false, prepare: null };
  }
  const bytes = readBytes(prepareFile), prepare = parsed(bytes);
  requireThat(prepare.protocol === CORPUS_PROTOCOL && prepare.transactionId === directory.name
    && prepare.authorityId === context.binding.authorityId && UUID.test(prepare.operationId ?? '')
    && SHA.test(prepare.beforeHeadSha256 ?? '') && SHA.test(prepare.afterHeadSha256 ?? '')
    && Array.isArray(prepare.writes) && prepare.writes.length > 0
    && new Set(prepare.writes.map(item => item.area + '/' + item.path)).size === prepare.writes.length, 'invalid_prepared_journal');
  let total = 0;
  for (const item of prepare.writes) {
    requireThat((item.area === 'corpus' && dataPath(item.path) || item.area === 'metadata' && operationPath(item.path))
      && (item.beforeSha256 === null || SHA.test(item.beforeSha256)) && SHA.test(item.afterSha256)
      && typeof item.base64 === 'string', 'invalid_journal_write');
    const content = Buffer.from(item.base64, 'base64'); total += content.length;
    requireThat(content.length <= LIMIT && total <= TOTAL_LIMIT && content.toString('base64') === item.base64
      && sha(content) === item.afterSha256, 'invalid_journal_content');
  }
  const afterHead = Buffer.from(prepare.afterHeadBase64 ?? '', 'base64'), beforeHead = Buffer.from(prepare.beforeHeadBase64 ?? '', 'base64');
  requireThat(afterHead.length <= LIMIT && beforeHead.length <= LIMIT
    && afterHead.toString('base64') === prepare.afterHeadBase64 && beforeHead.toString('base64') === prepare.beforeHeadBase64
    && sha(afterHead) === prepare.afterHeadSha256 && sha(beforeHead) === prepare.beforeHeadSha256, 'invalid_journal_head');
  const before = parsed(beforeHead), after = parsed(afterHead); checkHead(context, before); checkHead(context, after);
  requireThat(after.revision === before.revision + 1 && !before.operationReceipts[prepare.operationId], 'invalid_journal_revision');
  const expected = structuredClone(before); expected.revision++;
  let receiptWrites = 0;
  for (const item of prepare.writes) {
    if (item.area === 'corpus') {
      requireThat((before.files[item.path] ?? null) === item.beforeSha256, 'invalid_journal_before_hash');
      expected.files[item.path] = item.afterSha256;
    } else {
      requireThat(item.path === 'operations/' + prepare.operationId + '.json' && item.beforeSha256 === null, 'invalid_journal_receipt');
      const receipt = parsed(Buffer.from(item.base64, 'base64'));
      requireThat(receipt.protocol === CORPUS_PROTOCOL && receipt.operationId === prepare.operationId
        && receipt.revision === after.revision && SHA.test(receipt.fingerprint ?? ''), 'invalid_journal_receipt');
      expected.operationReceipts[prepare.operationId] = item.afterSha256; receiptWrites++;
    }
  }
  requireThat(receiptWrites === 1 && canonical(expected) === canonical(after), 'invalid_journal_after_index');
  if (!fs.existsSync(commitFile)) {
    requireThat(!names.some(name => name.startsWith('APPLIED')), 'applied_without_commit');
    return { ...directory, committed: false, prepare, afterHead };
  }
  const commit = parsed(readBytes(commitFile));
  requireThat(commit.protocol === CORPUS_PROTOCOL && commit.transactionId === directory.name
    && commit.authorityId === context.binding.authorityId && commit.prepareSha256 === sha(bytes)
    && commit.afterHeadSha256 === prepare.afterHeadSha256, 'invalid_committed_journal');
  let applied = false;
  const appliedFile = path.join(directory.root, 'APPLIED.json');
  if (fs.existsSync(appliedFile)) {
    const marker = parsed(readBytes(appliedFile));
    requireThat(marker.protocol === CORPUS_PROTOCOL && marker.afterHeadSha256 === prepare.afterHeadSha256
      && marker.revision === after.revision, 'invalid_applied_marker'); applied = true;
  }
  return { ...directory, committed: true, applied, prepare, commit, afterHead };
}
function pending(context) {
  const head = readHead(context), entries = transactionDirectories(context).map(directory => inspectTransaction(context, directory));
  const applied = entries.filter(entry => entry.applied);
  requireThat(new Set(applied.map(entry => entry.prepare.operationId)).size === applied.length, 'duplicate_applied_operation');
  for (const entry of applied) {
    const historical = parsed(entry.afterHead);
    requireThat(historical.revision <= head.value.revision
      && historical.operationReceipts[entry.prepare.operationId] === head.value.operationReceipts[entry.prepare.operationId], 'applied_history_drift');
  }
  requireThat(Object.keys(head.value.operationReceipts).every(id => entries.some(entry => entry.committed && entry.prepare.operationId === id)), 'missing_committed_history');
  return entries.filter(entry => !entry.applied);
}
function removeKnownTemporary(file, bytes) {
  const parent = path.dirname(file), prefix = path.basename(file) + '.pending-';
  for (const name of fs.readdirSync(parent).filter(name => name.startsWith(prefix))) {
    const partial = readBytes(path.join(parent, name));
    requireThat(UUID.test(name.slice(prefix.length)) && partial.length <= bytes.length
      && bytes.subarray(0, partial.length).equals(partial), 'unknown_atomic_remnant');
    fs.unlinkSync(path.join(parent, name));
  }
}
function preflightMaterialization(context, entry) {
  const before = parsed(Buffer.from(entry.prepare.beforeHeadBase64, 'base64')), after = parsed(entry.afterHead);
  const dataWrites = new Map(entry.prepare.writes.filter(item => item.area === 'corpus').map(item => [item.path, item]));
  const names = listData(context.root, new Set(dataWrites.keys()));
  requireThat(names.every(rel => Object.hasOwn(before.files, rel) || Object.hasOwn(after.files, rel)), 'recovery_file_interference');
  const projected = new Map();
  for (const rel of new Set([...Object.keys(before.files), ...Object.keys(after.files)])) {
    const actual = diskHash(target(context.root, rel));
    requireThat(actual === (before.files[rel] ?? null) || actual === (after.files[rel] ?? null), 'recovery_file_interference');
    const bytes = dataWrites.has(rel) ? Buffer.from(dataWrites.get(rel).base64, 'base64') : readBytes(target(context.root, rel));
    projected.set(rel, bytes);
  }
  validateCorpus(projected);
  // Validate partial sibling temporaries before touching any canonical file.
  for (const item of entry.prepare.writes) {
    const file = target(item.area === 'corpus' ? context.root : context.metadata, item.path), prefix = path.basename(file) + '.pending-';
    const expected = Buffer.from(item.base64, 'base64');
    for (const name of fs.readdirSync(path.dirname(file)).filter(name => name.startsWith(prefix))) {
      const partial = readBytes(path.join(path.dirname(file), name));
      requireThat(UUID.test(name.slice(prefix.length)) && partial.length <= expected.length && expected.subarray(0, partial.length).equals(partial), 'unknown_atomic_remnant');
    }
  }
  const operationNames = fs.readdirSync(path.join(context.metadata, 'operations'));
  const receiptPath = 'operations/' + entry.prepare.operationId + '.json';
  requireThat(operationNames.every(name => Object.hasOwn(after.operationReceipts, path.basename(name, '.json'))
    || name.startsWith(entry.prepare.operationId + '.json.pending-')), 'operation_index_drift');
  for (const [id, expected] of Object.entries(before.operationReceipts)) {
    requireThat(diskHash(target(context.metadata, 'operations/' + id + '.json')) === expected, 'operation_receipt_drift');
  }
  const operationHash = diskHash(target(context.metadata, receiptPath));
  requireThat(operationHash === null || operationHash === after.operationReceipts[entry.prepare.operationId], 'recovery_file_interference');
}
function materialize(context, owner, entry) {
  const prepare = entry.prepare, currentHead = readHead(context);
  requireThat([prepare.beforeHeadSha256, prepare.afterHeadSha256].includes(sha(currentHead.bytes)), 'recovery_head_interference');
  preflightMaterialization(context, entry);
  for (const item of prepare.writes) {
    assertHeld(context, owner);
    const file = target(item.area === 'corpus' ? context.root : context.metadata, item.path);
    const actual = diskHash(file);
    requireThat(actual === item.beforeSha256 || actual === item.afterSha256, 'recovery_file_interference');
    if (actual !== item.afterSha256) atomic(file, Buffer.from(item.base64, 'base64'));
    removeKnownTemporary(file, Buffer.from(item.base64, 'base64'));
  }
  assertHeld(context, owner); atomic(path.join(context.metadata, 'HEAD.json'), entry.afterHead);
  removeKnownTemporary(path.join(context.metadata, 'HEAD.json'), entry.afterHead);
  cleanState(context);
  atomic(path.join(entry.root, 'APPLIED.json'), jsonBytes({ protocol: CORPUS_PROTOCOL,
    afterHeadSha256: prepare.afterHeadSha256, revision: parsed(entry.afterHead).revision }));
}
function recover(context, owner) {
  const entries = pending(context);
  requireThat(entries.filter(entry => entry.committed).length <= 1, 'multiple_pending_commits');
  for (const entry of entries) {
    assertHeld(context, owner);
    if (entry.committed) { materialize(context, owner, entry); continue; }
    if (entry.prepare?.beforeHeadSha256) requireThat(diskHash(path.join(context.metadata, 'HEAD.json')) === entry.prepare.beforeHeadSha256, 'uncommitted_head_interference');
    // No canonical write occurs before COMMIT. Archive, never delete, an
    // interrupted preparation; cleanState below still checks every old file.
    fs.renameSync(entry.root, path.join(context.metadata, 'aborted', entry.name));
  }
  return cleanState(context);
}
function view(files) {
  return { readJson: rel => { requireThat(files.has(rel), 'missing_corpus_entry'); return structuredClone(parsed(files.get(rel))); },
    readBytes: rel => { requireThat(files.has(rel), 'missing_corpus_entry'); return Buffer.from(files.get(rel)); },
    has: rel => files.has(rel), list: prefix => [...files.keys()].filter(rel => rel.startsWith(prefix)).sort() };
}
export function createCorpusStore(repoRoot = process.cwd()) {
  // Construction only reads the already installed explicit binding. It does
  // not adopt a worktree, initialize metadata, repair data or start a server.
  const context = resolveAuthority(repoRoot);
  async function underLock(callback) {
    const owner = await acquire(context);
    try { return await callback(owner); } finally { unlock(context, owner); }
  }
  return {
    authority: { id: context.binding.authorityId, root: context.root, protocol: CORPUS_PROTOCOL },
    async read(callback) {
      return underLock(async () => {
        requireThat(pending(context).length === 0, 'recovery_required');
        const state = cleanState(context), result = await callback(view(state.files));
        return { result, coordination: { authorityId: context.binding.authorityId, protocol: CORPUS_PROTOCOL,
          revision: state.head.value.revision, snapshotSha256: sha(state.head.bytes), observedAt: new Date().toISOString() } };
      });
    },
    async mutate({ actor, command, operationId, expectedRevision, input }, callback) {
      requireThat(UUID.test(operationId ?? '') && typeof actor === 'string' && actor && typeof command === 'string'
        && Number.isSafeInteger(expectedRevision) && expectedRevision >= 0, 'operation_id_and_revision_required');
      const fingerprint = sha(canonical({ actor, command, expectedRevision, input }));
      return underLock(async owner => {
        const state = recover(context, owner), existing = 'operations/' + operationId + '.json';
        if (state.head.value.operationReceipts[operationId]) {
          const receipt = parsed(readBytes(target(context.metadata, existing)));
          requireThat(receipt.actor === actor && receipt.command === command && receipt.fingerprint === fingerprint, 'operation_identity_conflict');
          requireThat(parsed(state.files.get('SESSION_REGISTRY.json')).sessions.some(session => session.id === actor && session.state === 'active'), 'inactive_operation_actor');
          return { result: receipt.result, coordination: { authorityId: context.binding.authorityId,
            protocol: CORPUS_PROTOCOL, revision: receipt.revision, currentRevision: state.head.value.revision,
            operationId, replayed: true, authority: 'historical_result_only_revalidate_current_claim' } };
        }
        requireThat(state.head.value.revision === expectedRevision, 'coordination_revision_conflict');
        const files = new Map([...state.files].map(([rel, bytes]) => [rel, Buffer.from(bytes)])), draft = view(files);
        draft.writeBytes = (rel, bytes) => { requireThat(dataPath(rel) && Buffer.isBuffer(bytes) && bytes.length <= LIMIT, 'invalid_corpus_write'); decode(bytes); files.set(rel, Buffer.from(bytes)); };
        draft.writeJson = (rel, value) => draft.writeBytes(rel, jsonBytes(value));
        const result = JSON.parse(canonical(await callback(draft)));
        validateCorpus(files);
        const revision = state.head.value.revision + 1;
        const receipt = jsonBytes({ protocol: CORPUS_PROTOCOL, operationId, actor, command, fingerprint, revision, result });
        const writes = [...files].filter(([rel, bytes]) => !state.files.has(rel) || !bytes.equals(state.files.get(rel)))
          .map(([rel, bytes]) => ({ area: 'corpus', path: rel, beforeSha256: state.files.has(rel) ? sha(state.files.get(rel)) : null,
            afterSha256: sha(bytes), base64: bytes.toString('base64') }));
        writes.push({ area: 'metadata', path: existing, beforeSha256: null, afterSha256: sha(receipt), base64: receipt.toString('base64') });
        const nextHead = jsonBytes({ ...state.head.value, revision,
          files: Object.fromEntries([...files].map(([rel, bytes]) => [rel, sha(bytes)])),
          operationReceipts: { ...state.head.value.operationReceipts, [operationId]: sha(receipt) } });
        requireThat(Object.keys(state.head.value.operationReceipts).length < 10_000, 'operation_history_capacity');
        requireThat(transactionDirectories(context).length < 1_000, 'transaction_history_capacity');
        const transactionId = crypto.randomUUID(), directory = target(context.metadata, 'transactions/' + transactionId);
        assertHeld(context, owner); fs.mkdirSync(directory);
        const prepare = jsonBytes({ protocol: CORPUS_PROTOCOL, authorityId: context.binding.authorityId, transactionId, operationId,
          beforeHeadSha256: sha(state.head.bytes), beforeHeadBase64: state.head.bytes.toString('base64'),
          afterHeadSha256: sha(nextHead), afterHeadBase64: nextHead.toString('base64'), writes });
        requireThat(prepare.length <= LIMIT, 'journal_too_large');
        atomic(path.join(directory, 'PREPARE.json'), prepare); assertHeld(context, owner);
        atomic(path.join(directory, 'COMMIT.json'), jsonBytes({ protocol: CORPUS_PROTOCOL,
          authorityId: context.binding.authorityId, transactionId, prepareSha256: sha(prepare), afterHeadSha256: sha(nextHead) }));
        const entry = inspectTransaction(context, { name: transactionId, root: directory });
        materialize(context, owner, entry);
        return { result, coordination: { authorityId: context.binding.authorityId, protocol: CORPUS_PROTOCOL,
          revision, operationId, replayed: false, snapshotSha256: sha(nextHead) } };
      });
    },
    async recover() { return underLock(owner => { const state = recover(context, owner); return {
      ok: true, coordination: { authorityId: context.binding.authorityId, protocol: CORPUS_PROTOCOL,
        revision: state.head.value.revision, snapshotSha256: sha(state.head.bytes), recoveryOnly: true } }; }); },
  };
}

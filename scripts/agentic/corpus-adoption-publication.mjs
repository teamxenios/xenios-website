// PRIVATE SOURCE CANDIDATE. No bootstrap, command-line entry or installed client.
// Installation custody is not task/actor authority. Root must supply the real
// admission function and enforce its writer window outside this module.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { plan as assess, inspectPrepared, SOURCE_PINS, LIMITS } from './corpus-adoption.mjs';
import { canonical, contentHash, initialHead, validateCorpus, observeOwner,
  resolveAuthority, createCorpusStore, REQUIRED_NODE } from './corpus-store.mjs';

export const PUBLICATION_BASE = '3052c882821c835a3fb62efa11a8ba1e66c70712';
export const PUBLICATION_LIMITS = Object.freeze({ milliseconds: 120000,
  observerMs: 8000, gitMs: 5000, fileBytes: 5 * 1024 * 1024,
  imageBytes: 32 * 1024 * 1024, entries: 10000, custodyOwners: 16 });
const NEW_PATHS = ['scripts/agentic/corpus-adoption-publication.mjs',
  'scripts/agentic/corpus-adoption-publication.node-test.mjs'];
const OLD_PINS = { ...SOURCE_PINS,
  'scripts/agentic/corpus-adoption.mjs': '74dfc62debb5f522d9cf8211271855e96c973cf47035642bff480ca2ab9e66ca',
  'scripts/agentic/corpus-adoption.node-test.mjs': 'a412e6c3fd069a8c98241103ba210f10794a34f236588e7f7bc4da27e59e231a' };
const CODE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const OID = /^[a-f0-9]{40}$/;
const eq = (a, b) => canonical(a) === canonical(b);
const encode = x => Buffer.from(JSON.stringify(x, null, 2) + '\n');
const hash = x => contentHash(Buffer.from(canonical(x)));
const lower = x => path.resolve(x).toLowerCase();
function fail(code) { throw Object.assign(new Error(code), { code }); }
function need(x, code) { if (!x) fail(code); }
function code(error) { return /^[A-Za-z0-9_]{1,80}$/.test(error?.code ?? '') ? error.code : 'publication_refused'; }
function component(x) {
  return typeof x === 'string' && x.length > 0 && x.length <= 255
    && /^[\x20-\x7e]+$/.test(x) && !/[<>:"/\\|?*~]/.test(x)
    && !/[ .]$/.test(x) && !x.startsWith(' ') && !['.', '..'].includes(x)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9]|conin\$|conout\$)(?:\.|$)/i.test(x);
}
function relative(x) { need(typeof x === 'string' && x.split('/').every(component), 'unsafe_relative_path'); return x; }
function stat(file) { try { return fs.lstatSync(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
function physical(file, absent = false) {
  need(process.platform === 'win32' && /^[A-Za-z]:\\/.test(file)
    && lower(file) === file.toLowerCase() && !file.includes('~'), 'unsupported_physical_path');
  let at = file;
  for (;;) {
    const s = stat(at);
    if (s) need(!s.isSymbolicLink() && lower(fs.realpathSync.native(at)) === lower(at), 'physical_alias_or_link');
    else need(absent || at !== file, 'physical_path_absent');
    const parent = path.dirname(at); if (parent === at) break; at = parent;
  }
  return file;
}
function bytes(file) {
  const before = fs.lstatSync(file, { bigint: true });
  need(before.isFile() && !before.isSymbolicLink() && before.size <= BigInt(LIMITS.fileBytes), 'invalid_bounded_file');
  const fd = fs.openSync(file, 'r');
  try {
    const first = fs.fstatSync(fd, { bigint: true });
    need(first.dev === before.dev && first.ino === before.ino && first.size === before.size, 'file_identity_drift');
    const value = fs.readFileSync(fd), last = fs.fstatSync(fd, { bigint: true });
    need(last.size === first.size && BigInt(value.length) === first.size, 'file_size_drift'); return value;
  } finally { fs.closeSync(fd); }
}
function readJSON(file) {
  const raw = bytes(file); let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { fail('publication_record_invalid'); }
  // Every owned record has exactly the deterministic bytes this version emits;
  // comparison with the expected record, not JSON.parse, establishes its identity.
  return { raw, value };
}
function budget(options) {
  const milliseconds = options.budgetMs ?? 120000;
  need(Number.isSafeInteger(milliseconds) && milliseconds > 0 && milliseconds <= 120000, 'invalid_publication_budget');
  const began = performance.now();
  return { milliseconds, began, check(reserve = 0) {
    need(performance.now() - began + reserve < milliseconds, 'publication_deadline');
  }, elapsed: () => performance.now() - began };
}
function instant(value) {
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)\.(\d{3,7})Z$/.exec(value ?? '');
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const d = new Date(0); d.setUTCFullYear(year, month - 1, day); d.setUTCHours(hour, minute, second, 0);
  if (year < 1601 || d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1
    || d.getUTCDate() !== day || d.getUTCHours() !== hour || d.getUTCMinutes() !== minute || d.getUTCSeconds() !== second) return null;
  return BigInt(d.getTime()) * 10000n + BigInt(m[7].padEnd(7, '0'));
}
function mkdirNew(dir, b) { b.check(); fs.mkdirSync(dir); b.check(); }
function rebuilt(value) {
  const p = assess(value.retainedRequest);
  need(value.digest === p.digest && eq(value.manifest, p.manifest), 'plan_identity_mismatch');
  need(p.manifest.findings.length === 0 && p.manifest.analysisComplete, 'plan_not_mechanically_complete');
  need(Array.isArray(p.retainedRequest.preimage.directories), 'preimage_directory_inventory_required');
  p.retainedRequest.preimage.directories.forEach(relative);
  need(new Set(p.retainedRequest.preimage.directories).size === p.retainedRequest.preimage.directories.length,
    'duplicate_preimage_directory');
  return p;
}
function context(p, options, operation) {
  need(UUID.test(options.publicationId ?? '') && OID.test(options.sourceCommit ?? ''), 'publication_identity_and_source_required');
  const t = p.retainedRequest.targets, bindingDirectory = path.dirname(t.bindingPath);
  return { schemaVersion: 1, operation, planDigest: p.digest,
    publicationId: options.publicationId, sourceCommit: options.sourceCommit,
    recoveryId: options.recoveryId ?? null,
    authorityId: p.retainedRequest.authorityId, preimageSha256: p.retainedRequest.preimage.sha256,
    runtimeNamespace: structuredClone(p.retainedRequest.runtime.namespace),
    barrier: structuredClone(p.retainedRequest.barrier), writerInventorySha256: hash(p.retainedRequest.writerInventory),
    targets: structuredClone(t), paths: { bindingDirectory,
      lock: path.join(bindingDirectory, 'adoption-installation-lock'),
      journal: path.join(bindingDirectory, 'adoption-' + options.publicationId),
      preparedBinding: path.join(bindingDirectory, '.adoption-binding-' + options.publicationId + '.json') } };
}
function admission(p, options, operation) {
  // An executable, externally installed port is the trust boundary. Receipt
  // files, JSON booleans or supplied ACK labels cannot substitute for this port.
  need(typeof options.admit === 'function', 'trusted_action_port_required');
  const subject = context(p, options, operation), cap = options.admit(Object.freeze(structuredClone(subject)));
  need(cap && typeof cap.recheck === 'function' && ['root-workflow', 'owned-fixture-only'].includes(cap.scope),
    'trusted_action_capability_required');
  return { subject, scope: cap.scope, check(phase, facts = null) {
    need(cap.recheck(Object.freeze({ ...structuredClone(subject), phase, facts: facts && structuredClone(facts) })) === undefined,
      'trusted_action_recheck_refused');
  } };
}
function git(root, args, b, diagnostics) {
  b.check(5000); const receipt = { tool: 'git', deadlineMs: 5000, helperPid: null, helperBirth: null, exitCode: null };
  try {
    const raw = execFileSync('git', ['--no-optional-locks', '--no-replace-objects', '--no-lazy-fetch', '-C', root, ...args],
      { windowsHide: true, timeout: 5000, maxBuffer: LIMITS.fileBytes + 1024,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1' },
        stdio: ['ignore', 'pipe', 'pipe'] });
    receipt.exitCode = 0; b.check(); return raw;
  } catch (e) { receipt.exitCode = e.status ?? null; receipt.signal = e.signal ?? null; receipt.code = code(e); fail('bounded_git_refused'); }
  finally { diagnostics.push(receipt); }
}
function verifySources(source, b, diagnostics) {
  const text = args => git(CODE_ROOT, args, b, diagnostics).toString('utf8').trim();
  need(text(['show', '-s', '--format=%P', source]) === PUBLICATION_BASE, 'publication_source_parent_mismatch');
  need(eq(text(['diff', '--no-renames', '--name-status', PUBLICATION_BASE, source]).split('\n').sort(),
    NEW_PATHS.map(x => 'A\t' + x).sort()), 'publication_source_delta_mismatch');
  const pins = [];
  for (const file of [...Object.keys(OLD_PINS), ...NEW_PATHS]) {
    b.check(); physical(path.join(CODE_ROOT, ...file.split('/')));
    const entry = text(['ls-tree', source, '--', file]), match = /^100644 blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
    need(match?.[2] === file, 'loaded_source_mode_or_path_mismatch');
    const raw = git(CODE_ROOT, ['cat-file', 'blob', match[1]], b, diagnostics), actual = bytes(path.join(CODE_ROOT, file));
    need(raw.equals(actual) && (!OLD_PINS[file] || contentHash(raw) === OLD_PINS[file]), 'loaded_source_pin_mismatch');
    pins.push({ path: file, mode: '100644', blob: match[1], bytes: raw.length, sha256: contentHash(raw) });
  }
  return { source, tree: text(['rev-parse', source + '^{tree}']), pins };
}
function namespace(f) { return { platform: f.platform, hostId: f.hostId, bootId: f.bootId, fileSystem: f.fileSystem }; }
function observe(pid, root, b, diagnostics) {
  b.check(8000);
  const facts = observeOwner(pid, root, { onReceipt: receipt => diagnostics.push({ tool: 'production-observer', ...receipt,
    helperPid: null, helperBirth: null, handleBoundary: 'Existing synchronous API does not export native helper PID/birth handle.' }) });
  b.check(); return { ...facts, capturedAt: new Date().toISOString() };
}
// This fixed primitive checks FILE_ATTRIBUTE_REPARSE_POINT, including Windows
// reparse types which Node isSymbolicLink alone does not classify. It neither
// observes process identity nor replaces the production namespace observer.
const REPARSE_SCRIPT = [
  "$ErrorActionPreference='Stop'", "$items=@(([Console]::In.ReadToEnd() | ConvertFrom-Json))",
  "if($items.Count -gt 10000){throw 'bound'}",
  "$seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)",
  "$drives=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)",
  "foreach($item in $items){$q=[IO.Path]::GetFullPath([string]$item);while($q){",
  "$driveRoot=[IO.Path]::GetPathRoot($q);if($drives.Add($driveRoot)){$drive=[IO.DriveInfo]::new($driveRoot);if(-not $drive.IsReady -or $drive.DriveType -ne [IO.DriveType]::Fixed -or $drive.DriveFormat -ne 'NTFS'){throw 'filesystem'}}",
  "if($seen.Add($q) -and ([IO.File]::Exists($q) -or [IO.Directory]::Exists($q))){",
  "if(([IO.File]::GetAttributes($q) -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'reparse'}}",
  "$n=[IO.Path]::GetDirectoryName($q);if($n -eq $q){break};$q=$n}}",
  "[Console]::Out.Write('{\"schemaVersion\":1,\"noReparse\":true,\"checked\":'+$items.Count+'}')"
].join(';');
function nativePhysical(paths, b, diagnostics) {
  b.check(8000); const input = encode([...new Set(paths)]);
  need(input.length <= LIMITS.fileBytes && paths.length <= 10000, 'physical_probe_bound');
  const rec = { tool: 'fixed-reparse-attributes', deadlineMs: 8000, inputSha256: contentHash(input),
    helperPid: null, helperBirth: null, exitCode: null };
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', REPARSE_SCRIPT],
      { windowsHide: true, timeout: 8000, maxBuffer: 64000, input, stdio: ['pipe', 'pipe', 'pipe'] });
    rec.exitCode = 0; rec.stdoutBytes = out.length; rec.stdoutSha256 = contentHash(out);
    const value = JSON.parse(out.toString('utf8'));
    need(value.schemaVersion === 1 && value.noReparse === true && value.checked === JSON.parse(input).length,
      'physical_probe_refused'); b.check();
  } catch (e) { rec.exitCode = e.status ?? rec.exitCode; rec.signal = e.signal ?? null; rec.code = code(e); fail('physical_probe_refused'); }
  finally { diagnostics.push(rec); }
}
function snapshot(root, b) {
  physical(root); const files = [], directories = []; let total = 0, nodes = 0;
  function walk(dir, prefix) {
    b.check(); const s = fs.lstatSync(dir); need(s.isDirectory() && !s.isSymbolicLink(), 'snapshot_directory_invalid');
    for (const name of fs.readdirSync(dir).sort()) {
      b.check(); need(++nodes <= 10000 && component(name), 'snapshot_entry_or_path_bound');
      const rel = prefix ? prefix + '/' + name : name, absolute = path.join(dir, name), item = fs.lstatSync(absolute);
      need(!item.isSymbolicLink(), 'snapshot_link_refused');
      if (item.isDirectory()) { directories.push(rel); walk(absolute, rel); }
      else { need(item.isFile(), 'snapshot_type_refused'); const value = bytes(absolute); total += value.length;
        need(total <= LIMITS.totalBytes, 'snapshot_byte_bound'); files.push({ path: rel, bytes: value }); }
    }
  }
  walk(root, ''); files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return { files, directories: directories.sort(), paths: [root, ...directories.map(x => path.join(root, x)), ...files.map(x => path.join(root, x.path))] };
}
function matchSnapshot(actual, wanted, directories) {
  need(eq(actual.directories, [...directories].sort()), 'directory_inventory_drift');
  need(actual.files.length === wanted.length, 'raw_preimage_inventory_drift');
  const map = new Map(actual.files.map(x => [x.path, x.bytes]));
  for (const x of wanted) need(map.has(x.path) && map.get(x.path).equals(x.bytes), 'raw_preimage_byte_drift');
}
function writeNew(file, value, b) {
  b.check(); need(Buffer.isBuffer(value) && value.length <= LIMITS.fileBytes, 'write_byte_bound');
  physical(path.dirname(file)); b.check(); const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, value); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  b.check(); need(bytes(file).equals(value), 'write_readback_mismatch');
}
function exactRecord(file, expected, b, resume) {
  const raw = encode(expected);
  if (stat(file)) { need(resume && bytes(file).equals(raw), 'existing_publication_record_mismatch'); }
  else writeNew(file, raw, b);
}
function identity(dir) { const s = fs.lstatSync(dir, { bigint: true }); need(s.isDirectory() && !s.isSymbolicLink(), 'owned_directory_invalid'); return { dev: s.dev.toString(), ino: s.ino.toString() }; }
function sameIdentity(dir, value) { need(eq(identity(dir), value), 'owned_directory_changed'); physical(dir); }
function verifyRuntime(p, c, b, diagnostics) {
  const t = p.retainedRequest.targets;
  need(process.platform === 'win32' && process.versions.node === REQUIRED_NODE, 'unsupported_publication_runtime');
  for (const name of ['repoRoot', 'gitCommonDirectory', 'legacyRoot', 'futureParent']) physical(t[name]);
  physical(t.futureRoot, true); physical(t.bindingPath, true);
  const common = fs.realpathSync.native(git(t.repoRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir'], b, diagnostics).toString('utf8').trim());
  need(lower(common) === lower(t.gitCommonDirectory)
    && lower(t.bindingPath) === lower(path.join(common, 'xenios-coordination', 'authority-binding.json')), 'actual_git_common_mismatch');
  const facts = observe(process.pid, t.futureParent, b, diagnostics);
  need(facts.found && facts.pid === process.pid && typeof facts.birthId === 'string'
    && instant(facts.bootId) !== null && instant(facts.birthId) !== null
    && instant(facts.birthId) >= instant(facts.bootId)
    && instant(facts.birthId) <= instant(new Date().toISOString())
    && eq(namespace(facts), p.retainedRequest.runtime.namespace), 'actual_runtime_namespace_mismatch');
  nativePhysical([t.repoRoot, common, t.legacyRoot, t.futureParent, t.futureRoot, c.paths.bindingDirectory], b, diagnostics);
  return facts;
}
function ownerBody(c, facts, index, previousHash = null, recoveryId = null) {
  return { protocol: 1, publicationId: c.publicationId, planDigest: c.planDigest,
    sourceCommit: c.sourceCommit, authorityId: c.authorityId, targets: c.targets,
    index, previousHash, recoveryId, pid: facts.pid, birthId: facts.birthId, namespace: namespace(facts) };
}
function owners(c) {
  const s = stat(c.paths.lock); if (!s) return [];
  need(s.isDirectory() && !s.isSymbolicLink(), 'installation_lock_invalid');
  const names = fs.readdirSync(c.paths.lock).sort();
  need(names.length > 0 && names.length <= 16 && names.every((name, n) => name === 'owner-' + String(n).padStart(4, '0') + '.json'), 'installation_custody_partial_or_unknown');
  return names.map((name, n) => {
    const r = readJSON(path.join(c.paths.lock, name));
    need(r.raw.equals(encode(r.value)) && r.value.protocol === 1 && r.value.index === n
      && r.value.publicationId === c.publicationId && r.value.planDigest === c.planDigest
      && r.value.sourceCommit === c.sourceCommit && r.value.authorityId === c.authorityId
      && eq(r.value.targets, c.targets) && Number.isSafeInteger(r.value.pid) && r.value.pid > 0
      && instant(r.value.birthId) !== null && instant(r.value.namespace?.bootId) !== null
      && instant(r.value.birthId) >= instant(r.value.namespace.bootId)
      && instant(r.value.birthId) <= instant(new Date().toISOString())
      && eq(r.value.namespace, c.runtimeNamespace)
      && (n === 0 ? r.value.recoveryId === null : UUID.test(r.value.recoveryId ?? ''))
      && eq(Object.keys(r.value).sort(), ['protocol', 'publicationId', 'planDigest', 'sourceCommit', 'authorityId',
        'targets', 'index', 'previousHash', 'recoveryId', 'pid', 'birthId', 'namespace'].sort()), 'foreign_installation_custody');
    return r;
  }).map((r, n, rows) => {
    need(r.value.previousHash === (n ? contentHash(rows[n - 1].raw) : null), 'custody_chain_drift'); return r;
  });
}
function held(c, current) {
  const rows = owners(c); need(rows.length > 0 && rows.at(-1).raw.equals(encode(current)), 'installation_custody_lost');
}
function acquire(c, facts, options, b, diagnostics, resume, gate) {
  physical(c.paths.bindingDirectory, true);
  if (!stat(c.paths.bindingDirectory)) mkdirNew(c.paths.bindingDirectory, b);
  physical(c.paths.bindingDirectory);
  if (!resume) {
    mkdirNew(c.paths.lock, b); const owner = ownerBody(c, facts, 0);
    writeNew(path.join(c.paths.lock, 'owner-0000.json'), encode(owner), b); return owner;
  }
  const rows = owners(c); need(rows.length > 0, 'resume_custody_missing'); const last = rows.at(-1).value;
  need(eq(last.namespace, namespace(facts)), 'recovery_namespace_changed');
  if (last.pid === facts.pid && last.birthId === facts.birthId) return last;
  const old = observe(last.pid, c.targets.futureParent, b, diagnostics);
  // Reused PID, changed boot and unavailable observations never establish death.
  need(eq(namespace(old), namespace(facts)) && old.found === false, 'installation_owner_not_proven_absent');
  need(rows.length < 16 && UUID.test(options.recoveryId ?? ''), 'external_recovery_identity_required');
  gate.check('before_dead_owner_recovery', { currentOwner: facts, previousOwner: last,
    previousOwnerSha256: contentHash(rows.at(-1).raw), actualAbsence: old });
  const next = ownerBody(c, facts, rows.length, contentHash(rows.at(-1).raw), options.recoveryId);
  const candidate = path.join(c.paths.bindingDirectory, '.adoption-custody-' + options.recoveryId + '.json');
  writeNew(candidate, encode(next), b); b.check();
  fs.linkSync(candidate, path.join(c.paths.lock, 'owner-' + String(rows.length).padStart(4, '0') + '.json'));
  held(c, next); return next;
}
function treeDirectories(files) {
  const dirs = new Set(['sessions', 'handoffs', 'messages']);
  for (const { path: rel } of files) { const parts = relative(rel).split('/'); parts.pop(); while (parts.length) { dirs.add(parts.join('/')); parts.pop(); } }
  return [...dirs].sort();
}
function completeTree(root, files, directories, b, resume) {
  const old = snapshot(root, b), expected = new Map(files.map(x => [relative(x.path), x.bytes]));
  need(old.directories.every(x => directories.includes(x)), 'foreign_preparation_directory');
  for (const x of old.files) need(resume && expected.has(x.path) && expected.get(x.path).equals(x.bytes), 'partial_or_foreign_preparation_file');
  for (const rel of [...directories].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))) {
    b.check(); if (!stat(path.join(root, rel))) mkdirNew(path.join(root, rel), b);
  }
  for (const x of files) { b.check(); if (!stat(path.join(root, x.path))) writeNew(path.join(root, x.path), x.bytes, b); }
  matchSnapshot(snapshot(root, b), files, directories);
}
function expected(p) {
  const req = p.retainedRequest, image = req.candidate.files.map(x => ({ path: x.path, bytes: Buffer.from(x.bytes) }));
  validateCorpus(new Map(image.map(x => [x.path, x.bytes])));
  const head = encode(initialHead(new Map(image.map(x => [x.path, x.bytes])), req.authorityId));
  return { image, head, directories: [...treeDirectories(image), '.coordination', '.coordination/transactions',
    '.coordination/operations', '.coordination/aborted', '.coordination/mutex-candidates'].sort(),
  allFiles: [...image, { path: '.coordination/HEAD.json', bytes: head }], binding: encode({ protocol: 1,
    authorityId: req.authorityId, nodeVersion: REQUIRED_NODE, corpusRoot: req.targets.futureRoot,
    gitCommonDirectory: req.targets.gitCommonDirectory, namespace: req.runtime.namespace }) };
}
function journalKnown(c) {
  physical(c.paths.journal); const allowed = new Set(['manifest.json', 'archive', 'future-identity.json', 'initial-head-reservation.json']);
  for (const name of fs.readdirSync(c.paths.journal)) {
    need(allowed.has(name), 'unknown_publication_journal_entry');
    const s = fs.lstatSync(path.join(c.paths.journal, name));
    need(!s.isSymbolicLink() && (name === 'archive' ? s.isDirectory() : s.isFile()), 'publication_journal_type_invalid');
  }
}
function inspectState(p, c, b) {
  const req = p.retainedRequest, e = expected(p), bindingStat = stat(c.targets.bindingPath), futureStat = stat(c.targets.futureRoot);
  if (bindingStat) need(bytes(c.targets.bindingPath).equals(e.binding), 'foreign_or_unknown_binding');
  if (!futureStat) { need(!bindingStat, 'binding_without_image'); return { phase: 'unprepared', bindingPresent: false }; }
  const headFile = path.join(c.targets.futureRoot, '.coordination', 'HEAD.json');
  if (stat(headFile)) {
    const h = readJSON(headFile).value;
    need(h.protocol === 1 && h.authorityId === req.authorityId, 'foreign_prepared_head');
    need(h.revision === 0 && eq(h.operationReceipts, {}), 'advanced_authority_requires_existing_coordinator');
  }
  try { matchSnapshot(snapshot(c.targets.futureRoot, b), e.allFiles, e.directories); }
  catch (error) { if (bindingStat) throw error; return { phase: 'partial_unpublished_preserved', bindingPresent: false, code: code(error) }; }
  return { phase: bindingStat ? 'binding_observed_requires_trusted_read' : 'prepared_unpublished', bindingPresent: !!bindingStat };
}
function inspectActualPrepared(p, c, facts, b) {
  const snap = snapshot(c.targets.futureRoot, b), data = snap.files.filter(x => !x.path.startsWith('.coordination/'));
  const inventory = data.map(x => ({ path: x.path, bytes: x.bytes.length, sha256: contentHash(x.bytes) }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const directoryNames = ['sessions', 'handoffs', 'messages', '.coordination/transactions', '.coordination/operations',
    '.coordination/aborted', '.coordination/mutex-candidates'];
  const observed = { planDigest: p.digest, targets: p.retainedRequest.targets,
    runtime: { nodeVersion: process.versions.node, producer: 'corpus-store.observeOwner',
      namespace: namespace(facts), owner: { pid: facts.pid, birthId: facts.birthId, found: facts.found },
      capturedAt: facts.capturedAt, physicalPath: { path: c.targets.futureRoot,
        realPath: fs.realpathSync.native(c.targets.futureRoot), noReparseOrAlias: true } },
    binding: stat(c.targets.bindingPath) ? { state: 'present', bytes: bytes(c.targets.bindingPath) } : { state: 'absent' },
    image: { state: 'present', files: data, inventory }, headBytes: bytes(path.join(c.targets.futureRoot, '.coordination', 'HEAD.json')),
    rootEntries: fs.readdirSync(c.targets.futureRoot), metadataEntries: fs.readdirSync(path.join(c.targets.futureRoot, '.coordination')),
    directories: directoryNames.map(rel => ({ path: rel, noReparseOrAlias: true,
      entries: fs.readdirSync(path.join(c.targets.futureRoot, rel)) })) };
  // These are this invocation's actual reads/native observations, not supplied
  // facts. The fixed reparse probe must precede this structural projection.
  const result = inspectPrepared({ ...p, preparedObservation: observed });
  need(result.findings.length === 0, result.findings[0]?.code ?? 'strict_preparation_refused');
  return result;
}
export function inspectPublication(value, options = {}) {
  const b = budget(options), p = rebuilt(value), c = context(p, options, 'inspect');
  need(process.platform === 'win32' && process.versions.node === REQUIRED_NODE, 'unsupported_publication_runtime');
  const result = { kind: 'filesystem_corpus_publication_inspection', planDigest: p.digest, mutations: false,
    installed: null, trustedStoreReadVerified: false, externalApprovalVerified: false, publishable: false,
    loadedSourceVerified: false, runtimeNamespaceVerified: false, actualFilesystemObserved: true };
  try { physical(c.targets.futureParent); physical(c.targets.futureRoot, true); physical(c.targets.bindingPath, true);
    return { ...result, ...inspectState(p, c, b), installationOwners: stat(c.paths.lock) ? owners(c).map(x => x.value) : [] };
  } catch (error) { return { ...result, phase: 'held_for_explicit_recovery', findings: [{ code: code(error) }] }; }
}
async function run(operation, value, options = {}) {
  // Even a malformed plan cannot cause I/O in the default-denied call.
  need(typeof options.admit === 'function', 'trusted_action_port_required');
  const b = budget(options), p = rebuilt(value), gate = admission(p, options, operation), c = gate.subject;
  const diagnostics = [], e = expected(p); let phase = 'admission', owner = null;
  const checkpoint = name => {
    phase = name; b.check(); if (owner) held(c, owner);
    if (options.onProgress !== undefined) { need(typeof options.onProgress === 'function', 'invalid_progress_port'); options.onProgress(Object.freeze({ phase, planDigest: p.digest })); }
    b.check();
  };
  try {
    gate.check('before_filesystem'); b.check();
    const source = verifySources(c.sourceCommit, b, diagnostics), facts = verifyRuntime(p, c, b, diagnostics);
    const state = inspectState(p, c, b);
    if (operation === 'publish') {
      need(!state.bindingPresent && !stat(c.paths.lock), 'publication_already_started');
      need(!stat(c.paths.journal) && !stat(c.paths.preparedBinding), 'publication_namespace_already_present');
      need(c.targets.futureState === 'empty' ? stat(c.targets.futureRoot) && fs.readdirSync(c.targets.futureRoot).length === 0
        : !stat(c.targets.futureRoot), 'future_target_not_approved_empty_or_absent');
    }
    const preimage = snapshot(c.targets.legacyRoot, b);
    matchSnapshot(preimage, p.retainedRequest.preimage.files, p.retainedRequest.preimage.directories);
    nativePhysical(preimage.paths, b, diagnostics); gate.check('before_installation_custody', facts);
    b.check(); owner = acquire(c, facts, options, b, diagnostics, operation === 'resume', gate); checkpoint('custody_acquired');
    if (stat(c.paths.journal)) {
      journalKnown(c); need(stat(path.join(c.paths.journal, 'manifest.json')), 'publication_journal_incomplete');
    } else mkdirNew(c.paths.journal, b);
    physical(c.paths.journal);
    exactRecord(path.join(c.paths.journal, 'manifest.json'), { schemaVersion: 1, publicationId: c.publicationId,
      planDigest: p.digest, source, intent: p.manifest.intent, targets: c.targets, authorityId: c.authorityId }, b, operation === 'resume');
    const archive = path.join(c.paths.journal, 'archive');
    if (!stat(archive)) mkdirNew(archive, b);
    completeTree(archive, p.retainedRequest.preimage.files, p.retainedRequest.preimage.directories, b, operation === 'resume');
    checkpoint('archive_verified');
    const futureIdentityFile = path.join(c.paths.journal, 'future-identity.json');
    if (operation === 'resume' && stat(futureIdentityFile)) {
      const record = readJSON(futureIdentityFile);
      need(record.value.planDigest === p.digest && record.value.root === c.targets.futureRoot, 'foreign_future_identity');
      need(record.raw.equals(encode({ planDigest: p.digest, root: c.targets.futureRoot, identity: record.value.identity })), 'future_identity_record_invalid');
      sameIdentity(c.targets.futureRoot, record.value.identity);
    } else {
      if (operation === 'resume') need(!stat(c.targets.futureRoot), 'future_creation_ownership_unknown');
      if (c.targets.futureState === 'absent' || operation === 'resume') mkdirNew(c.targets.futureRoot, b);
      exactRecord(futureIdentityFile, { planDigest: p.digest, root: c.targets.futureRoot, identity: identity(c.targets.futureRoot) }, b, false);
    }
    const reservation = path.join(c.paths.journal, 'initial-head-reservation.json');
    const headPath = path.join(c.targets.futureRoot, '.coordination', 'HEAD.json');
    const reservationBody = { planDigest: p.digest, authorityId: c.authorityId, headSha256: contentHash(e.head) };
    if (stat(reservation)) {
      need(bytes(reservation).equals(encode(reservationBody)) && stat(headPath), 'genesis_outcome_unknown_preserved');
      // Once genesis was reserved, never reconstruct missing/partial files or
      // reset HEAD, even if the binding is absent. Inspect/manual custody only.
      matchSnapshot(snapshot(c.targets.futureRoot, b), e.allFiles, e.directories);
    } else {
      need(!state.bindingPresent && !stat(headPath), 'unowned_or_published_genesis');
      exactRecord(reservation, reservationBody, b, false);
      completeTree(c.targets.futureRoot, e.allFiles, e.directories, b, false);
    }
    checkpoint('image_verified');
    exactRecord(c.paths.preparedBinding, JSON.parse(e.binding), b, operation === 'resume');
    checkpoint('binding_prepared');
    // Reserve the unchanged strict store's observer/lock/read work before the
    // irreversible publication. OS blocking can still overrun a soft deadline.
    b.check(24000); gate.check('before_binding', facts);
    verifySources(c.sourceCommit, b, diagnostics); const finalFacts = verifyRuntime(p, c, b, diagnostics);
    matchSnapshot(snapshot(c.targets.legacyRoot, b), p.retainedRequest.preimage.files, p.retainedRequest.preimage.directories);
    matchSnapshot(snapshot(c.targets.futureRoot, b), e.allFiles, e.directories);
    const finalArchive = snapshot(archive, b);
    matchSnapshot(finalArchive, p.retainedRequest.preimage.files, p.retainedRequest.preimage.directories);
    sameIdentity(c.targets.futureRoot, readJSON(futureIdentityFile).value.identity); journalKnown(c);
    nativePhysical([c.paths.bindingDirectory, c.paths.preparedBinding, c.paths.lock, c.paths.journal,
      ...finalArchive.paths, ...snapshot(c.targets.futureRoot, b).paths], b, diagnostics);
    inspectActualPrepared(p, c, finalFacts, b);
    held(c, owner); b.check(24000); gate.check('immediately_before_binding', finalFacts);
    need(bytes(c.paths.preparedBinding).equals(e.binding), 'prepared_binding_drift');
    if (state.bindingPresent) need(bytes(c.targets.bindingPath).equals(e.binding), 'binding_changed_during_resume');
    else {
      need(!stat(c.targets.bindingPath), 'binding_already_present');
      // Complete flushed bytes, SAME directory, exclusive destination. Never
      // rename/replace, copy fallback or automatically retry an unknown result.
      fs.linkSync(c.paths.preparedBinding, c.targets.bindingPath);
    }
    need(bytes(c.targets.bindingPath).equals(e.binding), 'published_binding_drift');
    checkpoint('binding_observed');
    gate.check('before_trusted_read', facts); b.check(24000);
    const resolved = resolveAuthority(c.targets.repoRoot);
    need(resolved.bindingHash === contentHash(e.binding) && lower(resolved.root) === lower(c.targets.futureRoot), 'trusted_binding_mismatch');
    const store = createCorpusStore(c.targets.repoRoot);
    const readback = await store.read(view => {
      need(eq(view.list(''), e.image.map(x => x.path).sort()), 'trusted_image_inventory_mismatch');
      for (const x of e.image) need(view.readBytes(x.path).equals(x.bytes), 'trusted_image_byte_mismatch');
      return { files: e.image.length, imageSha256: p.retainedRequest.candidate.sha256 };
    });
    need(readback.coordination.revision === 0 && readback.coordination.authorityId === c.authorityId
      && readback.coordination.snapshotSha256 === contentHash(e.head), 'advanced_or_unexpected_trusted_read');
    matchSnapshot(snapshot(c.targets.futureRoot, b), e.allFiles, e.directories);
    sameIdentity(c.targets.futureRoot, readJSON(futureIdentityFile).value.identity);
    gate.check('after_trusted_read', finalFacts); checkpoint('trusted_read_verified');
    return { kind: 'actual_corpus_publication_result', state: 'INSTALLED_TRUSTED_READ_VERIFIED', operation,
      planDigest: p.digest, publicationId: c.publicationId, source, authorityId: c.authorityId,
      bindingSha256: contentHash(e.binding), headSha256: contentHash(e.head), coordination: readback.coordination,
      archiveRawBytesVerified: true, installed: true, trustedStoreReadVerified: true,
      admissionPortScope: gate.scope, externalApprovalVerified: false, allWriterCompletenessVerified: false,
      liveAdoptionVerified: false, nativeClientsConfigured: false, diagnostics,
      elapsedMs: b.elapsed(), hardOsDeadlineClaimed: false,
      custodyEvidenceRetained: true, cleanupOrLockTheftPerformed: false };
  } catch (error) {
    // Retain every partial/foreign byte and installation owner. No finally
    // cleanup, binding rollback, automatic retry or replay of initialHead.
    const report = { state: 'HOLD_PRESERVED_NO_RETRY', phase, planDigest: p.digest,
      publicationId: c.publicationId, code: code(error), diagnostics, elapsedMs: b.elapsed(),
      externalApprovalVerified: false, hardOsDeadlineClaimed: false, bindingOutcome: 'INSPECT_REQUIRED' };
    throw Object.assign(new Error(code(error)), { code: code(error), publication: report });
  }
}
export const publish = (p, options) => run('publish', p, options);
export const resumePublication = (p, options) => run('resume', p, options);
export { inspectPublication as inspect, resumePublication as resume };

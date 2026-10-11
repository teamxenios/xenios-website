/**
 * Doc 49 qualification preparation. SOURCE ONLY: authoring is not a window,
 * admission, reservation, G0 acceptance, test result, install or release decision.
 *
 * Future CLI (only after the recorded direct approval covers these actions):
 * node qualification-supervisor.mjs --manifest <file> --group <G0|G1..G7>
 *   --window <window-record> --approval-verification <coordinator-record>
 *   --window-review <committed-original-reviewer-record-reference>
 *   --pre-window-observation <separately-authorized-observation-record>
 *   --policy-observation <separately-authorized-opening-policy-record>
 *   --reservation <record> --admission <record>
 *   [--resume <exact immutable paused-continuation receipt>]
 * Or --prepare instead of --group, with the same complete authority checks.
 *
 * Windows-only enforcement uses an embedded, run-owned PowerShell/C# Job Object
 * helper. Compilation, snapshot materialisation, dependency copying, host/process
 * observations and all children are future execution actions. None occurred when
 * these two source files were authored. G8/G9/database are deliberately deferred.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST = path.join(HERE, 'evidence/qualification-manifest-20261008.json');
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const RUN_ID = /^[a-z0-9][a-z0-9-]{7,79}$/;
const STREAM_LIMIT = 4 * 1024 * 1024;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = bytes => Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const refuse = reason => { throw new Error(`REFUSED: ${reason}`); };
const check = (condition, reason) => { if (!condition) refuse(reason); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const within = (root, file) => {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};
const ensureOwned = (root, file) => check(within(root, file), 'path outside the exact run-owned root');
// Publish a completed, fsynced record atomically without overwriting an existing
// receipt. The temporary hard-link name is retained as evidence, never deleted.
const writeNew = (file, value) => {
  const temporary = `${file}.${crypto.randomBytes(12).toString('hex')}.pending`;
  const descriptor = fs.openSync(temporary, 'wx');
  try { fs.writeFileSync(descriptor, JSON.stringify(value, null, 2) + '\n'); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  fs.linkSync(temporary, file); // Atomic no-replace publication; an interrupted pending file is not a receipt.
};
// Absence is an ENOENT result, never an access or inspection failure.
function pathAbsent(file) {
  try { fs.lstatSync(file); return false; }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}
// Initial metadata, precommand refusal and own release records may retry
// publication once. Exact bytes and IDs are retained; no command is retried.
function writeInitialRecord(file, value) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n'), sha256 = hash(bytes);
  const archives = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const temporary = file + '.' + crypto.randomBytes(12).toString('hex') + '.pending';
    let descriptor = null, identity = null, closed = false, synced = false;
    try {
      descriptor = fs.openSync(temporary, 'wx'); identity = fs.fstatSync(descriptor);
      fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); synced = true;
      fs.closeSync(descriptor); descriptor = null; closed = true;
      fs.linkSync(temporary, file);
      return { path: file, sha256, recoveredUnpublished: archives };
    } catch (error) {
      if (descriptor !== null) {
        try { fs.closeSync(descriptor); descriptor = null; closed = true; }
        catch { error.evidenceUncertain = true; }
      }
      try {
        if (!pathAbsent(file)) {
          const published = fs.lstatSync(file);
          // A successful no-replace link whose syscall reported an error is
          // recoverable only by exact inode AND fully written/fsynced bytes.
          if (identity && identity.ino !== 0 && closed && synced && !published.isSymbolicLink()
            && published.ino === identity.ino && published.dev === identity.dev
            && hash(fs.readFileSync(file)) === sha256) return { path: file, sha256, recoveredUnpublished: archives };
          error.evidenceUncertain = true; // Foreign or uncertain publication: never recover it.
        } else if (!error.evidenceUncertain) {
          if (identity) {
            const pending = fs.lstatSync(temporary);
            check(closed && identity.ino !== 0 && !pending.isSymbolicLink()
              && pending.ino === identity.ino && pending.dev === identity.dev, 'initial temporary identity differs');
            const archived = path.join(path.dirname(file), '.metadata-unpublished-' + crypto.randomBytes(16).toString('hex') + '.json');
            check(pathAbsent(archived), 'initial metadata archive exists');
            fs.renameSync(temporary, archived); archives.push(archived);
          } else check(pathAbsent(temporary), 'unknown initial temporary exists');
          error.initialPublicationAbsent = true;
          error.unpublishedArchives = archives;
        }
      } catch (preservationError) {
        error.evidenceUncertain = true;
        error.message += '; initial publication preservation unresolved: ' + preservationError.message;
      }
      error.initialPublicationFailure = true;
      if (attempt === 0 && error.initialPublicationAbsent && !error.evidenceUncertain) continue;
      throw error;
    }
  }
}
let metadataToolchain = null;
const git = (cwd, args, deadline = Date.now() + 30_000) => {
  check(Date.now() < deadline, 'local Git metadata deadline exhausted');
  check(metadataToolchain && path.isAbsolute(metadataToolchain.executable)
    && hash(fs.readFileSync(metadataToolchain.executable)) === metadataToolchain.sha256,
    'absolute Git executable pin absent or different');
  check(fs.realpathSync.native(metadataToolchain.executable).toLowerCase() === path.resolve(metadataToolchain.executable).toLowerCase()
    && metadataToolchain.executable.replaceAll('\\', '/').toLowerCase().endsWith('/mingw64/bin/git.exe'),
    'the pinned Git reader must be the direct mingw64 binary');
  check(!within(cwd, metadataToolchain.cwd) && path.resolve(metadataToolchain.cwd) !== path.resolve(cwd),
    'Git launcher directory must be outside the subject snapshot');
  const remainingMs = Math.min(30_000, deadline - Date.now());
  check(remainingMs > 0, 'Git executable verification exhausted metadata deadline');
  const result = spawnSync(metadataToolchain.executable, ['-c', 'core.hooksPath=NUL', '-c', 'core.fsmonitor=false', '-C', cwd, ...args], {
    cwd: metadataToolchain.cwd, windowsHide: true, shell: false, encoding: 'buffer', timeout: remainingMs,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...osEnvironment(), GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: 'NUL', GIT_NO_REPLACE_OBJECTS: '1' },
  });
  check(Date.now() < deadline, 'local Git metadata exceeded its current deadline');
  check(result.status === 0 && !result.error, `local Git metadata failed: ${args[0]}`);
  return result.stdout;
};
function osEnvironment() {
  const result = {};
  const allowed = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP',
    'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA']);
  for (const [key, value] of Object.entries(process.env)) {
    const canonical = key.toUpperCase();
    if (allowed.has(canonical) && value !== undefined) {
      check(!Object.hasOwn(result, canonical) || result[canonical] === value, 'conflicting case-variant environment entries');
      result[canonical] = value;
    }
  }
  return result;
}
function canonicalEnvironment(input) {
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    const canonical = key.toUpperCase();
    check(typeof value === 'string' && !canonical.includes('=') && !canonical.includes('\0') && !value.includes('\0'),
      'invalid environment entry');
    check(!Object.hasOwn(result, canonical) || result[canonical] === value, 'conflicting case-variant environment entries');
    result[canonical] = value;
  }
  return result;
}
function assertCommandEnvironment(command) {
  check(Object.keys(canonicalEnvironment(command.environment ?? {})).every(key => ['NODE_ENV', 'NODE_OPTIONS'].includes(key)),
    'command environment override outside pinned node settings');
}
function assertManifestCommandEnvironments(manifest) {
  for (const group of manifest.groups) for (const command of group.commands) assertCommandEnvironment(command);
  return { groups: manifest.groups.length,
    commands: manifest.groups.reduce((count, group) => count + group.commands.length, 0),
    outcome: 'ALL_MANIFEST_COMMAND_ENVIRONMENTS_ADMITTED' };
}
function policyEnvironment(environment) {
  const input = canonicalEnvironment(environment);
  // Child-specific TEMP/TMP, NODE_ENV and NODE_OPTIONS do not change the
  // PowerShell policy scopes. Policy-affecting overrides are not permitted.
  const keys = ['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'LOCALAPPDATA', 'APPDATA'];
  check(!Object.hasOwn(input, 'PSEXECUTIONPOLICYPREFERENCE') && !Object.hasOwn(input, '__PSLOCKDOWNPOLICY'),
    'execution-policy environment override refused');
  return Object.fromEntries(keys.map(key => [key, input[key] ?? null]));
}
function boundRecord(file) {
  const resolved = path.resolve(file);
  check(!fs.lstatSync(resolved).isSymbolicLink() && fs.statSync(resolved).isFile(), 'record must be a regular non-symlink file');
  check(fs.statSync(resolved).size <= 32 * 1024 * 1024, 'record byte ceiling exceeded');
  const bytes = fs.readFileSync(resolved);
  check(bytes.length <= 32 * 1024 * 1024, 'record changed beyond byte ceiling');
  return { path: resolved, sha256: hash(bytes), value: JSON.parse(bytes) };
}
function committedRecord(reference, repository, deadline, expectedBranch) {
  check(reference && typeof repository === 'string' && path.isAbsolute(repository)
    && path.resolve(reference.repository ?? '').toLowerCase() === path.resolve(repository).toLowerCase()
    && typeof expectedBranch === 'string' && /^refs\/heads\/[A-Za-z0-9_./-]+$/.test(expectedBranch)
    && !expectedBranch.includes('..') && !expectedBranch.includes('//') && !expectedBranch.endsWith('/')
    && reference.expectedBranch === expectedBranch
    && SHA.test(reference.commit ?? '') && DIGEST.test(reference.sha256 ?? '')
    && typeof reference.path === 'string' && /^[A-Za-z0-9_.\/-]+$/.test(reference.path)
    && !reference.path.startsWith('/') && !reference.path.split('/').some(part => part === '..' || part === '.' || part === ''),
    'exact committed record reference and expected branch required');
  // The worktrees share an object store: object presence is not reviewer identity.
  // Type and branch ancestry narrow integrity checks; they do not authenticate
  // a human decision, authorship, branch ownership or remote publication.
  check(git(repository, ['cat-file', '-t', reference.commit], deadline).toString().trim() === 'commit',
    'record reference must name an exact commit object');
  git(repository, ['merge-base', '--is-ancestor', reference.commit, expectedBranch], deadline);
  const bytes = git(repository, ['show', `${reference.commit}:${reference.path}`], deadline);
  check(hash(bytes) === reference.sha256, 'committed record digest differs');
  return { reference, sha256: reference.sha256, value: JSON.parse(bytes) };
}
function approvalScope(manifest, window) {
  return {
    supervisor: { commit: window.supervisorCommit, tree: window.supervisorTree, sha256: manifest.supervisor.sha256 },
    manifestSha256: manifest._digest, qualifiedSource: manifest.source,
    snapshots: manifest.httpRegression.snapshots,
    groups: window.groups.map(id => {
      const group = manifest.groups.find(row => row.id === id);
      check(group, 'unknown approved group');
      return { id, wallMs: group.wallMs, ramFloorMiB: group.ramFloorMiB, commands: group.commands, timeBudget: group.timeBudget,
        continuationPolicy: group.continuationPolicy,
        listenerDisclosure: group.listenerDisclosure ?? null };
    }),
    preparation: manifest.preparation, bounds: manifest.bounds, g0Memory: manifest.g0.memoryContract,
    prerequisites: manifest.executionPrerequisites, openingPolicyContract: manifest.approvalTrust.policyObservationContract,
    window: { runId: window.runId, approvedAt: window.approvedAt, expiresAt: window.expiresAt,
      maximumAttempts: window.maximumAttempts, snapshotPreparationApproved: window.snapshotPreparationApproved,
      executionBudget: window.executionBudget },
  };
}
function assertStaticTimeBudget(manifest, window) {
  let groupTotal = 0;
  for (const id of window.groups) {
    const group = manifest.groups.find(row => row.id === id), budget = group?.timeBudget;
    check(group && Number.isSafeInteger(group.wallMs) && group.wallMs > 0 && budget,
      'declared group wall and overhead budget required before admission');
    check(Array.isArray(group.requires) && group.requires.every(required => window.groups.includes(required)),
      'selected window must include every required dependency group');
    for (const key of ['setupMs', 'admissionAndPauseMs', 'finalizationMs', 'totalOverheadMs', 'commandCeilingTotalMs']) {
      check(Number.isSafeInteger(budget[key]) && budget[key] >= 0, 'invalid static group time budget');
    }
    const commandTotal = group.commands.reduce((sum, command) => {
      check(Number.isSafeInteger(command.wallMs) && command.wallMs > 0, 'invalid command ceiling');
      return sum + command.wallMs;
    }, 0);
    check(Number.isSafeInteger(commandTotal) && budget.totalOverheadMs === budget.setupMs + budget.admissionAndPauseMs + budget.finalizationMs
      && budget.commandCeilingTotalMs === commandTotal && commandTotal + budget.totalOverheadMs <= group.wallMs,
      'command ceilings plus setup/admission/finalization cannot fit unchanged group wall');
    check(Number.isSafeInteger(budget.handshakeWaitBudgetMs) && budget.handshakeWaitBudgetMs > 0
      && budget.handshakeWaitBudgetMs <= budget.admissionAndPauseMs,
      'finite cumulative handshake wait budget must fit declared admission allowance');
    check(group.continuationPolicy?.zeroLaunch === 'MATERIAL_CHANGE_RESTART_PRESERVE_PREFIX_START_WALL_AT_FIRST_ACTUAL_CHILD'
      && group.continuationPolicy.postLaunch === (id === 'G0' ? 'TERMINAL_ADMISSION_INTERRUPTION' : 'PAUSE_ONLY_IF_FULL_REMAINING_BUDGET_FITS'),
      'exact zero-launch restart and post-launch continuation policy required');
    check(Number.isSafeInteger(group.continuationPolicy.resumeStartAllowanceMs)
      && (id === 'G0' ? group.continuationPolicy.resumeStartAllowanceMs === 0
        : group.continuationPolicy.resumeStartAllowanceMs > 0 && group.continuationPolicy.resumeStartAllowanceMs <= budget.setupMs),
      'finite actual resume-start allowance must come from unchanged overhead/slack');
    groupTotal += group.wallMs;
  }
  const budget = window.executionBudget;
  check(budget && Number.isSafeInteger(budget.g0AcceptanceMs) && budget.g0AcceptanceMs >= 0
    && Number.isSafeInteger(budget.transitionAndIdleMs) && budget.transitionAndIdleMs >= 0,
    'explicit finite G0 review and transition budget required');
  check(!window.groups.some(id => id !== 'G0') || budget.g0AcceptanceMs > 0,
    'dependent groups require positive independent G0 acceptance time');
  const preparationMs = window.snapshotPreparationApproved ? manifest.preparation.wallMs : 0;
  const total = preparationMs + groupTotal + budget.g0AcceptanceMs + budget.transitionAndIdleMs;
  check(Number.isSafeInteger(preparationMs) && preparationMs >= 0 && Number.isSafeInteger(total)
    && total <= manifest.bounds.maximumApplicationExecutionMs
    && total <= Date.parse(window.expiresAt) - Date.parse(window.approvedAt),
    'preparation/groups/G0 acceptance/idle budget cannot fit aggregate and window');
  return { preparationMs, groupTotalMs: groupTotal, g0AcceptanceMs: budget.g0AcceptanceMs,
    transitionAndIdleMs: budget.transitionAndIdleMs, declaredTotalMs: total, provenance: 'STATIC_PROPOSAL_NOT_MEASURED_FIT' };
}
function assertDecisionTokens(text, required, groups) {
  const tokens = text.split(/\s+/u).filter(Boolean);
  for (const [label, value] of Object.entries(required)) {
    const matching = tokens.filter(token => token.startsWith(label + '='));
    check(matching.length === 1 && matching[0] === label + '=' + value,
      'approval text lacks a complete exact labelled token: ' + label);
  }
  const declaredGroups = tokens.filter(token => token.startsWith('group=')).map(token => token.slice(6));
  check(eq([...declaredGroups].sort(), [...groups].sort()), 'approval group tokens differ, repeat or form a range');
  check(Object.hasOwn(required, 'action') || !tokens.some(token => token.startsWith('action=')),
    'unrequired preparation action token refused');
}
function assertPolicyObservation(policy, observation, manifest, approved) {
  const contract = manifest.approvalTrust.policyObservationContract;
  check(contract && Number.isSafeInteger(contract.maximumAgeMs) && contract.maximumAgeMs > 0
    && contract.maximumAgeMs <= 300_000, 'finite opening policy freshness contract required');
  const precedence = ['MachinePolicy', 'UserPolicy', 'Process', 'CurrentUser', 'LocalMachine'];
  const values = new Set(['Undefined', 'Restricted', 'AllSigned', 'RemoteSigned', 'Unrestricted', 'Bypass']);
  check(Array.isArray(policy.effectivePolicies) && policy.effectivePolicies.length === precedence.length
    && policy.effectivePolicies.every((row, index) => row?.scope === precedence[index] && values.has(row.policy)),
    'all five policy scopes in exact precedence order required; a curated subset is not effective policy');
  check(policy.effectivePolicies[2].policy === 'Undefined',
    'opening Process policy must be Undefined for the exact helper environment');
  const effective = policy.effectivePolicies.find(row => row.policy !== 'Undefined');
  check(effective && ['RemoteSigned', 'Unrestricted'].includes(effective.policy)
    && eq(policy.effectivePolicy, effective) && eq(observation.effectivePolicy, effective),
    'computed first-defined policy does not permit the exact unsigned helper');
  const observed = Date.parse(observation.observedAt);
  check(Number.isFinite(observed) && observed <= approved && approved - observed <= contract.maximumAgeMs,
    'separately authorized policy observation is stale at opening');
  // This is an opening fact. It is not a policy probe or continuous guarantee that
  // host policy remains unchanged during the finite approved window.
}
// Record integrity under a trusted-local-operator model. Actual consent retrieval
// and the original reviewer's comparison remain external duties. Shared-store
// ancestry, record text and hashes cannot authenticate human consent.
function loadAuthority(options) {
  const authorityStartedAt = Date.now(); // Includes control-file and executable hashing.
  check(process.platform === 'win32', 'only the explicitly authored Windows route is supported');
  const manifestRecord = boundRecord(options['--manifest'] ?? DEFAULT_MANIFEST);
  const manifest = manifestRecord.value; manifest._digest = manifestRecord.sha256;
  check(manifest.schemaVersion === 1 && SHA.test(manifest.source.commit) && SHA.test(manifest.source.tree), 'invalid manifest');
  const wr = boundRecord(options['--window']), vr = boundRecord(options['--approval-verification']);
  const window = wr.value, verification = vr.value;
  const approved = Date.parse(window.approvedAt), expires = Date.parse(window.expiresAt);
  const now = Date.now();
  check(Number.isFinite(approved) && Number.isFinite(expires) && approved <= authorityStartedAt && approved <= now && expires > now
    && expires > approved && expires - approved <= manifest.bounds.maximumWindowMs,
    'unexpired bounded execution window required');
  check(RUN_ID.test(window.runId ?? '') && Array.isArray(window.groups) && window.groups.length > 0
    && new Set(window.groups).size === window.groups.length, 'invalid run/group identity');
  check(window.groups.every(id => manifest.groups.some(row => row.id === id))
    && (!window.groups.some(id => id !== 'G0') || window.groups.includes('G0')),
    'window has an unknown group or a dependent group without G0');
  const staticTimeBudget = assertStaticTimeBudget(manifest, window);
  const mode = options['--prepare'] ? 'PREPARE' : options['--group'];
  check(typeof window.snapshotPreparationApproved === 'boolean'
    && (mode === 'PREPARE' ? window.snapshotPreparationApproved === true : window.groups.includes(mode)),
    'mode is outside the actual verified decision');
  // Preparation and execution refuse the same unusable proposed group set.
  // No boolean or observation can lift a source hold.
  assertStageEligibility(manifest, mode);
  for (const id of window.groups) {
    check(manifest.groups.find(row => row.id === id)?.status === 'AUTHORED_PENDING_APPROVAL_AND_ACCEPTANCE',
      'window includes an absent, held or deferred group');
    assertStageEligibility(manifest, id);
  }
  const modeWallMs = mode === 'PREPARE' ? manifest.preparation.wallMs : manifest.groups.find(row => row.id === mode).wallMs;
  check(Number.isFinite(modeWallMs) && modeWallMs > 0
    && Number.isFinite(manifest.bounds.maximumApplicationExecutionMs) && manifest.bounds.maximumApplicationExecutionMs > 0,
    'finite positive stage and aggregate walls required');
  const aggregateDeadline = Math.min(expires, approved + manifest.bounds.maximumApplicationExecutionMs);
  const resumePreview = options['--resume'] ? boundRecord(options['--resume']) : null;
  const resumeDeadline = resumePreview?.value.schemaVersion === 'quick-order-paused-continuation-v1'
    ? Date.parse(resumePreview.value.deadline) : Infinity;
  if (resumePreview?.value.schemaVersion === 'quick-order-paused-continuation-v1')
    check(Number.isFinite(resumeDeadline), 'resume original deadline missing');
  // Metadata may validate and terminalize an expired pause while the original
  // window remains open. This never extends its started execution deadline:
  // readPause restores that exact deadline before any admission or command.
  const authorityDeadline = Math.min(aggregateDeadline, authorityStartedAt + modeWallMs);
  check(Date.now() < authorityDeadline, 'control reads exhausted stage/aggregate/window ceiling');
  const pinDeadline = Math.min(authorityDeadline, Date.now() + 30_000);
  check(manifest.g0.memoryContract.subjectJob.limitBytes === 512 * 1024 * 1024
    && manifest.g0.memoryContract.subjectJob.limitMiB === 512
    && manifest.g0.memoryContract.hostAdmission.floorMiB === 1536
    && manifest.groups.find(row => row.id === 'G0')?.ramFloorMiB === 1536,
    'G0 memory definitions differ from the authored subject limit and host floor');
  const script = fileURLToPath(import.meta.url);
  check(fs.realpathSync.native(script).toLowerCase() === path.resolve(script).toLowerCase()
    && hash(fs.readFileSync(script)) === manifest.supervisor.sha256, 'supervisor raw source differs or symlink invocation');
  check(path.resolve(process.execPath).toLowerCase() === path.resolve(manifest.toolchain.executable).toLowerCase()
    && hash(fs.readFileSync(process.execPath)) === manifest.toolchain.sha256, 'launcher identity differs');
  metadataToolchain = manifest.toolchain.git;
  check(window.manifestSha256 === manifest._digest && window.sourceCommit === manifest.source.commit
    && window.sourceTree === manifest.source.tree && SHA.test(window.supervisorCommit) && SHA.test(window.supervisorTree),
    'exact supervisor and qualified source identities required');
  check(Number.isInteger(window.maximumAttempts) && window.maximumAttempts > 0
    && window.maximumAttempts <= manifest.bounds.maximumAttempts, 'invalid bounded attempt budget');
  check(verification.coordinatorThread === manifest.approvalTrust.coordinatorThread
    && verification.status === 'ACTUAL_HUMAN_DECISION_RETRIEVED_AND_EXACT_SCOPE_COMPARED'
    && verification.windowSha256 === wr.sha256 && verification.manifestSha256 === manifest._digest,
    'independent coordinator approval verification absent or mismatched');
  const decision = verification.decision;
  check(decision?.origin === 'HUMAN_USER' && typeof decision.threadId === 'string' && decision.threadId.length > 0
    && typeof decision.messageId === 'string' && decision.messageId.length > 0
    && typeof decision.text === 'string' && decision.text.trim().length > 0
    && DIGEST.test(decision.textSha256 ?? '') && hash(Buffer.from(decision.text)) === decision.textSha256
    && window.decisionTextSha256 === decision.textSha256
    && eq(window.decisionReference, { threadId: decision.threadId, messageId: decision.messageId }),
    'immutable actual human decision reference/text digest missing');
  const decisionAt = Date.parse(decision.at), verifiedAt = Date.parse(verification.verifiedAt);
  check(window.approvalText === decision.text && Number.isFinite(decisionAt) && Number.isFinite(verifiedAt)
    && decisionAt <= verifiedAt && verifiedAt <= approved && window.decisionAt === decision.at,
    'decision and coordinator verification must precede the proposed window start');
  assertDecisionTokens(decision.text, { manifestSha256: manifest._digest, sourceCommit: manifest.source.commit,
    sourceTree: manifest.source.tree, supervisorSha256: manifest.supervisor.sha256, runId: window.runId,
    maximumAttempts: String(window.maximumAttempts), approvedAt: window.approvedAt, expiresAt: window.expiresAt,
    ...(window.snapshotPreparationApproved ? { action: 'PREPARE' } : {}) }, window.groups);
  check(verification.scopeComparison === 'EXACT_MATCH' && eq(verification.scope, approvalScope(manifest, window)),
    'verified owner decision does not bind the complete exact proposal');
  // The comparison binds the observation contract, not future opening facts.
  // No observation bytes belong in the owner/coordinator/reviewer chain.
  check(!Object.hasOwn(verification, 'executionPolicy') && !Object.hasOwn(window, 'executionPolicy')
    && !Object.hasOwn(window, 'policyObservation') && !Object.hasOwn(window, 'policyObservationSha256'),
    'opening policy observation must be separate from immutable approval/comparison records');
  const policyObservation = boundRecord(options['--policy-observation']);
  const policy = policyObservation.value;
  const policyBase = osEnvironment();
  policyBase.PATH = path.dirname(manifest.toolchain.executable) + path.delimiter + (policyBase.PATH ?? '');
  check(policy?.status === 'VERIFIED_EFFECTIVE_POLICY_PERMITS_EXACT_HELPER_WITHOUT_BYPASS'
    && policy.powershellSha256 === manifest.toolchain.windowsHelper.executableSha256
    && policy.helperSha256 === hash(Buffer.from(WINDOWS_HELPER))
    && policy.environmentProjection === 'WINDOWS_POLICY_CONTEXT_V1'
    && policy.environmentSha256 === hash(Buffer.from(JSON.stringify(policyEnvironment(policyBase))))
    && policy.windowSha256 === wr.sha256 && policy.manifestSha256 === manifest._digest && policy.runId === window.runId,
    'separately authorized effective policy with an allowed named scope is required; no probe or bypass is inferred');
  assertPolicyObservation(policy, policy, manifest, approved);
  // Fresh host facts are separate bytes, so they do not make the committed
  // proposed window/review depend on observations made just before its start.
  check(!Object.hasOwn(window, 'preWindowObservation'), 'host observation must not be embedded in immutable window bytes');
  const preWindowRecord = boundRecord(options['--pre-window-observation']);
  const preWindow = preWindowRecord.value;
  const maximumFloor = Math.max(...window.groups.map(id => manifest.groups.find(row => row.id === id).ramFloorMiB));
  check(preWindow?.manifestSha256 === manifest._digest && preWindow.windowSha256 === wr.sha256
    && preWindow.runId === window.runId
    && Number.isFinite(preWindow.availableMiB) && preWindow.availableMiB >= maximumFloor
    && Number.isFinite(preWindow.freeDiskGiB) && preWindow.freeDiskGiB >= 20
    && preWindow.noCompetingHeavyJob === true && preWindow.heavyJobPredicate === manifest.admission.heavyJobPredicateId
    && Number.isFinite(Date.parse(preWindow.observedAt))
    && Date.parse(preWindow.observedAt) >= approved - 30_000 && Date.parse(preWindow.observedAt) <= approved,
    'separately bound maximum-floor host observation absent or stale at window opening');
  const observationAuthorities = [];
  for (const [action, observation] of [
    ['HOST_PRE_WINDOW_OBSERVATION', preWindow],
    ['EFFECTIVE_POLICY_OBSERVATION', policyObservation.value],
  ]) {
    const record = committedRecord(observation.observationAuthorityReference,
      manifest.approvalTrust.coordinatorRepository, pinDeadline, manifest.approvalTrust.coordinatorBranch);
    const value = record.value, observationDecision = value.decision, scope = value.scope;
    check(value.coordinatorThread === manifest.approvalTrust.coordinatorThread
      && value.status === 'ACTUAL_HUMAN_OBSERVATION_AUTHORITY_RETRIEVED_AND_EXACT_SCOPE_COMPARED'
      && observationDecision?.origin === 'HUMAN_USER'
      && typeof observationDecision.threadId === 'string' && observationDecision.threadId.length > 0
      && typeof observationDecision.messageId === 'string' && observationDecision.messageId.length > 0
      && typeof observationDecision.text === 'string' && observationDecision.text.trim().length > 0
      && DIGEST.test(observationDecision.textSha256 ?? '')
      && hash(Buffer.from(observationDecision.text)) === observationDecision.textSha256
      && scope?.action === action && scope.manifestSha256 === manifest._digest
      && scope.windowSha256 === wr.sha256 && scope.runId === window.runId && scope.maximumObservations === 1
      && Number.isFinite(Date.parse(observationDecision.at)) && Number.isFinite(Date.parse(scope.notBefore))
      && Number.isFinite(Date.parse(scope.notAfter)) && Date.parse(observationDecision.at) <= Date.parse(scope.notBefore)
      && Date.parse(scope.notBefore) <= Date.parse(observation.observedAt)
      && Date.parse(observation.observedAt) <= Date.parse(scope.notAfter) && Date.parse(scope.notAfter) <= approved,
      'separate one-shot observation authority record absent or outside exact scope');
    observationAuthorities.push({ action, reference: record.reference });
  }
  check(git(manifest.snapshot.sourceRepository, ['cat-file', '-t', window.supervisorCommit], pinDeadline).toString().trim() === 'commit',
    'supervisor identity must be an exact commit object');
  check(git(manifest.snapshot.sourceRepository, ['rev-parse', `${window.supervisorCommit}^{tree}`], pinDeadline).toString().trim()
    === window.supervisorTree, 'approved supervisor tree differs');
  for (const [relative, digest] of [[manifest.supervisor.path, manifest.supervisor.sha256],
    [manifest.supervisor.manifestPath, manifest._digest]]) {
    check(hash(git(manifest.snapshot.sourceRepository, ['show', `${window.supervisorCommit}:${relative}`], pinDeadline)) === digest,
      'approved committed supervisor/manifest bytes differ');
  }
  const reviewPointer = boundRecord(options['--window-review']);
  const review = committedRecord(reviewPointer.value, manifest.approvalTrust.reviewerRepository,
    pinDeadline, manifest.approvalTrust.reviewerBranch);
  const reviewed = review.value, reviewedAt = Date.parse(reviewed.reviewedAt);
  check(reviewed.reviewerThread === manifest.approvalTrust.reviewerThread
    && reviewed.disposition === 'APPROVAL_WINDOW_EXACT_MATCH_SOURCE_ACCEPTED'
    && reviewed.manifestSha256 === manifest._digest && reviewed.decisionTextSha256 === decision.textSha256
    && eq(reviewed.decisionReference, window.decisionReference) && eq(reviewed.scope, verification.scope)
    && Number.isFinite(reviewedAt) && verifiedAt <= reviewedAt && reviewedAt <= approved,
    'original reviewer exact comparison must follow verification and precede window start');
  const reviewedWindow = committedRecord(reviewed.window, manifest.approvalTrust.coordinatorRepository,
    pinDeadline, manifest.approvalTrust.coordinatorBranch);
  const reviewedVerification = committedRecord(reviewed.coordinatorVerification, manifest.approvalTrust.coordinatorRepository,
    pinDeadline, manifest.approvalTrust.coordinatorBranch);
  check(reviewedWindow.sha256 === wr.sha256 && reviewedVerification.sha256 === vr.sha256,
    'reviewer did not compare these exact committed window and approval-verification bytes');
  const sourceReview = committedRecord(reviewed.sourceDisposition, manifest.approvalTrust.reviewerRepository,
    pinDeadline, manifest.approvalTrust.reviewerBranch);
  check(sourceReview.value.reviewerThread === manifest.approvalTrust.reviewerThread
    && ['SOURCE ACCEPT', 'SOURCE ACCEPT WITH LIMITS'].includes(sourceReview.value.disposition)
    && sourceReview.value.supervisorCommit === window.supervisorCommit
    && sourceReview.value.supervisorTree === window.supervisorTree
    && sourceReview.value.supervisorSha256 === manifest.supervisor.sha256
    && sourceReview.value.manifestSha256 === manifest._digest
    && sourceReview.value.sourceCommit === manifest.source.commit && sourceReview.value.sourceTree === manifest.source.tree
    && Array.isArray(sourceReview.value.eligibleModes) && sourceReview.value.eligibleModes.includes(mode)
    && window.groups.every(id => sourceReview.value.eligibleModes.includes(id)),
    'exact supervisor source disposition does not permit every proposed mode');
  const reservationRecord = boundRecord(options['--reservation']), admissionRecord = boundRecord(options['--admission']);
  const reservation = reservationRecord.value, admission = admissionRecord.value;
  check(reservation.runId === window.runId && reservation.group === mode && reservation.state === 'EXCLUSIVE_ACTIVE'
    && reservation.leaseId === manifest.owner.leaseId && reservation.manifestSha256 === manifest._digest
    && reservation.windowSha256 === wr.sha256 && reservation.id === admission.reservationId,
    'exact exclusive reservation absent or mismatched');
  const authority = { windowSha256: wr.sha256, verificationSha256: vr.sha256,
    decisionReference: window.decisionReference, decisionAt: decision.at, decisionTextSha256: decision.textSha256,
    reservationSha256: reservationRecord.sha256, initialAdmissionSha256: admissionRecord.sha256,
    preWindowObservationSha256: preWindowRecord.sha256, observationAuthorities,
    effectivePolicyObservationSha256: policyObservation.sha256,
    windowReviewPointerSha256: reviewPointer.sha256,
    windowReview: review.reference, sourceDisposition: sourceReview.reference,
    committedWindow: reviewed.window, coordinatorVerification: reviewed.coordinatorVerification,
    windowCommit: reviewed.window.commit, approvalVerificationCommit: reviewed.coordinatorVerification.commit,
    trust: 'COORDINATOR_RETRIEVAL_AND_ORIGINAL_REVIEWER_COMPARISON; LOCAL_RECORD_INTEGRITY_NOT_CRYPTOGRAPHIC_CONSENT',
    recordStoreLimitation: 'SHARED_OBJECT_STORE; EXACT_COMMIT_TYPE_AND_EXPECTED_BRANCH_ANCESTRY_ARE_NOT_AUTHORSHIP_OR_REMOTE_PUBLICATION_PROOF' };
  check(Date.now() < authorityDeadline, 'authority checks exhausted stage/aggregate/window ceiling');
  return { manifest, window, reservation, admission, authority, aggregateDeadline, authorityDeadline, mode, policy,
    staticTimeBudget, resumePreview,
    admissionFile: path.resolve(options['--admission']), authorityStartedAt };
}
function parseOptions(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    check(!['--continue', '--continuation'].includes(argv[i]), 'only exact --resume pause-record mode is supported');
    if (argv[i] === '--prepare') {
      check(!options['--prepare'], 'duplicate prepare mode'); options['--prepare'] = true; i -= 1; continue;
    }
    check(['--manifest', '--group', '--window', '--reservation', '--admission', '--approval-verification',
      '--window-review', '--pre-window-observation', '--policy-observation', '--resume'].includes(argv[i]), 'unknown option');
    check(argv[i + 1] !== undefined && !Object.hasOwn(options, argv[i]), 'missing or duplicate option');
    options[argv[i]] = argv[i + 1];
  }
  check(Boolean(options['--group']) !== Boolean(options['--prepare']), 'exactly one group or prepare mode required');
  check(!options['--resume'] || options['--group'], 'resume requires the same explicit group, never preparation');
  check(options['--window'] && options['--reservation'] && options['--admission'] && options['--approval-verification']
    && options['--window-review'] && options['--pre-window-observation'] && options['--policy-observation'],
    'explicit future authority, separate pre-window observation, reservation and admission records required');
  return options;
}

function ownedArtifactInventory(cwd, deadline) {
  const root = path.join(cwd, 'dist'); ensureOwned(cwd, root);
  check(fs.existsSync(path.join(root, 'index.cjs')) && fs.existsSync(path.join(root, 'public')), 'G7 required build outputs absent');
  const inventory = [];
  function visit(folder) {
    for (const entry of fs.readdirSync(folder)) {
      check(Date.now() < deadline, 'G7 artifact inventory exceeded group/window deadline');
      const file = path.join(folder, entry); ensureOwned(root, file);
      const stat = fs.lstatSync(file);
      check(!stat.isSymbolicLink(), 'G7 output symlink refused');
      if (stat.isDirectory()) visit(file);
      else {
        check(stat.isFile(), 'G7 unsupported build output');
        inventory.push({ path: path.relative(cwd, file).replaceAll('\\', '/'), bytes: stat.size, sha256: hash(fs.readFileSync(file)) });
      }
    }
  }
  visit(root);
  return inventory.sort((a, b) => a.path.localeCompare(b.path));
}

/** Exact file/name multisets; expected failures remain actual FAILED verdicts. */
const caseKey = row => JSON.stringify([row.file, row.name, row.ancestorTitles ?? null, row.title ?? null]);
const counts = rows => {
  const result = new Map();
  for (const row of rows) result.set(caseKey(row), (result.get(caseKey(row)) ?? 0) + (row.count ?? 1));
  return [...result].sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
};
function assertFailureCause(row, expected) {
  const cause = expected.cause;
  check(cause?.calibrationRequired !== true, 'actual runner cause serialization remains HELD');
  check(cause && Array.isArray(cause.messageIncludes) && cause.messageIncludes.length > 0
    && typeof cause.sourcePath === 'string' && Number.isInteger(cause.sourceLine),
    'intended RED cause has no exact predeclared message and source assertion');
  check(Array.isArray(row.failureMessages) && row.failureMessages.length === 1, 'missing or multiple failure causes');
  const message = row.failureMessages[0].replaceAll('\\', '/');
  check(cause.messageIncludes.every(value => typeof value === 'string' && message.includes(value))
    && message.includes(cause.sourcePath + ':' + cause.sourceLine + ':')
    && (cause.excludes ?? []).every(value => !message.includes(value)), 'RED failed for another cause or assertion');
}
function assertProtectionFailure(text, contract) {
  check(Array.isArray(contract.expectedViolationSections) && Array.isArray(contract.expectedViolatingPaths),
    'exact protection failure inventory absent');
  const sections = new Map(); let active = null, last = null, verdicts = 0;
  for (const line of text.replaceAll('\r\n', '\n').split('\n')) {
    if (!line) { active = null; last = null; continue; }
    if (line.startsWith('FAIL:')) {
      check(contract.expectedViolationSections.some(row => row.header === line) && !sections.has(line),
        'unknown or duplicate protection failure section');
      active = []; sections.set(line, active); last = null; continue;
    }
    if (line.startsWith('RESULT:')) { check(line === 'RESULT: FAIL', 'protection result differs'); verdicts += 1; continue; }
    if (!active) continue;
    const item = line.match(/^  - (.+)$/);
    if (item) { last = { path: item[1] }; active.push(last); continue; }
    const detail = line.match(/^      (expected |actual   )(sha256:[a-f0-9]{64})$/);
    if (detail) {
      const key = detail[1].startsWith('expected') ? 'expected' : 'actual';
      check(last && !Object.hasOwn(last, key), 'unbound protection hash detail'); last[key] = detail[2]; continue;
    }
    check(line === 'The main website outside /research and /care must not be modified.', 'unparsed protection failure detail');
  }
  check(verdicts === 1, 'missing or repeated protection verdict');
  const union = [];
  for (const expected of contract.expectedViolationSections) {
    const actual = sections.get(expected.header) ?? [];
    check(eq(actual.map(row => row.path).sort(), expected.paths.slice().sort()), 'protection violating section paths differ');
    for (const row of actual) {
      union.push(row.path);
      const expectedHash = expected.hashes?.find(pin => pin.path === row.path);
      if (expectedHash) check(row.expected === expectedHash.expected && row.actual === expectedHash.actual, 'protection hash cause differs');
      else check(row.expected === undefined && row.actual === undefined, 'unexpected protection hash cause');
    }
  }
  check(eq([...new Set(union)].sort(), contract.expectedViolatingPaths.slice().sort()), 'protection violating path set differs');
}
export function compareCaseSets(observed, contract) {
  check(observed.length > 0 && Array.isArray(contract.expectedCases) && contract.expectedCases.length > 0,
    'exact full selected/skipped inventory absent');
  check(contract.expectedCases.every(row => typeof row.file === 'string' && typeof row.name === 'string'
    && Number.isInteger(row.count) && row.count > 0), 'invalid expected inventory multiplicity');
  check(eq(counts(observed), counts(contract.expectedCases)), 'observed file/name multiset differs');
  check(observed.every(row => ['passed', 'failed', 'skipped', 'todo'].includes(row.status)), 'pending or cancelled case');
  const expectedSkipped = contract.expectedSkipped ?? [];
  const skipped = observed.filter(row => row.status === 'skipped');
  check(eq(counts(skipped), counts(expectedSkipped)), 'skipped case inventory differs');
  check(observed.every(row => row.status !== 'todo'), 'todo case refused');
  const failed = observed.filter(row => row.status === 'failed');
  const expectedFailures = contract.expectedFailures ?? [];
  check(expectedFailures.every(row => typeof row === 'object') && eq(counts(failed), counts(expectedFailures)),
    'observed failed file/name multiset differs');
  for (const row of failed) assertFailureCause(row, expectedFailures.find(expected => caseKey(expected) === caseKey(row)));
  const passed = observed.filter(row => row.status === 'passed');
  if (contract.expectedCounts) {
    for (const expected of contract.expectedCounts) check(observed.filter(row => row.file === expected.file).length === expected.count,
      'per-file case count differs');
  }
  return { caseCount: observed.length, passed: passed.length, failed: failed.length, skipped: skipped.length, todo: 0,
    failedCases: failed, runnerVerdict: failed.length ? 'FAILED' : 'PASSED',
    dependencyDisposition: failed.length ? 'EXACT_PREDECLARED_RED_ONLY' : 'GREEN' };
}
function parseVitestReport(report, supplemental, cwd) {
  check(Array.isArray(report.testResults) && report.testResults.length > 0, 'missing JSON test results');
  check(supplemental?.schemaVersion === 1 && Array.isArray(supplemental.files)
    && Array.isArray(supplemental.unhandledErrors) && supplemental.unhandledErrors.length === 0, 'suite/unhandled evidence missing or failed');
  const rows = [], files = [], suites = [];
  for (const result of report.testResults) {
    check(typeof result.name === 'string' && within(cwd, result.name), 'test file outside snapshot');
    const file = path.relative(cwd, result.name).replaceAll('\\', '/');
    check(!files.includes(file) && result.message === '' && Array.isArray(result.assertionResults), 'duplicate file or suite/hook error');
    files.push(file);
    for (const row of result.assertionResults) {
      check(Array.isArray(row.ancestorTitles) && row.ancestorTitles.every(x => typeof x === 'string')
        && typeof row.title === 'string' && row.fullName === [...row.ancestorTitles, row.title].join(' ')
        && Array.isArray(row.failureMessages), 'unparsed or ambiguous assertion identity');
      rows.push({ file, name: row.fullName, ancestorTitles: row.ancestorTitles, title: row.title,
        status: row.status, failureMessages: row.failureMessages, location: row.location });
      check(row.status === 'failed' || row.failureMessages.length === 0, 'nonfailed case has failure evidence');
    }
    check(result.status === (result.assertionResults.some(row => row.status === 'failed') ? 'failed' : 'passed'),
      'file status contains unaccounted hook or suite failure');
  }
  const supplementalFiles = supplemental.files.map(entry => {
    check(typeof entry.file === 'string' && within(cwd, entry.file) && Array.isArray(entry.suites), 'invalid suite inventory');
    for (const suite of entry.suites) {
      check(Array.isArray(suite.errors) && suite.errors.length === 0 && !['run', 'queued'].includes(suite.state)
        && suite.mode !== 'todo', 'suite/hook/afterAll or pending evidence refused');
      suites.push(suite);
    }
    return path.relative(cwd, entry.file).replaceAll('\\', '/');
  });
  check(eq(files.slice().sort(), supplementalFiles.sort()), 'suite report file inventory differs');
  const summary = { numTotalTests: rows.length, numPassedTests: rows.filter(row => row.status === 'passed').length,
    numFailedTests: rows.filter(row => row.status === 'failed').length,
    numPendingTests: rows.filter(row => row.status === 'skipped' || row.status === 'pending').length,
    numTodoTests: rows.filter(row => row.status === 'todo').length,
    numTotalTestSuites: suites.length, numFailedTestSuites: suites.filter(row => row.state === 'fail').length,
    numPendingTestSuites: 0 };
  summary.numPassedTestSuites = summary.numTotalTestSuites - summary.numFailedTestSuites;
  for (const [key, count] of Object.entries(summary)) check(Number.isInteger(report[key]) && report[key] === count,
    'JSON final total differs: ' + key);
  check(report.success === (summary.numFailedTests === 0 && summary.numFailedTestSuites === 0), 'JSON success disagrees with final totals');
  check(supplemental.reason === (report.success ? 'passed' : 'failed'), 'suite reporter finish reason differs or run interrupted');
  return { rows, summary, suites, files,
    supplementalAssertions: 'RETAINED_ONLY; JSON_ASSERTION_IDENTITIES_AND_SUPPLEMENTAL_SUITE_ERRORS_ARE_ENFORCED' };
}
/** Flat TAP13 only: the exact G1 source registers no suites or subtests. */
export function parseCases(text, kind, contract = {}) {
  check(kind === 'node-tap', 'unsupported text reporter; Vitest requires both structured reports');
  check(Buffer.byteLength(text) <= STREAM_LIMIT && !text.includes('\u001b'), 'TAP cap or ANSI refused');
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  check(lines.shift() === 'TAP version 13', 'TAP13 header absent');
  const rows = [], summary = {}; let pendingName = null, plan = null, diagnostic = null, trailer = false, durationSeen = false;
  for (const line of lines) {
    if (!line) continue;
    if (diagnostic !== null) {
      if (line === '  ...') { rows.at(-1).failureMessages = rows.at(-1).status === 'failed' ? [diagnostic.join('\n')] : []; diagnostic = null; }
      else { check(line.startsWith('  '), 'TAP malformed diagnostic block'); diagnostic.push(line); }
      continue;
    }
    if (line === '  ---') { check(rows.length > 0 && pendingName === null && !trailer, 'TAP diagnostic without case'); diagnostic = []; continue; }
    let match = line.match(/^# Subtest: (.+)$/);
    if (match) { check(!trailer && pendingName === null, 'nested or duplicate TAP subtest'); pendingName = match[1]; continue; }
    match = line.match(/^(not ok|ok) (\d+) - (.*?)(?: # (SKIP|TODO)(?: (.*))?)?$/);
    if (match) {
      check(!trailer && Number(match[2]) === rows.length + 1 && pendingName === match[3], 'TAP case ID/name differs');
      check(match[4] !== 'TODO', 'TAP todo refused');
      if (match[4]) check(match[5] === 'test name does not match pattern', 'unapproved TAP skip cause');
      if (contract.tapInventory) {
        const expected = contract.tapInventory[rows.length];
        check(expected?.index === Number(match[2]) && expected.name === match[3]
          && (expected.status === 'prescribed_skip') === Boolean(match[4]), 'TAP bound source order or selected/skip identity differs');
      }
      rows.push({ file: contract.targetFiles?.[0], name: match[3], index: Number(match[2]),
        status: match[4] ? 'skipped' : match[1] === 'ok' ? 'passed' : 'failed', failureMessages: [] });
      pendingName = null; continue;
    }
    match = line.match(/^1\.\.(\d+)$/);
    if (match) { check(plan === null && pendingName === null, 'duplicate or incomplete TAP plan'); plan = Number(match[1]); trailer = true; continue; }
    match = line.match(/^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$/);
    if (match) { check(trailer && !Object.hasOwn(summary, match[1]), 'TAP duplicate or premature total'); summary[match[1]] = Number(match[2]); continue; }
    if (/^# duration_ms \d+(?:\.\d+)?$/.test(line)) { check(trailer && !durationSeen, 'TAP duplicate or premature duration'); durationSeen = true; continue; }
    refuse('unparsed TAP line, nested suite, bailout or trailing evidence');
  }
  check(diagnostic === null && pendingName === null && plan === rows.length && rows.length > 0 && durationSeen, 'TAP truncated or missing plan');
  const expected = { tests: rows.length, suites: 0, pass: rows.filter(r => r.status === 'passed').length,
    fail: rows.filter(r => r.status === 'failed').length, cancelled: 0, skipped: rows.filter(r => r.status === 'skipped').length, todo: 0 };
  check(eq(summary, expected), 'TAP final totals differ or are incomplete');
  return { rows, summary };
}
function classifyResult(command, native, streams, context) {
  check(native.cleanupProven === true, 'owned Job Object active-zero cleanup not established');
  check(native.processTraceComplete === true, 'owned process event trace incomplete');
  if (command.result.kind === 'supervisor-self-test') {
    check(native.fault === null, 'native supervisor self-test fault');
    check(native.abortReason === (command.result.expectAbort ?? null), 'self-test abort reason differs');
    if (command.result.expectExit !== undefined) check(native.rootExitCode === command.result.expectExit, 'self-test exit differs');
    if (command.result.stdout) check(streams.stdout.toString('utf8') === command.result.stdout, 'stdout separation differs');
    if (command.result.stderr) check(streams.stderr.toString('utf8') === command.result.stderr, 'stderr separation differs');
    if (command.result.minimumPeakJobChildren) check(native.peakJobChildren >= command.result.minimumPeakJobChildren, 'real owned-child capture missing');
    return { runnerVerdict: 'SELF_TEST_EXPECTATION_MET', dependencyDisposition: 'GREEN',
      observedExitCode: native.rootExitCode, observedAbort: native.abortReason };
  }
  check(native.abortReason === null && native.rootExitCode !== null, 'deadline, cap, process bound or native supervisor failure');
  const output = streams.stdout.toString('utf8') + '\n' + streams.stderr.toString('utf8');
  check(!/ERR_MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|ERR_REQUIRE_ESM|Cannot find (?:package|module)|heap out of memory|ENOMEM|ETIMEDOUT|Test timed out|Hook timed out|Unhandled Errors/i.test(output),
    'setup, import, resource, timeout or unhandled error');
  if (command.result.kind === 'exit') {
    check(command.result.allowedCodes.includes(native.rootExitCode), 'unexpected exit verdict');
    if (command.result.requiredOutput) check(output.includes(command.result.requiredOutput), 'required verdict marker absent');
    if (command.result.nonBlockingDisposition === 'PROTECTION_FAILURE_RETAINED_ARTIFACTS_INDEPENDENT') {
      check(streams.stderr.length === 0, 'unexpected protection stderr evidence');
      assertProtectionFailure(streams.stdout.toString('utf8'), command.result);
    }
    return { runnerVerdict: native.rootExitCode === 0 ? 'PASSED' : 'FAILED',
      dependencyDisposition: native.rootExitCode === 0 ? 'GREEN' : command.result.nonBlockingDisposition,
      exitCode: native.rootExitCode };
  }
  const contract = command.result;
  if (contract.kind === 'vitest-json') {
    for (const file of [context.reportPath, context.reportPath + '.suites.json'])
      check(fs.existsSync(file) && fs.lstatSync(file).isFile() && fs.statSync(file).size <= STREAM_LIMIT,
        'structured reporter missing, not regular or exceeds retained evidence cap');
  }
  const parsed = contract.kind === 'vitest-json'
    ? parseVitestReport(boundRecord(context.reportPath).value, boundRecord(context.reportPath + '.suites.json').value, context.cwd)
    : parseCases(streams.stdout.toString('utf8'), contract.kind, contract);
  const rows = parsed.rows;
  if (contract.targetFiles) {
    const observedFiles = [...new Set(rows.map(row => row.file))].sort();
    check(eq(observedFiles, [...contract.targetFiles].sort()), 'observed test files differ from bound targets');
  }
  const verdict = compareCaseSets(rows, contract);
  check(native.rootExitCode === (verdict.failed ? 1 : 0), 'case verdict and raw runner exit disagree');
  return { ...verdict, observedCases: rows, finalTotals: parsed.summary };
}

/* Future, bounded Windows helper. No library, installer, network or third-party executable. */
const WINDOWS_HELPER = String.raw`param([Parameter(Mandatory=$true)][string]$SpecPath)
$ErrorActionPreference = 'Stop'
$spec = Get-Content -LiteralPath $SpecPath -Raw | ConvertFrom-Json
# Reflection.Emit defines P/Invoke methods in-process. No C# compiler or child is
# needed to own this helper before Add-Type may start csc.exe.
$assemblyName = New-Object System.Reflection.AssemblyName('XeniosJobBootstrap')
$assembly = [AppDomain]::CurrentDomain.DefineDynamicAssembly($assemblyName, [System.Reflection.Emit.AssemblyBuilderAccess]::Run)
$module = $assembly.DefineDynamicModule('XeniosJobBootstrap')
$type = $module.DefineType('XeniosJobBootstrap', [System.Reflection.TypeAttributes]::Public)
$attributes = [System.Reflection.MethodAttributes]::Public -bor [System.Reflection.MethodAttributes]::Static -bor [System.Reflection.MethodAttributes]::PinvokeImpl
function Add-NativeMethod([string]$name,[Type]$returns,[Type[]]$parameters) {
  $method = $type.DefinePInvokeMethod($name,'kernel32.dll',$attributes,[System.Reflection.CallingConventions]::Standard,$returns,$parameters,[System.Runtime.InteropServices.CallingConvention]::Winapi,[System.Runtime.InteropServices.CharSet]::Unicode)
  $method.SetImplementationFlags($method.GetMethodImplementationFlags() -bor [System.Reflection.MethodImplAttributes]::PreserveSig)
}
Add-NativeMethod 'CreateJobObjectW' ([IntPtr]) @([IntPtr],[string])
Add-NativeMethod 'SetInformationJobObject' ([bool]) @([IntPtr],[int],[IntPtr],[uint32])
Add-NativeMethod 'AssignProcessToJobObject' ([bool]) @([IntPtr],[IntPtr])
Add-NativeMethod 'QueryInformationJobObject' ([bool]) @([IntPtr],[int],[IntPtr],[uint32],[IntPtr])
$native = $type.CreateType()
$bootstrapJob = $native::CreateJobObjectW([IntPtr]::Zero,$null)
if ($bootstrapJob -eq [IntPtr]::Zero) { throw 'Bootstrap Job Object unavailable; no compiler or subject started' }
# This route is explicitly64-bit Windows PowerShell. Native EXTENDED_LIMIT is144bytes:
# flags@16, activeProcessLimit@40. Outerjob includes helper+compiler/subject tree.
if ([IntPtr]::Size -ne 8) { throw 'Only the bound64-bit Windows bootstrap is supported' }
$limit = [System.Runtime.InteropServices.Marshal]::AllocHGlobal(144)
try {
  for ($index=0; $index -lt 144; $index++) { [System.Runtime.InteropServices.Marshal]::WriteByte($limit,$index,0) }
  [System.Runtime.InteropServices.Marshal]::WriteInt32($limit,16,0x2408)
  [System.Runtime.InteropServices.Marshal]::WriteInt32($limit,40,([int]$spec.maxJobChildren+1))
  if (-not $native::SetInformationJobObject($bootstrapJob,9,$limit,144)) { throw 'Bootstrap job limit refused' }
} finally { [System.Runtime.InteropServices.Marshal]::FreeHGlobal($limit) }
if (-not $native::AssignProcessToJobObject($bootstrapJob,[System.Diagnostics.Process]::GetCurrentProcess().Handle)) {
  throw 'Bootstrap self-assignment refused; no compiler or subject started'
}
# Keep the outerjob handle alive until helperprocess exit. Kill-on-close covers
# every compiler/subject descendant even if the outer Node deadline kills helper.
$source = @'
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class XeniosOwnedJob {
  // Interop fields are populated by native marshalling, not ordinary assignments.
#pragma warning disable 0649
  [StructLayout(LayoutKind.Sequential)] struct SA { public int size; public IntPtr descriptor; public bool inherit; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUP { public int size; public string reserved, desktop, title; public int x,y,xsize,ysize,xchars,ychars,fill,flags; public short show,reserved2; public IntPtr extra,input,output,error; }
  [StructLayout(LayoutKind.Sequential)] struct PI { public IntPtr process,thread; public uint pid,tid; }
  [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT { public long processTime,jobTime; public uint flags; public UIntPtr minimum,maximum; public uint active; public UIntPtr affinity; public uint priority,scheduling; }
  [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong readOps,writeOps,otherOps,readBytes,writeBytes,otherBytes; }
  [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMIT { public BASIC_LIMIT basic; public IO_COUNTERS io; public UIntPtr processMemory,jobMemory,peakProcessMemory,peakJobMemory; }
  [StructLayout(LayoutKind.Sequential)] struct ACCOUNT { public long user,kernel,periodUser,periodKernel; public uint faults,total,active,terminated; }
  [StructLayout(LayoutKind.Sequential)] struct PORT_ASSOC { public IntPtr key,port; }
  #pragma warning restore 0649
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int info,IntPtr value,uint length);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int info,out ACCOUNT value,uint length,IntPtr returned);
  [DllImport("kernel32.dll",EntryPoint="QueryInformationJobObject",SetLastError=true)] static extern bool QueryJobLimits(IntPtr job,int info,out EXTENDED_LIMIT value,uint length,IntPtr returned);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateJobObject(IntPtr job,uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref SA attributes,uint size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string application,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr environment,string cwd,ref STARTUP start,out PI info);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateIoCompletionPort(IntPtr handle,IntPtr existing,UIntPtr key,uint threads);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetQueuedCompletionStatus(IntPtr port,out uint message,out UIntPtr key,out IntPtr process,uint milliseconds);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr process,out long created,out long exited,out long kernel,out long user);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool belongs);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder name,ref uint count);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
  static void Need(bool value,string label) { if (!value) throw new Exception(label+":"+Marshal.GetLastWin32Error()); }
  static void Configure<T>(IntPtr job,int info,T value) { int size=Marshal.SizeOf(typeof(T)); IntPtr memory=Marshal.AllocHGlobal(size); try { Marshal.StructureToPtr(value,memory,false); Need(SetInformationJobObject(job,info,memory,(uint)size),"job-limit"); } finally { Marshal.FreeHGlobal(memory); } }
  static bool MemorySample(IntPtr job,ref ulong peak,ref int samples) { EXTENDED_LIMIT value;if(!QueryJobLimits(job,9,out value,(uint)Marshal.SizeOf(typeof(EXTENDED_LIMIT)),IntPtr.Zero))return false;peak=Math.Max(peak,value.peakJobMemory.ToUInt64());samples++;return true; }
  static string Json(string value) { return value==null?"null":"\""+value.Replace("\\","\\\\").Replace("\"","\\\"").Replace("\r","\\r").Replace("\n","\\n")+"\""; }
  static string Identity(IntPtr job,uint pid) { IntPtr h=OpenProcess(0x1000,false,pid); if(h==IntPtr.Zero)return "{\"pid\":"+pid+",\"creationTime\":null,\"executable\":null,\"identityLimit\":\"process exited or access unavailable\"}"; try { bool belongs;if(!IsProcessInJob(h,job,out belongs)||!belongs)return "{\"pid\":"+pid+",\"creationTime\":null,\"executable\":null,\"identityLimit\":\"unavailable or PID reused outside ownedjob\"}";long c,e,k,u; bool timed=GetProcessTimes(h,out c,out e,out k,out u); StringBuilder name=new StringBuilder(32768); uint length=32768; bool named=QueryFullProcessImageName(h,0,name,ref length); return "{\"pid\":"+pid+",\"creationTime\":"+(timed?Json(c.ToString()):"null")+",\"executable\":"+(named?Json(name.ToString()):"null")+"}"; } finally{CloseHandle(h);} }
  static int stopping; static string abort;
  static void Stop(IntPtr job,string reason) { if(Interlocked.CompareExchange(ref stopping,1,0)==0){abort=reason;TerminateJobObject(job,124);} }
  static Task<long> Pump(IntPtr handle,string output,int cap,IntPtr job) { return Task.Run(()=> { long count=0,kept=0; using(var source=new FileStream(new SafeFileHandle(handle,true),FileAccess.Read,4096,false)) using(var target=new FileStream(output,FileMode.CreateNew,FileAccess.Write,FileShare.Read)) { byte[] buffer=new byte[8192]; int n; while((n=source.Read(buffer,0,buffer.Length))>0){count+=n;int retain=(int)Math.Max(0,Math.Min((long)n,(long)cap-kept));if(retain>0){target.Write(buffer,0,retain);kept+=retain;}if(count>cap)Stop(job,"stream-cap");} target.Flush();}return count; }); }
  static long eventBytes,processStarts,memoryLimitMessages;
  static void Event(StreamWriter events,IntPtr job,string value,int cap) { int bytes=Encoding.UTF8.GetByteCount(value)+1;eventBytes+=bytes;if(eventBytes>cap){Stop(job,"process-event-cap");return;}events.WriteLine(value);events.Flush(); }
  static void DrainEvents(StreamWriter events,IntPtr job,IntPtr port,int cap) { uint message;UIntPtr key;IntPtr process;while(GetQueuedCompletionStatus(port,out message,out key,out process,0)){if(message==6)processStarts++;uint pid=unchecked((uint)process.ToInt64());Event(events,job,"{\"event\":\"job-message\",\"message\":"+message+",\"identity\":"+Identity(job,pid)+"}",cap);if(message==3)Stop(job,"active-process-cap");if(message==10){memoryLimitMessages++;Stop(job,"job-memory-limit");}} }
  public static string Run(string exe,string command,string cwd,string env,string outPath,string errPath,string eventsPath,int cap,int maxChildren,int timeout,ulong subjectMemoryLimit,IntPtr bootstrapJob) {
    stopping=0;abort=null;IntPtr job=IntPtr.Zero,port=IntPtr.Zero,block=IntPtr.Zero,outRead=IntPtr.Zero,outWrite=IntPtr.Zero,errRead=IntPtr.Zero,errWrite=IntPtr.Zero;PI child=new PI();Task<long> stdout=null,stderr=null;bool cleanup=false,assigned=false,streamsDrained=false,streamUncertainty=false;uint exit=259;int peak=0;string fault=null;
    DateTime started=DateTime.UtcNow,deadline=started.AddMilliseconds(timeout);eventBytes=0;processStarts=0;memoryLimitMessages=0;bool bootstrapClean=false,traceComplete=false;uint jobTotal=0,bootstrapTotal=0;
    ulong peakCommitted=0;int memorySamples=0;bool memoryQueryFailed=false,memoryFinal=false,memoryLimitVerified=false;
    try {
      ACCOUNT bootstrapBefore;Need(QueryInformationJobObject(bootstrapJob,1,out bootstrapBefore,(uint)Marshal.SizeOf(typeof(ACCOUNT)),IntPtr.Zero),"bootstrap-before");Need(bootstrapBefore.active==1,"compiler-descendants-remain");bootstrapTotal=bootstrapBefore.total;
      job=CreateJobObject(IntPtr.Zero,null);Need(job!=IntPtr.Zero,"create-job");
      EXTENDED_LIMIT limits=new EXTENDED_LIMIT();limits.basic.flags=0x2000|0x400|0x8;limits.basic.active=(uint)maxChildren;
      if(subjectMemoryLimit>0){limits.basic.flags|=0x200;limits.jobMemory=new UIntPtr(subjectMemoryLimit);}Configure(job,9,limits);
      EXTENDED_LIMIT configured;Need(QueryJobLimits(job,9,out configured,(uint)Marshal.SizeOf(typeof(EXTENDED_LIMIT)),IntPtr.Zero),"subject-memory-limit-readback");
      memoryLimitVerified=subjectMemoryLimit==0 ? (configured.basic.flags&0x200)==0 : (configured.basic.flags&0x200)!=0&&configured.jobMemory.ToUInt64()==subjectMemoryLimit;
      Need(memoryLimitVerified,"subject-memory-limit-differs");
      port=CreateIoCompletionPort(new IntPtr(-1),IntPtr.Zero,UIntPtr.Zero,1);Need(port!=IntPtr.Zero,"completion-port");Configure(job,7,new PORT_ASSOC{key=new IntPtr(1),port=port});
      SA attributes=new SA{size=Marshal.SizeOf(typeof(SA)),inherit=true};Need(CreatePipe(out outRead,out outWrite,ref attributes,0),"stdout-pipe");Need(CreatePipe(out errRead,out errWrite,ref attributes,0),"stderr-pipe");Need(SetHandleInformation(outRead,1,0),"stdout-read");Need(SetHandleInformation(errRead,1,0),"stderr-read");
      STARTUP startup=new STARTUP{size=Marshal.SizeOf(typeof(STARTUP)),flags=0x100,input=IntPtr.Zero,output=outWrite,error=errWrite};block=Marshal.StringToHGlobalUni(env);
      Need(CreateProcess(exe,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,true,0x4|0x400|0x08000000,block,cwd,ref startup,out child),"create-suspended");
      Need(AssignProcessToJobObject(job,child.process),"assign-suspended");
      assigned=true;
      using(var events=new StreamWriter(new FileStream(eventsPath,FileMode.CreateNew,FileAccess.Write,FileShare.Read),new UTF8Encoding(false))) {
        Event(events,job,"{\"event\":\"root-assigned-before-resume\",\"identity\":"+Identity(job,child.pid)+"}",cap);
        stdout=Pump(outRead,outPath,cap,job);outRead=IntPtr.Zero;stderr=Pump(errRead,errPath,cap,job);errRead=IntPtr.Zero;CloseHandle(outWrite);outWrite=IntPtr.Zero;CloseHandle(errWrite);errWrite=IntPtr.Zero;
        Need(ResumeThread(child.thread)!=0xffffffff,"resume");
        while(true) {
          ACCOUNT accounting;Need(QueryInformationJobObject(job,1,out accounting,(uint)Marshal.SizeOf(typeof(ACCOUNT)),IntPtr.Zero),"accounting");peak=Math.Max(peak,(int)accounting.active);
          if(!MemorySample(job,ref peakCommitted,ref memorySamples)){memoryQueryFailed=true;throw new Exception("subject-committed-memory-query");}
          DrainEvents(events,job,port,cap);
          if(accounting.active==0){jobTotal=accounting.total;for(int i=0;i<40;i++){DrainEvents(events,job,port,cap);if(processStarts==jobTotal){traceComplete=true;break;}Thread.Sleep(25);}cleanup=true;break;}
          if(DateTime.UtcNow>=deadline)Stop(job,"deadline");
          if(stopping!=0 && DateTime.UtcNow>=deadline.AddSeconds(10))break;
          Thread.Sleep(25);
        }
      }
      Need(GetExitCodeProcess(child.process,out exit),"root-exit");
      if(!Task.WaitAll(new Task[]{stdout,stderr},10000)){Stop(job,"stream-drain-timeout");streamUncertainty=true;cleanup=false;}else{streamsDrained=true;}
      ACCOUNT bootstrapAfter;Need(QueryInformationJobObject(bootstrapJob,1,out bootstrapAfter,(uint)Marshal.SizeOf(typeof(ACCOUNT)),IntPtr.Zero),"bootstrap-after");bootstrapClean=bootstrapAfter.active==1;
    } catch(Exception error){fault=error.Message;streamUncertainty=true;if(job!=IntPtr.Zero)Stop(job,"native-supervisor-fault");}
    finally {
      // Job Object ownership, not a PID search, scopes termination to descendants.
      if(child.process!=IntPtr.Zero && !assigned){TerminateProcess(child.process,124);cleanup=WaitForSingleObject(child.process,10000)==0;}
      if(job!=IntPtr.Zero && assigned && !cleanup){TerminateJobObject(job,124);for(int i=0;i<100;i++){ACCOUNT a;if(QueryInformationJobObject(job,1,out a,(uint)Marshal.SizeOf(typeof(ACCOUNT)),IntPtr.Zero)&&a.active==0){cleanup=true;break;}Thread.Sleep(100);}}
      if(job!=IntPtr.Zero){memoryFinal=MemorySample(job,ref peakCommitted,ref memorySamples);if(!memoryFinal)memoryQueryFailed=true;}
      if(block!=IntPtr.Zero)Marshal.FreeHGlobal(block);foreach(IntPtr handle in new IntPtr[]{child.thread,child.process,outRead,outWrite,errRead,errWrite,port,job})if(handle!=IntPtr.Zero)CloseHandle(handle);
    }
    string memoryReceipt="{\"measure\":\"SUBJECT_JOB_PEAK_COMMITTED_BYTES\",\"scope\":\"SUBJECT_AND_DESCENDANTS_ONLY_EXCLUDES_SUPERVISOR_HELPER_COMPILER\",\"limitBytes\":"+(subjectMemoryLimit==0?"null":subjectMemoryLimit.ToString())+",\"limitReadbackVerified\":"+(memoryLimitVerified?"true":"false")+",\"peakCommittedBytes\":"+(memorySamples>0?peakCommitted.ToString():"null")+",\"queryCount\":"+memorySamples+",\"finalQuerySucceeded\":"+(memoryFinal?"true":"false")+",\"queryFailureObserved\":"+(memoryQueryFailed?"true":"false")+",\"limitMessagesObserved\":"+memoryLimitMessages+",\"limitMessageCaveat\":\"Ordinary completion-port delivery is not guaranteed; zero observed messages does not prove no allocation refusal\",\"measurementProven\":"+(memorySamples>0&&memoryFinal&&!memoryQueryFailed&&memoryLimitVerified?"true":"false")+"}";
    return "{\"subjectMemory\":"+memoryReceipt+",\"startedAt\":"+Json(started.ToString("o"))+",\"finishedAt\":"+Json(DateTime.UtcNow.ToString("o"))+",\"deadline\":"+Json(deadline.ToString("o"))+",\"rootPid\":"+child.pid+",\"rootExitCode\":"+(exit==259?"null":exit.ToString())+",\"signal\":null,\"abortReason\":"+Json(abort)+",\"fault\":"+Json(fault)+",\"peakJobChildren\":"+peak+",\"processEventBytes\":"+eventBytes+",\"jobTotalProcesses\":"+jobTotal+",\"observedProcessStartEvents\":"+processStarts+",\"processTraceComplete\":"+(traceComplete?"true":"false")+",\"bootstrapTotalBeforeSubject\":"+bootstrapTotal+",\"stdoutObservedBytes\":"+(stdout!=null&&stdout.Status==TaskStatus.RanToCompletion?stdout.Result.ToString():"null")+",\"stderrObservedBytes\":"+(stderr!=null&&stderr.Status==TaskStatus.RanToCompletion?stderr.Result.ToString():"null")+",\"bootstrapDescendantsAbsent\":"+(bootstrapClean?"true":"false")+",\"cleanupProven\":"+(cleanup&&bootstrapClean&&streamsDrained&&!streamUncertainty?"true":"false")+"}";
  }
}
'@
Add-Type -TypeDefinition $source -Language CSharp
$envBlock = (($spec.environment.PSObject.Properties | Sort-Object Name | ForEach-Object { $_.Name + '=' + [string]$_.Value }) -join [char]0) + [char]0 + [char]0
[XeniosOwnedJob]::Run([string]$spec.executable,[string]$spec.commandLine,[string]$spec.cwd,$envBlock,[string]$spec.stdoutPath,[string]$spec.stderrPath,[string]$spec.eventsPath,[int]$spec.streamLimit,[int]$spec.maxJobChildren,[int]$spec.timeoutMs,[ulong]$spec.subjectJobCommittedMemoryLimitBytes,$bootstrapJob)
`;

function quoteWindows(value) {
  check(!value.includes('\0') && !/[\r\n]/.test(value), 'invalid Windows argument');
  return '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"';
}
function generatedInputs(manifest) {
  const pins = manifest.preparation.generatedFiles.map(row => ({ path: row.path, sha256: row.sha256 }));
  for (const snapshot of manifest.httpRegression.snapshots) {
    for (const pin of snapshot.files) pins.push({ path: path.posix.join(snapshot.scratchPathProposed, pin.relativePath), sha256: pin.sha256lf });
    pins.push({ path: snapshot.configProposed.path, sha256: snapshot.configProposed.sha256lf });
  }
  return pins;
}
function treeInventory(root, deadline, dereference = false) {
  const entries = [], ancestors = new Set(); const realRoot = fs.realpathSync.native(root);
  function visit(folder, relative) {
    check(Date.now() < deadline, 'full input inventory deadline exhausted');
    const real = fs.realpathSync.native(folder);
    check(real === realRoot || within(realRoot, real), 'dependency symlink leaves disclosed source');
    const stat = fs.lstatSync(folder);
    check(dereference || !stat.isSymbolicLink(), 'snapshot input symlink refused');
    const followed = fs.statSync(folder);
    if (followed.isDirectory()) {
      check(!ancestors.has(real), 'inventory directory cycle'); ancestors.add(real);
      for (const item of fs.readdirSync(folder)) visit(path.join(folder, item), relative ? relative + '/' + item : item);
      ancestors.delete(real);
    } else {
      check(followed.isFile(), 'unsupported inventory object');
      const bytes = fs.readFileSync(folder);
      entries.push({ path: relative, bytes: bytes.length, sha256: hash(bytes) });
    }
  }
  visit(root, '');
  entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  return { fileCount: entries.length, totalBytes: entries.reduce((n, row) => n + row.bytes, 0),
    sha256: hash(Buffer.from(JSON.stringify(entries))), entries };
}
function trustedTrackedInventory(manifest, deadline) {
  const repository = manifest.snapshot.sourceRepository;
  check(git(repository, ['rev-parse', `${manifest.source.commit}^{tree}`], deadline).toString('utf8').trim() === manifest.source.tree,
    'trusted source tree differs');
  return git(repository, ['ls-tree', '-r', '-z', manifest.source.commit], deadline).toString('utf8').split('\0').filter(Boolean).map(entry => {
    const matched = entry.match(/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/s);
    check(matched, 'unsupported tracked object mode (symlink/submodule); explicit preparation needed');
    return { mode: matched[1], blob: matched[2], path: matched[3] };
  });
}
function sourceState(cwd, manifest, deadline, acceptedArtifacts = null, frozen = null, dependencyMode = 'full') {
  // The child can write its snapshot, including .git. No post-child Git command
  // reads that metadata or invokes repository filters outside the subject Job.
  const head = manifest.source.commit, tree = manifest.source.tree;
  const inventory = frozen ?? trustedTrackedInventory(manifest, deadline);
  check(Array.isArray(inventory) && inventory.length > 0, 'preparation-frozen tracked inventory absent');
  const files = inventory.map(entry => {
    check(Date.now() < deadline, 'source inventory exceeded the group/window deadline');
    const { mode, blob, path: relative } = entry;
    check(['100644', '100755'].includes(mode) && SHA.test(blob) && typeof relative === 'string',
      'invalid frozen tracked input');
    const file = path.join(cwd, relative); ensureOwned(cwd, file);
    check(fs.existsSync(file) && !fs.lstatSync(file).isSymbolicLink() && fs.lstatSync(file).isFile(),
      'tracked source missing or not a regular file');
    check(fs.realpathSync.native(file).toLowerCase() === path.resolve(file).toLowerCase(),
      'tracked input resolves through a junction or symlink');
    const actual = fs.readFileSync(file);
    const actualBlob = crypto.createHash('sha1').update(Buffer.from(`blob ${actual.length}\0`)).update(actual).digest('hex');
    check(actualBlob === blob, `tracked byte drift: ${relative}`);
    return { path: relative, mode, blob, bytes: actual.length, sha256: hash(actual) };
  });
  const generated = generatedInputs(manifest), allowed = new Map(files.map(row => [row.path, row.sha256]));
  for (const pin of generated) {
    const file = path.join(cwd, pin.path); ensureOwned(cwd, file);
    check(fs.existsSync(file) && !fs.lstatSync(file).isSymbolicLink() && hash(fs.readFileSync(file)) === pin.sha256,
      'generated/historical fixture changed: ' + pin.path);
    check(!allowed.has(pin.path), 'generated fixture shadows tracked input'); allowed.set(pin.path, pin.sha256);
  }
  for (const artifact of acceptedArtifacts ?? []) {
    check(artifact.path.startsWith('dist/') && !allowed.has(artifact.path), 'unapproved artifact path');
    allowed.set(artifact.path, artifact.sha256);
  }
  function visit(folder) {
    for (const name of fs.readdirSync(folder)) {
      check(Date.now() < deadline, 'unexpected-file inventory deadline exhausted');
      const file = path.join(folder, name), relative = path.relative(cwd, file).replaceAll('\\', '/');
      if (relative === '.git' || relative === 'node_modules') continue; // Git metadata; complete dependencies are separately pinned.
      const stat = fs.lstatSync(file); check(!stat.isSymbolicLink(), 'untracked/ignored symlink refused');
      if (stat.isDirectory()) visit(file);
      else check(stat.isFile() && allowed.has(relative) && hash(fs.readFileSync(file)) === allowed.get(relative),
        'unexpected tracked/untracked/ignored content: ' + relative);
    }
  }
  visit(cwd);
  const dependencies = checkDependencyPins(cwd, manifest, deadline, dependencyMode);
  return { head, tree, identityBasis: 'TRUSTED_SOURCE_OR_RAW_BOUND_PREPARATION_INVENTORY_NOT_SNAPSHOT_GIT',
    consumedSourceInventory: files, generatedInputs: generated, dependencies, artifacts: acceptedArtifacts,
    unexpectedTrackedUntrackedIgnoredFiles: 0 };
}

async function copyPrivateDependencies(sourceRoot, destinationRoot, deadline) {
  const ancestors = new Set();
  async function copy(source, destination) {
    check(Date.now() < deadline, 'private dependency copy deadline reached; partial owned snapshot retained');
    ensureOwned(path.dirname(destinationRoot), destination);
    const real = await fs.promises.realpath(source);
    check(real === sourceRoot || within(sourceRoot, real), 'dependency symlink escapes disclosed dependency source');
    const stat = await fs.promises.stat(real);
    if (stat.isDirectory()) {
      check(!ancestors.has(real), 'dependency symlink directory cycle');
      ancestors.add(real);
      await fs.promises.mkdir(destination, { recursive: false });
      for (const item of await fs.promises.readdir(real)) await copy(path.join(real, item), path.join(destination, item));
      ancestors.delete(real);
    } else {
      check(stat.isFile(), 'unsupported dependency object');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
      try {
        await pipeline(fs.createReadStream(real), fs.createWriteStream(destination, { flags: 'wx' }), { signal: controller.signal });
      } finally { clearTimeout(timer); }
      check(Date.now() < deadline, 'private dependency copy expired; partial owned snapshot retained');
    }
  }
  await copy(sourceRoot, destinationRoot);
}

/** Future preparation action, separately included in the exact approved window. */
export async function materializeOwnedSnapshot(options) {
  check(options['--prepare'] === true, 'explicit --prepare mode required');
  const run = loadAuthority(options), { manifest, window, reservation, admission, authority } = run;
  assertStageEligibility(manifest, 'PREPARE');
  for (const id of window.groups) assertStageEligibility(manifest, id);
  const digest = manifest._digest;
  const requiredFloor = Math.max(...window.groups.map(id => manifest.groups.find(row => row.id === id)?.ramFloorMiB ?? Infinity));
  assertAdmission(admission, manifest, { id: 'PREPARE', ramFloorMiB: requiredFloor }, Date.now(), null, run);
  const deadline = Math.min(run.aggregateDeadline, run.authorityStartedAt + manifest.preparation.wallMs);
  const root = path.resolve(manifest.snapshot.parent, window.runId);
  ensureOwned(manifest.snapshot.parent, root);
  check(!fs.existsSync(root), 'unique preparation root already exists; never retry or remove another snapshot');
  fs.mkdirSync(manifest.snapshot.parent, { recursive: true });
  fs.mkdirSync(root, { recursive: false });
  run.runRoot = root; acquireRunLock(run);
  writeNew(path.join(root, 'ownership.json'), { runId: window.runId, manifestSha256: digest, authority,
    createdBySession: manifest.owner.sessionId, snapshotSource: manifest.source.commit,
    sourceRepository: manifest.snapshot.sourceRepository, createdAt: new Date().toISOString(), preparationComplete: false });
  const snapshot = path.join(root, 'snapshot'); ensureOwned(root, snapshot);
  try {
  const receiptRoot = path.join(root, 'receipts'); ensureOwned(root, receiptRoot);
  fs.mkdirSync(receiptRoot, { recursive: false }); // Preparation alone initializes this evidence root.
  git(root, ['clone', '--local', '--shared', '--no-checkout', '--quiet', manifest.snapshot.sourceRepository, snapshot], deadline);
  git(snapshot, ['-c', 'core.autocrlf=false', '-c', 'filter.lfs.required=false', '-c', 'filter.lfs.smudge=',
    '-c', 'filter.lfs.process=', 'checkout', '--detach', '--quiet', manifest.source.commit], deadline);
  const dependencySource = fs.realpathSync.native(manifest.toolchain.dependencySource);
  check(dependencySource.toLowerCase() === path.resolve(manifest.toolchain.dependencySource).toLowerCase(), 'dependency source must be its disclosed real path');
  for (const pin of manifest.toolchain.dependencyPins) {
    check(hash(fs.readFileSync(path.join(dependencySource, pin.path.replace(/^node_modules\//, '')))) === pin.sha256,
      `pre-copy installed dependency differs: ${pin.path}`);
  }
  const dependencyInventory = treeInventory(dependencySource, deadline, true);
  check(dependencyInventory.sha256 === manifest.toolchain.dependencyTree?.sha256
    && dependencyInventory.fileCount === manifest.toolchain.dependencyTree.fileCount
    && dependencyInventory.totalBytes === manifest.toolchain.dependencyTree.totalBytes, 'complete pre-copy dependency tree differs');
  await copyPrivateDependencies(dependencySource, path.join(snapshot, 'node_modules'), deadline);
  checkDependencyPins(snapshot, manifest, deadline);
  for (const fixture of manifest.preparation.generatedFiles) {
    check(Date.now() < deadline, 'generated fixture preparation deadline reached');
    const file = path.join(snapshot, fixture.path); ensureOwned(snapshot, file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const contents = Buffer.from(fixture.bytesUtf8);
    check(hash(contents) === fixture.sha256, 'generated fixture hash differs');
    fs.writeFileSync(file, contents, { flag: 'wx' });
  }
  for (const historical of manifest.httpRegression.snapshots) {
    const folder = path.join(snapshot, historical.scratchPathProposed); ensureOwned(snapshot, folder);
    check(!fs.existsSync(folder), 'frozen HTTP scratch name already present in unique snapshot');
    fs.mkdirSync(folder, { recursive: true });
    for (const pin of historical.files) {
      const committed = git(manifest.snapshot.sourceRepository, ['cat-file', 'blob', `${pin.sourceCommit}:${pin.sourcePath}`], deadline);
      check(hash(lf(committed)) === pin.sha256lf, 'historical HTTP source pin differs');
      const file = path.join(folder, pin.relativePath); ensureOwned(folder, file);
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, lf(committed), { flag: 'wx' });
    }
    const config = path.join(snapshot, historical.configProposed.path); ensureOwned(folder, config);
    const contents = Buffer.from(historical.configProposed.bytesUtf8);
    check(hash(contents) === historical.configProposed.sha256lf, 'frozen HTTP config hash differs');
    fs.writeFileSync(config, contents, { flag: 'wx' });
  }
  check(Date.now() < deadline, 'preparation exceeded the approved window or preparation ceiling');
  writeNew(path.join(root, 'preparation-complete.json'), { runId: window.runId, manifestSha256: digest,
    authority, reservation, admission, snapshotSource: manifest.source.commit, cwd: snapshot, nodeModulesMode: 'OWNED_PRIVATE_COPY_NO_JUNCTION_NO_INSTALL',
    receiptsDirectory: 'receipts', initialEvidenceState: 'OWNED_EMPTY_DIRECTORY_INITIALIZED_BY_PREPARATION',
    dependencyPinsChecked: true, historicalHttpPinsChecked: true, generatedFixturePinsChecked: true,
    completedAt: new Date().toISOString(), sourceState: sourceState(snapshot, manifest, deadline),
    executionAcceptance: 'NONE; G0 still required', cleanup: 'Preserve this exact owned root and evidence; no automatic recursive removal.' });
  releaseRunLock(run, 'PREPARATION_COMPLETE_NO_SUBJECT_CHILD');
  return snapshot;
  } catch (error) {
    try { writeNew(path.join(root, 'preparation-aborted.json'), { runId: window.runId, manifestSha256: digest,
      authority, failedAt: new Date().toISOString(), reason: error.message, partialOwnedRootPreserved: root,
      noAutomaticRetryOrRemoval: true, sourceExecutionStarted: false }); } catch { /* Preserve the root even if disk-full prevents the receipt. */ }
    throw error;
  }
}
const dependencyMetadataBaselines = new Map();
function dependencyMetadata(root, deadline) {
  const rows = [];
  function visit(folder) {
    for (const name of fs.readdirSync(folder)) {
      check(Date.now() < deadline, 'dependency metadata boundary deadline exhausted');
      const file = path.join(folder, name), stat = fs.lstatSync(file);
      check(!stat.isSymbolicLink(), 'dependency metadata symlink refused');
      const relative = path.relative(root, file).replaceAll('\\', '/');
      if (stat.isDirectory()) { rows.push({ path: relative, directory: true }); visit(file); }
      else {
        check(stat.isFile(), 'unsupported dependency metadata object');
        rows.push({ path: relative, bytes: stat.size, modified: stat.mtimeMs, changed: stat.ctimeMs });
      }
    }
  }
  visit(root); rows.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  return hash(Buffer.from(JSON.stringify(rows)));
}
function checkDependencyPins(cwd, manifest, deadline, mode = 'full') {
  for (const pin of manifest.toolchain.dependencyPins) {
    check(Date.now() < deadline, 'critical dependency pin deadline exhausted');
    const file = path.join(cwd, pin.path);
    check(fs.existsSync(file) && hash(fs.readFileSync(file)) === pin.sha256, `installed dependency pin differs: ${pin.path}`);
  }
  const dependencies = path.join(cwd, 'node_modules');
  check(fs.realpathSync.native(dependencies).toLowerCase() === path.resolve(dependencies).toLowerCase(),
    'snapshot node_modules is a junction or symlink');
  check(Number.isFinite(deadline), 'dependency inventory needs bounded deadline');
  check(mode === 'full' || mode === 'pinned', 'unknown dependency boundary mode');
  if (mode === 'pinned') {
    const metadata = dependencyMetadata(dependencies, deadline);
    check(dependencyMetadataBaselines.has(cwd) && dependencyMetadataBaselines.get(cwd) === metadata,
      'dependency metadata drift since group byte inventory');
    return { mode: 'CRITICAL_BYTE_PINS_AND_COMPLETE_METADATA', metadataSha256: metadata,
      limitation: 'Complete byte inventory at group start/end; boundary metadata is not continuous content attestation.' };
  }
  const actual = treeInventory(dependencies, deadline);
  const expected = manifest.toolchain.dependencyTree;
  check(expected && actual.sha256 === expected.sha256 && actual.fileCount === expected.fileCount
    && actual.totalBytes === expected.totalBytes, 'complete dependency tree differs');
  const metadataSha256 = dependencyMetadata(dependencies, deadline);
  dependencyMetadataBaselines.set(cwd, metadataSha256);
  return { mode: 'COMPLETE_BYTE_INVENTORY', sha256: actual.sha256, fileCount: actual.fileCount,
    totalBytes: actual.totalBytes, metadataSha256, entries: actual.entries };
}
function assertAdmission(admission, manifest, group, startedAt, commandId = null, run = null, request = null) {
  check(admission.manifestSha256 === manifest._digest && admission.group === group.id, 'admission binding differs');
  check(admission.reservationId && admission.exclusive === true && admission.leaseId === manifest.owner.leaseId,
    'exclusive existing lease/reservation not established');
  if (run) check(admission.runId === run.window.runId && admission.reservationId === run.reservation.id
    && admission.windowSha256 === run.authority.windowSha256, 'admission run/window/reservation differs');
  if (request) check(admission.requestNonce === request.nonce && admission.requestSha256 === request.sha256
    && admission.commandId === commandId, 'per-command admission request differs');
  const observation = admission;
  check(observation && observation.observedAt && Date.parse(observation.observedAt) >= startedAt - 30_000
    && Date.parse(observation.observedAt) <= Date.now(), 'fresh one-shot admission observation missing');
  if (request) check(Date.parse(observation.observedAt) >= Date.parse(request.requestedAt)
    && Date.now() - Date.parse(observation.observedAt) <= 30_000, 'observation predates command request or is stale');
  check(Number.isFinite(observation.availableMiB) && Number.isFinite(observation.freeDiskGiB)
    && typeof observation.observationAuthorityReference === 'string' && observation.observationAuthorityReference.length > 0,
    'typed admission measures and separate observation authority reference required');
  check(observation.availableMiB >= group.ramFloorMiB && observation.freeDiskGiB >= 20,
    'RAM or disk admission floor not met');
  check(observation.noCompetingHeavyJob === true && observation.heavyJobPredicate === manifest.admission.heavyJobPredicateId,
    'competing-heavy-job census absent or incompatible');
  check(observation.inputsUnchanged === true && observation.permissionsEstablished === true,
    'input or permissions admission missing');
  if (commandId && group.id === 'G7') check(observation.ownedDistNoOpenHandles === true,
    'G7 owned dist open-handle absence not established');
}
function nonconsumingAdmission(reason, pauseAllowed = true) {
  const error = new Error('REFUSED: ' + reason);
  error.code = 'NONCONSUMING_ADMISSION_REFUSAL';
  error.pauseAllowed = pauseAllowed;
  return error;
}
function requireCommandTime(run, command) {
  check(Number.isSafeInteger(command.wallMs) && command.wallMs > 0, 'invalid declared command ceiling');
  const reserve = run.group.timeBudget.finalizationMs;
  if (!run.actualStartedAt && Date.now() >= run.authorityDeadline) {
    const error = nonconsumingAdmission('finite prelaunch metadata ceiling exhausted; outer window is unchanged', false);
    error.code = 'PRELAUNCH_METADATA_CEILING_EXHAUSTED'; throw error;
  }
  if (run.deadline - Date.now() < command.wallMs + reserve) {
    throw nonconsumingAdmission('command ceiling and reserved finalization no longer fit original group/aggregate/window', false);
  }
}
function remainingGroupBudget(run, at = Date.now(), futureInvocation = false) {
  const budget = run.group.timeBudget;
  const commandsMs = run.group.commands.slice(run.nextCommandIndex).reduce((sum, command) => sum + command.wallMs, 0);
  const setupRemainingMs = futureInvocation ? budget.setupMs : Math.max(0, budget.setupMs - (at - run.authorityStartedAt));
  const admissionRemainingMs = Math.max(0, budget.admissionAndPauseMs - run.handshakeWaitSpentMs);
  return { commandsMs, setupRemainingMs, admissionRemainingMs, finalizationMs: budget.finalizationMs,
    totalMs: commandsMs + setupRemainingMs + admissionRemainingMs + budget.finalizationMs };
}
function requireGroupTime(run) {
  const at = Date.now(), required = remainingGroupBudget(run, at);
  if (!remainingHandshakeCapacity(run)) {
    const error = nonconsumingAdmission('declared cumulative handshake allowance exhausted', false);
    error.code = 'HANDSHAKE_BUDGET_EXHAUSTED'; error.terminalProgress = true; throw error;
  }
  if (run.deadline - at < required.totalMs) {
    const error = nonconsumingAdmission('unfinished ceilings plus remaining setup/admission/finalization cannot fit original deadline', false);
    error.code = 'AGGREGATE_OR_STARTED_GROUP_TIME_EXHAUSTED'; error.terminalProgress = true;
    throw error;
  }
  return required;
}
function groupWorkDeadline(run) {
  return run.actualStartedAt ? run.deadline : Math.min(run.authorityDeadline, run.aggregateDeadline);
}
function remainingHandshakeCapacity(run) {
  const children = run.group.commands.slice(run.nextCommandIndex).filter(row => !NONCHILD_GROUP_COMMANDS.has(row.result.kind)).length;
  return children === 0 || run.group.timeBudget.handshakeWaitBudgetMs - run.handshakeWaitSpentMs >= children;
}
function recheckChildAdmission(run, command) {
  try { assertAdmission(run.commandAdmission.response, run.manifest, run.group, Date.now(), command.id, run); }
  catch (error) { error.code = 'NONCONSUMING_ADMISSION_REFUSAL'; error.pauseAllowed = true; throw error; }
}
async function requestCommandAdmission(run, command, deadline) {
  const handshakeStarted = Date.now();
  const waitRemaining = run.group.timeBudget.handshakeWaitBudgetMs - run.handshakeWaitSpentMs;
  const childrenRemaining = run.group.commands.slice(run.nextCommandIndex)
    .filter(row => !NONCHILD_GROUP_COMMANDS.has(row.result.kind)).length;
  const allocatedWait = Math.min(run.manifest.admission.handshake.maximumWaitMs,
    Math.floor(waitRemaining / Math.max(1, childrenRemaining)));
  if (allocatedWait <= 0) throw nonconsumingAdmission('declared cumulative command-handshake wait allowance exhausted', false);
  try {
  const folder = path.join(run.evidence, 'admission-requests'); fs.mkdirSync(folder, { recursive: true });
  const nonce = crypto.randomBytes(16).toString('hex'), requestedAt = new Date().toISOString();
  const waitUntil = Math.min(deadline, handshakeStarted + allocatedWait);
  if (waitUntil <= Date.now()) throw nonconsumingAdmission('no bounded command-admission wait remains', false);
  const basename = `${run.group.id}-${command.id}-${nonce}`;
  const requestFile = path.join(folder, basename + '.request.json');
  const responseFile = path.join(folder, basename + '.response.json');
  const value = { runId: run.window.runId, group: run.group.id, commandId: command.id, nonce, requestedAt,
    expiresAt: new Date(waitUntil).toISOString(), manifestSha256: run.manifest._digest,
    authority: run.authority, reservationId: run.reservation.id, ramFloorMiB: run.group.ramFloorMiB,
    freeDiskFloorGiB: 20, responseFile, action: 'ONE_SEPARATELY_AUTHORIZED_OBSERVATION; NO_AUTOMATIC_PROBE_OR_RETRY' };
  writeNew(requestFile, value);
  const request = { ...value, sha256: hash(fs.readFileSync(requestFile)) };
  process.stdout.write(JSON.stringify({ event: 'COMMAND_ADMISSION_REQUEST', requestFile, responseFile,
    commandId: command.id, expiresAt: value.expiresAt }) + '\n');
  // Filesystem notification only: the coordinator decides whether an observation
  // is authorized. There is no resource sampler or timed file-polling loop here.
  const response = await new Promise((resolve, reject) => {
    let done = false, watcher, timer;
    const finish = (error, result) => {
      if (done) return; done = true; clearTimeout(timer); watcher?.close();
      if (error) { error.code = 'NONCONSUMING_ADMISSION_REFUSAL'; reject(error); }
      else resolve(result);
    };
    const receive = () => {
      if (!fs.existsSync(responseFile)) return;
      let record;
      try { record = boundRecord(responseFile); }
      catch (error) {
        // A writer must publish atomically, but an incomplete/unreadable event
        // is not an admission verdict. Await another notification or expiry.
        if (error instanceof SyntaxError || ['ENOENT', 'EBUSY', 'EACCES', 'EPERM'].includes(error.code)) return;
        finish(error); return;
      }
      try {
        check(Date.now() < waitUntil, 'command-admission response arrived after bounded wait');
        check(Date.parse(record.value.observedAt) <= waitUntil, 'command observation exceeds handshake expiry');
        assertAdmission(record.value, run.manifest, run.group, Date.now(), command.id, run, request);
        check(Date.now() < waitUntil, 'command-admission verification exceeded bounded wait');
        finish(null, record);
      } catch (error) { finish(error); }
    };
    try {
      watcher = fs.watch(folder, { persistent: true }, (_event, name) => {
        if (String(name) === path.basename(responseFile)) receive();
      });
      watcher.on('error', error => finish(error));
      timer = setTimeout(() => finish(new Error('REFUSED: bounded command-admission handshake expired')), waitUntil - Date.now());
      receive();
    } catch (error) { finish(error); }
  });
  run.commandAdmission = { requestSha256: request.sha256, responseSha256: response.sha256, response: response.value };
  return run.commandAdmission;
  } finally { run.handshakeWaitSpentMs += Math.max(0, Date.now() - handshakeStarted); }
}

function assertStageEligibility(manifest, mode) {
  const holds = (manifest.executionPrerequisites ?? []).filter(row => row.status !== 'SATISFIED_IN_REVIEWED_SOURCE'
    && !(row.id === 'DOC55-CR03-BOUND-CONTINUATION_PROTOCOL' && row.status === 'IMPLEMENTED_SOURCE_ACCEPTANCE_REQUIRED')
    && row.appliesTo.includes(mode));
  const group = manifest.groups.find(row => row.id === mode);
  const localHolds = group?.correctionHolds ?? [];
  const commandHolds = (group?.commands ?? []).flatMap(command => [
    ...(command.hold ? [command.id + ': ' + command.hold] : []),
    ...(command.correctionHolds ?? []).map(hold => command.id + ': ' + JSON.stringify(hold)),
    ...(command.result?.expectedFailures ?? []).filter(row => row.cause?.calibrationRequired === true)
      .map(() => command.id + ': actual runner cause calibration remains held'),
  ]);
  check(holds.length === 0 && localHolds.length === 0 && commandHolds.length === 0,
    'stage HELD: ' + [...holds.map(row => row.id + ': ' + row.reason),
      ...localHolds.map(row => typeof row === 'string' ? row : JSON.stringify(row)), ...commandHolds].join('; '));
  if (group) assertContinuationSourceGate(group);
  if (mode === 'G0') {
    const counts = { 'parser-self-test': 3, 'exit-zero': 3, 'exit-one': 3, 'deadline-kill': 3,
      'stdout-cap': 3, 'stderr-cap': 3, 'refusal-path': 3, 'real-child-tree': 4, 'vitest-baseline': 8 };
    check(group.commands.length === Object.keys(counts).length && group.commands.every(command =>
      Object.hasOwn(counts, command.id) && command.maxOwnedProcesses === counts[command.id]),
      'G0 exact approved stage mapping differs; count the complete owned tree including console hosts');
    check(group.wallMs === 60_000, 'G0 started-helper wall must remain 60,000 ms');
    // Compiler topology remains separately HELD. No compiler allowance is selected
    // by the 3/4/8 subject-stage mapping; native proof must establish the whole tree.
  }
  // A window boolean cannot lift a source hold. Revised exact source and review
  // are required if the original memory/process/bootstrap contract changes.
}
function acquireRunLock(run) {
  const file = path.join(run.runRoot, 'run-exclusive.lock.json');
  check(!fs.existsSync(file), 'exclusive run lock exists; stale or ambiguous owner must remain held');
  const value = { runId: run.window.runId, mode: run.mode, nonce: crypto.randomBytes(16).toString('hex'),
    manifestSha256: run.manifest._digest, authority: run.authority, at: new Date().toISOString(),
    owner: run.manifest.owner, state: 'EXCLUSIVE_ACTIVE_NO_AUTOMATIC_STALE_RECOVERY' };
  const published = writeInitialRecord(file, value);
  run.lock = { file, value, digest: published.sha256 };
  run.initialPublicationRecoveries = published.recoveredUnpublished;
}
function releaseRunLock(run, disposition) {
  check(run.lock && hash(fs.readFileSync(run.lock.file)) === run.lock.digest, 'run lock identity changed; hold');
  try {
    writeInitialRecord(path.join(run.runRoot, 'run-release-' + run.lock.value.nonce + '.json'), {
      lockSha256: run.lock.digest, authority: run.authority, at: new Date().toISOString(), disposition });
  } catch (error) {
    if (!error.initialPublicationAbsent || error.evidenceUncertain) throw error;
    // Only this process, holding this exact lock and known cleanup, can preserve
    // it under the released name when release-receipt storage is unavailable.
    check(hash(fs.readFileSync(run.lock.file)) === run.lock.digest, 'own lock changed during release publication');
    process.stderr.write('Release receipt unpublished; preserving exact own lock under released name: ' + error.message + '\n');
  }
  // Preserve the exact lock as evidence. No stale-lock removal or deletion.
  const destination = path.join(run.runRoot, 'released-lock-' + run.lock.value.nonce + '.json');
  check(pathAbsent(destination), 'released-lock destination exists; preserve lock');
  fs.renameSync(run.lock.file, destination);
  run.lock = null;
}
function loadRun(options) {
  const run = loadAuthority(options), { manifest, window } = run;
  const group = manifest.groups.find(row => row.id === run.mode);
  check(group && group.status === 'AUTHORED_PENDING_APPROVAL_AND_ACCEPTANCE', 'group absent, held or deferred');
  assertStageEligibility(manifest, group.id);
  const runRoot = path.resolve(manifest.snapshot.parent, window.runId);
  check(within(manifest.snapshot.parent, runRoot), 'invalid run root');
  check(fs.existsSync(runRoot), 'future run-owned snapshot must first be materialised by explicit preparation');
  const ownershipRecord = boundRecord(path.join(runRoot, 'ownership.json'));
  const ownership = ownershipRecord.value;
  check(ownership.runId === window.runId && ownership.manifestSha256 === manifest._digest
    && ownership.createdBySession === manifest.owner.sessionId && ownership.snapshotSource === manifest.source.commit
    && ownership.authority.windowSha256 === run.authority.windowSha256
    && ownership.authority.decisionTextSha256 === run.authority.decisionTextSha256
    && eq(stableAuthority(ownership.authority), stableAuthority(run.authority)), 'run ownership or approval/opening facts changed');
  const preparation = boundRecord(path.join(runRoot, 'preparation-complete.json'));
  check(preparation.value.manifestSha256 === manifest._digest
    && preparation.value.authority.windowSha256 === run.authority.windowSha256
    && eq(stableAuthority(preparation.value.authority), stableAuthority(run.authority))
    && preparation.value.sourceState.head === manifest.source.commit && preparation.value.sourceState.tree === manifest.source.tree,
    'preparation receipt binding differs');
  const trustedInventory = trustedTrackedInventory(manifest, run.authorityDeadline);
  check(Array.isArray(preparation.value.sourceState.consumedSourceInventory)
    && eq(preparation.value.sourceState.consumedSourceInventory.map(({ mode, blob, path }) => ({ mode, blob, path })), trustedInventory),
    'preparation inventory differs from immutable trusted source objects');
  const cwd = path.join(runRoot, 'snapshot'), evidence = path.join(runRoot, 'receipts');
  ensureOwned(runRoot, cwd); ensureOwned(runRoot, evidence);
  check(preparation.value.receiptsDirectory === 'receipts'
    && preparation.value.initialEvidenceState === 'OWNED_EMPTY_DIRECTORY_INITIALIZED_BY_PREPARATION'
    && fs.existsSync(evidence) && fs.lstatSync(evidence).isDirectory() && !fs.lstatSync(evidence).isSymbolicLink()
    && fs.realpathSync.native(evidence).toLowerCase() === path.resolve(evidence).toLowerCase(),
    'prepared evidence root missing or substituted; never recreate lost Temp execution history');
  Object.assign(run, { group, runRoot, cwd, evidence, admissionStart: run.authorityStartedAt,
    ownershipSha256: ownershipRecord.sha256, preparationSha256: preparation.sha256,
    preparedSourceInventory: trustedInventory });
  acquireRunLock(run);
  return run;
}
async function executeOwned(command, run, remainingMs) {
  const { manifest, cwd, evidence, group, runRoot } = run;
  requireCommandTime(run, command);
  check(command.executable === manifest.toolchain.executable, 'command executable differs from pinned launcher');
  const folder = path.join(evidence, `${group.id}-${run.attemptId}-${command.id}`);
  ensureOwned(runRoot, folder);
  fs.mkdirSync(folder, { recursive: false }); // Existing receipt means no repeat.
  run.preLaunchFolder = { path: folder, invocationId: run.invocationId };
  const helper = path.join(folder, 'windows-owned-job.ps1');
  fs.writeFileSync(helper, WINDOWS_HELPER, { flag: 'wx' });
  const reportPath = path.join(folder, 'test-report.json');
  const args = command.argv.map(value => value.replaceAll('$SNAPSHOT', cwd).replaceAll('$COMMAND_REPORT', reportPath));
  assertCommandEnvironment(command);
  const environment = { ...osEnvironment(), ...canonicalEnvironment(command.environment), TEMP: path.join(runRoot, 'temp'), TMP: path.join(runRoot, 'temp'),
    PATH: path.dirname(manifest.toolchain.executable) + path.delimiter + (osEnvironment().PATH ?? ''),
    NO_COLOR: '1', FORCE_COLOR: '0', CI: '1', XENIOS_QO_SUITE_REPORT: reportPath + '.suites.json' };
  check(!Object.keys(environment).some(key => /TOKEN|PASSWORD|SERVICE_ROLE|RESEND|DATABASE_URL|PAYMENT|SECRET/i.test(key)),
    'credential-like inherited environment key');
  check(hash(Buffer.from(JSON.stringify(policyEnvironment(environment)))) === run.policy.environmentSha256,
    'child policy-relevant environment differs from verified fact');
  fs.mkdirSync(environment.TEMP, { recursive: true });
  // Preserve cleanup time without collapsing a five-second G0 command to a
  // one-millisecond child deadline. Explicit deadline/cap fixtures stay exact.
  const cleanupReserveMs = Math.min(10_000, Math.floor(command.wallMs / 4));
  const spec = { executable: manifest.toolchain.executable,
    commandLine: [manifest.toolchain.executable, ...args].map(quoteWindows).join(' '), cwd, environment,
    stdoutPath: path.join(folder, 'stdout.raw'), stderrPath: path.join(folder, 'stderr.raw'),
    eventsPath: path.join(folder, 'job-process-events.jsonl'), streamLimit: STREAM_LIMIT,
    maxJobChildren: command.maxOwnedProcesses - 2,
    subjectJobCommittedMemoryLimitBytes: group.id === 'G0' ? 512 * 1024 * 1024 : 0,
    timeoutMs: Math.max(1, Math.min(command.childWallMs ?? Math.max(1, command.wallMs - cleanupReserveMs),
      Math.max(1, remainingMs - cleanupReserveMs))) };
  check(spec.maxJobChildren >= 1 && spec.timeoutMs > 0, 'process or remaining wall ceiling invalid');
  const specFile = path.join(folder, 'launch-spec.json'); writeNew(specFile, spec);
  const powershell = manifest.toolchain.windowsHelper.executable;
  check(fs.existsSync(powershell) && hash(fs.readFileSync(powershell)) === manifest.toolchain.windowsHelper.executableSha256,
    'existing Windows PowerShell route absent or different');
  recheckChildAdmission(run, command);
  requireCommandTime(run, command);
  consumeGroup(run, command.id);
  // Recheck after durable marker IO, immediately before the launch attempt.
  recheckChildAdmission(run, command);
  requireCommandTime(run, command);
  run.commandLaunchAttempted = true;
  const startedAt = new Date().toISOString(), launchAttemptedAt = startedAt;
  const supervisorResidentBytesBefore = process.memoryUsage().rss;
  let child, spawnObserved = false, spawnError = null, clockError = null;
  let helperStdout = Buffer.alloc(0), helperStderr = Buffer.alloc(0), overflow = false, outerExpired = false;
  let timer = null, helperExit;
  try {
    try {
      child = spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-File', helper, '-SpecPath', specFile],
        { cwd, env: environment, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      // A synchronous argument refusal has no ChildProcess. Unknown throws remain
      // uncertain; neither an error label nor a missing receipt proves absence.
      spawnError = error;
      helperExit = { code: null, signal: null, error: error.message, closeObserved: false, synchronous: true };
    }
    if (child) {
      const capture = (old, chunk) => {
        const next = Buffer.concat([old, chunk]);
        if (next.length > 64 * 1024) { overflow = true; child.kill(); }
        return next.subarray(0, 64 * 1024);
      };
      child.stdout?.on('data', chunk => { helperStdout = capture(helperStdout, chunk); });
      child.stderr?.on('data', chunk => { helperStderr = capture(helperStderr, chunk); });
      helperExit = await new Promise(resolve => {
        child.once('error', error => { spawnError = error; }); // Wait for CLOSE, not error alone.
        child.once('close', (code, signal) => resolve({ code, signal, error: spawnError?.message ?? null, closeObserved: true }));
        child.once('spawn', () => {
          spawnObserved = true; run.anyActualChildStarted = true; run.preLaunchFolder = null;
          run.groupConsumed = true; run.firstConsumedCommandId ??= command.id;
          try { publishActualGroupClock(run, child, command, launchAttemptedAt); }
          catch (error) { clockError = error; run.clockWitnessUncertain = true; child.kill(); }
        });
        // Exhaustion without close is explicitly uncertain and cannot release custody.
        timer = setTimeout(() => {
          outerExpired = true; child.kill();
          resolve({ code: null, signal: null, error: 'helper close not established within command wall', closeObserved: false });
        }, Math.max(1, Math.min(command.wallMs, run.deadline - Date.now())));
      });
    }
  } finally { if (timer) clearTimeout(timer); }
  if (!spawnObserved) {
    const synchronousArgumentRefusal = !child && ['ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE',
      'ERR_OUT_OF_RANGE', 'ERR_INVALID_OPT_VALUE'].includes(spawnError?.code);
    const asynchronousStartRefusal = child && helperExit.closeObserved === true && !child.pid
      && ['ENOENT', 'EACCES', 'EPERM', 'EMFILE', 'ENFILE', 'ENOMEM', 'EAGAIN'].includes(spawnError?.code)
      && (child.stdout == null || child.stdout.destroyed) && (child.stderr == null || child.stderr.destroyed);
    const noSubjectOutputs = [spec.stdoutPath, spec.stderrPath, spec.eventsPath, reportPath, reportPath + '.suites.json']
      .every(file => pathAbsent(file));
    if ((synchronousArgumentRefusal || asynchronousStartRefusal) && !overflow && !outerExpired
      && !run.clockWitnessUncertain && noSubjectOutputs && helperStdout.length === 0 && helperStderr.length === 0) {
      const proofPath = path.join(evidence, group.id + '-' + run.invocationId + '.no-helper-spawn.json');
      const proof = { schemaVersion: 'quick-order-no-helper-spawn-v1', runId: run.window.runId, group: group.id,
        command: command.id, attemptId: run.attemptId, invocationId: run.invocationId,
        authority: run.authority, manifestSha256: manifest._digest, attemptRecord: run.attemptRecord,
        launchAttemptedAt, finishedAt: new Date().toISOString(), spawnCalled: true, helperSpawnObserved: false,
        helperPid: null, errorCode: spawnError.code, closeObserved: helperExit.closeObserved,
        synchronousArgumentRefusal, asynchronousStartRefusal: Boolean(asynchronousStartRefusal),
        noSubjectOutputs, cleanupProven: true, commandCompleted: false };
      writeNew(proofPath, proof);
      run.noHelperSpawnProof = { path: proofPath, sha256: hash(fs.readFileSync(proofPath)) };
      const error = nonconsumingAdmission('helper start refused; exact failed-launch evidence proves no helper or subject started', false);
      error.code = 'HELPER_START_REFUSED_NO_SPAWN_PROVEN'; throw error;
    }
    const error = new Error('REFUSED: helper start failed; absence or stream cleanup not proven');
    error.code = 'HELPER_START_FAILED_CLEANUP_UNPROVEN'; error.evidenceUncertain = true; throw error;
  }
  if (clockError) throw clockError; // Actual launch always remains consumed and uncertain.
  fs.writeFileSync(path.join(folder, 'helper-stdout.raw'), helperStdout, { flag: 'wx' });
  fs.writeFileSync(path.join(folder, 'helper-stderr.raw'), helperStderr, { flag: 'wx' });
  let native = null, parseError = null;
  try { native = JSON.parse(helperStdout.toString('utf8').trim()); } catch (error) { parseError = error.message; }
  const streams = { stdout: fs.existsSync(spec.stdoutPath) ? fs.readFileSync(spec.stdoutPath) : Buffer.alloc(0),
    stderr: fs.existsSync(spec.stderrPath) ? fs.readFileSync(spec.stderrPath) : Buffer.alloc(0) };
  const receipt = { group: group.id, command: command.id, attemptId: run.attemptId, invocationId: run.invocationId,
    childLaunchAttempted: true, attemptRecord: run.attemptRecord, startedAt, finishedAt: new Date().toISOString(),
    helperSpawnObserved: spawnObserved, groupClock: run.groupClock, requestRecord: run.requestRecord,
    invocationWitness: run.invocationWitness, requestedAt: run.requestedAt,
    actualGroupStartedAt: run.actualStartedAt, groupDeadline: run.actualStartedAt ? new Date(run.deadline).toISOString() : null,
    executable: spec.executable, executableSha256: manifest.toolchain.sha256, argv: args, cwd,
    environmentKeys: Object.keys(environment).sort(), workerNodeOptions: environment.NODE_OPTIONS ?? null,
    source: manifest.source, manifestSha256: manifest._digest, authority: run.authority, admission: run.commandAdmission, helperSourceSha256: hash(Buffer.from(WINDOWS_HELPER)),
    rawControlFiles: [helper, specFile, path.join(folder, 'helper-stdout.raw'), path.join(folder, 'helper-stderr.raw')]
      .map(file => ({ path: file, bytes: fs.statSync(file).size, sha256: hash(fs.readFileSync(file)) })),
    helperPid: child.pid, helperExit, outerExpired, helperOutputOverflow: overflow, native, parseError,
    subjectMemory: native?.subjectMemory ?? { measure: 'SUBJECT_JOB_PEAK_COMMITTED_BYTES', peakCommittedBytes: null,
      limitBytes: spec.subjectJobCommittedMemoryLimitBytes || null, measurementProven: false, status: 'UNAVAILABLE_HELPER_RECEIPT' },
    outsideSubjectJob: { supervisorPid: process.pid, supervisorResidentBytesBefore,
      supervisorResidentBytesAfter: process.memoryUsage().rss,
      supervisorMeasure: 'RESIDENT_BYTES_AT_TWO_INSTANTS_NOT_COMMITTED_OR_PEAK',
      helperPid: child.pid, helperAndCompilerScope: 'OUTER_BOOTSTRAP_JOB_EXCLUDES_NODE_SUPERVISOR_INCLUDES_SUBJECT',
      bootstrapTotalBeforeSubject: native?.bootstrapTotalBeforeSubject ?? null,
      helperCompilerCommittedBytes: null, limitBytes: null, uncapped: true,
      limitation: 'Helper/compiler/supervisor committed memory is not covered by the subject limit or peak; no whole-owned-tree memory cap is claimed.' },
    stdout: { path: spec.stdoutPath, retainedBytes: streams.stdout.length, sha256: hash(streams.stdout), observedBytes: native?.stdoutObservedBytes ?? null },
    stderr: { path: spec.stderrPath, retainedBytes: streams.stderr.length, sha256: hash(streams.stderr), observedBytes: native?.stderrObservedBytes ?? null },
    processEvents: { path: spec.eventsPath, sha256: fs.existsSync(spec.eventsPath) ? hash(fs.readFileSync(spec.eventsPath)) : null },
    structuredReports: [reportPath, reportPath + '.suites.json'].map(file => ({ path: file,
      bytes: fs.existsSync(file) ? fs.statSync(file).size : null,
      sha256: fs.existsSync(file) && fs.statSync(file).size <= STREAM_LIMIT ? hash(fs.readFileSync(file)) : null,
      cap: STREAM_LIMIT, capEnforcement: 'POST_CHILD_ADMISSION_REFUSAL; NOT_A_LIVE_FILE_WRITE_CAP' })),
    cleanupProven: native?.cleanupProven === true && helperExit.code === 0 && !helperExit.error && !outerExpired && !overflow,
    provenanceLimit: 'Kernel Job Object membership scopes the owned tree. Process-start/executable metadata can be unavailable for a very short-lived child; raw event and that limitation are retained. No network sandbox or continuous filesystem attestation is claimed.' };
  let disposition;
  try {
    check(helperExit.code === 0 && !helperExit.error && !outerExpired && !overflow && native !== null,
      'Windows helper did not produce an unambiguous receipt');
    check(native.subjectMemory?.measurementProven === true
      && Number.isSafeInteger(native.subjectMemory.peakCommittedBytes) && native.subjectMemory.peakCommittedBytes >= 0
      && native.subjectMemory.limitBytes === (spec.subjectJobCommittedMemoryLimitBytes || null)
      && (group.id !== 'G0' || native.subjectMemory.peakCommittedBytes <= spec.subjectJobCommittedMemoryLimitBytes),
      'subject committed-memory limit or measured peak unavailable or different');
    disposition = classifyResult(command, native, streams, { reportPath, cwd });
    receipt.disposition = disposition;
  } catch (error) {
    receipt.disposition = { runnerVerdict: 'ABORTED_OR_UNEXPECTED', reason: error.message };
  }
  const receiptPath = path.join(folder, 'receipt.json');
  writeNew(receiptPath, receipt);
  return { ...receipt, receiptPath, receiptSha256: hash(fs.readFileSync(receiptPath)) };
}

function assertDependencies(run) {
  const { group, evidence, manifest } = run;
  for (const required of group.requires) {
    const file = path.join(evidence, `${required}.group.json`);
    check(fs.existsSync(file), `required group receipt absent: ${required}`);
    const receipt = readJson(file);
    check(receipt.manifestSha256 === manifest._digest && receipt.authority?.windowSha256 === run.authority.windowSha256
      && eq(stableAuthority(receipt.authority), stableAuthority(run.authority))
      && receipt.runId === run.window.runId && receipt.group === required && receipt.cleanupProven === true
      && receipt.dependencyAccepted === true, `dependency not accepted: ${required}`);
  }
  if (group.id !== 'G0') {
    const g0 = boundRecord(path.join(evidence, 'G0.group.json'));
    // Published after G0. Keeping this reference outside the immutable window
    // avoids making the approval or G0 itself depend on future G0 receipt bytes.
    const pointer = boundRecord(path.join(evidence, 'G0.review-acceptance.json'));
    const acceptance = committedRecord(pointer.value.g0Acceptance?.acceptingReview,
      manifest.approvalTrust.reviewerRepository, run.deadline, manifest.approvalTrust.reviewerBranch);
    check(pointer.value.g0Acceptance.g0ReceiptSha256 === g0.sha256
      && acceptance.value.reviewerThread === manifest.approvalTrust.reviewerThread
      && acceptance.value.manifestSha256 === manifest._digest && acceptance.value.runId === run.window.runId
      && acceptance.value.windowSha256 === run.authority.windowSha256
      && acceptance.value.decisionTextSha256 === run.authority.decisionTextSha256
      && acceptance.value.windowReviewSha256 === run.authority.windowReview.sha256
      && acceptance.value.g0ReceiptSha256 === g0.sha256 && acceptance.value.disposition === 'EXACT_G0_EVIDENCE_ACCEPTED'
      && g0.value.cleanupProven === true && g0.value.dependencyAccepted === true
      && g0.value.receipts.some(row => row.command === 'parser-self-test' && row.disposition.dependencyDisposition === 'GREEN'),
      'exact G0 receipt and original reviewer accepting commit absent');
    const completedAt = Date.parse(g0.value.finishedAt), acceptedAt = Date.parse(acceptance.value.acceptedAt);
    check(Number.isFinite(completedAt) && Number.isFinite(acceptedAt) && completedAt <= acceptedAt
      && acceptedAt <= completedAt + run.window.executionBudget.g0AcceptanceMs
      && acceptedAt <= run.aggregateDeadline && acceptedAt <= Date.now(),
      'independent G0 acceptance exceeded its explicit original aggregate/window review budget');
    run.g0Acceptance = { g0ReceiptSha256: g0.sha256, acceptingReview: acceptance.reference, pointerSha256: pointer.sha256 };
    // Source-held bootstrap/memory/process prerequisites are checked separately;
    // neither this acceptance record nor a bootstrapAccepted boolean lifts them.
  }
}

const NONCHILD_GROUP_COMMANDS = new Set(['admission-refusal-self-test', 'parser-self-test']);
function assertContinuationSourceGate(group) {
  check(Array.isArray(group.commands) && group.commands.length > 0, 'group command inventory absent');
  check(new Set(group.commands.map(command => command.id)).size === group.commands.length
    && group.commands.every(command => /^[a-z0-9-]+$/.test(command.id)), 'unique bounded command identifiers required');
}

function initializeInvocationHistory(run) {
  const file = path.join(run.evidence, `${run.group.id}-${run.invocationId}.invocation.json`);
  const invocation = writeInitialRecord(file, { schemaVersion: 'quick-order-invocation-witness-v1', runId: run.window.runId, group: run.group.id,
    invocationId: run.invocationId, invocationStartedAt: new Date(run.authorityStartedAt).toISOString(),
    prelaunchStartedAt: run.prelaunchStartedAt, recordedAt: new Date().toISOString(), manifestSha256: run.manifest._digest,
    aggregateDeadline: new Date(run.aggregateDeadline).toISOString(), authority: run.authority,
    ownershipSha256: run.ownershipSha256, preparationSha256: run.preparationSha256,
    admissionCharge: false, event: 'EXPLICIT_INVOCATION_REQUESTED_NOT_GROUP_STARTED' });
  run.invocationWitness = { path: file, sha256: invocation.sha256 };
  run.initialPublicationRecoveries.push(...invocation.recoveredUnpublished);
  const requestedFile = path.join(run.evidence, run.group.id + '.requested.json');
  if (!fs.existsSync(requestedFile)) {
    const prior = fs.readdirSync(run.evidence).filter(name => name.startsWith(run.group.id + '-'));
    requirePriorEvidence(!fs.readdirSync(run.evidence).some(name => name.startsWith(run.group.id + '.requested.json.'))
      && !prior.some(name => name.endsWith('.attempt.json') || name.endsWith('.in-process.json')
        || name.endsWith('.paused.json') || fs.lstatSync(path.join(run.evidence, name)).isDirectory())
      && !fs.existsSync(run.startedMarker) && !fs.existsSync(path.join(run.evidence, run.group.id + '.group.json')),
      'first requested-group witness missing beside prior execution history');
    const requestPublication = writeInitialRecord(requestedFile, { schemaVersion: 'quick-order-requested-group-v1', runId: run.window.runId, group: run.group.id,
      attemptId: run.invocationId, requestedAt: new Date(run.authorityStartedAt).toISOString(),
      firstInvocationId: run.invocationId, firstInvocationWitness: run.invocationWitness,
      recordedAt: new Date().toISOString(), manifestSha256: run.manifest._digest, authority: run.authority,
      aggregateDeadline: new Date(run.aggregateDeadline).toISOString(), actualStartedAt: null,
      event: 'PROSPECTIVE_GROUP_IDENTITY_NOT_ACTUAL_START' });
    run.initialPublicationRecoveries.push(...requestPublication.recoveredUnpublished);
  }
  const request = boundRecord(requestedFile), value = request.value;
  const requestedAt = Date.parse(value.requestedAt), recordedAt = Date.parse(value.recordedAt);
  check(value.schemaVersion === 'quick-order-requested-group-v1' && value.runId === run.window.runId
    && value.group === run.group.id && value.manifestSha256 === run.manifest._digest
    && /^[a-f0-9]{24}$/.test(value.attemptId ?? '') && value.firstInvocationId === value.attemptId
    && eq(stableAuthority(value.authority), stableAuthority(run.authority))
    && value.aggregateDeadline === new Date(run.aggregateDeadline).toISOString()
    && Date.parse(run.window.approvedAt) <= requestedAt && requestedAt <= recordedAt && recordedAt <= Date.now(),
    'requested-group clock/history binding differs or is in the future');
  canonicalEvidencePath(run, value.firstInvocationWitness.path,
    path.join(run.evidence, `${run.group.id}-${value.firstInvocationId}.invocation.json`));
  const first = boundRecord(value.firstInvocationWitness.path);
  check(first.sha256 === value.firstInvocationWitness.sha256 && first.value.invocationId === value.firstInvocationId
    && first.value.invocationStartedAt === value.requestedAt && first.value.runId === run.window.runId
    && first.value.group === run.group.id && first.value.manifestSha256 === run.manifest._digest
    && eq(stableAuthority(first.value.authority), stableAuthority(run.authority)), 'raw first-invocation witness differs');
  run.requestRecord = { path: request.path, sha256: request.sha256 };
  run.attemptId = value.attemptId; run.requestedAt = value.requestedAt;
}

function publishActualGroupClock(run, child, command, launchAttemptedAt) {
  check(Number.isSafeInteger(child.pid) && child.pid > 0, 'successful spawn event has no actual helper PID');
  if (run.actualStartedAt) return;
  const actualStartedAt = new Date().toISOString(), actualTime = Date.parse(actualStartedAt);
  check(actualTime >= Date.parse(launchAttemptedAt) && actualTime < run.aggregateDeadline,
    'actual first helper spawn is outside original aggregate/window');
  run.actualStartedAt = actualStartedAt;
  run.deadline = Math.min(actualTime + run.group.wallMs, run.aggregateDeadline);
  run.groupConsumed = true; run.firstConsumedCommandId = command.id;
  const file = path.join(run.evidence, `${run.group.id}-${run.attemptId}.launch-clock.json`);
  writeNew(file, { schemaVersion: 'quick-order-actual-group-clock-v1', runId: run.window.runId, group: run.group.id,
    attemptId: run.attemptId, invocationId: run.invocationId, requestedAt: run.requestedAt,
    prelaunchStartedAt: run.prelaunchStartedAt, launchAttemptedAt, actualStartedAt, recordedAt: new Date().toISOString(),
    deadline: new Date(run.deadline).toISOString(), aggregateDeadline: new Date(run.aggregateDeadline).toISOString(),
    helperPid: child.pid, helperExecutable: run.manifest.toolchain.windowsHelper.executable,
    helperExecutableSha256: run.manifest.toolchain.windowsHelper.executableSha256,
    commandId: command.id, requestRecord: run.requestRecord, invocationWitness: run.invocationWitness,
    attemptRecord: run.attemptRecord, startedMarkerSha256: run.startedMarkerSha256,
    authority: run.authority, manifestSha256: run.manifest._digest,
    event: 'NODE_OBSERVED_FIRST_OWNED_HELPER_PROCESS_SPAWN',
    limitation: 'Node-observed actual helper child; not proof of subject ResumeThread time or kernel Job assignment at this instant. Native receipt must separately prove ownership/cleanup.' });
  run.groupClock = { path: file, sha256: hash(fs.readFileSync(file)) };
}

function consumeGroup(run, commandId) {
  const command = run.group.commands.find(row => row.id === commandId);
  check(command && !NONCHILD_GROUP_COMMANDS.has(command.result?.kind),
    'in-process fixture cannot consume child execution authority');
  assertContinuationSourceGate(run.group);
  requireCommandTime(run, command);
  if (run.groupConsumed) {
    check(run.group.commands[run.nextCommandIndex]?.id === commandId
      && !run.completedCommands.has(commandId), 'only the next never-launched command may continue the same group attempt');
    return;
  }
  writeNew(run.startedMarker, { runId: run.window.runId, group: run.group.id, commandId,
    attemptId: run.attemptId, invocationId: run.invocationId, at: new Date().toISOString(), manifestSha256: run.manifest._digest,
    requestedAt: run.requestedAt, actualStartedAt: null, deadline: null,
    aggregateDeadline: new Date(run.aggregateDeadline).toISOString(), requestRecord: run.requestRecord,
    invocationWitness: run.invocationWitness,
    authority: run.authority, disposition: 'CHILD_LAUNCH_INTENT_NO_ACTUAL_SPAWN_YET' });
  run.markerWrittenByInvocation = true;
  run.startedMarkerSha256 = hash(fs.readFileSync(run.startedMarker));
}

function stableAuthority(authority) {
  return { windowSha256: authority.windowSha256, verificationSha256: authority.verificationSha256,
    decisionTextSha256: authority.decisionTextSha256, windowReview: authority.windowReview,
    sourceDisposition: authority.sourceDisposition, committedWindow: authority.committedWindow,
    preWindowObservationSha256: authority.preWindowObservationSha256,
    effectivePolicyObservationSha256: authority.effectivePolicyObservationSha256,
    observationAuthorities: authority.observationAuthorities };
}
function canonicalEvidencePath(run, supplied, expected) {
  const resolved = path.resolve(supplied);
  ensureOwned(run.evidence, resolved);
  check(resolved.toLowerCase() === path.resolve(expected).toLowerCase()
    && fs.realpathSync.native(resolved).toLowerCase() === resolved.toLowerCase(),
    'noncanonical receipt path or filesystem alias refused');
}
function readInvocationWitness(run, pointer, invocationId) {
  check(pointer && DIGEST.test(pointer.sha256 ?? ''), 'raw invocation witness missing');
  canonicalEvidencePath(run, pointer.path, path.join(run.evidence, `${run.group.id}-${invocationId}.invocation.json`));
  const record = boundRecord(pointer.path), value = record.value;
  check(record.sha256 === pointer.sha256 && value.schemaVersion === 'quick-order-invocation-witness-v1'
    && value.runId === run.window.runId && value.group === run.group.id && value.invocationId === invocationId
    && value.manifestSha256 === run.manifest._digest && eq(stableAuthority(value.authority), stableAuthority(run.authority))
    && value.aggregateDeadline === new Date(run.aggregateDeadline).toISOString()
    && value.ownershipSha256 === run.ownershipSha256 && value.preparationSha256 === run.preparationSha256
    && Date.parse(run.window.approvedAt) <= Date.parse(value.invocationStartedAt)
    && Date.parse(value.invocationStartedAt) <= Date.parse(value.prelaunchStartedAt)
    && Date.parse(value.prelaunchStartedAt) <= Date.parse(value.recordedAt) && Date.parse(value.recordedAt) <= Date.now(),
    'invocation clock or exact source/ownership witness differs');
  return record;
}
function readActualGroupClock(run, value) {
  const pointer = value.groupClock;
  check(pointer && DIGEST.test(pointer.sha256 ?? ''), 'started group has no immutable raw launch-clock witness');
  canonicalEvidencePath(run, pointer.path, path.join(run.evidence, `${run.group.id}-${value.attemptId}.launch-clock.json`));
  const clock = boundRecord(pointer.path), witnessed = clock.value;
  check(clock.sha256 === pointer.sha256 && witnessed.schemaVersion === 'quick-order-actual-group-clock-v1'
    && witnessed.runId === run.window.runId && witnessed.group === run.group.id && witnessed.attemptId === value.attemptId
    && witnessed.manifestSha256 === run.manifest._digest && eq(stableAuthority(witnessed.authority), stableAuthority(run.authority))
    && eq(witnessed.requestRecord, run.requestRecord) && value.requestedAt === run.requestedAt
    && witnessed.requestedAt === run.requestedAt && value.startedAt === witnessed.actualStartedAt
    && value.actualStartedAt === witnessed.actualStartedAt && value.deadline === witnessed.deadline
    && witnessed.deadline === new Date(Math.min(Date.parse(witnessed.actualStartedAt) + run.group.wallMs, run.aggregateDeadline)).toISOString()
    && witnessed.aggregateDeadline === new Date(run.aggregateDeadline).toISOString()
    && Number.isSafeInteger(witnessed.helperPid) && witnessed.helperPid > 0
    && witnessed.helperExecutable === run.manifest.toolchain.windowsHelper.executable
    && witnessed.helperExecutableSha256 === run.manifest.toolchain.windowsHelper.executableSha256
    && witnessed.event === 'NODE_OBSERVED_FIRST_OWNED_HELPER_PROCESS_SPAWN'
    && Date.parse(run.requestedAt) <= Date.parse(witnessed.prelaunchStartedAt)
    && Date.parse(witnessed.prelaunchStartedAt) <= Date.parse(witnessed.launchAttemptedAt)
    && Date.parse(witnessed.launchAttemptedAt) <= Date.parse(witnessed.actualStartedAt)
    && Date.parse(witnessed.actualStartedAt) <= Date.parse(witnessed.recordedAt)
    && Date.parse(witnessed.recordedAt) <= Date.parse(value.finishedAt) && Date.parse(value.finishedAt) <= Date.now(),
    'actual group clock, anchored helper event or unchanged deadline differs');
  const invocation = readInvocationWitness(run, witnessed.invocationWitness, witnessed.invocationId);
  check(invocation.value.prelaunchStartedAt === witnessed.prelaunchStartedAt, 'actual launch does not bind its prelaunch invocation');
  canonicalEvidencePath(run, witnessed.attemptRecord.path,
    path.join(run.evidence, `${run.group.id}-${witnessed.invocationId}.attempt.json`));
  const attempt = boundRecord(witnessed.attemptRecord.path);
  check(attempt.sha256 === witnessed.attemptRecord.sha256 && attempt.value.attemptId === value.attemptId
    && attempt.value.invocationId === witnessed.invocationId && attempt.value.group === run.group.id
    && attempt.value.runId === run.window.runId && attempt.value.requestedAt === run.requestedAt
    && eq(attempt.value.requestRecord, run.requestRecord) && eq(attempt.value.invocationWitness, witnessed.invocationWitness)
    && attempt.value.actualStartedAt === null && attempt.value.deadline === null
    && eq(stableAuthority(attempt.value.authority), stableAuthority(run.authority)),
    'raw first actual-launch admission attempt differs');
  return clock;
}
function pauseUsedPath(run, digest) {
  check(DIGEST.test(digest), 'pause digest identity missing');
  return path.join(run.evidence, `${run.group.id}-pause-${digest}.resume-used.json`);
}
function requirePriorEvidence(condition, reason) {
  if (!condition) {
    const error = new Error('REFUSED: ' + reason);
    error.code = 'UNRESOLVED_PRIOR_EVIDENCE'; error.evidenceUncertain = true; throw error;
  }
}
function readCompletedPrefix(run, value) {
  return value.receipts.map((summary, index) => {
    const command = run.group.commands[index];
    check(command && summary.command === command.id && summary.cleanupProven === true
      && summary.receiptPath && DIGEST.test(summary.receiptSha256),
      'progress is not an exact prefix of immutable completed-command receipts');
    const noChild = NONCHILD_GROUP_COMMANDS.has(command.result.kind);
    const expected = noChild ? path.join(run.evidence, `${run.group.id}-${value.attemptId}-${command.id}.in-process.json`)
      : path.join(run.evidence, `${run.group.id}-${value.attemptId}-${command.id}`, 'receipt.json');
    canonicalEvidencePath(run, summary.receiptPath, expected);
    const raw = boundRecord(summary.receiptPath);
    check(raw.sha256 === summary.receiptSha256 && raw.value.command === command.id && raw.value.group === run.group.id
      && raw.value.attemptId === value.attemptId && /^[a-f0-9]{24}$/.test(raw.value.invocationId ?? '')
      && raw.value.childLaunchAttempted === !noChild && raw.value.manifestSha256 === run.manifest._digest
      && raw.value.cleanupProven === true && eq(stableAuthority(raw.value.authority), stableAuthority(run.authority))
      && eq(raw.value.disposition, summary.disposition), 'prior completed-command identity, bytes or authority differ');
    const pointer = raw.value.attemptRecord;
    check(pointer && DIGEST.test(pointer.sha256 ?? ''), 'completed command has no raw invocation-attempt binding');
    canonicalEvidencePath(run, pointer.path, path.join(run.evidence, `${run.group.id}-${raw.value.invocationId}.attempt.json`));
    const attempt = boundRecord(pointer.path);
    check(attempt.sha256 === pointer.sha256 && attempt.value.attemptId === value.attemptId
      && attempt.value.invocationId === raw.value.invocationId && attempt.value.group === run.group.id
      && attempt.value.runId === run.window.runId && attempt.value.manifestSha256 === run.manifest._digest
      && attempt.value.requestedAt === value.requestedAt && eq(attempt.value.requestRecord, run.requestRecord)
      && (attempt.value.groupClock === null || eq(attempt.value.groupClock, value.groupClock))
      && attempt.value.aggregateDeadline === value.aggregateDeadline
      && eq(stableAuthority(attempt.value.authority), stableAuthority(run.authority)),
      'completed command invocation record differs');
    readInvocationWitness(run, raw.value.invocationWitness, raw.value.invocationId);
    check(eq(raw.value.requestRecord, run.requestRecord)
      && (noChild ? raw.value.groupClock === null || eq(raw.value.groupClock, value.groupClock)
        : raw.value.helperSpawnObserved === true && eq(raw.value.groupClock, value.groupClock)),
      'completed command does not bind its actual launch or prospective request');
    check(['GREEN', 'EXACT_PREDECLARED_RED_ONLY', 'PROTECTION_FAILURE_RETAINED_ARTIFACTS_INDEPENDENT'].includes(summary.disposition.dependencyDisposition),
      'unexpected prior command result cannot continue');
    check(summary.attemptId === raw.value.attemptId && summary.invocationId === raw.value.invocationId
      && eq(summary.attemptRecord, raw.value.attemptRecord) && summary.childLaunchAttempted === raw.value.childLaunchAttempted,
      'completed-command summary cannot substitute invocation or launch identity');
    return { ...raw.value, receiptPath: summary.receiptPath, receiptSha256: summary.receiptSha256 };
  });
}
function restoreArtifactRecord(run, value) {
  if (!value.artifacts?.inventory) return;
  const pointer = value.artifacts.inventoryRecord;
  check(pointer && DIGEST.test(pointer.sha256 ?? ''), 'G7 artifact inventory raw binding missing');
  canonicalEvidencePath(run, pointer.path, path.join(run.evidence, 'G7-build-artifacts.json'));
  const record = boundRecord(pointer.path);
  check(record.sha256 === pointer.sha256 && record.value.attemptId === value.attemptId
    && record.value.manifestSha256 === run.manifest._digest && eq(record.value.files, value.artifacts.inventory)
    && eq(stableAuthority(record.value.authority), stableAuthority(run.authority)),
    'G7 artifact inventory identity or digest differs');
  run.artifactSnapshot = record.value.files; run.artifactRecord = pointer;
}
function readPause(run) {
  if (!fs.existsSync(run.startedMarker)) {
    // Recover only the existing unstarted prefix while refusing this mistaken
    // mode. This is not a restart, admission charge or fixture execution.
    const prefix = assertFreshGroupStart(run);
    run.restoredReceipts = prefix;
    throw new Error('REFUSED: resume requires an actually started paused group; use a separately qualified fresh invocation');
  }
  const record = run.resumePreview;
  ensureOwned(run.evidence, record.path);
  const value = record.value;
  canonicalEvidencePath(run, record.path, path.join(run.evidence, `${run.group.id}-${value.attemptId}-${value.invocationId}.paused.json`));
  check(value.schemaVersion === 'quick-order-paused-continuation-v1' && value.runId === run.window.runId
    && value.group === run.group.id && value.manifestSha256 === run.manifest._digest
    && eq(stableAuthority(value.authority), stableAuthority(run.authority))
    && value.cleanupProven === true && value.evidenceUncertain === false && value.inFlightCommand === null
    && value.groupConsumed === true && value.anyChildLaunchAttempted === true && run.group.id !== 'G0'
    && value.continuation.status === 'PAUSED_BEFORE_NEXT_CHILD_ADMISSION'
    && /^[a-f0-9]{24}$/.test(value.attemptId ?? '') && /^[a-f0-9]{24}$/.test(value.invocationId ?? '') && Array.isArray(value.receipts)
    && Number.isInteger(value.continuation.nextCommandIndex)
    && value.continuation.nextCommandIndex === value.receipts.length
    && value.continuation.nextCommandIndex < run.group.commands.length,
    'exact clean immutable pause receipt required; uncertain or terminal evidence cannot resume');
  check(value.controlRecords?.ownershipSha256 === run.ownershipSha256
    && value.controlRecords?.preparationSha256 === run.preparationSha256,
    'pause ownership or immutable preparation bytes differ');
  const groupClock = readActualGroupClock(run, value);
  for (const pointer of [value.originalAttemptRecord,
    { path: value.controlRecords.attemptPath, sha256: value.controlRecords.attemptSha256 }]) {
    check(pointer && typeof pointer.path === 'string' && DIGEST.test(pointer.sha256 ?? ''), 'raw prior attempt binding missing');
    ensureOwned(run.evidence, pointer.path);
    const attemptIdentity = boundRecord(pointer.path);
    canonicalEvidencePath(run, pointer.path, path.join(run.evidence, `${run.group.id}-${attemptIdentity.value.invocationId}.attempt.json`));
    const attempt = boundRecord(pointer.path);
    check(attempt.sha256 === pointer.sha256 && attempt.value.attemptId === value.attemptId
      && attempt.value.runId === run.window.runId && attempt.value.group === run.group.id
      && attempt.value.manifestSha256 === run.manifest._digest
      && attempt.value.requestedAt === value.requestedAt && eq(attempt.value.requestRecord, run.requestRecord)
      && (attempt.value.groupClock === null || eq(attempt.value.groupClock, value.groupClock))
      && attempt.value.aggregateDeadline === value.aggregateDeadline
      && eq(stableAuthority(attempt.value.authority), stableAuthority(run.authority)),
      'prior group/invocation admission attempt bytes or authority differ');
  }
  const priorAttempt = readJson(value.controlRecords.attemptPath);
  check(priorAttempt.invocationId === value.invocationId && eq(priorAttempt.parentPause, value.parentPause),
    'pause does not link its actual preceding invocation and raw parent pause');
  check(Date.parse(value.aggregateDeadline) === run.aggregateDeadline
    && Number.isFinite(Date.parse(value.startedAt)) && Number.isFinite(Date.parse(value.deadline))
    && Date.parse(value.deadline) === Math.min(Date.parse(value.startedAt) + run.group.wallMs, run.aggregateDeadline),
    'resume may not reset or extend original deadlines');
  check(Number.isFinite(Date.parse(value.latestResumeStartAt))
    && Date.parse(value.latestResumeStartAt) >= Date.parse(value.finishedAt)
    && Date.parse(value.latestResumeStartAt) <= Date.parse(value.finishedAt) + run.group.continuationPolicy.resumeStartAllowanceMs,
    'immutable finite resume-start allowance is malformed');
  const used = pauseUsedPath(run, record.sha256);
  check(!fs.existsSync(used), 'pause has already been consumed by a resume invocation; no branching or replay');
  for (const name of fs.readdirSync(run.evidence).filter(name => name.endsWith('.attempt.json'))) {
    check(boundRecord(path.join(run.evidence, name)).value.parentPause?.sha256 !== record.sha256,
      'pause digest already belongs to a recorded resumed invocation');
  }
  check(!fs.existsSync(path.join(run.evidence, run.group.id + '.group.json')), 'completed or failed group cannot resume');
  const receipts = readCompletedPrefix(run, value);
  const children = receipts.filter(row => row.childLaunchAttempted);
  check(value.anyChildLaunchAttempted === (children.length > 0)
    && value.groupConsumed === (children.length > 0)
    && value.firstConsumedCommandId === (children[0]?.command ?? null)
    && receipts.every(row => typeof row.childLaunchAttempted === 'boolean'
      && row.childLaunchAttempted === !NONCHILD_GROUP_COMMANDS.has(run.group.commands.find(command => command.id === row.command).result.kind)),
    'pause cannot erase a prior child launch or fabricate a consuming in-process fixture');
  check(children[0]?.helperPid === groupClock.value.helperPid && children[0]?.command === groupClock.value.commandId,
    'first actual helper clock does not match the first child receipt');
  if (value.groupConsumed) {
    const marker = boundRecord(run.startedMarker);
    check(marker.sha256 === value.startedMarkerSha256 && marker.value.attemptId === value.attemptId
      && marker.value.runId === run.window.runId && marker.value.group === run.group.id
      && marker.value.requestedAt === value.requestedAt && marker.value.actualStartedAt === null && marker.value.deadline === null
      && marker.sha256 === groupClock.value.startedMarkerSha256 && eq(marker.value.requestRecord, run.requestRecord)
      && marker.value.commandId === value.firstConsumedCommandId
      && eq(stableAuthority(marker.value.authority), stableAuthority(run.authority)),
      'original consumed-group marker differs');
  } else check(!fs.existsSync(run.startedMarker), 'unstarted pause has a contradictory consumed marker');
  if (value.parentPause) {
    const parent = boundRecord(value.parentPause.path);
    canonicalEvidencePath(run, value.parentPause.path,
      path.join(run.evidence, `${run.group.id}-${parent.value.attemptId}-${parent.value.invocationId}.paused.json`));
    check(hash(fs.readFileSync(value.parentPause.path)) === value.parentPause.sha256, 'prior pause chain bytes differ');
    const usedByParent = boundRecord(pauseUsedPath(run, value.parentPause.sha256));
    check(usedByParent.value.invocationId === value.invocationId
      && eq(usedByParent.value.attemptRecord, { path: value.controlRecords.attemptPath, sha256: value.controlRecords.attemptSha256 })
      && eq(usedByParent.value.parentPause, value.parentPause), 'pause chain does not match the actual exclusive prior resume');
  }
  check(Number.isSafeInteger(value.handshakeWaitSpentMs) && value.handshakeWaitSpentMs >= 0,
    'prior cumulative handshake charge missing');
  restoreArtifactRecord(run, value);
  Object.assign(run, { attemptId: value.attemptId, groupConsumed: value.groupConsumed,
    firstConsumedCommandId: value.firstConsumedCommandId, startedMarkerSha256: value.startedMarkerSha256,
    originalStartedAt: value.startedAt, deadline: Date.parse(value.deadline), nextCommandIndex: value.continuation.nextCommandIndex,
    actualStartedAt: value.actualStartedAt, groupClock: value.groupClock, anyActualChildStarted: true,
    handshakeWaitSpentMs: value.handshakeWaitSpentMs,
    parentPause: { path: record.path, sha256: record.sha256 }, resumeUseMarker: used });
  run.restoredReceipts = receipts;
  run.originalAttemptRecord = value.originalAttemptRecord;
  run.validatedPause = true;
  if (Date.now() >= run.deadline || run.authorityStartedAt > Date.parse(value.latestResumeStartAt)) {
    const error = nonconsumingAdmission('validated started pause exhausted its original deadline or finite resume-start allowance', false);
    error.code = 'STARTED_PAUSE_TIME_EXHAUSTED'; error.terminalProgress = true; throw error;
  }
  check(run.admission.materialChange?.sinceRefusalSha256 === record.sha256
    && Date.parse(run.admission.materialChange.at) > Date.parse(value.finishedAt)
    && typeof run.admission.materialChange.description === 'string' && run.admission.materialChange.description.trim().length > 0,
    'explicit resume requires exact pause-bound material change and remaining authority');
  return receipts;
}
function invocationBudgetState(run) {
  const spent = fs.readdirSync(run.evidence).filter(name => name.endsWith('.attempt.json')).length;
  const terminalGroups = [];
  const remainingGroups = run.window.groups.filter(id => {
    const file = path.join(run.evidence, id + '.group.json');
    if (!fs.existsSync(file)) return true;
    const record = boundRecord(file);
    check(record.value.manifestSha256 === run.manifest._digest
      && record.value.authority?.windowSha256 === run.authority.windowSha256, 'other group receipt belongs to a different window');
    if (!(record.value.dependencyAccepted === true && record.value.cleanupProven === true)) {
      terminalGroups.push(id); return true;
    }
    return false;
  });
  return { spentBefore: spent, unfinishedGroups: remainingGroups, maximumInvocations: run.window.maximumAttempts,
    terminalGroups, futureInvocationFits: terminalGroups.length === 0 && spent + remainingGroups.length <= run.window.maximumAttempts,
    requiredTotalForNextInvocationAndUnfinishedPlan: spent + remainingGroups.length,
    rule: 'AUTHORING_PROPOSAL: EACH_EXPLICIT_INVOCATION_ONE_ADMISSION_ATTEMPT; COMMAND_HANDSHAKES_WITHIN_IT_DO_NOT_ADD_INVOCATIONS' };
}
function assertInvocationBudget(run) {
  const state = invocationBudgetState(run);
  if (state.terminalGroups.length) {
    const error = nonconsumingAdmission('a terminal failed group prevents completing this frozen window plan', false);
    error.code = 'RUN_STOPPED_BY_TERMINAL_GROUP'; error.terminalProgress = true; throw error;
  }
  if (!state.futureInvocationFits) {
    const error = nonconsumingAdmission('remaining admission budget cannot cover current invocation and every unfinished selected group', false);
    error.code = 'INVOCATION_BUDGET_EXHAUSTED'; error.terminalProgress = true; throw error;
  }
  return state;
}
// Failed launch diagnostics are not completed commands. Fresh reentry must bind
// the exact absence witness, while preserving the published admission charge.
function hasProvenZeroLaunch(run, value) {
  if (value.anyChildLaunchAttempted === false) return true;
  const pointer = value.noHelperSpawnProof;
  if (!pointer || !DIGEST.test(pointer.sha256 ?? '')) return false;
  canonicalEvidencePath(run, pointer.path, path.join(run.evidence,
    value.group + '-' + value.invocationId + '.no-helper-spawn.json'));
  const proof = boundRecord(pointer.path), p = proof.value;
  return proof.sha256 === pointer.sha256 && p.schemaVersion === 'quick-order-no-helper-spawn-v1'
    && p.runId === run.window.runId && p.group === run.group.id && p.invocationId === value.invocationId
    && p.attemptId === value.attemptId && p.command === run.group.commands[value.continuation.nextCommandIndex]?.id
    && p.manifestSha256 === run.manifest._digest && eq(stableAuthority(p.authority), stableAuthority(run.authority))
    && p.attemptRecord?.path === value.controlRecords.attemptPath
    && p.attemptRecord?.sha256 === value.controlRecords.attemptSha256
    && p.spawnCalled === true && p.helperSpawnObserved === false && p.helperPid === null
    && p.noSubjectOutputs === true && p.cleanupProven === true && p.commandCompleted === false
    && (p.synchronousArgumentRefusal === true && ['ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE', 'ERR_OUT_OF_RANGE', 'ERR_INVALID_OPT_VALUE'].includes(p.errorCode)
      || p.asynchronousStartRefusal === true && p.closeObserved === true
        && ['ENOENT', 'EACCES', 'EPERM', 'EMFILE', 'ENFILE', 'ENOMEM', 'EAGAIN'].includes(p.errorCode));
}
function assertFreshGroupStart(run) {
  check(!fs.existsSync(run.startedMarker), 'group already started; require its clean immutable pause, never repeat commands');
  check(!fs.existsSync(path.join(run.evidence, run.group.id + '.group.json')), 'terminal group result cannot restart');
  const names = fs.readdirSync(run.evidence).filter(name => name.startsWith(run.group.id + '-'));
  requirePriorEvidence(!names.some(name => name.endsWith('.launch-clock.json')),
    'retained actual launch clock without usable marker/result; never fresh-start a consumed group');
  check(!names.some(name => name.endsWith('.paused.json')), 'prior child progress requires exact --resume, never a fresh group');
  const records = names.filter(name => name.endsWith('.nonconsuming.json') || name.endsWith('.resume-refused.json'))
    .map(name => boundRecord(path.join(run.evidence, name)));
  for (const name of names.filter(name => /\.[a-f0-9]{24}\.pending$/.test(name))) {
    requirePriorEvidence(fs.existsSync(path.join(run.evidence, name.replace(/\.[a-f0-9]{24}\.pending$/, ''))),
      'unpublished prior evidence remains; missing Temp publication is sticky uncertainty');
  }
  const progress = names.filter(name => name.endsWith('.attempt.json') || name.endsWith('.in-process.json')
    || name.endsWith('.launch-clock.json') || fs.lstatSync(path.join(run.evidence, name)).isDirectory()
    || name.endsWith('.unconsumed-marker.json') || name.endsWith('.no-launch.json'));
  requirePriorEvidence(records.length > 0 || progress.length === 0,
    'prior attempt, receipt folder or archive without its refusal record; lost Temp evidence cannot restart');
  if (records.length === 0) return [];
  for (const record of records) {
    const value = record.value;
    canonicalEvidencePath(run, record.path, path.join(run.evidence, `${run.group.id}-${value.invocationId}`
      + (record.path.endsWith('.resume-refused.json') ? '.resume-refused.json' : '.nonconsuming.json')));
    requirePriorEvidence(value.cleanupProven === true && value.evidenceUncertain === false
      && value.inFlightCommand === null && value.groupConsumed === false && hasProvenZeroLaunch(run, value),
      'prior refusal has unknown cleanup or child consumption; preserve sticky uncertainty');
    check(value.runId === run.window.runId && value.group === run.group.id && value.manifestSha256 === run.manifest._digest
      && /^[a-f0-9]{24}$/.test(value.attemptId ?? '') && /^[a-f0-9]{24}$/.test(value.invocationId ?? '')
      && eq(stableAuthority(value.authority), stableAuthority(run.authority)) && value.cleanupProven === true
      && value.groupConsumed === false && hasProvenZeroLaunch(run, value) && value.anyActualChildStarted === false
      && value.actualStartedAt === null && value.startedAt === null && value.deadline === null && value.groupClock === null
      && value.inFlightCommand === null && value.evidenceUncertain === false && Array.isArray(value.receipts)
      && value.receipts.every(row => row.childLaunchAttempted === false),
      'only clean non-consuming admission refusal with bound in-process progress permits qualified restart');
    if (value.fixtureFailure === true || value.restartForbidden === true || value.terminalProgress === true) {
      const error = new Error('REFUSED: prior refusal is not restart-eligible for this frozen run');
      error.code = value.fixtureFailure ? 'PRIOR_GENUINE_FIXTURE_FAILURE' : 'PRIOR_PERMANENT_REFUSAL';
      error.restartForbidden = true; throw error;
    }
    readInvocationWitness(run, value.controlRecords.invocationWitness, value.invocationId);
    check(Date.parse(run.window.approvedAt) <= Date.parse(value.invocationStartedAt)
      && Date.parse(value.invocationStartedAt) <= Date.parse(value.finishedAt) && Date.parse(value.finishedAt) <= Date.now(),
      'zero-launch refusal clocks are not anchored to a real invocation');
    check(value.requestRecord === null || eq(value.requestRecord, run.requestRecord), 'zero-launch prospective request differs');
  }
  const latest = records.sort((a, b) => Date.parse(b.value.finishedAt) - Date.parse(a.value.finishedAt)
    || Buffer.compare(Buffer.from(b.path), Buffer.from(a.path)))[0], value = latest.value;
  check(records.every(record => record.value.aggregateDeadline === new Date(run.aggregateDeadline).toISOString()
    && (record.value.requestRecord === null || record.value.attemptId === run.attemptId && record.value.requestedAt === run.requestedAt)),
    'zero-launch restart may not replace an initialized prospective identity or outer deadline');
  check(value.controlRecords.ownershipSha256 === run.ownershipSha256
    && value.controlRecords.preparationSha256 === run.preparationSha256,
    'zero-launch refusal ownership/preparation bytes differ');
  if (value.originalAttemptRecord) {
    ensureOwned(run.evidence, value.originalAttemptRecord.path);
    const original = boundRecord(value.originalAttemptRecord.path);
    canonicalEvidencePath(run, original.path, path.join(run.evidence, `${run.group.id}-${original.value.invocationId}.attempt.json`));
    check(original.sha256 === value.originalAttemptRecord.sha256 && original.value.attemptId === run.attemptId
      && original.value.runId === run.window.runId && original.value.group === run.group.id
      && original.value.manifestSha256 === run.manifest._digest && original.value.requestedAt === run.requestedAt
      && eq(original.value.requestRecord, run.requestRecord) && original.value.actualStartedAt === null
      && original.value.deadline === null && original.value.aggregateDeadline === value.aggregateDeadline
      && eq(stableAuthority(original.value.authority), stableAuthority(run.authority)),
      'zero-launch original invocation attempt bytes or deadlines differ');
  }
  const allowedInvocations = new Set(records.map(record => record.value.invocationId));
  for (const name of names.filter(name => name.endsWith('.attempt.json'))) {
    const attempt = boundRecord(path.join(run.evidence, name));
    requirePriorEvidence(allowedInvocations.has(attempt.value.invocationId) && attempt.value.attemptId === run.attemptId
      && records.some(record => record.value.controlRecords.attemptPath === attempt.path
        && record.value.controlRecords.attemptSha256 === attempt.sha256),
      'prior admission attempt lacks exact clean zero-launch refusal; no replay from missing markers');
  }
  const progressRecord = records.slice().sort((a, b) => b.value.receipts.length - a.value.receipts.length)[0];
  const receipts = readCompletedPrefix(run, progressRecord.value);
  check(records.every(record => record.value.receipts.every((row, index) => row.receiptSha256 === receipts[index]?.receiptSha256))
    && progressRecord.value.continuation.nextCommandIndex === receipts.length && receipts.length < run.group.commands.length,
    'zero-launch next-unexecuted index differs');
  const expectedInProcess = new Set(receipts.map(row => path.basename(row.receiptPath)));
  requirePriorEvidence(names.filter(name => name.endsWith('.in-process.json')).every(name => expectedInProcess.has(name)),
    'unbound in-process receipt must not be replayed');
  for (const name of names.filter(name => fs.lstatSync(path.join(run.evidence, name)).isDirectory())) {
    requirePriorEvidence([...allowedInvocations].some(id => name.endsWith('.no-launch-' + id)),
      'prior child receipt folder without permanent marker is sticky uncertainty');
  }
  Object.assign(run, { nextCommandIndex: receipts.length,
    handshakeWaitSpentMs: Math.max(...records.map(record => record.value.handshakeWaitSpentMs)),
    originalAttemptRecord: progressRecord.value.originalAttemptRecord
      ?? records.find(record => record.value.originalAttemptRecord)?.value.originalAttemptRecord ?? null,
    parentRefusal: { path: latest.path, sha256: latest.sha256 },
    qualifiedZeroLaunchRestart: true });
  check(Number.isSafeInteger(run.handshakeWaitSpentMs) && run.handshakeWaitSpentMs >= 0,
    'zero-launch cumulative handshake charge missing');
  run.restartProgressValidated = true;
  run.restoredReceipts = receipts;
  check(run.admission.materialChange?.sinceRefusalSha256 === latest.sha256
    && Date.parse(run.admission.materialChange.at) > Date.parse(value.finishedAt)
    && typeof run.admission.materialChange.description === 'string' && run.admission.materialChange.description.trim().length > 0,
    'qualified zero-launch restart needs exact raw refusal-bound material change');
  return receipts;
}

async function runGroup(options) {
  const run = loadRun(options), { group, evidence, manifest, window } = run;
  run.deadline = run.aggregateDeadline; // No group wall exists before an actual helper spawn.
  run.requestedAt = new Date(run.authorityStartedAt).toISOString();
  run.prelaunchStartedAt = new Date().toISOString(); run.actualStartedAt = null; run.originalStartedAt = null;
  run.groupClock = null; run.requestRecord = null; run.invocationWitness = null; run.anyActualChildStarted = false;
  run.startedMarker = path.join(evidence, group.id + '.started.json');
  run.invocationId = crypto.randomBytes(12).toString('hex');
  run.attemptId = run.invocationId; run.groupConsumed = false;
  run.firstConsumedCommandId = null; run.commandLaunchAttempted = false;
  run.markerWrittenByInvocation = false; run.nextCommandIndex = 0;
  run.completedCommands = new Set(); run.parentPause = null; run.parentRefusal = null;
  run.artifactSnapshot = null; run.artifactRecord = null; run.handshakeWaitSpentMs = 0;
  let before = null, after = null, failure = null, failureCode = null;
  let inFlightCommand = null, attemptRecorded = false, anyChildLaunchAttempted = false;
  let evidenceUncertain = false, admissionAccounting = null, pauseAllowed = false, preAttemptResumePreserved = false;
  let preAttemptRestartPreserved = false;
  let terminalProgress = false;
  let receipts = [];
  try {
    initializeInvocationHistory(run);
    assertContinuationSourceGate(group);
    if (run.resumePreview) {
      receipts = readPause(run);
      run.completedCommands = new Set(receipts.map(row => row.command));
      anyChildLaunchAttempted = receipts.some(row => row.childLaunchAttempted);
    } else {
      receipts = assertFreshGroupStart(run);
      run.completedCommands = new Set(receipts.map(row => row.command));
    }
    // All command holds are checked before the first admission attempt or fixture.
    for (const command of group.commands) {
      check(!command.hold && !(command.correctionHolds?.length), 'command explicitly HELD: ' + command.id);
    }
    assertDependencies(run);
    run.admissionFit = requireGroupTime(run);
    admissionAccounting = assertInvocationBudget(run);
    const attemptPath = path.join(evidence, group.id + '-' + run.invocationId + '.attempt.json');
    writeNew(attemptPath, {
      at: new Date().toISOString(), runId: window.runId, group: group.id, attemptId: run.attemptId, invocationId: run.invocationId,
      requestedAt: run.requestedAt, prelaunchStartedAt: run.prelaunchStartedAt, actualStartedAt: run.actualStartedAt,
      startedAt: run.actualStartedAt, deadline: run.actualStartedAt ? new Date(run.deadline).toISOString() : null,
      aggregateDeadline: new Date(run.aggregateDeadline).toISOString(), requestRecord: run.requestRecord,
      invocationWitness: run.invocationWitness, groupClock: run.groupClock,
      authority: run.authority, manifestSha256: manifest._digest, groupConsumed: run.groupConsumed,
      admissionAccounting, parentPause: run.parentPause, parentRefusal: run.parentRefusal, admissionFit: run.admissionFit,
      accounting: 'Authored proposal: one admission charge per explicit invocation, including resume; one stable group attempt; no command handshake adds another invocation; no owner policy or execution approval inferred.' });
    run.attemptRecord = { path: attemptPath, sha256: hash(fs.readFileSync(attemptPath)) }; attemptRecorded = true;
    run.originalAttemptRecord ??= run.attemptRecord;
    if (run.resumeUseMarker) writeNew(run.resumeUseMarker, { parentPause: run.parentPause,
      invocationId: run.invocationId, attemptRecord: run.attemptRecord, authority: run.authority,
      originalDeadline: new Date(run.deadline).toISOString(), disposition: 'EXCLUSIVE_RESUME_NO_BRANCHING_OR_REPEAT' });
    try { assertAdmission(run.admission, manifest, group, Date.now(), null, run); }
    catch (error) { error.code = 'NONCONSUMING_ADMISSION_REFUSAL'; throw error; }
    before = sourceState(run.cwd, manifest, groupWorkDeadline(run), run.artifactSnapshot, run.preparedSourceInventory, 'full');
    for (let index = run.nextCommandIndex; index < group.commands.length; index++) {
      const command = group.commands[index]; run.nextCommandIndex = index;
      check(!run.completedCommands.has(command.id), 'completed command must never run again');
      check(Date.now() < run.deadline, 'original group/aggregate/window deadline reached');
      sourceState(run.cwd, manifest, groupWorkDeadline(run), run.artifactSnapshot, run.preparedSourceInventory, 'pinned');
      if (command.result.kind === 'admission-refusal-self-test') {
        // This is not a child launch/admission/continuation and does not consume a group.
        let reason = null;
        try { assertAdmission({ ...run.admission, observedAt: new Date().toISOString(), availableMiB: 0, freeDiskGiB: 0 },
          manifest, group, Date.now(), null, run); } catch (error) { reason = error.message; }
        if (reason !== 'REFUSED: RAM or disk admission floor not met') {
          const error = new Error('REFUSED: refusal fixture did not establish intended cause');
          error.fixtureFailure = true; error.code = 'GENUINE_IN_PROCESS_FIXTURE_FAILURE'; throw error;
        }
        run.fixtureResultUnpublished = true;
        const receipt = { group: group.id, command: command.id, attemptId: run.attemptId, invocationId: run.invocationId,
          attemptRecord: run.attemptRecord, manifestSha256: manifest._digest,
          invocationWitness: run.invocationWitness, requestRecord: run.requestRecord, groupClock: run.groupClock,
          cleanupProven: true, authority: run.authority, childLaunchAttempted: false,
          subjectMemory: { status: 'NOT_APPLICABLE_NO_SUBJECT_JOB', peakCommittedBytes: null, limitBytes: null,
            reason: 'In-process supervisor assertion; no subject child was started.' },
          disposition: { runnerVerdict: 'SELF_TEST_EXPECTATION_MET', dependencyDisposition: 'GREEN', reason, childrenStarted: 0 } };
        const receiptPath = path.join(evidence, `${group.id}-${run.attemptId}-${command.id}.in-process.json`);
        writeNew(receiptPath, receipt);
        receipts.push({ ...receipt, receiptPath, receiptSha256: hash(fs.readFileSync(receiptPath)) });
        run.fixtureResultUnpublished = false;
        run.completedCommands.add(command.id); run.nextCommandIndex = index + 1;
        continue;
      }
      if (command.result.kind === 'parser-self-test') {
        let result;
        try { result = runParserSelfTests(manifest); }
        catch (error) { error.fixtureFailure = true; error.code = 'GENUINE_IN_PROCESS_FIXTURE_FAILURE'; throw error; }
        run.fixtureResultUnpublished = true;
        const receipt = { group: group.id, command: command.id, attemptId: run.attemptId, invocationId: run.invocationId,
          attemptRecord: run.attemptRecord, manifestSha256: manifest._digest,
          invocationWitness: run.invocationWitness, requestRecord: run.requestRecord, groupClock: run.groupClock,
          cleanupProven: true, authority: run.authority, childLaunchAttempted: false,
          subjectMemory: { status: 'NOT_APPLICABLE_NO_SUBJECT_JOB', peakCommittedBytes: null, limitBytes: null,
            reason: 'In-process supervisor parser fixture; no subject child was started.' },
          disposition: { runnerVerdict: 'SELF_TEST_EXPECTATION_MET', dependencyDisposition: 'GREEN', result, childrenStarted: 0 } };
        const receiptPath = path.join(evidence, `${group.id}-${run.attemptId}-${command.id}.in-process.json`);
        writeNew(receiptPath, receipt);
        receipts.push({ ...receipt, receiptPath, receiptSha256: hash(fs.readFileSync(receiptPath)) });
        run.fixtureResultUnpublished = false;
        run.completedCommands.add(command.id); run.nextCommandIndex = index + 1;
        continue;
      }
      requireCommandTime(run, command);
      await requestCommandAdmission(run, command, run.deadline - group.timeBudget.finalizationMs);
      requireCommandTime(run, command);
      inFlightCommand = command.id; run.commandLaunchAttempted = false; run.noHelperSpawnProof = null;
      const receipt = await executeOwned(command, run, run.deadline - group.timeBudget.finalizationMs - Date.now());
      anyChildLaunchAttempted ||= run.commandLaunchAttempted;
      const receiptPath = receipt.receiptPath ?? path.join(evidence, `${group.id}-${run.attemptId}-${command.id}`, 'receipt.json');
      ensureOwned(evidence, receiptPath);
      check(hash(fs.readFileSync(receiptPath)) === receipt.receiptSha256, 'returned child receipt raw bytes differ; preserve uncertainty');
      inFlightCommand = null; receipts.push({ ...receipt, receiptPath, childLaunchAttempted: run.commandLaunchAttempted });
      check(receipt.cleanupProven === true, 'owned process or stream cleanup unresolved; reservation remains held');
      check(receipt.disposition.runnerVerdict !== 'ABORTED_OR_UNEXPECTED', receipt.disposition.reason ?? 'unexpected run failure');
      if (group.id === 'G7' && command.id === 'build' && receipt.disposition.runnerVerdict === 'PASSED') {
        run.artifactSnapshot = ownedArtifactInventory(run.cwd, run.deadline);
        const artifactPath = path.join(evidence, 'G7-build-artifacts.json');
        writeNew(artifactPath, { authority: run.authority, attemptId: run.attemptId, invocationId: run.invocationId,
          manifestSha256: manifest._digest, source: manifest.source, files: run.artifactSnapshot,
          status: 'BUILD_OUTPUTS_ONLY_NOT_PROTECTION_OR_RELEASE_ACCEPTANCE' });
        run.artifactRecord = { path: artifactPath, sha256: hash(fs.readFileSync(artifactPath)) };
      }
      sourceState(run.cwd, manifest, groupWorkDeadline(run), run.artifactSnapshot, run.preparedSourceInventory, 'pinned');
      check(['GREEN', 'EXACT_PREDECLARED_RED_ONLY', 'PROTECTION_FAILURE_RETAINED_ARTIFACTS_INDEPENDENT'].includes(receipt.disposition.dependencyDisposition),
        'unexpected runner verdict stops later commands');
      run.completedCommands.add(command.id); run.nextCommandIndex = index + 1;
    }
  } catch (error) {
    if (!run.invocationWitness && error.initialPublicationFailure && error.initialPublicationAbsent
      && !error.evidenceUncertain && !run.commandLaunchAttempted && !attemptRecorded) {
      // No command or attempt exists. Do not create a malformed refusal pointing
      // to a missing invocation witness. Preserve the failed metadata separately.
      releaseRunLock(run, 'INITIAL_INVOCATION_PUBLICATION_REFUSED_NO_NEW_ATTEMPT_OR_COMMAND');
      process.stdout.write(JSON.stringify({ group: group.id, executionState: 'INITIAL_METADATA_REFUSED',
        failure: error.message, unpublishedArchives: error.unpublishedArchives,
        newCommands: 0, newAdmissionAttempts: 0, priorGroupState: 'UNCHANGED',
        restartEligible: false, nextAction: 'Correct record-storage failure; revalidate original authority and prior history on explicit invocation.' }) + '\n');
      process.exitCode = 1; return;
    }
    run.initialRecordFailureNoAttempt = error.initialPublicationFailure === true
      && error.initialPublicationAbsent === true && !error.evidenceUncertain
      && !run.requestRecord && !attemptRecorded && !run.commandLaunchAttempted;
    failure = error.message; failureCode = error.code ?? null;
    terminalProgress = error.terminalProgress === true;
    run.fixtureFailure = error.fixtureFailure === true;
    run.restartForbidden = error.restartForbidden === true;
    evidenceUncertain ||= error.evidenceUncertain === true || run.fixtureResultUnpublished === true || run.clockWitnessUncertain === true;
    preAttemptResumePreserved = Boolean(run.resumePreview && run.parentPause && !attemptRecorded && !terminalProgress);
    preAttemptRestartPreserved = Boolean(run.restartProgressValidated && !attemptRecorded && !terminalProgress);
    if (preAttemptResumePreserved || preAttemptRestartPreserved) {
      receipts = run.restoredReceipts ?? receipts;
      anyChildLaunchAttempted = receipts.some(row => row.childLaunchAttempted);
    }
    if (!attemptRecorded && run.restoredReceipts) receipts = run.restoredReceipts;
    pauseAllowed = error.pauseAllowed !== false;
    anyChildLaunchAttempted ||= run.commandLaunchAttempted;
    if (!run.commandLaunchAttempted || run.noHelperSpawnProof) inFlightCommand = null;
    // Prior in-process receipt count is irrelevant to the proof that no spawn
    // was attempted. An ambiguous marker archive is sticky evidence uncertainty.
    if ((!anyChildLaunchAttempted || run.noHelperSpawnProof) && !run.anyActualChildStarted
      && run.markerWrittenByInvocation && fs.existsSync(run.startedMarker)) {
      try {
        const marker = boundRecord(run.startedMarker);
        check(marker.value.runId === window.runId && marker.value.group === group.id
          && marker.value.attemptId === run.attemptId && marker.value.manifestSha256 === manifest._digest,
          'pre-launch marker ownership ambiguous; hold');
        writeNew(path.join(evidence, group.id + '-' + run.invocationId + '.no-launch.json'), {
          markerSha256: marker.sha256, authority: run.authority, reason: failure,
          noSpawnCalled: !run.commandLaunchAttempted, noHelperSpawnProof: run.noHelperSpawnProof ?? null,
          noChildCommandExecuted: true, inProcessReceiptCount: receipts.length, groupConsumed: false });
        fs.renameSync(run.startedMarker, path.join(evidence, group.id + '-' + run.invocationId + '.unconsumed-marker.json'));
        run.groupConsumed = false; run.firstConsumedCommandId = null;
        run.startedMarkerSha256 = null;
      } catch (archiveError) {
        evidenceUncertain = true; failure += '; marker preservation unresolved: ' + archiveError.message;
      }
    }
    if ((!run.commandLaunchAttempted || run.noHelperSpawnProof) && run.preLaunchFolder?.invocationId === run.invocationId) {
      try {
        const source = run.preLaunchFolder.path, destination = source + '.no-launch-' + run.invocationId;
        ensureOwned(evidence, source); ensureOwned(evidence, destination);
        check(!fs.existsSync(destination), 'owned pre-launch archive already exists');
        fs.renameSync(source, destination); // Preserve only this invocation's never-launched outputs.
        run.preLaunchFolder = null;
      } catch (archiveError) { evidenceUncertain = true; failure += '; pre-launch output preservation unresolved: ' + archiveError.message; }
    }
  }
  if (!preAttemptResumePreserved && !preAttemptRestartPreserved && (before || (run.resumePreview && attemptRecorded))) {
    try { after = sourceState(run.cwd, manifest, groupWorkDeadline(run), run.artifactSnapshot, run.preparedSourceInventory, 'full'); }
    catch (error) {
      failure ??= error.message;
      run.finalizationFailure = error.message;
      run.primaryFailureCode = failureCode;
      failureCode = error.code ?? 'FINALIZATION_INSPECTION_FAILED_NOT_RESUMABLE';
      pauseAllowed = false;
    }
  }
  const cleanupProven = !evidenceUncertain && inFlightCommand === null && receipts.every(receipt => receipt.cleanupProven);
  let dependencyAccepted = !failure && receipts.length === group.commands.length && cleanupProven && after !== null;
  const finishedAt = new Date().toISOString(), finishedMs = Date.parse(finishedAt);
  const pauseFit = remainingGroupBudget(run, finishedMs, true);
  let futureAdmission;
  try { futureAdmission = invocationBudgetState(run); }
  catch (error) {
    futureAdmission = { futureInvocationFits: false, inspectionFailure: error.message };
    run.primaryFailureCode ??= failureCode;
    failure ??= error.message; failureCode = 'INVOCATION_BUDGET_INSPECTION_FAILED'; dependencyAccepted = false;
  }
  const limits = [];
  const futureDeadline = run.actualStartedAt ? run.deadline : Math.min(finishedMs + group.wallMs, run.aggregateDeadline);
  if (futureDeadline - finishedMs < pauseFit.totalMs) limits.push(run.actualStartedAt ? 'STARTED_GROUP_TIME_EXHAUSTED' : 'AGGREGATE_WINDOW_TIME_EXHAUSTED');
  if (!remainingHandshakeCapacity(run)) limits.push('HANDSHAKE_CAPACITY_EXHAUSTED');
  if (!futureAdmission.futureInvocationFits) limits.push(futureAdmission.terminalGroups?.length ? 'RUN_STOPPED_BY_TERMINAL_GROUP'
    : futureAdmission.inspectionFailure ? 'INVOCATION_BUDGET_UNVERIFIED' : 'INVOCATION_BUDGET_EXHAUSTED');
  const allowance = group.continuationPolicy.resumeStartAllowanceMs;
  const latestResumeStartAt = run.actualStartedAt && group.id !== 'G0'
    ? new Date(Math.min(finishedMs + allowance, run.deadline - pauseFit.totalMs)).toISOString() : null;
  const actualStartGapFits = run.actualStartedAt && run.deadline - finishedMs >= pauseFit.totalMs + allowance;
  if (run.actualStartedAt && group.id !== 'G0' && run.nextCommandIndex < group.commands.length && !actualStartGapFits)
    limits.push('FINITE_RESUME_START_ALLOWANCE_DOES_NOT_FIT');
  const paused = group.id !== 'G0' && anyChildLaunchAttempted && run.groupConsumed && pauseAllowed && attemptRecorded
    && failureCode === 'NONCONSUMING_ADMISSION_REFUSAL' && cleanupProven && after !== null
    && run.nextCommandIndex === receipts.length && run.nextCommandIndex < group.commands.length
    && limits.length === 0 && actualStartGapFits;
  if (failure && run.validatedPause && run.actualStartedAt && limits.some(limit =>
    ['STARTED_GROUP_TIME_EXHAUSTED', 'HANDSHAKE_CAPACITY_EXHAUSTED', 'INVOCATION_BUDGET_EXHAUSTED',
      'RUN_STOPPED_BY_TERMINAL_GROUP', 'FINITE_RESUME_START_ALLOWANCE_DOES_NOT_FIT'].includes(limit))) {
    terminalProgress = true; preAttemptResumePreserved = false;
  }
  const terminalStartedResume = Boolean(run.resumePreview && run.validatedPause && run.actualStartedAt
    && run.groupConsumed && terminalProgress);
  const resumeRefusal = Boolean(run.resumePreview && !attemptRecorded && !terminalStartedResume);
  const launchAttemptUncertain = Boolean(run.commandLaunchAttempted && !run.noHelperSpawnProof && !run.anyActualChildStarted);
  const priorConsumptionNotRestored = fs.existsSync(run.startedMarker) && !run.actualStartedAt
    && !run.markerWrittenByInvocation;
  const cleanZeroLaunchRefusal = Boolean(failure && (!anyChildLaunchAttempted || run.noHelperSpawnProof) && !run.anyActualChildStarted
    && !run.groupConsumed && !priorConsumptionNotRestored && cleanupProven && !run.fixtureFailure
    && !run.restartForbidden
    && run.nextCommandIndex === receipts.length && run.invocationWitness);
  const restartEligible = cleanZeroLaunchRefusal && !terminalProgress && limits.length === 0;
  const restartRequiresFreshInspection = cleanZeroLaunchRefusal && !terminalProgress
    && Boolean(futureAdmission.inspectionFailure);
  const artifactCommands = receipts.filter(row => ['build', 'no-em-dash-build'].includes(row.command));
  const artifactAccepted = group.id === 'G7' && artifactCommands.length === 2 && artifactCommands.every(row =>
    row.cleanupProven && row.disposition.runnerVerdict === 'PASSED') && after !== null && run.artifactSnapshot !== null;
  const result = { schemaVersion: paused ? 'quick-order-paused-continuation-v1' : 'quick-order-group-result-v1',
    runId: window.runId, group: group.id, manifestSha256: manifest._digest, authority: run.authority,
    g0Acceptance: run.g0Acceptance ?? null, releaseAcceptance: false,
    initialPublicationRecoveries: run.initialPublicationRecoveries,
    controlRecords: { ownershipSha256: run.ownershipSha256 ?? null, preparationSha256: run.preparationSha256 ?? null,
      attemptPath: run.attemptRecord?.path ?? null, attemptSha256: run.attemptRecord?.sha256 ?? null,
      invocationWitness: run.invocationWitness },
    requestedAt: run.requestedAt, prelaunchStartedAt: run.prelaunchStartedAt, actualStartedAt: run.actualStartedAt,
    startedAt: run.actualStartedAt, invocationStartedAt: new Date(run.authorityStartedAt).toISOString(), finishedAt,
    attemptId: run.attemptId, invocationId: run.invocationId, attemptConsumed: attemptRecorded,
    groupConsumed: priorConsumptionNotRestored || launchAttemptUncertain ? null : run.groupConsumed,
    priorGroupState: priorConsumptionNotRestored ? 'PRIOR_GROUP_CONSUMPTION_NOT_RESTORED'
      : launchAttemptUncertain ? 'CURRENT_INVOCATION_LAUNCH_UNRESOLVED' : run.groupConsumed ? 'ACTUALLY_STARTED' : 'UNSTARTED',
    invocationWitness: run.invocationWitness, requestRecord: run.requestRecord, groupClock: run.groupClock,
    originalAttemptRecord: run.originalAttemptRecord ?? null,
    admissionAccounting, startedMarkerSha256: run.startedMarkerSha256 ?? null, parentPause: run.parentPause, parentRefusal: run.parentRefusal,
    handshakeWaitSpentMs: run.handshakeWaitSpentMs, continuationFit: pauseFit, restartEligible,
    cleanZeroLaunchRefusal, restartRequiresFreshInspection, terminalProgress, terminalStartedResume, futureAdmission, eligibilityLimits: limits,
    noHelperSpawnProof: run.noHelperSpawnProof ?? null, restartForbidden: run.restartForbidden === true,
    latestResumeStartAt: paused ? latestResumeStartAt : null, resumeStartAllowanceMs: allowance,
    aggregateDeadline: new Date(run.aggregateDeadline).toISOString(), staticTimeBudget: run.staticTimeBudget,
    anyChildLaunchAttempted, anyActualChildStarted: run.anyActualChildStarted, firstConsumedCommandId: run.firstConsumedCommandId,
    reservation: run.reservation, admission: run.admission, deadline: run.actualStartedAt ? new Date(run.deadline).toISOString() : null,
    before, after, receipts: receipts.map(row => ({ command: row.command, disposition: row.disposition,
      attemptId: row.attemptId, invocationId: row.invocationId, attemptRecord: row.attemptRecord,
      cleanupProven: row.cleanupProven, childLaunchAttempted: row.childLaunchAttempted,
      receiptPath: row.receiptPath ?? null, receiptSha256: row.receiptSha256 ?? null, authority: row.authority,
      subjectMemory: row.subjectMemory, outsideSubjectJob: row.outsideSubjectJob ?? null })),
    failure, failureCode, primaryFailureCode: run.primaryFailureCode ?? null,
    finalizationFailure: run.finalizationFailure ?? null, fixtureFailure: run.fixtureFailure === true,
    inFlightCommand, evidenceUncertain, dependencyAccepted, cleanupProven,
    executionState: launchAttemptUncertain ? 'LAUNCH_ATTEMPTED_SPAWN_NOT_ESTABLISHED_CLEANUP_UNCERTAIN'
      : !cleanupProven ? 'CLEANUP_UNCERTAIN' : dependencyAccepted ? 'COMPLETED'
      : paused ? 'STARTED_PARTIAL_PAUSED' : priorConsumptionNotRestored ? 'REQUEST_REFUSED_PRIOR_GROUP_STATE_UNCHANGED'
        : !run.groupConsumed ? 'UNSTARTED_REFUSED'
        : preAttemptResumePreserved ? 'PARTIAL_PROGRESS_PRESERVED_CURRENT_INVOCATION_REFUSED' : 'STARTED_TERMINAL',
    artifacts: group.id === 'G7' ? { inventory: run.artifactSnapshot, inventoryRecord: run.artifactRecord, artifactDependencyAccepted: artifactAccepted,
      verdicts: receipts.map(row => ({ command: row.command, disposition: row.disposition })),
      note: 'Artifact acceptance never erases failed em-dash/protection verdicts or authorizes a release.' } : null,
    reservationDisposition: !cleanupProven ? 'HELD_UNRESOLVED_PROCESS_STREAM_OR_EVIDENCE_CLEANUP'
      : priorConsumptionNotRestored ? 'CURRENT_INVOCATION_REFUSED_PRIOR_GROUP_STATE_UNCHANGED'
      : resumeRefusal ? 'CURRENT_INVOCATION_RESUME_REFUSED_PRIOR_GROUP_STATE_UNCHANGED'
      : preAttemptRestartPreserved ? 'RESTART_REFUSED_BEFORE_ADMISSION_PRIOR_ZERO_LAUNCH_PROGRESS_PRESERVED'
      : paused ? 'PAUSED_NEXT_CHILD_NOT_LAUNCHED_CLEANUP_PROVEN_COORDINATOR_CAN_RELEASE'
        : restartEligible ? 'NONCONSUMING_UNSTARTED_REFUSAL_BOUND_PREFIX_FUTURE_ACTUAL_START_ONLY'
        : restartRequiresFreshInspection ? 'NONCONSUMING_UNSTARTED_RESTARTABILITY_UNVERIFIED_FRESH_INSPECTION_REQUIRED'
        : cleanZeroLaunchRefusal ? 'NONCONSUMING_UNSTARTED_NOT_RESTARTABLE_SEE_ELIGIBILITY_LIMITS'
        : run.groupConsumed && failure ? 'TERMINAL_GROUP_FAILURE_NO_COMMAND_REPEAT_CLEANUP_PROVEN'
        : 'OWNED_CHILD_ABSENCE_ESTABLISHED_COORDINATOR_CAN_RELEASE',
    continuation: { status: paused ? 'PAUSED_BEFORE_NEXT_CHILD_ADMISSION' : dependencyAccepted ? 'COMPLETE'
      : priorConsumptionNotRestored || resumeRefusal && !cleanZeroLaunchRefusal ? 'PRIOR_GROUP_STATE_UNCHANGED_NO_NEW_ATTEMPT'
      : preAttemptResumePreserved ? 'PRIOR_PAUSE_PRESERVED_NO_NEW_ATTEMPT'
        : preAttemptRestartPreserved ? 'PRIOR_ZERO_LAUNCH_PROGRESS_PRESERVED_NO_NEW_ATTEMPT'
        : restartEligible ? 'NONCONSUMING_UNSTARTED_MATERIAL_CHANGE_RESTART_ONLY'
          : restartRequiresFreshInspection ? 'UNSTARTED_EXPLICIT_REENTRY_REQUIRES_MATERIAL_CHANGE_AND_FRESH_INSPECTION'
          : cleanZeroLaunchRefusal ? 'NONCONSUMING_UNSTARTED_NOT_RESTARTABLE_SEE_ELIGIBILITY_LIMITS' : 'TERMINAL_NO_AUTOMATIC_REPEAT',
      protocol: 'IMMUTABLE_PAUSE_CHAIN_V1', nextCommandIndex: run.nextCommandIndex,
      nextCommandId: group.commands[run.nextCommandIndex]?.id ?? null, automaticResume: false,
      repeatConsumedCommandAllowed: false, groupAttemptUnchanged: true,
      admissionAccountingDecision: 'CONSERVATIVE_SOURCE_PROPOSAL_PER_EXPLICIT_INVOCATION_CAP9_REQUIRES_REVIEW_AND_FRESH_ACTUAL_DECISION' },
    sourceDecision: 'SOURCE_PREPARATION_NOT_EXECUTION_OR_RELEASE_ACCEPTANCE' };
  const resultPath = path.join(evidence, paused ? group.id + '-' + run.attemptId + '-' + run.invocationId + '.paused.json'
    : launchAttemptUncertain ? group.id + '-' + run.invocationId + '.launch-unresolved.json'
    : terminalStartedResume ? group.id + '.group.json'
    : resumeRefusal ? group.id + '-' + run.invocationId + '.resume-refused.json'
      : preAttemptRestartPreserved ? group.id + '-' + run.invocationId + '.restart-refused.json'
      : run.groupConsumed ? group.id + '.group.json' : group.id + '-' + run.invocationId + '.nonconsuming.json');
  if (run.initialRecordFailureNoAttempt && !attemptRecorded && receipts.length === 0
    && !run.commandLaunchAttempted && !run.resumePreview
    && !run.startedMarkerSha256 && !evidenceUncertain && cleanupProven) {
    try { writeInitialRecord(resultPath, result); }
    catch (error) {
      if (!error.initialPublicationAbsent || error.evidenceUncertain) throw error;
      releaseRunLock(run, 'PRECOMMAND_REFUSAL_PUBLICATION_FAILED_NO_NEW_ATTEMPT_OR_COMMAND');
      process.stdout.write(JSON.stringify({ group: group.id, executionState: 'PRECOMMAND_RECORD_STORAGE_REFUSED',
        failure, recordFailure: error.message, newCommands: 0, newAdmissionAttempts: 0,
        priorGroupState: 'UNCHANGED', receiptPublished: false, restartEligible: false,
        nextAction: 'Repair record storage, then explicitly revalidate original authority and every prior evidence binding.' }) + '\n');
      process.exitCode = 1; return;
    }
  } else writeNew(resultPath, result);
  // The permanent started marker/failed verdict still prevents command repeat.
  // Known cleanup permits releasing this invocation's lock, even on failure;
  // an ambiguous child, stream, receipt or marker remains sticky and held.
  if (cleanupProven) releaseRunLock(run, result.reservationDisposition);
  process.stdout.write(JSON.stringify({ group: group.id, groupConsumed: run.groupConsumed,
    dependencyAccepted, cleanupProven, failure, receipt: resultPath }) + '\n');
  process.exitCode = dependencyAccepted ? 0 : 1;
}

/** Authored fixtures, never observations of the pinned runners. G0 must run them
 * under separate authority before G1 can consume its single HTTP attempt. */
function runParserSelfTests(manifest) {
  const manifestEnvironments = assertManifestCommandEnvironments(manifest);
  const file = 'handler.test.mjs';
  const fixture = [
    'TAP version 13', '# Subtest: filtered skip', 'ok 1 - filtered skip # SKIP test name does not match pattern',
    '  ---', '  duration_ms: 0.1', '  ...', '# Subtest: selected pass', 'ok 2 - selected pass',
    '  ---', '  duration_ms: 0.2', '  ...', '# Subtest: selected fail', 'not ok 3 - selected fail',
    '  ---', '  duration_ms: 0.3', "  failureType: 'testCodeFailure'", "  error: 'literal dot segment'",
    "  code: 'ERR_ASSERTION'", "  name: 'AssertionError'", '  expected: 400', '  actual: 403',
    "  operator: 'strictEqual'", '  stack: |-', '    TestContext.<anonymous> (file:///C:/owned/handler.test.mjs:412:12)',
    '  ...', '1..3', '# tests 3', '# suites 0', '# pass 1', '# fail 1', '# cancelled 0', '# skipped 1', '# todo 0', '# duration_ms 0.6', '',
  ].join('\n');
  const contract = { targetFiles: [file], expectedCases: ['filtered skip', 'selected pass', 'selected fail'].map(name => ({ file, name, count: 1 })),
    expectedSkipped: [{ file, name: 'filtered skip', count: 1 }],
    expectedFailures: [{ file, name: 'selected fail', count: 1, cause: { sourcePath: file, sourceLine: 412,
      messageIncludes: ["failureType: 'testCodeFailure'", "code: 'ERR_ASSERTION'", "name: 'AssertionError'",
        "error: 'literal dot segment'", 'expected: 400', 'actual: 403', "operator: 'strictEqual'"] } }] };
  const classify = value => compareCaseSets(parseCases(value, 'node-tap', contract).rows, contract);
  check(classify(fixture).failed === 1, 'authored TAP positive fixture mismatch');
  const bad = [
    [fixture.replace('# fail 1', '# fail 0'), 'TAP final totals differ or are incomplete'],
    [fixture.slice(0, fixture.indexOf('1..3')), 'TAP truncated or missing plan'],
    [fixture + 'Bail out! unexpected interruption\n', 'unparsed TAP line, nested suite, bailout or trailing evidence'],
    [fixture.replace('ok 2 - selected pass', '    ok 2 - selected pass'), 'unparsed TAP line, nested suite, bailout or trailing evidence'],
    [fixture.replace("code: 'ERR_ASSERTION'", "code: 'ERR_MODULE_NOT_FOUND'"), 'RED failed for another cause or assertion'],
    [fixture.replace('actual: 403', 'actual: 500'), 'RED failed for another cause or assertion'],
    [fixture.replace('handler.test.mjs:412:12', 'handler.test.mjs:413:12'), 'RED failed for another cause or assertion'],
    [fixture.replace('ok 2 - selected pass', 'ok 2 - selected pass # TODO'), 'TAP todo refused'],
  ];
  for (const [input, expected] of bad) {
    let reason = null; try { classify(input); } catch (error) { reason = error.message; }
    check(reason === 'REFUSED: ' + expected, 'parser refusal fixture rejected for a different cause');
  }
  const duplicates = [{ file: 'sample.test.ts', name: 'duplicate', status: 'passed', failureMessages: [] },
    { file: 'sample.test.ts', name: 'duplicate', status: 'passed', failureMessages: [] }];
  check(compareCaseSets(duplicates, { expectedCases: [{ file: 'sample.test.ts', name: 'duplicate', count: 2 }], expectedFailures: [] }).passed === 2,
    'bound duplicate-title multiset fixture failed');
  const cwd = path.resolve('C:/owned'), testFile = path.join(cwd, 'sample.test.ts');
  const json = { numTotalTestSuites: 1, numPassedTestSuites: 1, numFailedTestSuites: 0, numPendingTestSuites: 0,
    numTotalTests: 2, numPassedTests: 2, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0, success: true,
    testResults: [{ name: testFile, message: '', status: 'passed', assertionResults: duplicates.map(() => ({
      ancestorTitles: [], title: 'duplicate', fullName: 'duplicate', status: 'passed', failureMessages: [] })) }] };
  const supplemental = { schemaVersion: 1, reason: 'passed', files: [{ file: testFile, suites: [{ id: 'root', name: '',
    parentId: null, mode: 'run', state: 'pass', errors: [] }] }], unhandledErrors: [] };
  check(parseVitestReport(json, supplemental, cwd).rows.length === 2, 'structured reporter fixture failed');
  const badSuite = structuredClone(supplemental); badSuite.files[0].suites[0].errors = ['afterAll cleanup failed'];
  let suiteReason = null; try { parseVitestReport(json, badSuite, cwd); } catch (error) { suiteReason = error.message; }
  check(suiteReason === 'REFUSED: suite/hook/afterAll or pending evidence refused', 'hook fixture refused for wrong cause');
  const badTotals = { ...json, numPassedTests: 1 };
  let totalsReason = null; try { parseVitestReport(badTotals, supplemental, cwd); } catch (error) { totalsReason = error.message; }
  check(totalsReason === 'REFUSED: JSON final total differs: numPassedTests', 'JSON totals fixture refused for wrong cause');
  function refuses(action, expected) {
    let reason = null; try { action(); } catch (error) { reason = error.message; }
    check(reason === 'REFUSED: ' + expected, 'negative fixture refused for a different cause: ' + expected);
  }
  // Pure authored controls. These fixtures neither retrieve consent nor observe
  // host policy; actual source/window comparison and opening facts stay external.
  const requiredTokens = { manifestSha256: 'a'.repeat(64), sourceCommit: 'b'.repeat(40), sourceTree: 'c'.repeat(40),
    supervisorSha256: 'd'.repeat(64), runId: 'qo-g0-a1', maximumAttempts: '9',
    approvedAt: '2026-10-08T12:00:00.000Z', expiresAt: '2026-10-08T13:00:00.000Z' };
  const decisionFixture = Object.entries(requiredTokens).map(([key, value]) => key + '=' + value).join(' ') + ' group=G0 group=G1';
  assertDecisionTokens(decisionFixture, requiredTokens, ['G0', 'G1']);
  assertDecisionTokens(decisionFixture + ' action=PREPARE', { ...requiredTokens, action: 'PREPARE' }, ['G0', 'G1']);
  refuses(() => assertDecisionTokens(decisionFixture.replace('runId=qo-g0-a1', 'runId=qo-g0-a1-retry'), requiredTokens, ['G0', 'G1']),
    'approval text lacks a complete exact labelled token: runId');
  refuses(() => assertDecisionTokens(decisionFixture.replace('group=G1', 'group=G1-G7'), requiredTokens, ['G0', 'G1']),
    'approval group tokens differ, repeat or form a range');
  refuses(() => assertDecisionTokens(decisionFixture + ' group=G1', requiredTokens, ['G0', 'G1']),
    'approval group tokens differ, repeat or form a range');
  refuses(() => assertDecisionTokens(decisionFixture + ' action=PREPARE', requiredTokens, ['G0', 'G1']),
    'unrequired preparation action token refused');
  const policyFixture = { effectivePolicies: ['MachinePolicy', 'UserPolicy', 'Process', 'CurrentUser', 'LocalMachine']
    .map(scope => ({ scope, policy: scope === 'LocalMachine' ? 'RemoteSigned' : 'Undefined' })),
    effectivePolicy: { scope: 'LocalMachine', policy: 'RemoteSigned' }, observedAt: '2026-10-08T11:59:00.000Z' };
  const policyManifest = { approvalTrust: { policyObservationContract: { maximumAgeMs: 300_000 } } };
  const policyOpening = Date.parse('2026-10-08T12:00:00.000Z');
  assertPolicyObservation(policyFixture, policyFixture, policyManifest, policyOpening);
  const subsetPolicy = { ...policyFixture, effectivePolicies: policyFixture.effectivePolicies.slice(1) };
  refuses(() => assertPolicyObservation(subsetPolicy, subsetPolicy, policyManifest, policyOpening),
    'all five policy scopes in exact precedence order required; a curated subset is not effective policy');
  const undefinedPolicy = structuredClone(policyFixture);
  undefinedPolicy.effectivePolicies.forEach(row => { row.policy = 'Undefined'; });
  refuses(() => assertPolicyObservation(undefinedPolicy, undefinedPolicy, policyManifest, policyOpening),
    'computed first-defined policy does not permit the exact unsigned helper');
  const restrictedPolicy = structuredClone(policyFixture); restrictedPolicy.effectivePolicies[0].policy = 'Restricted';
  refuses(() => assertPolicyObservation(restrictedPolicy, restrictedPolicy, policyManifest, policyOpening),
    'computed first-defined policy does not permit the exact unsigned helper');
  const processPolicy = structuredClone(policyFixture); processPolicy.effectivePolicies[2].policy = 'RemoteSigned';
  refuses(() => assertPolicyObservation(processPolicy, processPolicy, policyManifest, policyOpening),
    'opening Process policy must be Undefined for the exact helper environment');
  refuses(() => assertPolicyObservation(policyFixture, policyFixture, policyManifest,
    Date.parse(policyFixture.observedAt) + 300_001), 'separately authorized policy observation is stale at opening');
  const duplicateContract = { expectedCases: [{ file: 'sample.test.ts', name: 'duplicate', count: 2 }], expectedFailures: [] };
  refuses(() => compareCaseSets(duplicates.slice(0, 1), duplicateContract), 'observed file/name multiset differs');
  refuses(() => compareCaseSets([...duplicates, duplicates[0]], duplicateContract), 'observed file/name multiset differs');
  refuses(() => assertCommandEnvironment({ environment: { NODE_ENV: 'test', XENIOS_QO_SUITE_REPORT: 'untrusted' } }),
    'command environment override outside pinned node settings');
  const jsonContract = { expectedCases: [{ file: 'sample.test.ts', name: 'duplicate', ancestorTitles: [], title: 'duplicate', count: 2 }],
    expectedFailures: [], expectedSkipped: [] };
  const checkJson = (report, extra = supplemental, expected = jsonContract) =>
    compareCaseSets(parseVitestReport(report, extra, cwd).rows, expected);
  check(checkJson(json).passed === 2, 'full structured identity control failed');
  const skippedJson = structuredClone(json); skippedJson.testResults[0].assertionResults[0].status = 'skipped';
  skippedJson.numPassedTests = 1; skippedJson.numPendingTests = 1;
  refuses(() => checkJson(skippedJson), 'skipped case inventory differs');
  const todoJson = structuredClone(json); todoJson.testResults[0].assertionResults[0].status = 'todo';
  todoJson.numPassedTests = 1; todoJson.numTodoTests = 1;
  refuses(() => checkJson(todoJson), 'todo case refused');
  const unhandled = structuredClone(supplemental); unhandled.unhandledErrors = ['unhandled fixture'];
  refuses(() => checkJson(json, unhandled), 'suite/unhandled evidence missing or failed');
  const importJson = structuredClone(json); importJson.testResults[0].message = 'import fixture';
  refuses(() => checkJson(importJson), 'duplicate file or suite/hook error');
  const failedJson = structuredClone(json), failedSupplemental = structuredClone(supplemental);
  const failedRow = failedJson.testResults[0].assertionResults[0];
  failedRow.status = 'failed'; failedRow.failureMessages = ['wrong cause at sample.test.ts:42:1'];
  failedJson.testResults[0].status = 'failed'; failedJson.success = false;
  failedJson.numPassedTests = 1; failedJson.numFailedTests = 1;
  failedJson.numPassedTestSuites = 0; failedJson.numFailedTestSuites = 1;
  failedSupplemental.reason = 'failed'; failedSupplemental.files[0].suites[0].state = 'fail';
  const failedContract = { ...jsonContract, expectedFailures: [{ ...jsonContract.expectedCases[0], count: 1,
    cause: { sourcePath: 'sample.test.ts', sourceLine: 42, messageIncludes: ['intended assertion'] } }] };
  refuses(() => checkJson(failedJson, failedSupplemental, failedContract), 'RED failed for another cause or assertion');
  const boundaryRows = [{ file: 'sample.test.ts', name: 'one two three', ancestorTitles: ['one two'], title: 'three',
    status: 'passed', failureMessages: [] }];
  refuses(() => compareCaseSets(boundaryRows, { expectedCases: [{ file: 'sample.test.ts', name: 'one two three',
    ancestorTitles: ['one'], title: 'two three', count: 1 }], expectedFailures: [] }), 'observed file/name multiset differs');
  return { authoredTapFixture: 'PASS_FAILED_CAUSE_SKIP_TOTALS_AND_EIGHT_NEGATIVES', exactDuplicateMultiset: true,
    manifestEnvironments,
    decisionTokenFixtures: 'EXACT_POSITIVES_SUFFIX_RANGE_DUPLICATE_AND_UNREQUIRED_PREPARATION_ACTION',
    openingPolicyFixtures: 'ALL_FIVE_PROCESS_UNDEFINED_PRECEDENCE_ALL_UNDEFINED_SUBSET_AND_FINITE_OPENING_AGE',
    structuredReports: 'TOTALS_HOOK_DUPLICATE_SKIP_TODO_CAUSE_UNHANDLED_IMPORT_AND_TITLE_BOUNDARY_FIXTURES',
    actualNode20FilteredDiagnosticCalibration: 'SEPARATE_HELD_PREREQUISITE; NOT_INFERRED_FROM_SYNTHETIC_FIXTURE' };
}

/** Authored G0 definitions. Calling this export would be execution and is not done now. */
export function selfTestDefinitions(node, ownedRoot) {
  return [
    { id: 'exit-zero', argv: ['-e', 'process.stdout.write("stdout-zero\\n");process.stderr.write("stderr-zero\\n");process.exit(0)'], expectExit: 0 },
    { id: 'exit-one', argv: ['-e', 'process.stdout.write("stdout-one\\n");process.stderr.write("stderr-one\\n");process.exit(1)'], expectExit: 1 },
    { id: 'deadline-kill', argv: ['-e', 'setInterval(()=>{},1000)'], wallMs: 250, expectAbort: 'deadline' },
    { id: 'stream-cap', argv: ['-e', 'process.stdout.write(Buffer.alloc(4*1024*1024+1,65));setInterval(()=>{},1000)'], expectAbort: 'stream-cap' },
    { id: 'stderr-cap', argv: ['-e', 'process.stderr.write(Buffer.alloc(4*1024*1024+1,66));setInterval(()=>{},1000)'], expectAbort: 'stream-cap' },
    { id: 'real-child-tree', argv: ['-e', 'const c=require("node:child_process").spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});process.stdout.write(String(c.pid));setInterval(()=>{},1000)'],
      expectOwnedChildren: 2, expectAbort: 'deadline', minimumTotalOwnedProcesses: 4 },
    { id: 'refusal-path', noChild: true, admission: { availableMiB: 0, freeDiskGiB: 0 }, expect: 'REFUSED' },
    { id: 'bootstrap-interruption', acceptance: 'PENDING separately observed, exact owned helper/compiler interruption exercise; no automatic cleanup claim from a missing receipt',
      expect: 'Reservation HELD until all exact owned bootstrap descendants are independently established absent' },
    { id: 'vitest-baseline', executable: node, cwd: ownedRoot,
      targets: ['a separately materialised one-test owned Vitest fixture'], proposedTotalOwnedProcesses: 8,
      expect: 'one pass, measured complete child tree, no setup error, exact cleanup' },
  ];
}

const modulePath = fileURLToPath(import.meta.url);
let invocationRealPath = null;
if (process.argv[1] && fs.existsSync(process.argv[1])) {
  try { invocationRealPath = fs.realpathSync.native(process.argv[1]); } catch { /* Named direct invocation refuses below. */ }
}
const invokedDirectly = Boolean(process.argv[1] && (
  invocationRealPath?.toLowerCase() === fs.realpathSync.native(modulePath).toLowerCase()
  || path.basename(process.argv[1]).toLowerCase() === path.basename(modulePath).toLowerCase()));
if (invokedDirectly) {
  Promise.resolve().then(() => {
    check(invocationRealPath && invocationRealPath.toLowerCase() === fs.realpathSync.native(modulePath).toLowerCase()
      && invocationRealPath.toLowerCase() === path.resolve(process.argv[1]).toLowerCase(),
      'alias, short-path, symlink or mismatched direct invocation refused');
    const options = parseOptions(process.argv.slice(2));
    return options['--prepare'] ? materializeOwnedSnapshot(options) : runGroup(options);
  }).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

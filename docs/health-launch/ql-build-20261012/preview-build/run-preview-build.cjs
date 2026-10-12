const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const root = 'C:/Users/sboad/.codex/worktrees/ql-preview-20261012/xenios-website';
const scratch = 'C:/Users/sboad/.codex/tmp/ql-preview-build-20261012';
const runtime = 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64';
const node = path.join(runtime, 'node.exe');
const npmCli = path.join(runtime, 'node_modules/npm/bin/npm-cli.js');
const gitExe = 'C:/Program Files/Git/cmd/git.exe';
const expected = '7a2bf7533f5c26d98e0bdb34a862852942b2914e';
const tree = '28617c360f487803baa556d33158c4e95df471f1';
const pins = {
  "C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe": "6e3a39787e667d50487f7335c85636c2823a53e636d73c2c841d45da4e57906c",
  "C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node_modules/npm/bin/npm-cli.js": "3ce7cba6f5128dd5f54c98b6a5036b0f850496878cc2e21044b675fe3c594e3e",
  "C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node_modules/npm/package.json": "c24c86166b39e4a7df131f03a8bbe904703de8fad44485bcf527d4de7806d6c6",
  "C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node_modules/npm/lib/cli.js": "bbcf260a5c9c25e8789fe26905951d52a76d9723ce15416c3174f8c732cf2d17",
  "C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/npm.cmd": "21b46c69ad6e2f231f02a9e120f4ba6c8e75fef5a45637103002eab99f888ab8",
  "C:/Program Files/Git/cmd/git.exe": "37c5725818d602e951ba2563b870d62763322956b73373da4c33a0b566a80bc9",
  "C:/Users/sboad/.codex/worktrees/ql-preview-20261012/xenios-website/scripts/evidence/build-candidate-preview.mjs": "889c561597e3bf376e62af994e39bb064bda37967de223aaf937fec50cc907b0",
  "C:/Users/sboad/.codex/worktrees/ql-preview-20261012/xenios-website/scripts/evidence/lib/provenance.mjs": "ba227736911cad45af19ef52eec033ca480f78efe162186c1a86ac46c88142d2",
  "C:/Users/sboad/.codex/worktrees/ql-preview-20261012/xenios-website/scripts/evidence/lib/immutable-dist.mjs": "ebb4ff9954be25eb9e8e784f0f68418aec98cbe4064c5ee67b429640602792ff",
  "C:/Users/sboad/.codex/worktrees/ql-preview-20261012/xenios-website/script/build.mjs": "f0b8175c54d3398d5d62a1aa363d4e80440c1b8c4cde14472f4396fb974900dc",
  "C:/Users/sboad/.codex/worktrees/ql-preview-20261012/xenios-website/vite.config.ts": "ded50d975bb3fa372bd3c85689dc234eb079309a54eaae72f1a5dd6c0bce5f92",
  "C:/Users/sboad/.codex/worktrees/ql-preview-20261012/xenios-website/package.json": "32aa3da519b9377d43d30731e60f75a5ff2fe5d0f57d719b43081ef6adf280b4",
  "C:/Users/sboad/.codex/worktrees/ql-preview-20261012/xenios-website/package-lock.json": "d3083edc542cd123d839611dfd0b214fcd03ee5c04fa89323da73bbe37c332c8",
  "C:/Users/sboad/.codex/worktrees/ql-preview-20261012/xenios-website/.npmrc": "6d5c57b99119abf207f8554d3cc743ce6578e6baea2a67317ba21d98bc303aa7",
  "C:/Users/sboad/.codex/worktrees/ql-preview-20261012/xenios-website/tsconfig.json": "74cb25011ea689d2b3f8412f14e8a61fed78f02e511d272a30346e871f03eded"
};
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inside = (parent, child) => { const rel = path.relative(path.resolve(parent), path.resolve(child)); return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel); };
const stopAt = Date.parse(process.argv[2]);
if (!Number.isFinite(stopAt) || Date.now() + 915000 > stopAt) throw new Error('Fresh full 900-second window plus15-second cleanup margin required');
if (process.execPath.toLowerCase() !== path.resolve(node).toLowerCase() || process.version !== 'v20.19.0') throw new Error('Pinned launcher required');
for (const dir of [root, scratch]) if (fs.realpathSync(dir).toLowerCase() !== path.resolve(dir).toLowerCase()) throw new Error('Physical exact target required');
if (!inside('C:/Users/sboad/.codex/worktrees/ql-preview-20261012', root)) throw new Error('Checkout escaped owned target');
if (!inside('C:/Users/sboad/.codex/tmp', scratch)) throw new Error('Scratch escaped private target');
for (const [file, hash] of Object.entries(pins)) if (digest(file) !== hash) throw new Error('Pin mismatch: ' + file);
for (const name of ['node_modules', 'dist']) if (fs.existsSync(path.join(root, name))) throw new Error('Fresh checkout required: refusing existing ' + name);
for (const name of ['run.log', 'receipt.json', 'home', 'tmp', 'npm-cache', 'npm-prefix', 'node-gyp-cache']) if (fs.existsSync(path.join(scratch, name))) throw new Error('No overwrite/retry: ' + name);
for (const dir of [root, path.join(root, 'client')]) for (const name of fs.readdirSync(dir)) if (name.startsWith('.env') && name !== '.env.example') throw new Error('Unexpected environment file');
for (let dir = root; ; dir = path.dirname(dir)) {
  if (fs.existsSync(path.join(dir, 'node_modules/.bin'))) throw new Error('Unexpected lifecycle ancestor bin: ' + dir);
  if (path.dirname(dir) === dir) break;
}
for (const name of ['user.npmrc', 'global.npmrc']) if (fs.readFileSync(path.join(scratch, name), 'utf8').trim() !== '') throw new Error('Private npm config must be blank');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
for (const [name, pkg] of Object.entries(lock.packages)) {
  if (Object.keys(pkg.bin || {}).some(bin => ['node', 'npm', 'git'].includes(bin))) throw new Error('Unexpected lifecycle executable shadow');
  if (pkg.resolved && !pkg.resolved.startsWith('https://registry.npmjs.org/')) throw new Error('Unexpected registry source: ' + name);
}
for (const name of ['home', 'tmp', 'npm-cache', 'npm-prefix', 'node-gyp-cache']) fs.mkdirSync(path.join(scratch, name));
const env = {
  SYSTEMROOT: 'C:\\Windows', WINDIR: 'C:\\Windows', COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
  PATH: runtime + ';C:\\Program Files\\Git\\cmd;C:\\Windows\\System32;C:\\Windows',
  PATHEXT: '.COM;.EXE;.BAT;.CMD', TEMP: path.join(scratch, 'tmp'), TMP: path.join(scratch, 'tmp'),
  USERPROFILE: path.join(scratch, 'home'), HOME: path.join(scratch, 'home'),
  APPDATA: path.join(scratch, 'home/AppData/Roaming'), LOCALAPPDATA: path.join(scratch, 'home/AppData/Local'),
  NODE_OPTIONS: '--max-old-space-size=1536', NO_COLOR: '1',
  NPM_CONFIG_USERCONFIG: path.join(scratch, 'user.npmrc'), NPM_CONFIG_GLOBALCONFIG: path.join(scratch, 'global.npmrc'),
  NPM_CONFIG_CACHE: path.join(scratch, 'npm-cache'), NPM_CONFIG_PREFIX: path.join(scratch, 'npm-prefix'),
  NPM_CONFIG_DEVDIR: path.join(scratch, 'node-gyp-cache'), NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
  NPM_CONFIG_FETCH_RETRIES: '0', NPM_CONFIG_FETCH_TIMEOUT: '60000', NPM_CONFIG_FOREGROUND_SCRIPTS: 'true',
  NPM_CONFIG_PROGRESS: 'false', NPM_CONFIG_LOGLEVEL: 'notice'
};
const git = (...args) => execFileSync(gitExe, args, { cwd: root, env, encoding: 'utf8', timeout: 15000 }).trim();
if (git('rev-parse', 'HEAD') !== expected || git('rev-parse', 'HEAD^{tree}') !== tree || git('status', '--porcelain=v2', '--untracked-files=all')) throw new Error('Frozen clean candidate required');
const npmVersion = execFileSync(node, [npmCli, '--version'], { cwd: root, env, encoding: 'utf8', timeout: 15000 }).trim();
if (npmVersion !== '10.8.2') throw new Error('Pinned npm required');
if (Date.now() + 915000 > stopAt) throw new Error('Insufficient complete remaining window');
const args = ['scripts/evidence/build-candidate-preview.mjs', '--sha', expected];
const receipt = { schemaVersion: 1, action: 'QL_EXACT_PREVIEW_NPMCI_BUILD_20261012', candidate: expected, tree, command: [node, ...args], effectiveSubcommands: [[node, npmCli, 'ci', '--no-audit', '--no-fund'], [node, npmCli, 'run', 'build']], cwd: root, startedUtc: new Date().toISOString(), coordinatorStopAt: new Date(stopAt).toISOString(), timeoutMs: 900000, cleanupMarginMs: 15000, attempts: 1, automaticRetries: 0, nodeVersion: process.version, npmVersion, pins, environment: env, dependencyMode: 'Genuine fresh project-local npm ci; previous donor build retained separately', containment: 'Procedural allowlist and Node heap only; no kernel aggregate memory/network sandbox claim', childRuntimeLimit: 'Main/builder/sibling npm pinned; lifecycle PATH audited, no child self-attestation claimed', ownedEffects: ['fresh node_modules/dist', 'private npm cache/prefix/node-gyp cache/temp/home', 'public registry downloads and locked package lifecycle scripts'], excluded: ['global/toolchain install', 'server/browser', 'tests/fullsuite', 'Docker/SQL', 'hosted mutation', 'real email/money'] };
const logPath = path.join(scratch, 'run.log');
const logFd = fs.openSync(logPath, 'wx');
let finalized = false;
const finish = (resultCode, forced = false) => {
  if (finalized) return;
  finalized = true;
  clearTimeout(timer); clearTimeout(deadline);
  fs.closeSync(logFd);
  receipt.logSha256 = digest(logPath);
  receipt.finalizedUtc = new Date().toISOString();
  fs.writeFileSync(path.join(scratch, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
  process.exitCode = resultCode;
  if (forced) process.exit(resultCode);
};
const child = spawn(node, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
receipt.childPid = child.pid;
let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  try { receipt.timeoutCleanup = execFileSync('C:/Windows/System32/taskkill.exe', ['/T', '/F', '/PID', String(child.pid)], { encoding: 'utf8', timeout: 10000, windowsHide: true }); }
  catch (error) { receipt.timeoutCleanupError = String(error); }
}, receipt.timeoutMs);
const deadline = setTimeout(() => {
  receipt.endedUtc = new Date().toISOString();
  receipt.timedOut = true;
  receipt.status = 'SUPERVISOR_DEADLINE_INCOMPLETE_CLEANUP_NOT_CONFIRMED';
  receipt.forcedFinalization = true;
  receipt.childCleanupConfirmed = false;
  finish(124, true);
}, Math.max(1, stopAt - Date.now() - 1000));
const tee = chunk => { if (!finalized) { fs.writeSync(logFd, chunk); process.stdout.write(chunk); } };
child.stdout.on('data', tee); child.stderr.on('data', tee);
child.on('error', error => { receipt.startError = String(error); });
child.on('close', (code, signal) => {
  if (finalized) return;
  clearTimeout(timer);
  Object.assign(receipt, { endedUtc: new Date().toISOString(), exitCode: code, signal, timedOut });
  try {
    if (timedOut) throw new Error('Postchecks skipped after timeout; inspect owned cleanup separately');
    const budget = () => { const ms = Math.min(2000, stopAt - Date.now() - 3000); if (ms < 1) throw new Error('Postcheck deadline exhausted'); return ms; };
    const git = (...gitArgs) => execFileSync(gitExe, gitArgs, { cwd: root, env, encoding: 'utf8', timeout: budget() }).trim();
    receipt.postHead = git('rev-parse', 'HEAD');
    receipt.postTree = git('rev-parse', 'HEAD^{tree}');
    receipt.postTrackedStatus = git('status', '--porcelain=v2', '--untracked-files=all');
    receipt.postLockSha256 = digest(path.join(root, 'package-lock.json'));
    receipt.postNpmVersion = execFileSync(node, [npmCli, '--version'], { cwd: root, env, encoding: 'utf8', timeout: budget() }).trim();
    const stamp = path.join(root, 'dist/evidence-provenance.json');
    if (fs.existsSync(stamp)) {
      receipt.provenanceFileSha256 = digest(stamp);
      const p = JSON.parse(fs.readFileSync(stamp, 'utf8'));
      receipt.provenance = { kind: p.kind, candidateSha: p.candidateSha, sourceTree: p.sourceTree, builtAtUtc: p.builtAtUtc, nodeVersion: p.nodeVersion, npmVersion: p.npmVersion, packageLockSha256: p.packageLockSha256, installMethod: p.installMethod, distFileCount: p.distFileCount, distInventorySha256: p.distInventorySha256 };
    }
    receipt.sourceInvariant = receipt.postHead === expected && receipt.postTree === tree && receipt.postTrackedStatus === '' && receipt.postLockSha256 === pins[path.join(root, 'package-lock.json').replace(/\\/g, '/')];
    receipt.provenancePresent = Boolean(receipt.provenance);
    receipt.installedMetadataSha256 = fs.existsSync(path.join(root, 'node_modules/.package-lock.json')) ? digest(path.join(root, 'node_modules/.package-lock.json')) : null;
  } catch (error) { receipt.postcheckError = String(error); }
  const complete = code === 0 && !timedOut && receipt.sourceInvariant && receipt.provenancePresent && receipt.postNpmVersion === '10.8.2';
  receipt.status = complete ? 'BUILDER_COMPLETED_REQUIRES_ARTIFACT_AND_PROCESS_POSTCHECKS' : 'FAILED_OR_INCOMPLETE';
  finish(timedOut ? 124 : complete ? 0 : code || 1);
});

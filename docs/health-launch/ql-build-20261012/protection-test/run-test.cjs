const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const root = 'C:/Users/sboad/.codex/worktrees/ql-build-20261012/xenios-website';
const scratch = 'C:/Users/sboad/.codex/tmp/ql-protection-test-20261012';
const node = 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe';
const expected = '7a2bf7533f5c26d98e0bdb34a862852942b2914e';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const stopAt = Date.parse(process.argv[2]);
if (!Number.isFinite(stopAt) || Date.now() + 120000 > stopAt) throw new Error('Fresh full coordinator window required');
if (process.execPath.toLowerCase() !== path.resolve(node).toLowerCase() || process.version !== 'v20.19.0') throw new Error('Pinned launcher runtime required');
if (git('rev-parse', 'HEAD') !== expected || git('status', '--porcelain')) throw new Error('Frozen clean candidate required');
if (fs.realpathSync(root).toLowerCase() !== path.resolve(root).toLowerCase()) throw new Error('Physical root required');
for (const dir of [root, path.join(root, 'client')]) {
  for (const name of ['.env', '.env.local', '.env.test', '.env.test.local']) if (fs.existsSync(path.join(dir, name))) throw new Error('Unexpected environment file');
}
for (const [file, hash] of Object.entries({
  [node]: '6e3a39787e667d50487f7335c85636c2823a53e636d73c2c841d45da4e57906c',
  [path.join(root, 'package-lock.json')]: 'd3083edc542cd123d839611dfd0b214fcd03ee5c04fa89323da73bbe37c332c8',
  [path.join(root, 'node_modules/.package-lock.json')]: '962b226705a406a95c5d5fe92d887e309c885a8a465cc4697a540bfb1d097e94',
  [path.join(root, 'node_modules/vitest/package.json')]: 'caa41f04799bd42f3cfd100c4282e630d77ffc7deb1e7e4927794fcb7f137f34',
  [path.join(root, 'node_modules/vite/package.json')]: '2ce2b783ef4f4511544fa045355e7076f192b1331f6801214173d1910518f5d7',
  [path.join(root, 'node_modules/esbuild/package.json')]: 'cb7d5b1fe478f8cbaae566a86031b6fdf5f7d444354f35d1cb3cba9adf6d2935'
})) if (digest(file) !== hash) throw new Error('Runtime/dependency identity mismatch');
const sourcePins = {
  'server/core-site-protection.test.ts': '75ea950ca0e3d873f8280e61c73679abc90096bb',
  'scripts/acceptance/verify-core-site-protection.mjs': 'c30371fdb01a371874ea6d6352689fff72cf9324',
  'vitest.config.ts': '242428c09e76d16da672e70e48bb885f90c71026',
  'docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json': '088deb74044d945c2e7d2cdb7827647785042038',
  'client/src/lib/content.ts': '634abb15522673ac32e0d5ca17ac17b499c4d6d1',
  'client/src/lib/careers.ts': '51cf1af0add03557d708511331ecf8b8cfb20628'
};
for (const [file, blob] of Object.entries(sourcePins)) if (git('hash-object', file) !== blob) throw new Error('Source/config changed');
for (const name of ['run.log', 'result.json', 'receipt.json']) if (fs.existsSync(path.join(scratch, name))) throw new Error('No overwrite or retry');
const home = path.join(scratch, 'home'); const tmp = path.join(scratch, 'tmp');
fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(tmp, { recursive: true });
const env = { SYSTEMROOT: 'C:\\Windows', WINDIR: 'C:\\Windows', COMSPEC: 'C:\\Windows\\System32\\cmd.exe', PATH: 'C:\\Users\\sboad\\.codex\\toolchains\\node-v20.19.0-win-x64;C:\\Windows\\System32;C:\\Windows', PATHEXT: '.COM;.EXE;.BAT;.CMD', TEMP: tmp, TMP: tmp, USERPROFILE: home, HOME: home, APPDATA: path.join(home, 'AppData/Roaming'), LOCALAPPDATA: path.join(home, 'AppData/Local'), NODE_ENV: 'test', NODE_OPTIONS: '--max-old-space-size=1024', CI: '1', NO_COLOR: '1' };
const args = [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.config.ts', '--maxWorkers', '1', '--no-file-parallelism', '--reporter', 'verbose', '--reporter', 'json', '--outputFile.json', path.join(scratch, 'result.json'), 'server/core-site-protection.test.ts'];
const receipt = { candidate: expected, tree: git('rev-parse', 'HEAD^{tree}'), command: [node, ...args], cwd: root, sourcePins, nodeVersion: process.version, nodeBinarySha256: digest(node), npm: 'NOT_INVOKED', startedUtc: new Date().toISOString(), coordinatorStopAt: new Date(stopAt).toISOString(), timeoutMs: 120000, environmentKeys: Object.keys(env), dependencyMode: 'Private physical existing dependencies; no install; metadata identity not clean-rebuild provenance', workerRuntime: 'Node full-path spawned, worker-self-attestation NOT_CAPTURED', kernelAggregateCaps: 'NOT_ENFORCED_NOT_G0' };
const log = fs.createWriteStream(path.join(scratch, 'run.log'), { flags: 'wx' });
const child = spawn(node, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
receipt.childPid = child.pid;
let timedOut = false;
const timer = setTimeout(() => { timedOut = true; spawn('C:/Windows/System32/taskkill.exe', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true, stdio: 'ignore' }); }, receipt.timeoutMs);
const tee = chunk => { log.write(chunk); process.stdout.write(chunk); };
child.stdout.on('data', tee); child.stderr.on('data', tee);
child.on('error', error => { receipt.startError = String(error); });
child.on('close', (code, signal) => {
  clearTimeout(timer);
  Object.assign(receipt, { endedUtc: new Date().toISOString(), exitCode: code, signal, timedOut, postHead: git('rev-parse', 'HEAD'), postTrackedStatus: git('status', '--porcelain') });
  log.end(() => {
    receipt.logSha256 = digest(path.join(scratch, 'run.log'));
    if (fs.existsSync(path.join(scratch, 'result.json'))) receipt.resultSha256 = digest(path.join(scratch, 'result.json'));
    fs.writeFileSync(path.join(scratch, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
    process.exitCode = timedOut ? 124 : code ?? 1;
  });
});

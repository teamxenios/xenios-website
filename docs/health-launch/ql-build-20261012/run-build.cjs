const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const root = 'C:/Users/sboad/.codex/worktrees/ql-build-20261012/xenios-website';
const scratch = 'C:/Users/sboad/.codex/tmp/ql-build-20261012';
const node = 'C:/Users/sboad/.codex/toolchains/node-v20.19.0-win-x64/node.exe';
const expected = '7a2bf7533f5c26d98e0bdb34a862852942b2914e';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (git('rev-parse', 'HEAD') !== expected || git('status', '--porcelain')) throw new Error('Frozen clean candidate required');
if (fs.realpathSync(root).toLowerCase() !== path.resolve(root).toLowerCase()) throw new Error('Unexpected root target');
const dist = path.resolve(root, 'dist');
if (path.relative(root, dist) !== 'dist' || fs.existsSync(dist)) throw new Error('Fresh exact isolated dist required before unchanged script deletion');
for (const dir of [root, path.join(root, 'client')]) {
  for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) if (fs.existsSync(path.join(dir, name))) throw new Error('Unexpected environment input');
}
const pins = {
  [node]: '6e3a39787e667d50487f7335c85636c2823a53e636d73c2c841d45da4e57906c',
  [path.join(root, 'package-lock.json')]: 'd3083edc542cd123d839611dfd0b214fcd03ee5c04fa89323da73bbe37c332c8',
  [path.join(root, 'node_modules/.package-lock.json')]: '962b226705a406a95c5d5fe92d887e309c885a8a465cc4697a540bfb1d097e94',
};
for (const [file, hash] of Object.entries(pins)) if (digest(file) !== hash) throw new Error('Runtime/dependency identity mismatch');
for (const [file, blob] of Object.entries({ 'script/build.mjs': 'a71731b3e52a6f22712329fa63d16693069c8f1b', 'vite.config.ts': 'aec779da413354fc7b4c7ff8bbe3ae74ed78a8b7' })) if (git('hash-object', file) !== blob) throw new Error('Build procedure changed');
const home = path.join(scratch, 'home'); const tmp = path.join(scratch, 'tmp');
fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(tmp, { recursive: true });
const env = { SYSTEMROOT: 'C:\\Windows', WINDIR: 'C:\\Windows', COMSPEC: 'C:\\Windows\\System32\\cmd.exe', PATH: 'C:\\Users\\sboad\\.codex\\toolchains\\node-v20.19.0-win-x64;C:\\Windows\\System32;C:\\Windows', PATHEXT: '.COM;.EXE;.BAT;.CMD', TEMP: tmp, TMP: tmp, USERPROFILE: home, HOME: home, APPDATA: path.join(home, 'AppData/Roaming'), LOCALAPPDATA: path.join(home, 'AppData/Local'), NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=2048', CI: '1', NO_COLOR: '1' };
const args = ['script/build.mjs'];
const receipt = { candidate: expected, tree: git('rev-parse', 'HEAD^{tree}'), command: [node, ...args], cwd: root, nodeVersion: process.version, nodeBinarySha256: digest(node), npm: 'NOT_INVOKED', startedUtc: new Date().toISOString(), timeoutMs: 420000, environmentKeys: Object.keys(env), distPrecheck: { absoluteTarget: dist, existed: false, relativeTarget: path.relative(root, dist) }, kernelAggregateCaps: 'NOT_ENFORCED_NOT_G0', dependencyMode: 'Private physical existing matching copy; no install' };
const log = fs.createWriteStream(path.join(scratch, 'build.log'), { flags: 'wx' });
const child = spawn(node, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let timedOut = false;
const timer = setTimeout(() => { timedOut = true; spawn('C:/Windows/System32/taskkill.exe', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true, stdio: 'ignore' }); }, receipt.timeoutMs);
const tee = chunk => { log.write(chunk); process.stdout.write(chunk); };
child.stdout.on('data', tee); child.stderr.on('data', tee);
child.on('error', error => { receipt.startError = String(error); });
child.on('close', (code, signal) => { clearTimeout(timer); Object.assign(receipt, { endedUtc: new Date().toISOString(), exitCode: code, signal, timedOut }); log.end(() => { receipt.logSha256 = digest(path.join(scratch, 'build.log')); receipt.outputBytes = fs.statSync(path.join(scratch, 'build.log')).size; fs.writeFileSync(path.join(scratch, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' }); process.stdout.write(JSON.stringify(receipt, null, 2) + '\n'); process.exitCode = timedOut ? 124 : code ?? 1; }); });

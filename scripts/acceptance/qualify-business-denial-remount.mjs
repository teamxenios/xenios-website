// CI-only negative control for the actual mounted Care/business view race.
// Restore the exact candidate source in finally; never reset a worktree.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const root = process.cwd(), target = 'client/src/care/CareRequestIntentPage.tsx';
const old = '991f840a31f91d866c72568202509f23cb90cab1';
const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8', timeout: 10000, stdio: ['ignore','pipe','pipe']});
assert.equal(process.env.CI, 'true', 'Run this source mutation only in an owned CI checkout');
assert.equal(git(['status','--porcelain']), '', 'Refuse dirty checkout');
const filename = path.join(root, target), current = fs.readFileSync(filename);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const prior = Buffer.from(git(['show', old + ':' + target]));
assert.notEqual(sha(current), sha(prior));
let result;
try {
  fs.writeFileSync(filename, prior);
  result = spawnSync(process.execPath, [path.join(root,'node_modules/vitest/vitest.mjs'), 'run',
    'client/src/care/CareRequestIntentPage.test.tsx', '-t',
    'keeps business denial authoritative across overlapping view reads',
    '--maxWorkers=1','--no-file-parallelism','--allowOnly=false','--retry=0'],
    {cwd: root, env: process.env, timeout: 60000, maxBuffer: 4*1024*1024, encoding:'utf8', windowsHide:true});
} finally {
  fs.writeFileSync(filename, current);
  assert.equal(sha(fs.readFileSync(filename)), sha(current), 'Candidate source was not restored');
  git(['diff','--exit-code','--',target]);
}
process.stdout.write(result?.stdout ?? '');
process.stderr.write(result?.stderr ?? '');
assert(!result.error && !result.signal, 'Timeout/launch failure is not a negative-control pass');
assert.equal(result.status, 1, 'Both old race orderings must fail');
const output = (result.stdout + result.stderr).replace(/\u001b\[[0-9;]*m/g,'');
assert(/Tests\s+2 failed\b/u.test(output), 'Require both actual race assertions to fail');
console.log(JSON.stringify({negativeControl:'prior991_held_response_remount_race',expectedFailures:2,
  candidateSourceRestored:true,oldSource:old,currentSourceSha256:sha(current)}));

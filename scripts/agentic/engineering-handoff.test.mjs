import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { admit, demo, digest, marker, transition, validateInput, validateOutput } from './engineering-handoff.mjs';

const head = 'a'.repeat(40);
const authority = { issue: 'KAN-225', pr: 999, paths: ['docs/engineering/synthetic.md'],
  stages: ['implement', 'review'], maxCycles: 2, expiresAt: '2026-10-18T00:00:00Z', costDecision: 'c'.repeat(64) };
const input = (extra = {}) => ({ repository: 'teamxenios/xenios-website', event: 'workflow_dispatch',
  ref: 'refs/heads/main', attempt: 1, actor: 'owner', issue: 'KAN-225', pr: 999, head,
  stage: 'implement', cycle: 1, approval: digest(JSON.stringify(authority)), paths: authority.paths, ...extra });
const facts = (extra = {}) => ({ enabled: 'approved-v1', approvalRecord: authority,
  now: Date.parse('2026-10-17T00:00:00Z'), permission: 'write', environmentExists: true,
  protectedEnvironment: true, trustedBranchPolicy: true, prState: 'open', fork: false, head, changedPaths: authority.paths,
  records: [], requiredChecks: ['test', 'typecheck', 'build'],
  checks: ['test', 'typecheck', 'build'].map(name => ({ name, head, status: 'completed', conclusion: 'success' })), ...extra });
const failAdmission = (i, f, code) => assert.throws(() => admit(input(i), facts(f)), new RegExp(code));

test('disabled by default; exact trusted admission succeeds only with all prerequisites', () => {
  failAdmission({}, { enabled: '' }, 'AUTOMATION_OFF');
  assert.equal(admit(input(), facts()).state, 'RESERVED');
});
for (const [name, i, f, code] of [
  ['comment event', { event: 'issue_comment' }, {}, 'UNTRUSTED_TRIGGER'],
  ['non-main ref', { ref: 'refs/heads/fork' }, {}, 'UNTRUSTED_TRIGGER'],
  ['job retry', { attempt: 2 }, {}, 'NO_RETRY'],
  ['bot trigger', { actor: 'github-actions[bot]' }, {}, 'HUMAN_DISPATCH'],
  ['read-only actor', {}, { permission: 'read' }, 'WRITER_REQUIRED'],
  ['missing environment', {}, { environmentExists: false }, 'PROTECTED_ENVIRONMENT'],
  ['unprotected environment', {}, { protectedEnvironment: false }, 'PROTECTED_ENVIRONMENT'],
  ['unrestricted environment branches', {}, { trustedBranchPolicy: false }, 'PROTECTED_ENVIRONMENT'],
  ['fork', {}, { fork: true }, 'PR_DRIFT_OR_FORK'],
  ['drift', {}, { head: 'b'.repeat(40) }, 'PR_DRIFT_OR_FORK'],
  ['extra source path', {}, { changedPaths: ['server/index.ts'] }, 'PR_OUTSIDE_CUSTODY'],
  ['third cycle', { cycle: 3 }, {}, 'CYCLE_LIMIT'],
  ['fake approval hash', { approval: '0'.repeat(64) }, {}, 'APPROVAL_MISMATCH'],
  ['expired approval', {}, { now: Date.parse('2026-10-19') }, 'APPROVAL_MISMATCH'],
]) test(`fail closed: ${name}`, () => failAdmission(i, f, code));

test('no arbitrary commands, wildcards or infrastructure paths', () => {
  for (const p of ['../../escape', '.github/workflows/ci.yml', 'server/auth/x.ts', 'docs/phase2/x.md',
    'server/db/migrations/x.ts', 'docs/a.sql', 'docs/a b.md', 'docs/**', 'docs/x\\y', 'docs/a\nx']) {
    assert.throws(() => validateInput(input({ paths: [p] })), /PATH_REQUIRES/);
  }
});
test('reservation is consumed even without result; duplicate stage/head/cycle cannot call a model', () => {
  const record = { ...input(), trusted: true };
  failAdmission({}, { records: [record] }, 'ALREADY_RESERVED');
  failAdmission({ head: 'b'.repeat(40) }, { head: 'b'.repeat(40), records: [record] }, 'ALREADY_RESERVED');
  assert.equal(marker(input()).includes(head), true);
});
test('two reservations exhaust budget across different heads', () => {
  failAdmission({ cycle: 2, head: 'd'.repeat(40) }, { head: 'd'.repeat(40), records: [
    { ...input(), cycle: 8, trusted: true }, { ...input(), cycle: 9, head: 'b'.repeat(40), trusted: true },
  ] }, 'CYCLE_LIMIT');
});
test('only trusted ledger entries count', () => {
  assert.equal(admit(input(), facts({ records: [{ ...input(), trusted: false }] })).state, 'RESERVED');
});
test('review needs every configured CI check on exact head, never skips/neutral/pending', () => {
  assert.equal(admit(input({ stage: 'review' }), facts()).state, 'RESERVED');
  failAdmission({ stage: 'review' }, { requiredChecks: [] }, 'REQUIRED_CHECKS');
  for (const conclusion of ['failure', 'skipped', 'neutral', null]) {
    failAdmission({ stage: 'review' }, { checks: [{ name: 'test', head, status: 'completed', conclusion }] }, 'CI_NOT_GREEN');
  }
  failAdmission({ stage: 'review' }, { checks: [] }, 'CI_NOT_GREEN');
  failAdmission({ stage: 'review' }, { checks: [...facts().checks, facts().checks[0]] }, 'CI_NOT_GREEN');
});
const review = extra => JSON.stringify({ head, verdict: 'ACCEPTED', patch: '', findingCodes: [], ...extra });
test('review output is exact closed shape, head bound and cannot contain patches', () => {
  assert.equal(validateOutput(input({ stage: 'review' }), review()).verdict, 'ACCEPTED');
  for (const out of [review({ head: 'b'.repeat(40) }), review({ patch: 'edit' }), review({ token: 'x' }),
    review({ findingCodes: ['raw customer detail'] }), review({ verdict: 'CHANGES_REQUIRED' })]) {
    assert.throws(() => validateOutput(input({ stage: 'review' }), out));
  }
});
test('implementation is proposal only; disallows unleased paths and binary/mode patches', () => {
  const patch = 'diff --git a/docs/engineering/synthetic.md b/docs/engineering/synthetic.md\n--- a/docs/engineering/synthetic.md\n+++ b/docs/engineering/synthetic.md\n@@ -1 +1 @@\n-old\n+new\n';
  const valid = review({ verdict: 'PROPOSED', patch });
  assert.equal(validateOutput(input(), valid).patchSha256, digest(patch));
  for (const change of [patch.replaceAll('docs/engineering/synthetic.md', 'server/index.ts'),
    patch.replace('+++ b/docs/engineering/synthetic.md', '+++ b/server/index.ts'), patch + '\nGIT binary patch\n',
    patch + '\nnew mode 100755\n']) assert.throws(() => validateOutput(input(), review({ verdict: 'PROPOSED', patch: change })));
});
test('oversized or invalid JSON fails, never executed', () => {
  assert.throws(() => validateOutput(input(), 'x'.repeat(100001)), /OUTPUT_LIMIT/);
  assert.throws(() => validateOutput(input(), 'not json'));
});
test('synthetic two-cycle handoff reaches acceptance and emits idempotent Jira intent only', () => {
  const result = demo();
  assert.match(result.demonstration, /SYNTHETIC/);
  assert.equal(result.state.status, 'ACCEPTED'); assert.equal(result.state.cycles, 2);
  assert.equal(result.state.jiraIntent.key, 'KAN-225');
  assert.equal(transition(result.state, { id: '6', head: 'b'.repeat(40) }), result.state);
});
test('failed CI, stale head and self-review block', () => {
  const state = { issue: 'KAN-225', writer: 'codex', head, cycles: 1, status: 'AWAITING_CI', seen: [] };
  assert.equal(transition(state, { id: '1', kind: 'ci', head, passed: false }).status, 'BLOCKED');
  assert.throws(() => transition(state, { id: '2', kind: 'ci', head: 'b'.repeat(40), passed: true }), /STALE/);
  const ready = { ...state, status: 'AWAITING_REVIEW' };
  assert.throws(() => transition(ready, { id: '3', kind: 'review', head, provider: 'claude', author: 'codex', verdict: 'ACCEPTED' }), /INDEPENDENT/);
  assert.equal(transition({ ...ready, cycles: 2 }, { id: '4', kind: 'review', head, provider: 'claude', author: 'reviewer', verdict: 'CHANGES_REQUIRED' }).status, 'BLOCKED');
});
test('workflow uses only manual dispatch, pinned actions, isolated jobs and no cloud tokens', () => {
  const yaml = readFileSync(new URL('../../.github/workflows/xenios-engineering-agents.yml', import.meta.url), 'utf8');
  assert.match(yaml, /workflow_dispatch:/); assert.doesNotMatch(yaml, /pull_request_target:|issue_comment:|workflow_run:|schedule:/);
  for (const action of yaml.matchAll(/uses: (\S+)/g)) assert.match(action[1], /@[a-f0-9]{40}$/);
  assert.match(yaml, /permissions: \{\}/); assert.match(yaml, /safety-strategy: drop-sudo/);
  assert.match(yaml, /permission-profile: ':read-only'/); assert.match(yaml, /--max-turns 6/);
  assert.match(yaml, /show_full_output: 'false'/); assert.doesNotMatch(yaml, /contents: write|id-token: write|deployments: write|SUPABASE|RENDER_API|JIRA_TOKEN/);
  const codex = yaml.split('  codex:')[1].split('  claude:')[0];
  assert.equal(codex.trim().split('\n').at(-1).trim(), "allow-bots: 'false'");
});

test('actual gate CLI reserves once through mocked GitHub, never prints response secrets', () => {
  // Real CLI entry/serialization/control flow; all network is replaced in child.
  // Not provider, GitHub or Jira execution evidence.
  const mock = `Date.now = () => Date.parse('2026-10-17T00:00:00Z'); globalThis.fetch = async (url, options) => {
    const route = new URL(url).pathname;
    let body;
    if (route.endsWith('/permission')) body = {permission:'write'};
    else if (route.endsWith('/pulls/999')) body = {state:'open',head:{sha:'${head}',repo:{full_name:'teamxenios/xenios-website'}},base:{repo:{full_name:'teamxenios/xenios-website'}}};
    else if (route.endsWith('/environments/xenios-engineering-agents')) body = {deployment_branch_policy:{protected_branches:true},protection_rules:[{type:'required_reviewers',reviewers:[{id:1}],prevent_self_review:true}]};
    else if (route.endsWith('/files')) body = [{filename:'docs/engineering/synthetic.md'}];
    else if (route.endsWith('/comments') && options.method === 'POST') {const value=JSON.parse(options.body);if(!value.body.includes('RESERVED')) throw new Error('bad reservation');body={secret:'DO_NOT_PRINT_RESPONSE'};}
    else if (route.endsWith('/comments')) body = [];
    else throw new Error('UNEXPECTED_NETWORK');
    return {ok:true,status:200,json:async()=>body};
  };`;
  const run = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(mock),
    new URL('./engineering-handoff.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'gate'], {
    encoding: 'utf8', env: { ...process.env, HANDOFF_INPUT: JSON.stringify(input()), GH_TOKEN: 'SYNTHETIC_NOT_A_CREDENTIAL',
      AUTOMATION_ENABLED: 'approved-v1', APPROVAL_RECORD: JSON.stringify(authority),
      NODE_OPTIONS: '' },
  });
  assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(run.stdout).state, 'RESERVED');
  assert.doesNotMatch(run.stdout + run.stderr, /DO_NOT_PRINT_RESPONSE|SYNTHETIC_NOT_A_CREDENTIAL/);
});

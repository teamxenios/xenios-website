// Timing-sensitive proof, separate from the functional driver. A Git worktree
// is not compute isolation. No final qualification may use a loaded host.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createAttributionFixture, configureAttributionSource, candidateRequest,
  metadataFreeEvent, attributionExpr, appendEventExpr, appendEvent, requestQuarantineHeld,
  attributionPath, prefix, expected, request, actor, q, json, call, digest,
} from './research_assisted_order_provider_attribution_local.mjs';

function hold(db, sql, label) {
  assert.match(db.containerId, /^[0-9a-f]{64}$/);
  const marker = `ATTRIBUTION_HOLDER_${label}:`;
  let stdout = '', stderr = '', resolveReady, rejectReady, backendPid;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const child = spawn('docker', ['exec', '-i', db.containerId, 'psql', '-X', '-q', '-A', '-t',
    '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { windowsHide: true });
  const timer = setTimeout(() => child.kill(), 60_000);
  child.stdout.on('data', chunk => {
    stdout += chunk;
    const complete = new RegExp(`${marker}(\\d+)\\r?\\n`).exec(stdout);
    if (complete) { backendPid = Number(complete[1]); resolveReady(); }
  });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    child.on('error', error => { clearTimeout(timer); rejectReady(error); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0 && backendPid) resolve(stdout);
      else {
        const error = Object.assign(new Error('Owned attribution holder failed'), { code, stdout, stderr });
        rejectReady(error); reject(error);
      }
    });
  });
  ready.catch(() => {}); done.catch(() => {});
  child.stdin.write(`\\set VERBOSITY verbose\nset statement_timeout='30s';set idle_in_transaction_session_timeout='45s';
    begin;${sql}\nselect '${marker}'||pg_backend_pid();\n`);
  return { ready, done, pid: () => backendPid, finish: command => child.stdin.end(`${command};\n`) };
}

// Explicit holder/peer causality. No pg_sleep timing window is used.
export async function attributionLockRace(db, firstSql, secondSql,
  { phase, rollback = false, refusal = null } = {}) {
  assert.ok(phase, 'Label the expected lock phase');
  const label = `${db.races}-${Date.now()}`, peerName = `synthetic-attribution-peer-${label}`;
  const holder = hold(db, firstSql, label);
  let peer, released = false, evidence;
  try {
    await holder.ready;
    peer = db.startSql(`set application_name=${q(peerName)};${secondSql}`);
    const deadline = performance.now() + 25_000;
    while (performance.now() < deadline) {
      const state = json(await db.psql(`select jsonb_build_object('peers',coalesce(jsonb_agg(jsonb_build_object(
        'peerPid',pid,'waitType',wait_event_type,'waitEvent',wait_event,'blockingPids',pg_blocking_pids(pid))), '[]'))::text
        from pg_stat_activity where application_name=${q(peerName)};`));
      if (state.peers.length === 1 && state.peers[0].waitType === 'Lock' && state.peers[0].blockingPids.includes(holder.pid())) {
        evidence = { ...state.peers[0], holderPid: holder.pid(), expectedPhase: phase, observedAt: new Date().toISOString() };
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(evidence, 'The peer must wait on this exact holder before release');
    holder.finish(rollback ? 'rollback' : 'commit'); released = true;
    const first = await holder.done;
    let second, error;
    try { second = await peer.done; } catch (failure) { error = failure; }
    if (refusal) db.checkError(error, ...refusal); else if (error) throw error;
    db.races++;
    console.log(`ATTRIBUTION_RACE LOCK ${JSON.stringify({ ...evidence, holderOutcome: rollback ? 'rollback' : 'commit' })}`);
    return { first: json(first), second: second ? json(second) : null };
  } finally {
    if (!released) { holder.finish('rollback'); await holder.done.catch(() => {}); }
    if (peer) await peer.done.catch(() => {});
  }
}

export async function runAttributionRaces(db) {
  let groups = 0;
  const pass = label => { groups++; console.log(`ATTRIBUTION_RACE PASS ${label}`); };
  async function prepared(label, n, { other = false } = {}) {
    const configuration = await configureAttributionSource(db, label);
    await candidateRequest(db, n, configuration);
    if (other) await candidateRequest(db, n + 1, configuration);
    const event = metadataFreeEvent(db, n);
    const journal = await appendEvent(db, event, configuration);
    assert.equal(journal.requestId, null);
    return { configuration, journal, event, sql: call(attributionExpr(journal.journalId, configuration)) };
  }
  {
    const a = await prepared('race-duplicate', 2300);
    const result = await attributionLockRace(db, a.sql, a.sql, { phase: 'same-request' });
    assert.equal(result.first.replayed, false); assert.equal(result.second.replayed, true);
    assert.equal(result.first.attributionId, result.second.attributionId);
    assert.equal(await requestQuarantineHeld(db, 2300), true);
    pass('concurrent duplicate commits produce one immutable held receipt');
  }
  {
    const a = await prepared('race-duplicate-rollback', 2310);
    const result = await attributionLockRace(db, a.sql, a.sql, { phase: 'same-request', rollback: true });
    assert.equal(result.second.replayed, false);
    assert.notEqual(result.first.attributionId, result.second.attributionId);
    assert.equal(await db.psql(`select count(*) from ${prefix}provider_attributions where journal_id=${q(a.journal.journalId)};`), '1');
    pass('rolled-back first receipt does not become a replay authority');
  }
  {
    const a = await prepared('race-settlement', 2320, { other: true });
    const result = await attributionLockRace(db, a.sql, call(db.settleExpr(2321, a.configuration)), { phase: 'provider-fence' });
    assert.equal(result.second.state, 'verified');
    assert.equal((await db.eligibility(2321)).fulfillmentEligible, true);
    assert.equal(await requestQuarantineHeld(db, 2320), true);
    pass('unrelated settlement waits on attribution fence and sees committed narrowed risk');
  }
  {
    const a = await prepared('race-settlement-rollback', 2330, { other: true });
    const before = await db.financial(2331);
    await attributionLockRace(db, a.sql, call(db.settleExpr(2331, a.configuration)),
      { phase: 'provider-fence', rollback: true, refusal: expected('SETTLEMENT_HELD') });
    assert.deepEqual(await db.financial(2331), before);
    assert.equal(await requestQuarantineHeld(db, 2331), true);
    pass('unrelated settlement remains held after attribution rollback');
  }
  for (const conflictFirst of [true, false]) {
    const n = conflictFirst ? 2340 : 2350;
    const a = await prepared(`race-conflict-${n}`, n, { other: true });
    const conflicting = call(appendEventExpr({ ...a.event, payloadSha256: digest(`synthetic-changed-${n}`) }, a.configuration));
    await attributionLockRace(db, conflictFirst ? conflicting : a.sql, conflictFirst ? a.sql : conflicting, { phase: 'provider-fence' });
    assert.equal(await requestQuarantineHeld(db, n), true);
    assert.equal(await requestQuarantineHeld(db, n + 1), true);
    assert.equal(await db.psql(`select count(*) from ${prefix}provider_attributions where journal_id=${q(a.journal.journalId)};`), '1');
    pass(`changed event bytes retain source-wide risk in ${conflictFirst ? 'event-first' : 'attribution-first'} ordering`);
  }
  for (const authority of ['grants', 'policies', 'sources']) {
    const n = { grants: 2360, policies: 2370, sources: 2380 }[authority];
    const a = await prepared(`race-revoke-${authority}`, n, { other: true });
    const table = authority === 'sources' ? 'provider_sources' : `provider_attribution_${authority}`;
    const revoke = `update ${prefix}${table} set revoked_at=date_trunc('milliseconds',clock_timestamp())
      where source_id=${q(a.configuration.sourceId)};select jsonb_build_object('revoked',true)::text;`;
    await attributionLockRace(db, revoke, a.sql, { phase: `authority-${authority}`, refusal: expected('ATTRIBUTION_GRANT_REQUIRED') });
    assert.equal(await db.psql(`select count(*) from ${prefix}provider_attributions where journal_id=${q(a.journal.journalId)};`), '0');
    assert.equal(await requestQuarantineHeld(db, n + 1), true);
    pass(`${authority} revocation before commit cannot create a receipt from stale authorization`);
  }
  {
    const a = await prepared('race-revoke-after', 2390, { other: true });
    const revoke = `update ${prefix}provider_attribution_grants set revoked_at=date_trunc('milliseconds',clock_timestamp())
      where source_id=${q(a.configuration.sourceId)} and auth_user_id='${actor}';select jsonb_build_object('revoked',true)::text;`;
    await attributionLockRace(db, a.sql, revoke, { phase: 'authority-grants' });
    assert.equal(await requestQuarantineHeld(db, 2390), true);
    assert.equal(await db.psql(`select ${prefix}provider_source_quarantine_held(${q(a.configuration.sourceId)});`), 'f');
    await db.refused(a.sql, ...expected('ATTRIBUTION_GRANT_REQUIRED'));
    pass('later revocation preserves receipt/target risk while denying new actor authority');
  }
  return { groups, lockWaits: db.races, refusals: db.refusals };
}

async function main() {
  assert.equal(process.version, 'v20.19.0');
  const diagnostic = process.argv.includes('--diagnostic-loaded-host');
  const receiptArg = process.argv.find(value => value.startsWith('--host-receipt='));
  if (!diagnostic && !receiptArg) {
    console.log('ATTRIBUTION_RACE DEFERRED: provide a fresh quiet-host receipt or explicitly request a loaded-host diagnostic. No database started.');
    process.exitCode = 2; return;
  }
  let hostReceipt = null;
  if (!diagnostic) {
    hostReceipt = JSON.parse((await readFile(resolve(receiptArg.slice('--host-receipt='.length)), 'utf8')).replace(/^\uFEFF/, ''));
    assert.equal(hostReceipt.classification, 'QUIET_PRECHECK_ONLY');
    assert.equal(hostReceipt.samples.length, 3);
    const age = Date.now() - Date.parse(hostReceipt.samples.at(-1).at);
    assert.ok(age >= 0 && age < 60_000, 'Quiet host receipt must be fresh');
    for (const sample of hostReceipt.samples) {
      assert.ok(sample.cpuPercent <= 15 && sample.availableMiB >= 4096 && sample.pagesInputPerSecond <= 100 && sample.pagesOutputPerSecond <= 100);
      assert.equal(sample.testBuildProcesses.length, 0);
    }
  }
  const source = await readFile(attributionPath);
  const startedAt = new Date().toISOString();
  const fixture = await createAttributionFixture({ label: 'races-initial' });
  try {
    const result = await runAttributionRaces(fixture.db);
    assert.equal(digest(await readFile(attributionPath)), digest(source));
    console.log(`ATTRIBUTION_RACE COMPLETE ${JSON.stringify({ ...result, startedAt, finishedAt: new Date().toISOString(),
      environment: fixture.environment, candidateSha256: digest(source), diagnosticLoadedHost: diagnostic,
      hostPrecheck: hostReceipt, continuousHostAttestation: false,
      finalControlledHostQualification: false, note: 'Actual lock proof; final host qualification requires separately retained in-run host evidence.',
      productionMutated: false, managedQualified: false })}`);
  } finally { await fixture.close(); }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) await main();

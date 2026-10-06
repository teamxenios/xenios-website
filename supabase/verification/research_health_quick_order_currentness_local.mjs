// SOURCE ONLY; NOT RUN. This is a future disposable SQL verifier, not permission
// to execute it. It never accepts a database URL or uses a managed connection.
// The bounded surface is held metadata publication and additive schema/ACL
// preservation. Commit, writer coordination, concurrency and liveness remain
// HELD / NOT IMPLEMENTED; even completed bounded checks end with exit code 2.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PREFIX = 'public.research_health_quick_order_';
const CANDIDATE = 'supabase/candidates/20261006_research_health_quick_order_currentness';
const BINDINGS = 'docs/health-launch/quick-order-20261005/evidence/review-cleared-draft-bindings-20261006.json';
const OWN_SOURCE = [CANDIDATE + '.sql', CANDIDATE + '.precheck.sql', CANDIDATE + '.postcheck.sql',
  CANDIDATE + '.rollback.md', 'supabase/verification/research_health_quick_order_currentness_local.mjs'];
// Actual historical sources, in dependency order. No replacement fence, mock
// integrity RPC, disabled canonical trigger or managed bootstrap is used.
const BASELINE_SQL = [
  'supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql',
  'supabase/migrations/20260815150000_research_assisted_order_bridge.sql',
  'supabase/migrations/20260820190000_research_assisted_order_declared_affiliate_code.sql',
  'supabase/migrations/20260927203000_research_status_recovery.sql',
  'supabase/migrations/20260930191323_research_assisted_order_quote_payment_guard.sql',
  'supabase/migrations/20260930193033_research_assisted_order_quote_paid_hold.sql',
  'supabase/migrations/20260930202413_research_assisted_order_quote_payment_authority.sql',
  'supabase/migrations/20260930205725_research_assisted_order_quote_access_finance_bound.sql',
  'supabase/migrations/20260930230541_research_assisted_order_quote_evidence_corrections.sql',
  'supabase/migrations/20260930234614_research_assisted_order_quote_provider_hold.sql',
  'supabase/migrations/20261001024018_research_assisted_order_quote_history_immutability.sql',
  'supabase/research-notification-outbox.sql',
  'supabase/migrations/20261001040349_research_assisted_order_quote_audit_store.sql',
  'supabase/migrations/20261001040351_research_assisted_order_quote_effects.sql',
  'supabase/migrations/20261001044200_research_assisted_order_quote_history_reissue.sql',
  'supabase/migrations/20261001062651_research_assisted_order_quote_no_funds_disposition.sql',
  'supabase/migrations/20261001085559_research_assisted_order_quote_provider_journal.sql',
  'supabase/migrations/20261001102904_research_assisted_order_quote_provider_execution.sql',
  'supabase/migrations/20261001115512_research_assisted_order_quote_provider_settlement.sql',
  'supabase/migrations/20261001160730_research_assisted_order_provider_quarantine_isolation.sql',
];
const TRIGGERS = [
  ['research_assisted_order_requests','research_assisted_order_paid_hold','O'],
  ['research_assisted_order_requests','hl12_observed_cancel','O'],
  ['research_assisted_order_requests','hl12_history_progression','O'],
  ['research_assisted_order_requests','aa_hl12_disposition_terminal','O'],
  ['research_assisted_order_requests','aaa_adp01_uncertainty','A'],
  ['research_assisted_order_requests','adp03_request_identity','A'],
  ['research_assisted_order_events','research_assisted_order_events_append_only','A'],
  ['research_assisted_order_events','research_assisted_order_paid_event_evidence','A'],
  ['research_assisted_order_events','hl12_disposition_cancel_event','O'],
  ['research_assisted_order_events','adp03_paid_event','A'],
  ['research_notification_outbox','hl12_payment_effects_outbox_guard','A'],
  ['research_notification_outbox','hl12_payment_effects_outbox_truncate','A'],
  ['research_notification_outbox','hl12_disposition_effects_outbox','O'],
  ['research_notification_outbox','hl12_disposition_effects_truncate','O'],
].map(row => row.join('|')).sort();
const HELD = ['atomic commit and receipt durability', 'source-writer guards and currentness',
  'competing writers and revocation ordering', 'expiry while waiting', 'liveness',
  'managed database and production Auth', 'live intake, notifications and deployment'];
const UNAVAILABLE = { state: 'unavailable', code: 'quick_order_currentness_not_implemented' };
const sha = value => createHash('sha256').update(value).digest('hex');
const lf = value => value.replaceAll('\r\n', '\n');
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const j = value => q(JSON.stringify(value)) + '::jsonb';
const parseLastJson = output => JSON.parse(output.split(/\r?\n/).filter(line => /^(?:\{|\[)/.test(line)).at(-1));
const section = (source, delimiter) => {
  const parts = source.split(delimiter);
  assert.equal(parts.length, 3, 'Expected exactly one reviewed source section');
  return parts[1];
};

let containerId = null;
let containerName = null;
let invocationLabel = null;
const OWNER_LABEL = 'com.xenios.quick-order-currentness-verifier';
let interrupted = null;
let activeChild = null;
const evidence = [];
const loadedSources = new Map();
const signalHandlers = new Map(['SIGINT','SIGTERM'].map(signal => [signal, () => {
  interrupted = signal;
  activeChild?.kill();
}]));
for (const [signal, handler] of signalHandlers) process.once(signal, handler);

// Arguments are fixed arrays, never interpolated shell commands. Output and
// runtime are bounded. Failures preserve exit/signal/timeout evidence without
// printing SQL bodies or inherited environment values.
function command(program, args, { input = '', cleanup = false, timeoutMs = 45000, trim = true } = {}) {
  if (interrupted && !cleanup) return Promise.reject(new Error('Interrupted'));
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { windowsHide: true, shell: false, stdio: ['pipe','pipe','pipe'] });
    activeChild = child;
    let stdout = '', stderr = '', bytes = 0, overflow = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    // Node's stream decoder retains incomplete UTF-8 across chunk boundaries.
    // Per-chunk Buffer.toString would corrupt a split non-ASCII source character.
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    const collect = key => chunk => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes > 4 * 1024 * 1024) { overflow = true; child.kill(); return; }
      if (key === 'stdout') stdout += chunk; else stderr += chunk;
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    child.stdin.on('error', () => {});
    child.on('error', error => {
      clearTimeout(timer);
      if (activeChild === child) activeChild = null;
      evidence.push({ command: program, spawnError: error.code ?? 'unknown' });
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (activeChild === child) activeChild = null;
      const result = { code, signal, timedOut, overflow, bytes };
      evidence.push({ command: program, ...result });
      if (code !== 0 || signal || timedOut || overflow || (interrupted && !cleanup)) {
        reject(Object.assign(new Error('Bounded command failed'), { ...result, stderr }));
      } else resolve(trim ? stdout.trim() : stdout);
    });
    child.stdin.end(input);
  });
}

let definition = '';
async function sql(body) {
  assert.match(containerId ?? '', /^[0-9a-f]{64}$/);
  const bind = definition ? `set research_health_quick_order.currentness_definition=${q(definition)};\n` : '';
  return command('docker', ['exec','-i',containerId,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'], {
    input: "\\set VERBOSITY verbose\nset statement_timeout='30s';\n" + bind + body + '\n',
  });
}
async function refused(body, state) {
  let failure;
  try { await sql(body); } catch (error) { failure = error; }
  assert.ok(failure, `Expected SQLSTATE ${state}`);
  assert.equal(failure.timedOut, false, 'A timeout is not an expected refusal');
  assert.equal(failure.overflow, false, 'An output limit is not an expected refusal');
  assert.equal(failure.signal, null, 'A signal is not an expected refusal');
  assert.match(failure.stderr ?? '', new RegExp(`ERROR:\\s+${state}:`));
}
async function canonical() {
  // Actual integrity routine called for every measured boundary, not a substitute
  // JSON assertion or a fingerprint adopted from an unqualified target.
  await sql('select public.research_assisted_order_provider_settlement_integrity();');
  const triggers = (await sql(`select c.relname||'|'||t.tgname||'|'||t.tgenabled
    from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal
    and c.relnamespace='public'::regnamespace and c.relname in
      ('research_assisted_order_requests','research_assisted_order_events','research_notification_outbox')
    order by c.relname,t.tgname;`)).split(/\r?\n/).filter(Boolean).sort();
  assert.deepEqual(triggers, TRIGGERS);
  return sql('select public.research_assisted_order_provider_schema_fingerprint();');
}
async function assertUnavailable() {
  assert.deepEqual(parseLastJson(await sql(`select ${PREFIX}read_current_authority()::text;`)), UNAVAILABLE);
}
async function currentRows() {
  return sql(`select jsonb_build_object('head',(select coalesce(jsonb_agg(to_jsonb(h)),'[]') from ${PREFIX}authority_head h),
    'revisions',(select coalesce(jsonb_agg(to_jsonb(r) order by revision_id),'[]') from ${PREFIX}authority_revisions r))::text;`);
}

try {
  const args = process.argv.slice(2);
  assert.deepEqual(args.filter(value => value.startsWith('--')),
    ['--allow-disposable-currentness','--receipt','--receipt-sha256','--source-commit'],
    'Separate execution authority, pinned receipt and exact source are required');
  assert.equal(args.length, 7);
  const receiptFile = args[2], receiptHash = args[4], sourceCommit = args[6];
  assert.match(receiptHash ?? '', /^[0-9a-f]{64}$/);
  assert.match(sourceCommit ?? '', /^[0-9a-f]{40}$/);
  assert.equal(process.version, 'v20.19.0', 'Use separately qualified pinned Node');
  for (const key of ['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','DOCKER_HOST']) {
    assert.equal(process.env[key], undefined, 'Remote/database overrides are forbidden');
  }
  const root = await realpath(process.cwd());
  const evidenceRoot = await realpath(path.join(root, 'docs/health-launch/quick-order-20261005/evidence'));
  const receiptPath = await realpath(path.resolve(root, receiptFile));
  assert.equal(path.dirname(receiptPath), evidenceRoot, 'Use an owned evidence receipt');
  const receiptBytes = await readFile(receiptPath);
  assert.ok(receiptBytes.length <= 256 * 1024);
  assert.equal(sha(receiptBytes), receiptHash, 'Externally pinned receipt bytes');
  const receipt = JSON.parse(receiptBytes.toString('utf8'));
  assert.deepEqual(Object.keys(receipt).sort(), ['files','schemaVersion','sourceCommit']);
  assert.equal(receipt.schemaVersion, 'quick-order-currentness-source-receipt-v1');
  assert.equal(receipt.sourceCommit, sourceCommit);
  assert.ok(Array.isArray(receipt.files) && receipt.files.length <= 256);
  const pins = new Map();
  for (const file of receipt.files) {
    assert.deepEqual(Object.keys(file).sort(), ['path','sha256lf']);
    assert.match(file.path, /^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/);
    assert.ok(!/(^|\/)\.{1,2}(\/|$)|\/\/|\/$/.test(file.path));
    assert.match(file.sha256lf, /^[0-9a-f]{64}$/);
    assert.ok(!pins.has(file.path));
    pins.set(file.path, file.sha256lf);
  }
  async function load(relative) {
    if (loadedSources.has(relative)) return loadedSources.get(relative);
    assert.ok(pins.has(relative), `Missing external source binding: ${relative}`);
    const filename = await realpath(path.join(root, relative));
    assert.ok(filename.startsWith(root + path.sep));
    const bytes = await readFile(filename);
    assert.ok(bytes.length <= 4 * 1024 * 1024);
    const text = lf(bytes.toString('utf8'));
    assert.equal(sha(text), pins.get(relative), `Source receipt mismatch: ${relative}`);
    // Confirm the reviewed commit contains the same bytes. No network/fetch.
    const committed = await command('git', ['show', `${sourceCommit}:${relative}`], { trim: false });
    assert.equal(sha(lf(committed)), pins.get(relative), `Git source mismatch: ${relative}`);
    loadedSources.set(relative, text);
    return text;
  }
  const bindings = JSON.parse(await load(BINDINGS));
  assert.equal(bindings.inventory.length, 55);
  assert.equal(new Set(bindings.inventory.map(file => file.path)).size, 55);
  assert.deepEqual(bindings.canonicalTriggers.map(t => [t.relation,t.name,t.enabled].join('|')).sort(), TRIGGERS);
  assert.match(bindings.base, /^[0-9a-f]{40}$/);
  for (const file of bindings.inventory) {
    assert.match(file.sha256lf, /^[0-9a-f]{64}$/);
    const historical = await command('git', ['show', `${bindings.base}:${file.path}`], { trim: false });
    await load(file.path);
    assert.equal(sha(lf(historical)), file.sha256lf,
      `Historical reviewed baseline mismatch: ${file.path}`);
  }
  for (const file of [...OWN_SOURCE, ...BASELINE_SQL]) await load(file);
  const candidate = loadedSources.get(CANDIDATE + '.sql');
  definition = sha(section(candidate, '$currentness_install$') + section(candidate, '$currentness_fingerprint$'));
  // The prose markers have distinct suffixes; take only the reviewed SQL block.
  const rollbackSql = loadedSources.get(CANDIDATE + '.rollback.md')
    .split('-- CURRENTNESS_EMPTY_ROLLBACK_BEGIN\n')[1]?.split('-- CURRENTNESS_EMPTY_ROLLBACK_END')[0];
  assert.ok(rollbackSql?.startsWith('begin;'));
  const contexts = JSON.parse(await command('docker', ['context','inspect']));
  assert.equal(contexts.length, 1);
  assert.match(contexts[0].Endpoints?.docker?.Host ?? '', /^(?:npipe:\/\/|unix:\/\/)/, 'Local Docker endpoint only');
  const image = JSON.parse(await command('docker', ['image','inspect','postgres:17-alpine']))[0];
  assert.match(image.Id, /^sha256:[0-9a-f]{64}$/);
  // Record identity before launch: an interrupted CLI can create a container
  // without returning its ID. Cleanup must verify this invocation's label/name.
  invocationLabel = randomUUID();
  containerName = 'xenios-quick-order-currentness-' + invocationLabel;
  containerId = await command('docker', ['run','-d','--rm','--pull=never','--name',
    containerName, '--label', OWNER_LABEL + '=' + invocationLabel, '--network','none','--tmpfs','/var/lib/postgresql/data',
    '-e','POSTGRES_HOST_AUTH_METHOD=trust',image.Id]);
  assert.match(containerId, /^[0-9a-f]{64}$/);
  let ready = false;
  for (let n = 0; n < 40; n++) {
    try { await command('docker', ['exec',containerId,'pg_isready','-U','postgres'], { timeoutMs: 3000 }); ready = true; break; }
    catch { if (interrupted) throw new Error('Interrupted'); await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  assert.ok(ready, 'Disposable PostgreSQL readiness is bounded');
  const container = JSON.parse(await command('docker', ['inspect',containerId]))[0];
  assert.equal(container.Name, '/' + containerName);
  assert.equal(container.Config.Labels[OWNER_LABEL], invocationLabel);
  assert.equal(container.HostConfig.NetworkMode, 'none');
  assert.equal(Object.keys(container.HostConfig.PortBindings ?? {}).length, 0);
  assert.match(await sql('show server_version;'), /^17\.11(?:\D|$)/);
  console.log(JSON.stringify({ kind: 'source_identity', sourceCommit, receiptHash, definition,
    files: Object.fromEntries(pins), containerId, imageId: image.Id, network: 'none', publishedPorts: 0 }));
  // Synthetic bootstrap is intentionally explicit and isolated. Defaults are
  // permissive before the candidate, making its own ACL revocations meaningful.
  await sql('create schema extensions;create extension pgcrypto with schema extensions;');
  for (const file of BASELINE_SQL) await sql(loadedSources.get(file));
  await sql(`grant usage on schema public to anon,authenticated,service_role;
    alter role service_role bypassrls;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
  const before = await canonical();
  const precheck = loadedSources.get(CANDIDATE + '.precheck.sql');
  const postcheck = loadedSources.get(CANDIDATE + '.postcheck.sql');
  await sql(precheck);
  await refused(`begin;create table ${PREFIX}authority_head(singleton boolean);\n${candidate}`, '55000');
  await sql(candidate);
  await sql(postcheck);
  assert.equal(await canonical(), before, 'Actual fence unchanged after install');
  assert.equal(await sql(`select count(*) from ${PREFIX}authority_head;`), '0', 'No authority seed');
  await assertUnavailable();
  const empty = await currentRows();
  await sql(candidate);
  await sql(postcheck);
  assert.equal(await currentRows(), empty);
  assert.equal(await canonical(), before, 'Actual fence unchanged after exact reapply');
  // Exercise the exact documented rollback while no retained record exists.
  await sql(precheck);
  await sql(rollbackSql);
  assert.equal(await canonical(), before, 'Actual fence unchanged after rollback');
  await sql(precheck);
  assert.equal(await sql(`select count(*) from pg_proc where pronamespace='public'::regnamespace and
    (proname in ('research_health_quick_order_publish_revision','research_health_quick_order_revoke_revision',
      'research_health_quick_order_read_current_authority') or proname like 'research\\_health\\_quick\\_order\\_currentness\\_%' escape '\\');`), '0');
  assert.equal(await sql(`select count(*) from pg_class where relnamespace='public'::regnamespace
    and relname like 'research\\_health\\_quick\\_order\\_authority\\_%' escape '\\';`), '0');
  await sql(candidate);
  await sql(postcheck);

  const publication = {
    schemaVersion: 'quick-order-authority-v1', revisionId: '00000000-0000-4000-8000-000000000001',
    sourceCommit: '1'.repeat(40), bundleSha256: '2'.repeat(64),
    artifacts: ['catalog','bindings','reconciliation','health_legal','configuration','normalized_decision_inputs']
      .map((kind, i) => ({ kind, path: `synthetic/${kind}.json`, sha256: String(i + 3).repeat(64) })),
    sourceRefs: ['synthetic-reviewed-source'], applicabilityRefs: ['synthetic-unapproved-health-scope'],
    effectiveFrom: '2026-10-06T00:00:00.000Z', effectiveUntil: null,
  };
  for (const key of Object.keys(publication)) {
    const missing = { ...publication }; delete missing[key];
    await refused(`select ${PREFIX}publish_revision(${j(missing)});`, '22023');
  }
  for (const invalid of [null, [], { ...publication, active: true }, { ...publication, token: 'synthetic-never-accepted' },
    { ...publication, effectiveFrom: '2026-02-30T00:00:00.000Z' },
    { ...publication, effectiveUntil: publication.effectiveFrom },
    { ...publication, sourceRefs: ['https://synthetic.invalid/'] },
    { ...publication, artifacts: publication.artifacts.map((a,i) => i ? a : { ...a, path: '../catalog.json' }) },
    { ...publication, artifacts: publication.artifacts.map((a,i) => i ? a : { ...a, url: 'https://synthetic.invalid/' }) },
  ]) await refused(`select ${PREFIX}publish_revision(${j(invalid)});`, '22023');
  assert.equal(await currentRows(), empty, 'Refused publication creates no rows');
  const published = parseLastJson(await sql(`select ${PREFIX}publish_revision(${j(publication)})::text;`));
  assert.deepEqual(published, { state: 'held', revisionId: publication.revisionId, writerEpoch: '1' });
  const retained = await sql(`select to_jsonb(r)::text from ${PREFIX}authority_revisions r;`);
  assert.equal(parseLastJson(retained).published_by, 'postgres', 'Audit identity is database-derived');
  await assertUnavailable();
  await sql(`select ${PREFIX}publish_revision(${j(publication)});`);
  assert.equal(await sql(`select to_jsonb(r)::text from ${PREFIX}authority_revisions r;`), retained);
  const current = await currentRows();
  await refused(`select ${PREFIX}publish_revision(${j({ ...publication, bundleSha256: 'f'.repeat(64) })});`, '23505');
  assert.equal(await currentRows(), current);
  const forced = parseLastJson(await sql(`begin;update ${PREFIX}authority_head set state='active',
    active_revision_id=${q(publication.revisionId)};select ${PREFIX}read_current_authority()::text;rollback;`));
  assert.deepEqual(forced, UNAVAILABLE, 'Manual active head confers no authority');
  await sql(`select ${PREFIX}revoke_revision(${q(publication.revisionId)},'synthetic-hold');`);
  await assertUnavailable();
  assert.equal(await sql(`select to_jsonb(r)::text from ${PREFIX}authority_revisions r;`), retained);
  await refused(rollbackSql, '55000');
  assert.equal(await sql(`select to_jsonb(r)::text from ${PREFIX}authority_revisions r;`), retained, 'Rollback retains evidence');

  for (const role of ['anon','authenticated','service_role']) {
    for (const call of [`publish_revision(${j(publication)})`,
      `revoke_revision(${q(publication.revisionId)},'synthetic-denied')`, 'read_current_authority()',
      'currentness_integrity()', 'currentness_schema_fingerprint()', `currentness_valid_publication(${j(publication)})`]) {
      await refused(`set role ${role};select ${PREFIX}${call};`, '42501');
    }
    for (const table of ['authority_head','authority_revisions']) {
      for (const statement of [`select * from ${PREFIX}${table}`, `delete from ${PREFIX}${table}`,
        `truncate ${PREFIX}${table}`, `insert into ${PREFIX}${table} default values`]) {
        await refused(`set role ${role};${statement};`, '42501');
      }
    }
  }
  for (const drift of [
    `grant execute on function ${PREFIX}publish_revision(jsonb) to service_role;`,
    `grant select(publication) on ${PREFIX}authority_revisions to authenticated;`,
    `alter table ${PREFIX}authority_head disable row level security;`,
    `alter table ${PREFIX}authority_head add column unexpected text;`,
    `create function ${PREFIX}publish_revision(text) returns boolean language sql as 'select true';`,
    `create or replace function ${PREFIX}read_current_authority() returns jsonb language sql as 'select null::jsonb';`,
  ]) await refused('begin;' + drift + '\n' + candidate, '55000');
  await sql(candidate);
  await sql(precheck);
  await sql(postcheck);
  assert.equal(await sql(`select to_jsonb(r)::text from ${PREFIX}authority_revisions r;`), retained);
  assert.equal(await canonical(), before);
  for (const [file, original] of loadedSources) assert.equal(lf(await readFile(file, 'utf8')), original, 'Source changed during verification');
  console.log(JSON.stringify({ kind: 'bounded_checks_complete', disposition: 'HELD_NOT_IMPLEMENTED',
    checked: ['exact absent/install/reapply/empty rollback','canonical fence and fourteen trigger states',
      'closed held metadata publication','role denial','retained revision evidence','schema/ACL drift refusal'],
    omitted: HELD, sourceCommit, receiptHash, commands: evidence }));
  process.exitCode = 2;
} catch (error) {
  console.error(JSON.stringify({ kind: 'verification_incomplete', disposition: 'HELD_NOT_IMPLEMENTED',
    failure: error instanceof assert.AssertionError ? 'assertion_failed' : 'operation_failed',
    interrupted, omitted: HELD, commands: evidence }));
  process.exitCode = interrupted === 'SIGINT' ? 130 : interrupted === 'SIGTERM' ? 143 : 1;
} finally {
  if (containerName && invocationLabel) {
    try {
      let owned;
      // A bounded lookup also covers a timed-out/interrupted run whose stdout
      // never assigned containerId. Absence/daemon failure is not removal proof.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const inspected = JSON.parse(await command('docker', ['inspect',containerName], { cleanup: true, timeoutMs: 5000 }));
          assert.equal(inspected.length, 1);
          const found = inspected[0];
          assert.equal(found.Name, '/' + containerName);
          assert.equal(found.Config?.Labels?.[OWNER_LABEL], invocationLabel);
          assert.match(found.Id, /^[0-9a-f]{64}$/);
          if (containerId) assert.equal(found.Id, containerId);
          owned = found.Id;
          break;
        } catch {
          if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      assert.ok(owned, 'Could not establish invocation-owned cleanup target');
      await command('docker', ['rm','-f',owned], { cleanup: true });
      console.log(JSON.stringify({ kind: 'cleanup', containerId: owned, removed: true, syntheticOnly: true }));
    } catch {
      console.error(JSON.stringify({ kind: 'cleanup_unresolved', containerId, containerName, invocationLabel }));
      process.exitCode = 1;
    }
  }
  for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
}

// LENS-01 synthetic, disposable proof. No managed target, provider, SMTP or HTTP.
// Exact historical census + exact current census + unchanged migration 88.
// One no-network PostgreSQL container; distinct local databases preserve each
// refused case rather than deleting/relabeling notices to manufacture success.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fixture, id, request, member, line, reference, q, j, service, json }
  from './research_assisted_order_quote_provider_journal_harness.mjs';

assert.equal(process.version, 'v20.19.0', 'Use the isolated pinned Node runtime');
const runFile = promisify(execFile);
const digest = value => createHash('sha256').update(value).digest('hex');
const originalRevision = 'abf151a47006bce54bd35c76b5a6ec006500e097';
const pre80Path = 'supabase/verification/research_assisted_order_quote_pre80_preflight.sql';
const pre88Path = 'supabase/verification/research_assisted_order_quote_effects_precheck.sql';
const post88Path = 'supabase/verification/research_assisted_order_quote_effects_postcheck.sql';
const auditPath = 'supabase/migrations/20261001040349_research_assisted_order_quote_audit_store.sql';
const effectsPath = 'supabase/migrations/20261001040351_research_assisted_order_quote_effects.sql';
const outboxPath = 'supabase/research-notification-outbox.sql';
const bootstrapPath = 'supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql';
const bridgePath = 'supabase/migrations/20260815150000_research_assisted_order_bridge.sql';
const predecessorPaths = [
  'supabase/migrations/20260930191323_research_assisted_order_quote_payment_guard.sql',
  'supabase/migrations/20260930193033_research_assisted_order_quote_paid_hold.sql',
  'supabase/migrations/20260930202413_research_assisted_order_quote_payment_authority.sql',
  'supabase/migrations/20260930205725_research_assisted_order_quote_access_finance_bound.sql',
  'supabase/migrations/20260930230541_research_assisted_order_quote_evidence_corrections.sql',
  'supabase/migrations/20260930234614_research_assisted_order_quote_provider_hold.sql',
  'supabase/migrations/20261001024018_research_assisted_order_quote_history_immutability.sql',
];
const sourcePaths = [
  'supabase/verification/research_assisted_order_quote_pre80_preflight_local.mjs',
  'supabase/verification/research_assisted_order_quote_provider_journal_harness.mjs',
  pre80Path, pre88Path, post88Path, bootstrapPath, bridgePath, outboxPath,
  ...predecessorPaths, auditPath, effectsPath,
];
const sourceBytes = new Map(await Promise.all(sourcePaths.map(async path => [path, await readFile(path)])));
const text = path => sourceBytes.get(path).toString('utf8');
const sourceHashes = Object.fromEntries([...sourceBytes].map(([path, bytes]) => [path, digest(bytes)]));
assert.equal(sourceHashes[auditPath], 'a6814b1c8f0cd42b24cc9f3ca17e3950d82811ada75abb8dba698441900457b0');
assert.equal(sourceHashes[effectsPath], '8121e537df0f3028b73be5c03b66912b8a04498c8d646aa7f5d1edba4071f743');
const originalBytes = (await runFile('git', ['show', `${originalRevision}:${pre80Path}`],
  { encoding: 'buffer', windowsHide: true, maxBuffer: 1024 * 1024 })).stdout;
const originalSql = originalBytes.toString('utf8');
assert.match(originalSql, /nonterminal_frozen_rows_requiring_decision/);
assert.doesNotMatch(originalSql, /research_notification_outbox/);
for (const path of [pre80Path, pre88Path]) {
  assert.match(text(path), /begin isolation level repeatable read read only;/i);
  assert.match(text(path), /set local row_security\s*=\s*off;/i);
  assert.match(text(path), /set local statement_timeout\s*=\s*'10s';/i);
  assert.match(text(path), /set local lock_timeout\s*=\s*'2s';/i);
}

const statuses = ['pending', 'processing', 'sent', 'delivered', 'failed_retryable', 'failed_permanent', 'cancelled'];
const canonicalTemplate = 'research.assisted_order.status_changed.customer';
const actor = id(4, 1800);
const sentinel = 'SYNTHETIC_PRIVATE_NOTICE_SENTINEL';
const zero = { legacy_paid_notices: 0, reserved_verification_keys: 0,
  adoption_required_outbox_rows: 0, invalid_status_envelopes: 0, delivery_status_counts: {},
  notification_chain_gate: 'CLEAR_COUNTS_ONLY_NOT_AUTHORIZATION' };
const notificationKeys = Object.keys(zero);
const startedAt = performance.now();
let containerId = null, groups = 0, refusals = 0, databaseCount = 0;
const reports = [];
const pass = label => { groups++; console.log(`LENS01_SQL PASS ${label}`); };
const jsonRows = output => output.split(/\r?\n/).filter(row => row.startsWith('{')).map(row => JSON.parse(row));

function startSql(database, sql, marker = null, open = false) {
  assert.match(containerId ?? '', /^[0-9a-f]{64}$/);
  assert.match(database, /^(?:postgres|lens01_[a-z0-9_]+)$/);
  let resolveReady, rejectReady, stdout = '', stderr = '';
  const ready = marker ? new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; }) : null;
  const child = spawn('docker', ['exec', '-i', containerId, 'psql', '-X', '-q', '-A', '-t',
    '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database], { windowsHide: true });
  const timer = setTimeout(() => child.kill(), 45_000);
  child.stdout.on('data', chunk => { stdout += chunk; if (marker && stdout.includes(marker)) resolveReady(); });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    child.on('error', error => { clearTimeout(timer); rejectReady?.(error); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) {
        if (marker && !stdout.includes(marker)) rejectReady?.(new Error('SQL marker was not reached'));
        resolve(stdout.trim());
      } else {
        const error = Object.assign(new Error(`Disposable psql exited ${code}`), { code, stdout, stderr });
        rejectReady?.(error); reject(error);
      }
    });
  });
  done.catch(() => {}); ready?.catch(() => {});
  const input = `\\set VERBOSITY verbose\nset timezone='UTC';set statement_timeout='30s';set lock_timeout='5s';\n${sql}\n`;
  if (open) child.stdin.write(input); else child.stdin.end(input);
  return { done, ready, finish: tail => child.stdin.end(`${tail}\n`) };
}
const psql = (database, sql) => startSql(database, sql).done;
async function refused(database, sql, state, detail = null) {
  let error;
  try { await psql(database, sql); } catch (failure) { error = failure; }
  assert.ok(error, `Expected SQLSTATE ${state}`);
  assert.match(error.stderr ?? '', new RegExp(`ERROR:\\s+${state}:`));
  if (detail) assert.match(error.stderr, new RegExp(`DETAIL:\\s+${detail}(?:\\r?\\n|$)`));
  refusals++;
  return error;
}
async function createDatabase(name, { withOutbox = true } = {}) {
  assert.match(name, /^lens01_[a-z0-9_]+$/);
  await runFile('docker', ['exec', containerId, 'createdb', '-U', 'postgres', '-T', 'template0', name], { windowsHide: true });
  databaseCount++;
  // One psql transport, unchanged SQL and transaction boundaries. In particular,
  // M71 still owns its BEGIN/COMMIT and no outer transaction encloses the batch.
  await psql(name, [text(bootstrapPath), text(bridgePath), ...(withOutbox ? [
    'create schema extensions;create extension pgcrypto with schema extensions;', text(outboxPath),
  ] : [])].join('\n'));
}
async function through87(database) {
  // These files are immutable inputs. Session bounds cover files with their own
  // BEGIN; only the known no-BEGIN files receive an explicit outer transaction.
  const noBegin = new Set([predecessorPaths[0], predecessorPaths[1], predecessorPaths[3], auditPath]);
  const files = [...predecessorPaths, auditPath].map(path => {
    const sql = text(path);
    return noBegin.has(path) ? `begin;${sql}\ncommit;` : sql;
  });
  // ON_ERROR_STOP remains in force. Files commit individually exactly as before;
  // batching transport does not make the migration chain one transaction.
  await psql(database, files.join('\n'));
}
function notice({ key, status = 'pending', payload = { status: 'paid' }, template = canonicalTemplate }) {
  return `insert into public.research_notification_outbox(event_key,event_type,recipient,template_key,payload,status,
      attempt_count,last_attempt_at,provider_message_id,completed_at)
    values(${q(key)},'assisted_order.status_changed','synthetic-census@example.test',${q(template)},${j(payload)},${q(status)},
      1,'2026-01-01T00:00:00.000Z',${q(`${sentinel}-${key}`)},
      ${['sent', 'delivered', 'cancelled'].includes(status) ? "'2026-01-01T00:00:00.000Z'" : 'null'});
    insert into public.research_notification_attempts(outbox_id,attempt,outcome,error_summary)
      select id,1,'synthetic-recorded',${q(sentinel)} from public.research_notification_outbox where event_key=${q(key)};`;
}
function expectedNotification(patch = {}) { return { ...zero, ...patch }; }
function checkNotification(value, expected, schemaVersion) {
  assert.equal(value.schemaVersion, schemaVersion);
  assert.deepEqual(Object.fromEntries(notificationKeys.map(key => [key, value[key]])), expected);
  const serialized = JSON.stringify(value);
  for (const privateText of [sentinel, '@example.test', 'XRR-', 'synthetic-census', 'provider_message_id', 'recipient'])
    assert.ok(!serialized.includes(privateText), `Census must not expose ${privateText}`);
  return value;
}
async function census(database, expected, { stage = 80, role = null } = {}) {
  const path = stage === 80 ? pre80Path : pre88Path;
  const output = await psql(database, `${role ? `set role ${role};` : ''}${text(path)}`);
  const rows = jsonRows(output);
  assert.equal(rows.length, 1, 'Exactly one complete notification census object');
  const value = checkNotification(rows[0], expected, `hl12_pre${stage}_notification_census_v1`);
  if (stage === 80) {
    assert.deepEqual(Object.keys(value).sort(), ['schemaVersion', ...notificationKeys].sort());
    assert.match(output.split(/\r?\n/).at(-2) ?? '', /^\d+$/, 'Historical decision count remains the preceding result');
  } else {
    assert.ok(Number.isInteger(value.verifications));
    assert.match(value.bound_verifier_md5, /^[a-f0-9]{32}$/);
    assert.match(value.private_verifier_md5, /^[a-f0-9]{32}$/);
  }
  reports.push({ database, stage, ...value });
  return value;
}
async function snapshot(database) {
  const names = (await psql(database, `select relname from pg_class where relnamespace='public'::regnamespace
    and relkind='r' and (relname like 'research_assisted_order_%' or relname in('research_notification_outbox','research_notification_attempts')) order by relname;`))
    .split(/\r?\n/).filter(Boolean);
  for (const name of names) assert.match(name, /^research_[a-z0-9_]+$/);
  const rows = names.map(name => `${q(name)},(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.${name} t)`).join(',');
  const data = await psql(database, `select jsonb_build_object(${rows})::text;`);
  const schema = await psql(database, `select jsonb_build_object(
    'columns',(select jsonb_agg(jsonb_build_array(c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl::text) order by c.relname,a.attnum)
      from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      where c.relnamespace='public'::regnamespace and c.relname like 'research_%'),
    'routines',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl::text) order by p.oid::regprocedure::text)
      from pg_proc p where pronamespace='public'::regnamespace and proname like 'research_assisted_order_%'),
    'constraints',(select jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid)) order by c.relname,k.conname)
      from pg_constraint k join pg_class c on c.oid=k.conrelid where c.relnamespace='public'::regnamespace and c.relname like 'research_%'),
    'triggers',(select jsonb_agg(jsonb_build_array(t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) order by t.tgrelid::regclass::text,t.tgname)
      from pg_trigger t where not t.tgisinternal and t.tgrelid in(select oid from pg_class where relnamespace='public'::regnamespace))
  )::text;`);
  return { data, schema };
}
async function refuse88Unchanged(database, detail) {
  const before = await snapshot(database);
  await refused(database, text(effectsPath), '55000', detail);
  assert.deepEqual(await snapshot(database), before, 'Refused M88 must leave stored rows, attempts and schema byte-identical');
  assert.equal(await psql(database, `select count(*) from pg_attribute where attrelid='public.research_notification_outbox'::regclass
    and attname='assisted_order_verification_id' and not attisdropped;`), '0');
  console.log(`LENS01_SQL REFUSAL ${JSON.stringify({ database, detail, storedDataSha256: digest(before.data), schemaSha256: digest(before.schema), bindingColumnAbsent: true })}`);
}

try {
  const image = JSON.parse((await runFile('docker', ['image', 'inspect', 'postgres:17-alpine'], { windowsHide: true })).stdout)[0];
  containerId = (await runFile('docker', ['run', '-d', '--rm', '--pull=never', '--name', `xenios-hl12-lens01-${process.pid}-local`,
    '--network', 'none', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine'], { windowsHide: true })).stdout.trim();
  assert.match(containerId, /^[0-9a-f]{64}$/);
  let ready = false;
  for (let n = 0; n < 40; n++) {
    try { await runFile('docker', ['exec', containerId, 'pg_isready', '-U', 'postgres'], { windowsHide: true }); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  assert.ok(ready, 'Disposable PostgreSQL ready');
  const environment = JSON.parse((await runFile('docker', ['inspect', containerId, '--format', '{{json .}}'], { windowsHide: true })).stdout);
  assert.equal(environment.HostConfig.NetworkMode, 'none');
  assert.equal(Object.keys(environment.HostConfig.PortBindings ?? {}).length, 0);
  const postgresVersion = await psql('postgres', 'show server_version;');
  assert.match(postgresVersion, /^17\./);
  console.log(`LENS01_SQL ENV ${JSON.stringify({ node: process.version, postgresVersion, imageId: image.Id,
    imageDigests: image.RepoDigests, containerId, network: 'none', publishedPorts: 0, sourceHashes,
    original: { revision: originalRevision, path: pre80Path, sha256: digest(originalBytes), byteLength: originalBytes.length, encoding: 'base64', bytesBase64: originalBytes.toString('base64') } })}`);

  await createDatabase('lens01_missing', { withOutbox: false });
  const missing = await refused('lens01_missing', text(pre80Path), '42P01');
  assert.ok(!missing.stdout.includes('hl12_pre80_notification_census_v1'));
  pass('missing canonical outbox is unavailable even when earlier request result sets were emitted');

  await createDatabase('lens01_legacy');
  const statusCounts = Object.fromEntries(statuses.map(status => [status, 1]));
  const legacyNotices = statuses.map((status, n) => {
    const publicReference = n % 3 === 0 ? reference(1800) : n % 3 === 1 ? reference(1801) : 'XRR-SYNTHETIC-NO-MATCH';
    return notice({ key: `synthetic-legacy-${status}`, status, payload: { publicReference, status: 'paid', customerMessage: sentinel } });
  });
  await psql('lens01_legacy', `${fixture(1800, 'closed')}${fixture(1801, 'cancelled')}` + legacyNotices.join('\n') +
    notice({ key: 'assisted-order:synthetic-closed:payment-verification:reserved-only', status: 'pending', template: 'synthetic.unrelated', payload: { status: 'reviewing', internal: sentinel } }) +
    notice({ key: 'assisted-order:synthetic-orphan:payment-verification:overlap', status: 'delivered', payload: { status: 'paid', publicReference: 'XRR-SYNTHETIC-NO-MATCH', customerMessage: sentinel } }) +
    notice({ key: 'synthetic-valid-nonpaid', status: 'pending', payload: { status: 'reviewing' } }) +
    notice({ key: 'synthetic-noncanonical-paid', status: 'pending', template: 'synthetic.unrelated', payload: { status: 'paid' } }));
  statusCounts.pending++; statusCounts.delivered++;
  const legacyExpected = expectedNotification({ legacy_paid_notices: 8, reserved_verification_keys: 2,
    adoption_required_outbox_rows: 9, delivery_status_counts: statusCounts, notification_chain_gate: 'NO_GO' });
  const absent = json(await psql('lens01_legacy', `select jsonb_build_object('quotes',to_regclass('public.research_assisted_order_quotes') is null,
    'observations',to_regclass('public.research_assisted_order_payment_observations') is null,
    'verifications',to_regclass('public.research_assisted_order_payment_verifications') is null)::text;`));
  assert.ok(Object.values(absent).every(value => value === true));
  const originalOutput = await psql('lens01_legacy', originalSql);
  assert.equal(originalOutput.split(/\r?\n/).at(-1), '0');
  assert.equal(jsonRows(originalOutput).length, 0);
  const beforeCensus = await snapshot('lens01_legacy');
  await census('lens01_legacy', legacyExpected);
  assert.deepEqual(await snapshot('lens01_legacy'), beforeCensus);
  console.log(`LENS01_SQL BEFORE ${JSON.stringify({ originalRevision, originalCensusSha256: digest(originalBytes),
    nonterminalFrozenRows: 0, legacyPaidNotices: 8, adoptionRows: 9, financialTablesAbsent: absent })}`);
  pass('original census misses all seven delivery states and closed/cancelled/orphan notices; corrected pre80 union is exact, PII-free and nonmutating');

  await psql('postgres', 'create role lens01_denied_reader nologin bypassrls;create role lens01_rls_reader nologin nobypassrls;');
  await psql('lens01_legacy', `grant usage on schema public to lens01_denied_reader,lens01_rls_reader;
    grant select on public.research_assisted_order_requests,public.research_assisted_order_events to lens01_denied_reader;
    grant select on all tables in schema public to lens01_rls_reader;`);
  await refused('lens01_legacy', `set role lens01_denied_reader;${text(pre80Path)}`, '42501');
  const rlsError = await refused('lens01_legacy', `set role lens01_rls_reader;${text(pre80Path)}`, '42501');
  assert.match(rlsError.stderr, /row-level security/);
  const holder = startSql('lens01_legacy', `begin;lock table public.research_notification_outbox in access exclusive mode;
    select 'LENS01_OUTBOX_LOCK_HELD';`, 'LENS01_OUTBOX_LOCK_HELD', true);
  try {
    await holder.ready;
    await refused('lens01_legacy', text(pre80Path), '55P03');
  } finally { holder.finish('rollback;'); await holder.done; }
  pass('missing privileges, RLS-filtered reads and actual outbox lock timeout fail unavailable rather than report clear counts');

  await through87('lens01_legacy');
  const pre88Legacy = await census('lens01_legacy', legacyExpected, { stage: 88 });
  assert.equal(pre88Legacy.verifications, 0);
  assert.equal(pre88Legacy.canonical_outbox_rows, 11);
  await refuse88Unchanged('lens01_legacy', 'ASSISTED_ORDER_EFFECTS_ADOPTION_REQUIRED');
  pass('exact M88 rejects valid legacy paid notices in any delivery state without changing notice/attempt bytes or adding its column');

  // Isolate the reserved-key predicate: there are no paid-template notices,
  // malformed envelopes, request histories or verifications in this database.
  await createDatabase('lens01_reserved');
  await psql('lens01_reserved', notice({
    key: 'assisted-order:synthetic-unrelated:payment-verification:reserved-only',
    template: 'synthetic.unrelated', payload: { status: 'reviewing' },
  }));
  const reservedExpected = expectedNotification({ reserved_verification_keys: 1,
    adoption_required_outbox_rows: 1, delivery_status_counts: { pending: 1 }, notification_chain_gate: 'NO_GO' });
  await census('lens01_reserved', reservedExpected);
  await through87('lens01_reserved');
  const pre88Reserved = await census('lens01_reserved', reservedExpected, { stage: 88 });
  assert.equal(pre88Reserved.verifications, 0); assert.equal(pre88Reserved.canonical_outbox_rows, 1);
  await refuse88Unchanged('lens01_reserved', 'ASSISTED_ORDER_EFFECTS_ADOPTION_REQUIRED');
  pass('reserved verification event key alone blocks M88 independently of paid-template, malformed-envelope and verification predicates');

  // Permission and RLS failures also remain failures at the pre88 boundary.
  await psql('lens01_legacy', `grant select on all tables in schema public to lens01_denied_reader,lens01_rls_reader;
    revoke select on public.research_notification_outbox from lens01_denied_reader;`);
  await refused('lens01_legacy', `set role lens01_denied_reader;${text(pre88Path)}`, '42501');
  const pre88Rls = await refused('lens01_legacy', `set role lens01_rls_reader;${text(pre88Path)}`, '42501');
  assert.match(pre88Rls.stderr, /row-level security/);
  const beforeMissingTable = await snapshot('lens01_legacy');
  await psql('lens01_legacy', 'alter table public.research_notification_outbox rename to lens01_hidden_outbox;');
  try {
    const pre88Missing = await refused('lens01_legacy', text(pre88Path), '42P01');
    assert.ok(!pre88Missing.stdout.includes('hl12_pre88_notification_census_v1'));
  } finally {
    await psql('lens01_legacy', 'alter table public.lens01_hidden_outbox rename to research_notification_outbox;');
  }
  assert.deepEqual(await snapshot('lens01_legacy'), beforeMissingTable);
  pass('pre88 also refuses missing outbox, permission and RLS-filtered inventory; all unavailable fixtures are synthetic local only');

  await createDatabase('lens01_malformed');
  const invalidPayloads = [{ status: ' paid ' }, { status: '\tpaid\t' }, { status: '\u00a0paid\u00a0' },
    { status: 'PAID' }, { status: 42 }, { status: false }, { status: null }, {}, ['paid'], 'paid', null];
  await psql('lens01_malformed', invalidPayloads.map((payload, n) =>
    notice({ key: `synthetic-malformed-${n}`, status: 'cancelled', payload })).join('\n') +
    notice({ key: 'assisted-order:synthetic:payment-verification:invalid-overlap', status: 'sent', payload: { status: ' paid ' } }));
  const invalidExpected = expectedNotification({ reserved_verification_keys: 1, adoption_required_outbox_rows: 1,
    invalid_status_envelopes: 12, delivery_status_counts: { cancelled: 11, sent: 1 }, notification_chain_gate: 'NO_GO' });
  await census('lens01_malformed', invalidExpected);
  await through87('lens01_malformed');
  await census('lens01_malformed', invalidExpected, { stage: 88 });
  await refuse88Unchanged('lens01_malformed', 'ASSISTED_ORDER_STATUS_ENVELOPE_INVALID');
  pass('padding, tab/NBSP, case, missing, nonstring and nonobject status envelopes mirror M88 refusal; invalid/reserved overlap is counted once in delivery totals');

  await createDatabase('lens01_verified');
  await census('lens01_verified', zero);
  await through87('lens01_verified');
  await psql('lens01_verified', fixture(1810));
  await psql('lens01_verified', `insert into public.research_assisted_order_payment_verifier_grants(auth_user_id,actor_label,granted_by)
    values('${actor}','synthetic-census-finance@example.test','synthetic-local-owner');`);
  const quote = json(await psql('lens01_verified', service(`select public.research_assisted_order_quote_issue('${request(1810)}',
    '[{"lineId":"${line(1810)}"}]',now()+interval '1 day','synthetic-admin')::text;`)));
  await psql('lens01_verified', service(`select public.research_assisted_order_quote_accept('${quote.quoteId}',1,5000,'${member(1810)}');
    select public.research_assisted_order_set_status('${request(1810)}','reviewing','payment_pending','synthetic-admin','admin');
    select public.research_assisted_order_set_status('${request(1810)}','payment_pending','payment_review','synthetic-admin','admin');`));
  const observation = json(await psql('lens01_verified', service(`select public.research_assisted_order_payment_observe(
    '${request(1810)}','${quote.quoteId}','manual',5000,'USD','${reference(1810)}','synthetic-positive-census-evidence',
    '2026-01-01T00:00:00.000Z','${actor}')::text;`)));
  const verified = json(await psql('lens01_verified', service(`select public.research_assisted_order_payment_verify_bound(
    '${request(1810)}','${observation.observationId}','${actor}')::text;`)));
  assert.equal(verified.state, 'paid');
  const verificationOnly = await census('lens01_verified', expectedNotification({ notification_chain_gate: 'NO_GO' }), { stage: 88 });
  assert.equal(verificationOnly.verifications, 1); assert.equal(verificationOnly.canonical_outbox_rows, 0);
  await refuse88Unchanged('lens01_verified', 'ASSISTED_ORDER_EFFECTS_ADOPTION_REQUIRED');
  pass('a real synthetic predecessor verification alone is pre88 NO_GO even with zero notices; no fabricated adoption or financial backfill');

  await createDatabase('lens01_clean');
  await psql('lens01_clean', `${fixture(1820, 'paid')}${fixture(1821, 'reviewing')}` +
    notice({ key: 'synthetic-clean-nonpaid', payload: { status: 'reviewing' } }));
  await census('lens01_clean', zero);
  const cleanPre80 = await psql('lens01_clean', text(pre80Path));
  assert.equal(cleanPre80.split(/\r?\n/).at(-2), '1', 'Notification clearance does not waive the separate historical freeze decision');
  await through87('lens01_clean');
  const cleanPre88 = await census('lens01_clean', zero, { stage: 88 });
  assert.equal(cleanPre88.verifications, 0); assert.equal(cleanPre88.historical_paid_holds, 1);
  const preInstall = await snapshot('lens01_clean');
  await psql('lens01_clean', text(effectsPath));
  const installedOnce = await snapshot('lens01_clean');
  await psql('lens01_clean', text(effectsPath));
  assert.deepEqual(await snapshot('lens01_clean'), installedOnce, 'Exact populated reapply preserves data and schema');
  const beforeRows = JSON.parse(preInstall.data), afterRows = JSON.parse(installedOnce.data);
  // M88's nullable metadata column is the only allowed existing-row shape delta.
  for (const row of afterRows.research_notification_outbox) {
    assert.equal(row.assisted_order_verification_id, null); delete row.assisted_order_verification_id;
  }
  assert.deepEqual(afterRows, beforeRows);
  const post = json(await psql('lens01_clean', text(post88Path)));
  assert.equal(post.bound_intents, 0); assert.equal(post.held_intents, 0); assert.equal(post.canonical_audit_events, 0);
  assert.equal(await psql('lens01_clean', 'select count(*) from public.research_assisted_order_payment_verifications;'), '0');
  pass('clean notification target applies exact M88 twice without history adoption; postcheck is used after install and CLEAR_COUNTS is never deployment authorization');

  for (const [path, bytes] of sourceBytes) assert.deepEqual(await readFile(path), bytes, `Source changed during proof: ${path}`);
  assert.deepEqual((await runFile('git', ['show', `${originalRevision}:${pre80Path}`],
    { encoding: 'buffer', windowsHide: true, maxBuffer: 1024 * 1024 })).stdout, originalBytes);
  console.log(`LENS01_SQL COMPLETE ${JSON.stringify({ result: 'PASS', groups, refusals, databaseCount,
    elapsedSeconds: (performance.now() - startedAt) / 1000, node: process.version, postgresVersion,
    sourceHashes, originalCensusSha256: digest(originalBytes), reports,
    immutableMigrationsUnchanged: true, syntheticOnly: true, managedStateMutated: false,
    realEmail: false, founderDispositionGranted: false, productionReady: false })}`);
} catch (error) {
  console.error(error); if (error?.stderr) console.error(error.stderr); process.exitCode = 1;
} finally {
  if (containerId) {
    assert.match(containerId, /^[0-9a-f]{64}$/);
    await runFile('docker', ['rm', '-f', containerId], { windowsHide: true });
    let absent = false;
    try { await runFile('docker', ['inspect', containerId], { windowsHide: true }); } catch { absent = true; }
    assert.ok(absent, 'Exact disposable container must be absent after cleanup');
    console.log(`LENS01_SQL CLEANUP ${JSON.stringify({ containerId, databasesRemovedWithContainer: databaseCount, postRemovalInspect: 'not_found' })}`);
  }
}

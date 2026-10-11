// SOURCE ONLY; NOT RUN. This is a future disposable SQL verifier, not permission
// to execute it. It never accepts a database URL or uses a managed connection.
// Doc71 authors the disabled currentness source, but its exact source-column
// census seal is still missing. The callable Doc71 fixture suites below are
// authored future controls, with an authored persistent-session driver. Their
// acceptance, proof bindings, CLI dispatch and execution remain pending.
// This entry point refuses before subprocesses while the source receipt is
// PENDING, and before Docker/SQL even after source acceptance until that same
// source/fixture dependency is completed in a separately reviewed successor.
// Historical envelope case/control pairs below are preserved, not new results.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PREFIX = 'public.research_health_quick_order_';
const CANDIDATE = 'supabase/candidates/20261006_research_health_quick_order_currentness';
const BINDINGS = 'docs/health-launch/quick-order-20261005/evidence/doc71-disabled-source-bindings-20261009.json';
const REVIEW = '9a9023e28b7f7faec4274bb3660889519f2b0263';
const PREDECESSOR = 'f581b6bd42b5c32cb7791677159522ddf6274aaa';
const HEAD = PREFIX + 'authority_head';
const REVISIONS = PREFIX + 'authority_revisions';
const HEAD_REMOVAL_TRIGGER = 'research_health_quick_order_head_removal_guard';
const REVISION_TRIGGER = 'research_health_quick_order_revisions_immutable';
const FOREIGN_KEYS = [
  ['research_health_quick_order_head_active_revision_fk','active_revision_id'],
  ['research_health_quick_order_head_published_revision_fk','last_published_revision_id'],
  ['research_health_quick_order_head_revoked_revision_fk','last_revoked_revision_id'],
];
const PRISTINE_HEAD = { singleton: true, writer_epoch: 0, state: 'held',
  active_revision_id: null, last_published_revision_id: null,
  last_revoked_revision_id: null, last_revoke_reason: null };
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
  ['research_assisted_order_requests','adp03_evidence_truncate','A'],
  ['research_assisted_order_requests','adp03_evidence_immutable','A'],
  ['research_assisted_order_events','research_assisted_order_events_append_only','A'],
  ['research_assisted_order_events','research_assisted_order_paid_event_evidence','A'],
  ['research_assisted_order_events','hl12_disposition_cancel_event','O'],
  ['research_assisted_order_events','adp03_paid_event','A'],
  ['research_assisted_order_events','adp03_evidence_truncate','A'],
  ['research_assisted_order_events','adp03_evidence_immutable','A'],
  ['research_assisted_order_events','hl12_disposition_no_truncate','O'],
  ['research_notification_outbox','hl12_payment_effects_outbox_guard','A'],
  ['research_notification_outbox','hl12_payment_effects_outbox_truncate','A'],
  ['research_notification_outbox','hl12_disposition_effects_outbox','O'],
  ['research_notification_outbox','hl12_disposition_effects_truncate','O'],
].map(row => row.join('|')).sort();
const HELD = ['accepted source-column census seal and qualified fixture execution', 'atomic commit and receipt durability', 'source-writer guard qualification',
  'competing writers and revocation ordering', 'expiry while waiting', 'liveness',
  'managed database and production Auth', 'live intake, notifications and deployment'];
const UNAVAILABLE = { state: 'unavailable', code: 'quick_order_currentness_not_implemented' };
const sha = value => createHash('sha256').update(value).digest('hex');
const lf = value => value.replaceAll('\r\n', '\n');
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const j = value => q(JSON.stringify(value)) + '::jsonb';
const textArgument = value => value === null ? 'null::text' : q(value);
const copy = value => JSON.parse(JSON.stringify(value));
const publishCall = fixture => `${PREFIX}publish_revision(${j(fixture.publication)},${textArgument(fixture.text)})`;
const decisionCall = fixture => `${PREFIX}currentness_valid_decision_inputs(${textArgument(fixture.text)},${j(fixture.publication)})`;
// These are synthetic format fixtures, never founder values, publication files,
// accepted census digests, actual catalog identities or operating policy. The
// embedded source SHA and input digests are opaque synthetic shape values. No
// Git delivery SHA, decision self-digest or bundle digest enters decision text.
function decisionFixture(publication) {
  const ref = kind => {
    const artifact = publication.artifacts.find(row => row.kind === kind);
    return { path: artifact.path, sha256: artifact.sha256 };
  };
  const refs = { sourceApprovalRefs: [publication.sourceRefs[0]], applicabilityRefs: [publication.applicabilityRefs[0]] };
  return {
    schemaVersion: 'quick-order-decision-inputs-v1', revisionId: publication.revisionId, sourceCommit: publication.sourceCommit,
    effectiveFrom: publication.effectiveFrom, effectiveUntil: publication.effectiveUntil,
    artifacts: { catalog: ref('catalog'), bindings: ref('bindings'), reconciliation: ref('reconciliation'),
      healthLegal: ref('health_legal'), configuration: ref('configuration') },
    configurationVersion: ref('configuration').sha256,
    healthAgreements: ['Synthetic Health A','Synthetic Health B'].map(kind => ({ kind, version: 'synthetic-v1', ...copy(refs) })),
    offerRules: [{ offeringVariantId: 'synthetic-offering', productId: 'synthetic-product', variantId: 'synthetic-variant',
      workflowModes: ['direct_order_request','request_pricing'], quantity: { minimum: 1, maximum: 10, increment: 1 },
      price: { currency: 'USD', audiences: ['member'], unpriced: 'request_pricing' },
      destination: { countryCode: 'US', regions: ['CA','DC','NY'], ...copy(refs) }, ...copy(refs) }],
    canonicalReaderProfile: 'quick-order-canonical-readers-v1', relationProjectionVersion: 'quick-order-relations-v1',
    readerCensusSha256: 'a'.repeat(64),
  };
}
function bindDecision(publication, decision) {
  const text = typeof decision === 'string' ? decision : JSON.stringify(decision);
  const bound = copy(publication);
  bound.artifacts.find(row => row.kind === 'normalized_decision_inputs').sha256 = sha(text);
  return { publication: bound, text };
}
function assertFixtureReferenceBinding(fixture) {
  const value = JSON.parse(fixture.text);
  for (const [key, kind] of [['catalog','catalog'],['bindings','bindings'],['reconciliation','reconciliation'],
    ['healthLegal','health_legal'],['configuration','configuration']]) {
    const rows = fixture.publication.artifacts.filter(row => row.kind === kind);
    assert.equal(rows.length, 1, 'Altered-envelope fixture keeps exactly one artifact per kind');
    assert.deepEqual(value.artifacts[key], { path: rows[0].path, sha256: rows[0].sha256 },
      'CF2 fixture cannot fail because it retains an original decision reference');
  }
  assert.equal(fixture.publication.artifacts.find(row => row.kind === 'normalized_decision_inputs').sha256, sha(fixture.text));
  for (const row of [...value.healthAgreements,...value.offerRules,...value.offerRules.map(rule => rule.destination)]) {
    assert.ok(row.sourceApprovalRefs.every(ref => fixture.publication.sourceRefs.includes(ref)));
    assert.ok(row.applicabilityRefs.every(ref => fixture.publication.applicabilityRefs.includes(ref)));
  }
}
// CF1: byte room comes only from schema-admitted ASCII identifier characters.
// No whitespace, unknown field, duplicate, escape variant or invalid reference
// pads the document. The same otherwise-valid content gives an adjacent pair.
function canonicalByteEdge(publication) {
  const ceiling = 8 * 1024 * 1024;
  const wide = copy(publication);
  for (const [field, prefix] of [['sourceRefs','synthetic-source'],['applicabilityRefs','synthetic-scope']]) {
    wide[field] = Array.from({ length: 32 }, (_, index) => {
      const head = `${prefix}-${String(index).padStart(2,'0')}-`;
      const ref = head + 'R'.repeat(160 - head.length);
      assert.equal(Buffer.byteLength(ref), 160);
      assert.match(ref, /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/);
      return ref;
    });
  }
  const value = decisionFixture(wide);
  for (const row of [...value.healthAgreements,...value.offerRules,...value.offerRules.map(rule => rule.destination)]) {
    row.sourceApprovalRefs = wide.sourceRefs; row.applicabilityRefs = wide.applicabilityRefs;
  }
  const prototype = value.offerRules[0];
  const rowAt = index => ({ ...prototype, offeringVariantId: `synthetic-offering-${String(index).padStart(6,'0')}`,
    productId: `synthetic-product-${String(index).padStart(6,'0')}`, variantId: 'synthetic-variant' });
  const rowBytes = Buffer.byteLength(JSON.stringify(rowAt(0)));
  value.offerRules = [];
  const fixedBytes = Buffer.byteLength(JSON.stringify(value));
  // Replacing [] with n equal-length rows adds n*(rowBytes+1)-1 bytes.
  const count = Math.floor((ceiling - fixedBytes + 1) / (rowBytes + 1));
  assert.ok(count >= 1 && count <= 50000, 'Byte-edge construction must retain the existing offer-count bound');
  value.offerRules = Array.from({ length: count }, (_, index) => rowAt(index));
  let remaining = ceiling - (fixedBytes + count * (rowBytes + 1) - 1);
  assert.ok(remaining >= 0 && remaining < rowBytes + 1);
  const capacity = count * (200 - rowAt(0).offeringVariantId.length);
  assert.ok(capacity >= remaining + 1, 'Both exact edges require admitted identifier capacity, never a larger bound');
  for (const row of value.offerRules) {
    const add = Math.min(remaining, 200 - row.offeringVariantId.length);
    row.offeringVariantId += 'X'.repeat(add); remaining -= add;
    assert.ok(row.offeringVariantId.length <= 200);
  }
  assert.equal(remaining, 0);
  const at = bindDecision(wide,value);
  assert.equal(Buffer.byteLength(at.text), ceiling, 'Exact canonical 8 MiB control');
  const index = value.offerRules.findIndex(row => row.offeringVariantId.length < 200);
  assert.ok(index >= 0);
  const overValue = { ...value, offerRules: [...value.offerRules] };
  overValue.offerRules[index] = { ...value.offerRules[index],
    offeringVariantId: value.offerRules[index].offeringVariantId + 'X' };
  assert.ok(overValue.offerRules[index].offeringVariantId.length <= 200);
  const over = bindDecision(wide,overValue);
  assert.equal(Buffer.byteLength(over.text), ceiling + 1, 'Exact canonical 8 MiB + 1 negative');
  const restored = { ...overValue, offerRules: [...overValue.offerRules] };
  restored.offerRules[index] = value.offerRules[index];
  assert.equal(JSON.stringify(restored), at.text, 'Only one admitted identifier byte differs between the edges');
  for (const fixture of [at,over]) assertFixtureReferenceBinding(fixture);
  return { at, over, offerCount: count, differingOfferIndex: index };
}
function rollbackBlock(source) {
  const body = source.split('-- CURRENTNESS_EMPTY_ROLLBACK_BEGIN\n')[1]?.split('-- CURRENTNESS_EMPTY_ROLLBACK_END')[0];
  assert.ok(body?.startsWith('begin;'), 'Exact documented rollback block required');
  return body;
}
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
const historicalSources = new Map();
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
async function refused(body, state, message) {
  let failure;
  try { await sql(body); } catch (error) { failure = error; }
  assert.ok(failure, `Expected SQLSTATE ${state}`);
  assert.equal(failure.timedOut, false, 'A timeout is not an expected refusal');
  assert.equal(failure.overflow, false, 'An output limit is not an expected refusal');
  assert.equal(failure.signal, null, 'A signal is not an expected refusal');
  assert.match(failure.stderr ?? '', new RegExp(`ERROR:\\s+${state}:`));
  if (message) assert.ok(failure.stderr?.includes(message), 'Expected the specific refusal, not another error with the same SQLSTATE');
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
async function assertPristineHead() {
  const rows = parseLastJson(await sql(`select coalesce(jsonb_agg(to_jsonb(h)),'[]')::text from ${HEAD} h;`));
  assert.equal(rows.length, 1, 'Install seeds exactly one authority head');
  assert.deepEqual(Object.fromEntries(Object.keys(PRISTINE_HEAD).map(key => [key, rows[0][key]])), PRISTINE_HEAD);
  assert.equal(rows[0].updated_by, 'postgres', 'Seed audit identity is database-derived');
  assert.equal(await sql(`select count(*) from ${REVISIONS};`), '0', 'Seed is not a publication');
}
async function assertHeadProtection() {
  const triggers = parseLastJson(await sql(`select jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgtype,t.tgenabled)
    order by c.relname,t.tgname)::text from pg_trigger t join pg_class c on c.oid=t.tgrelid
    where not t.tgisinternal and c.oid in (${q(HEAD)}::regclass,${q(REVISIONS)}::regclass);`));
  assert.deepEqual(triggers, [
    ['research_health_quick_order_authority_head','research_health_quick_order_head_epoch_monotonic',19,'A'],
    ['research_health_quick_order_authority_head',HEAD_REMOVAL_TRIGGER,42,'A'],
    ['research_health_quick_order_authority_revisions',REVISION_TRIGGER,58,'A'],
  ], 'Own-table guards retain their exact BEFORE events, row/statement scope and ALWAYS enablement');
  const keys = parseLastJson(await sql(`select jsonb_agg(jsonb_build_array(k.conname,a.attname,b.attname,
    k.confrelid::regclass::text,k.confdeltype,k.confupdtype,k.convalidated,k.condeferrable,k.condeferred,
    cardinality(k.conkey),cardinality(k.confkey)) order by k.conname)::text
    from pg_constraint k join pg_attribute a on a.attrelid=k.conrelid and a.attnum=k.conkey[1]
    join pg_attribute b on b.attrelid=k.confrelid and b.attnum=k.confkey[1]
    where k.conrelid=${q(HEAD)}::regclass and k.contype='f';`));
  assert.deepEqual(keys, FOREIGN_KEYS.map(([name, column]) => [name,column,'revision_id',
    'research_health_quick_order_authority_revisions','r','a',true,false,false,1,1])
    .sort((a,b) => a[0].localeCompare(b[0])), 'Exactly three validated, immediate ON DELETE RESTRICT revision references');
}
async function assertDecisionPersistence() {
  const shape = parseLastJson(await sql(`select jsonb_build_object(
    'publish',(to_regprocedure('${PREFIX}publish_revision(jsonb,text)') is not null),
    'legacyPublishAbsent',(to_regprocedure('${PREFIX}publish_revision(jsonb)') is null),
    'validator',(select jsonb_build_object('immutable',p.provolatile='i','invoker',not p.prosecdef,
      'boolean',p.prorettype='boolean'::regtype,'emptySearchPath',p.proconfig=array['search_path=""']::text[])
      from pg_proc p where p.oid=to_regprocedure('${PREFIX}currentness_valid_decision_inputs(text,jsonb)')),
    'column',(select a.attnotnull and a.atttypid='text'::regtype from pg_attribute a
      where a.attrelid=${q(REVISIONS)}::regclass and a.attname='decision_inputs_text' and not a.attisdropped),
    'check',(select pg_get_constraintdef(k.oid,true) from pg_constraint k
      where k.conrelid=${q(REVISIONS)}::regclass and k.conname='research_health_quick_order_decision_inputs_shape')
    )::text;`));
  assert.equal(shape.publish, true);
  assert.equal(shape.legacyPublishAbsent, true, 'No legacy publication overload bypass');
  assert.deepEqual(shape.validator, { immutable: true, invoker: true, boolean: true, emptySearchPath: true });
  assert.equal(shape.column, true, 'Decision text is required, not optional enrichment');
  assert.match(shape.check ?? '', /currentness_valid_decision_inputs\(decision_inputs_text, publication\) IS TRUE/);
}
// Only these new candidate-owned user triggers may be disabled, transactionally,
// to isolate corrupt-head and FK fixtures. ALWAYS is restored before a callable
// integrity check; the expected error rolls back the fixture, with no reseal.
// No canonical predecessor trigger, internal RI trigger or live schema is touched.
function absentHeadFixture(body) {
  return `begin;alter table ${HEAD} disable trigger ${HEAD_REMOVAL_TRIGGER};
    delete from ${HEAD};alter table ${HEAD} enable always trigger ${HEAD_REMOVAL_TRIGGER};${body}`;
}

// DOC71 FIXTURE-ONLY INCREMENT. Nothing below runs at module initialization.
// These callable suites consume fresh, isolated disposable connections from a
// authored, NOT RUN driver below. They never alter candidate SQL, learn an installation
// seal from their own database, disable canonical triggers, or create roles.
// query(text) -> {rows,rowCount}; start(text) -> {done:Promise}; pid -> integer.
// A query error must carry PostgreSQL code/message (not only a shell exit code).
// fresh({seedSql,profile,authority}) must bootstrap original source files, seed
// before installing the unchanged accepted successor, then return owner, writer,
// observer and contender connections plus close(). The driver is authored below;
// independent acceptance and a separately bound execution entry remain HELD.
// An authority fixture is installed ONLY via original publish/activate RPCs.
// Caller-provided booleans are not a substitute for receipts or proof bytes.
const DOC71_CANONICAL_SOURCE_COMMIT = '357890561160d59eb649505c6c46e9e5b65a3f08';
// DOC71_CANONICAL_PINS_BEGIN -- filled from original committed source bytes.
const DOC71_CANONICAL_SOURCES = [
  {
    "path": "supabase/research-membership.sql",
    "sha256lf": "a5741c2cd9d25e7fec0631e0609cc3e8385f4808026680465ee4a46cf26c46d8",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/research-members.sql",
    "sha256lf": "aa9f6c539f755f08042f90f7799885320e58e2f775f4078fbc6f10cf21b0aded",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/research-catalog.sql",
    "sha256lf": "0e868dcd4bea04a5cc6bdce474ac93d0feae9553bdfcbaf74a448c05b07d4f42",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/research-inventory-lots.sql",
    "sha256lf": "00ccc125f9bfcd428b530e19445c1042b7953b5450dea223707609b87282ee7e",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/research-products-diagnostics.sql",
    "sha256lf": "5d191bc21fea106a934640df8effe82eaf2bf5f445b6a3510f6272233b982013",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/migrations/20260726143000_research_product_control_center.sql",
    "sha256lf": "b1589eb24405d4700206d25541b647479afee34c2cd05422da70df2179876203",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/migrations/20260727120000_research_inventory_lot_coa_admin.sql",
    "sha256lf": "65a98ccdb43c4adb541d0e21c1cc54b7bfb618755dc37f679414e3dba7a48524",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/research-inventory-reservation-commands.sql",
    "sha256lf": "4e30807c7f58abc2d819abf509914364b55cba029586b3492329bacb7eef6005",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/migrations/20260804120000_research_early_access_identity_persistence.sql",
    "sha256lf": "3ac2f40f9627d8952db3a181a2ae0174565bda1fe469e3bfc5661a02108c5e28",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/migrations/20260804121000_research_early_access_commerce_persistence.sql",
    "sha256lf": "8a84bd82845e726702cdc001bdfce661ced7f74132c68a1338d5a476bd9ec9c6",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/migrations/20260804122000_research_early_access_supplier_operations.sql",
    "sha256lf": "fa12c45348c25826f63a5ad0a001a34ecfb847ef6e97a9470ff9fc96b1fd134c",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/migrations/20260807193000_research_early_access_cart_checkout.sql",
    "sha256lf": "8bf36cedb3cfe523f77c2853a5ea259859c7d067825b846dc8602ba9dbcdbe3b",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/migrations/20260808100000_research_early_access_cart_completion.sql",
    "sha256lf": "5e0b745ae3d8ff0844e55ba0714fd5f2bb5f446e7523594af8bfce7e1395bf22",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/migrations/20260809120000_research_early_access_cart_duplicate_guard.sql",
    "sha256lf": "a15ed8163b618a1de56d779c8b16e1ced31621ccf07d7435a2aa4838e4f3ead2",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/migrations/20260809130000_research_early_access_hardening.sql",
    "sha256lf": "c68ccc679bd04dc2ff6aeb460100ee3e9ec470a58a094274821c5b3f1697a7c1",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/research-private-early-access-sessions.sql",
    "sha256lf": "7365f2a6ae224d8a45e2d32ab437d07ea1e83470314e2f0ba7227f3d3e3eea38",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/research-required-input-readiness.sql",
    "sha256lf": "ffbd07e9c42703299cc9babe0f7c680bc6a22e88e7fae5c4c0fd66c7a93e6b8f",
    "usage": "whole-source-bootstrap"
  },
  {
    "path": "supabase/verification/research-20260819-cart-migrations-disposable-bootstrap.sql",
    "sha256lf": "cabf8355d3cb651cacffd56e44c8d319afee3e35e4ec8e42b49fac9fe3b432d5",
    "usage": "platform-reference-only"
  }
];
// DOC71_CANONICAL_PINS_END
const DOC71_SOURCE_RELATIONS = [
  'research_domain_launch_controls','research_early_access_legal_bindings',
  'research_early_access_session_bindings','research_early_access_shipping_regions',
  'research_inventory_lots','research_lot_quality_documents','research_lot_quality_tests',
  'research_product_content','research_product_prices','research_product_variants',
  'research_products','research_required_inputs',
];
const DOC71_PLATFORM_FIXTURE = `
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);`;
// The only synthetic platform relation above is the storage.buckets seam from
// research-20260819-cart-migrations-disposable-bootstrap.sql:56-69. Its M68
// stand-in functions are NOT used. All Research tables/functions remain whole
// canonical sources. Existing BASELINE_SQL preserves the actual provider chain.
async function doc71CanonicalBootstrapPlan(loadPinned) {
  const plan = [];
  for (const pin of DOC71_CANONICAL_SOURCES) {
    const source = await loadPinned(pin.path);
    assert.equal(sha(lf(source)), pin.sha256lf, `Canonical predecessor changed: ${pin.path}`);
    if(pin.usage==='whole-source-bootstrap') plan.push({ ...pin, source });
  }
  return { sourceCommit: DOC71_CANONICAL_SOURCE_COMMIT,
    platformSql: DOC71_PLATFORM_FIXTURE, steps: plan,
    disclaimer: 'Whole-source disposable bootstrap plan, not installed or implemented-S evidence' };
}
function doc71RequireFutureBindings(binding, candidateText) {
  assert.equal(binding?.receipt?.sourceAcceptance?.status, 'SOURCE_ACCEPT_WITH_LIMITS');
  assert.match(binding.receipt.sourceAcceptance.reviewCommit ?? '', /^[0-9a-f]{40}$/);
  assert.equal(binding.receipt.currentnessDefinition, binding.receipt.definitionSha256);
  const pin = binding.receipt.files.find(row => row.path === CANDIDATE + '.sql');
  assert.ok(pin, 'Exact future candidate needs an independently accepted file receipt');
  assert.equal(sha(lf(candidateText)), pin.sha256lf);
  assert.ok(!candidateText.includes('expected_columns:=null;'),
    'Frozen Doc71 candidate cannot be installed or rewritten by fixtures');
  assert.ok(!/source_column_descriptor_seal\s+(?:constant\s+)?(?:pg_catalog\.)?text\s*:=\s*null/i.test(candidateText),
    'Both source-column seals must be independently bound before the future driver');
  for (const field of ['executionAuthoritySha256','disposableIdentitySha256',
    'canonicalBootstrapReceiptSha256','schemaCensusAcceptanceSha256',
    'preBeginEnforcementReceiptSha256','connectionRoleReceiptSha256']) {
    assert.match(binding[field] ?? '', /^[0-9a-f]{64}$/, `Missing future driver binding: ${field}`);
    assert.ok(binding.proofBytes?.[field] instanceof Uint8Array, `Missing exact proof bytes: ${field}`);
    assert.equal(sha(binding.proofBytes[field]), binding[field]);
  }
  // Authenticity and scope of those proofs require the separately reviewed
  // driver/authorization. Hash consistency alone is explicitly insufficient.
  assert.equal(binding.driverReview?.status, 'SOURCE_ACCEPT_WITH_LIMITS');
  assert.match(binding.driverReview.reviewCommit ?? '', /^[0-9a-f]{40}$/);
}
async function doc71InstallCanonicalPredecessors(owner, plan) {
  // Called by the future driver ONLY after doc71RequireFutureBindings. Refuse
  // pre-existing Research objects rather than adopt a poisoned minimal schema.
  const existing = await owner.query(`select c.relname from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname like 'research_%';`);
  assert.deepEqual(existing.rows, [], 'Dedicated empty disposable Research namespace required');
  await owner.query(plan.platformSql);
  for (const step of plan.steps) {
    assert.equal(sha(lf(step.source)), step.sha256lf);
    await owner.query(step.source); // WHOLE original file, never rewritten.
  }
  const actual = await owner.query(`select c.relname from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
    and c.relname=any(array[${DOC71_SOURCE_RELATIONS.map(q).join(',')}]) order by c.relname;`);
  assert.deepEqual(actual.rows.map(row => row.relname), DOC71_SOURCE_RELATIONS);
  for (const name of ['research_private_early_access_sessions','research_private_early_access_nonces']) {
    const result = await owner.query(`select pg_catalog.to_regclass(${q('public.'+name)}) is not null as present;`);
    assert.equal(result.rows[0].present, true);
  }
}
function doc71SyntheticProfile(identities) {
  // Fixture-only milliseconds. Never founder configuration, deployed identities,
  // measured timing, or an alternative to the completed operating profile.
  for (const field of ['database','loginRole','requestRole','ownerRole']) {
    assert.match(identities[field]?.oid ?? '', /^[1-9][0-9]*$/);
    assert.ok(typeof identities[field].name === 'string' && identities[field].name.length > 0);
  }
  return { schemaVersion:'quick-order-approved-limits-v1',profileId:'synthetic-doc71',profileVersion:'fixture-v1',
    database:identities.database,loginRole:identities.loginRole,requestRole:identities.requestRole,
    ownerRole:identities.ownerRole,routeClass:'writer',routeId:'synthetic-disposable-writer',
    timeZone:'UTC',dateStyle:'ISO, YMD',
    intake:{lockTimeoutMs:250,statementTimeoutMs:4000,transactionTimeoutMs:5000,idleTimeoutMs:1000,
      deadlockTimeoutMs:1000,cleanupMs:1000,attemptDeadlineMs:8000,acquisitionMs:1000,responseMs:1000},
    writer:{lockTimeoutMs:7000,statementTimeoutMs:15000,transactionTimeoutMs:20000,idleTimeoutMs:1000,
      deadlockTimeoutMs:1000,cleanupMs:1000,attemptDeadlineMs:24000,acquisitionMs:1000,responseMs:2000,
      gateWaitMs:7000,postGateReserveMs:1000},
    enforcement:{preBeginAttestationSha256:'a'.repeat(64),writerOrderAttestationSha256:'b'.repeat(64),singleRpcAutocommit:true} };
}
const DOC71_FIXTURE_IDS = Object.freeze({
  product:'11111111-1111-4111-8111-111111111111',variant:'22222222-2222-4222-8222-222222222222',
  lot:'33333333-3333-4333-8333-333333333333',document:'44444444-4444-4444-8444-444444444444',
  test:'55555555-5555-4555-8555-555555555555',content:'66666666-6666-4666-8666-666666666666',
  price:'77777777-7777-4777-8777-777777777777',input:'88888888-8888-4888-8888-888888888888',
  legal:'99999999-9999-4999-8999-999999999999',member:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
});
function doc71RelationFixtures() {
  const id = DOC71_FIXTURE_IDS;
  const insert = (table,values,empty=false) => `insert into public.${table} (${Object.keys(values).join(',')}) select ${Object.values(values).join(',')}${empty?' where false':''};`;
  const product = {id:q(id.product),sku:q('synthetic-doc71-product'),slug:q('synthetic-doc71-product'),
    display_name:q('Synthetic fixture'),lane:q('research_material')};
  const variant = {id:q(id.variant),product_id:q(id.product),sku:q('synthetic-doc71-variant'),label:q('Synthetic variant'),
    created_by:q('synthetic-fixture'),updated_by:q('synthetic-fixture')};
  const productSeed=insert('research_products',product);
  const variantSeed=productSeed+insert('research_product_variants',variant);
  // Exercise the real variant lifecycle before a lot can use its identity.
  const readySeed=variantSeed+`update public.research_products set admin_status='approved' where id=${q(id.product)};
    update public.research_product_variants set status='in_review' where id=${q(id.variant)};
    update public.research_product_variants set status='approved',active=true where id=${q(id.variant)};`;
  const lot={id:q(id.lot),lot_id:q('synthetic-doc71-lot'),sku:q('synthetic-doc71-variant'),owner:q('xenios'),
    product_id:q(id.product),variant_id:q(id.variant)};
  const document={id:q(id.document),lot_id:q(id.lot)};
  const rows = [
    ['research_products',product,'',`display_name='Synthetic changed'`,'id',id.product],
    ['research_product_variants',variant,productSeed,`label='Synthetic changed'`,'id',id.variant],
    ['research_product_prices',{id:q(id.price),product_id:q(id.product),variant_id:q(id.variant),audience:q('member'),
      amount_cents:'100',effective_at:q('2030-01-01T00:00:00Z'),version:'1',created_by:q('synthetic-fixture')},variantSeed,
      `status='approved'`,'id',id.price],
    ['research_product_content',{id:q(id.content),product_id:q(id.product),section:q('overview')},productSeed,
      `state='in_review'`,'id',id.content],
    ['research_inventory_lots',lot,readySeed,`disposition='quality_hold'`,'id',id.lot],
    ['research_lot_quality_documents',document,readySeed+insert('research_inventory_lots',lot),
      `report_number='synthetic-new-report'`,'id',id.document],
    ['research_lot_quality_tests',{id:q(id.test),quality_document_id:q(id.document),test_key:q('identity')},
      readySeed+insert('research_inventory_lots',lot)+insert('research_lot_quality_documents',document),
      `state='under_review'`,'id',id.test],
    ['research_domain_launch_controls',{domain:q('synthetic_doc71'),updated_by:q('synthetic-fixture'),updated_reason:q('Synthetic fixture')},
      '',`software_complete=true`,'domain','synthetic_doc71'],
    ['research_required_inputs',{id:q(id.input),key:q('synthetic.doc71'),domain:q('synthetic_doc71'),label:q('Synthetic input'),
      description:q('Synthetic fixture input'),why_required:q('Synthetic fixture only'),record_type:q('fixture'),field_path:q('fixture'),
      blocking_level:q('blocks_transaction'),responsible_role:q('operations_admin'),verification_method:q('Synthetic inspection'),
      public_launch_impact:q('Synthetic fixture only'),next_action:q('Synthetic review'),admin_entry_href:q('/admin/research'),
      created_by:q('synthetic-fixture')},'',`label='Synthetic changed'`,'id',id.input],
    ['research_early_access_session_bindings',{session_id:q('1'.repeat(64)),customer_id:q('synthetic_doc71')},'',
      `customer_id='synthetic_changed'`,'session_id','1'.repeat(64)],
    ['research_early_access_legal_bindings',{id:q(id.legal),customer_ref:q('eac_'+'1'.repeat(32)),member_id:q(id.member),
      established_by:q('verified_link'),verified_at:q('2030-01-01T00:00:00Z'),alias_refs:`array[${q('eac_'+'2'.repeat(32))}]::text[]`},'',
      `verified_at='2030-01-02T00:00:00Z'`,'id',id.legal],
    ['research_early_access_shipping_regions',{country:q('US'),region:q('ZZ-FIXTURE'),added_by:q('synthetic-fixture')},'',
      `active=false`,'region','ZZ-FIXTURE'],
  ];
  return rows.map(([table,values,ancestors,change,key,value]) => ({table,ancestors,
    seed:insert(table,values), insert:insert(table,values), emptyInsert:insert(table,values,true),
    update:`update public.${table} set ${change} where ${key}=${q(value)};`,
    emptyUpdate:`update public.${table} set ${change} where false;`,
    equalUpdate:`update public.${table} set ${key}=${key} where ${key}=${q(value)};`,
    delete:`delete from public.${table} where ${key}=${q(value)};`,
    emptyDelete:`delete from public.${table} where false;`,
    snapshot:`select coalesce(jsonb_agg(to_jsonb(t) order by ${key}),'[]'::jsonb) as value from public.${table} t;`,
  }));
}
const DOC71_CANONICAL_REFUSALS = Object.freeze({
  research_product_prices:{delete:'research product price history is append-only'},
  research_early_access_session_bindings:{update:'is append-only',delete:'is append-only',equalUpdate:'is append-only'},
  research_early_access_legal_bindings:{update:'is append-only',delete:'is append-only',equalUpdate:'is append-only'},
  research_lot_quality_documents:{update:'quality records may change only through a reviewed quality command',
    delete:'quality records may change only through a reviewed quality command'},
  research_lot_quality_tests:{update:'quality tests may change only through a reviewed quality command',
    delete:'quality tests may change only through a reviewed quality command',equalUpdate:'quality tests may change only through a reviewed quality command'},
});
async function doc71Head(connection) {
  const result=await connection.query(`select writer_epoch::text as epoch,state,active_revision_id::text as active,
    last_published_revision_id::text as published from ${HEAD} where singleton;`);
  assert.equal(result.rows.length,1); return result.rows[0];
}
async function doc71ExpectRefusal(connection,statement,code,fragment) {
  let failure;
  try { await connection.query(statement); } catch (error) { failure=error; }
  assert.ok(failure,'Expected PostgreSQL refusal, not a successful command');
  assert.equal(failure.code,code,'Timeout/transport failure is not the expected SQL refusal');
  assert.ok(failure.message.includes(fragment),`Wrong refusal: expected ${fragment}`);
}
async function doc71GuardInventory(connection) {
  const result=await connection.query(`select c.relname,t.tgname,t.tgenabled,t.tgtype::int as type,
    t.tgnargs::int as arguments,t.tgattr::text as columns,pg_catalog.encode(t.tgargs,'hex') as argument_bytes,
    t.tgqual is null as no_when,t.tgconstraint=0 as unconstrained,not t.tgdeferrable and not t.tginitdeferred as immediate,
    t.tgoldtable as old_table,t.tgnewtable as new_table
    from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and t.tgname like 'research_health_quick_order_guard_%'
    order by c.relname,t.tgname;`);
  const expected=[];
  for(const table of DOC71_SOURCE_RELATIONS) for(const [suffix,type,oldTable,newTable] of [
    ['d',8,'qo_old_rows',null],['i',4,null,'qo_new_rows'],['t',34,null,null],['u',16,'qo_old_rows','qo_new_rows']]) {
    if(table==='research_early_access_session_bindings'&&suffix==='i')continue;
    expected.push({relname:table,tgname:'research_health_quick_order_guard_'+suffix,tgenabled:'A',type,
      arguments:0,columns:'',argument_bytes:'',no_when:true,unconstrained:true,immediate:true,old_table:oldTable,new_table:newTable});
  }
  assert.deepEqual(result.rows,expected,'Exact global 35 I/U/D + 12 TRUNCATE inventory, aliases and ALWAYS mode');
}
async function doc71WithFresh(h,binding,options,run) {
  doc71RequireFutureBindings(binding,h.candidateText);
  const ctx=await h.fresh(options);
  try { await doc71GuardInventory(ctx.owner); return await run(ctx); }
  finally { await ctx.close(); }
}
async function doc71RunGuardMatrix(h,binding) {
  const results=[];
  for(const row of doc71RelationFixtures()) {
    // Minimal ancestors, no children: a material delete cannot earn a second
    // epoch through an unrelated FK cascade. Every case has a fresh database.
    for(const event of ['insert','update','delete','emptyInsert','emptyUpdate','emptyDelete','equalUpdate']) {
      await doc71WithFresh(h,binding,{seedSql:row.ancestors+(event.toLowerCase().includes('insert')?'':row.seed),
        profile:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
        const before=await doc71Head(ctx.observer);
        assert.equal(before.epoch,'0');assert.equal(before.state,'held');
        const prior=(await ctx.observer.query(row.snapshot)).rows;
        const refusal=DOC71_CANONICAL_REFUSALS[row.table]?.[event];
        if(refusal) {
          await doc71ExpectRefusal(ctx.writer,row[event],'P0001',refusal);
          assert.deepEqual((await ctx.observer.query(row.snapshot)).rows,prior);
          assert.deepEqual(await doc71Head(ctx.observer),before);
          results.push({id:`guard-${row.table}-${event}`,coverage:'CANONICAL_BEFORE_REFUSAL_ONLY'});return;
        }
        const changed=await ctx.writer.query(row[event]);
        const bypass=event.startsWith('empty')||event==='equalUpdate'||
          (row.table==='research_early_access_session_bindings'&&event==='insert');
        assert.equal(changed.rowCount,event.startsWith('empty')?0:1,'Fixture must reach the intended row/event');
        const after=await doc71Head(ctx.observer);
        assert.equal(BigInt(after.epoch)-BigInt(before.epoch),bypass?0n:1n);
        assert.equal(after.state,'held');assert.equal(after.active,null);
        if(bypass) assert.deepEqual(after,before);
        results.push({id:`guard-${row.table}-${event}`,coverage:bypass?'NO_EPOCH_CONTROL':'MATERIAL_EPOCH_CONTROL'});
      });
    }
    await doc71WithFresh(h,binding,{seedSql:row.ancestors+row.seed,profile:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
      const before=await doc71Head(ctx.observer);
      await doc71ExpectRefusal(ctx.writer,`truncate public.${row.table} cascade;`,'55000','Quick Order guarded source truncate refused');
      assert.deepEqual(await doc71Head(ctx.observer),before);
      // CASCADE can reach another guarded table first; this is a guard-family
      // refusal for each command target, NOT proof each individual trigger ran.
      results.push({id:`guard-${row.table}-truncate`,coverage:'TRUNCATE_FAMILY_REFUSAL'});
    });
  }
  return results;
}
function doc71ProfileMutations() {
  return [
    {id:'missing-anchor',anchor:'absent',message:'approved limits binding unavailable'},
    {id:'wrong-anchor',anchor:'mismatched',message:'approved limits binding unavailable'},
    {id:'duplicate-key',raw:raw=>raw.replace('{','{"schemaVersion":"duplicate",'),message:'approved limits binding unavailable'},
    {id:'unknown-key',mutate:p=>{p.unapproved=true;},message:'approved limits identity mismatch'},
    {id:'route',mutate:p=>{p.routeClass='intake';},message:'approved limits identity mismatch'},
    {id:'database-identity',mutate:p=>{p.database.oid=String(BigInt(p.database.oid)+1n);},message:'approved limits identity mismatch'},
    {id:'login-identity',mutate:p=>{p.loginRole.oid=String(BigInt(p.loginRole.oid)+1n);},message:'approved limits identity mismatch'},
    {id:'request-identity',mutate:p=>{p.requestRole.oid=String(BigInt(p.requestRole.oid)+1n);},message:'approved limits identity mismatch'},
    {id:'owner-identity',mutate:p=>{p.ownerRole.oid=String(BigInt(p.ownerRole.oid)+1n);},message:'approved limits identity mismatch'},
    {id:'missing-prebegin',mutate:p=>{delete p.enforcement.preBeginAttestationSha256;},message:'route attestation binding missing'},
    {id:'null-prebegin',mutate:p=>{p.enforcement.preBeginAttestationSha256=null;},message:'route attestation binding missing'},
    {id:'null-timeout',mutate:p=>{p.writer.lockTimeoutMs=null;},message:'approved limit is not representable positive milliseconds'},
    {id:'zero-timeout',mutate:p=>{p.writer.lockTimeoutMs=0;},message:'approved limit is not representable positive milliseconds'},
    {id:'negative-timeout',mutate:p=>{p.writer.lockTimeoutMs=-1;},message:'approved limit is not representable positive milliseconds'},
    {id:'fractional-timeout',mutate:p=>{p.writer.lockTimeoutMs=1.5;},message:'approved limit is not representable positive milliseconds'},
    {id:'overflow-timeout',raw:raw=>raw.replace('"lockTimeoutMs":7000','"lockTimeoutMs":9223372036854775808'),message:'approved limit is not representable positive milliseconds'},
    {id:'intake-idle-order',mutate:p=>{p.intake.idleTimeoutMs=p.intake.statementTimeoutMs;},message:'approved limit relationships invalid'},
    {id:'intake-lock-order',mutate:p=>{p.intake.lockTimeoutMs=p.intake.deadlockTimeoutMs;},message:'approved gate relationships invalid'},
    {id:'writer-lock-gate',mutate:p=>{p.writer.lockTimeoutMs++;},message:'approved gate relationships invalid'},
    {id:'idle-order',mutate:p=>{p.writer.idleTimeoutMs=p.writer.statementTimeoutMs;},message:'approved limit relationships invalid'},
    {id:'statement-order',mutate:p=>{p.writer.statementTimeoutMs=p.writer.transactionTimeoutMs;},message:'approved limit relationships invalid'},
    {id:'attempt-envelope',mutate:p=>{p.writer.attemptDeadlineMs++;},message:'approved limit relationships invalid'},
    {id:'gate-release-envelope',mutate:p=>{p.writer.gateWaitMs=5000;p.writer.lockTimeoutMs=5000;},message:'approved gate relationships invalid'},
    {id:'gate-reserve',mutate:p=>{p.writer.postGateReserveMs=8000;},message:'approved gate relationships invalid'},
    {id:'zero-effective-lock',sessionSql:"set lock_timeout='0';",message:'effective timer unavailable or unsupported'},
    {id:'zero-effective-statement',sessionSql:"set statement_timeout='0';",message:'effective timer unavailable or unsupported'},
    {id:'zero-effective-transaction',sessionSql:"set transaction_timeout='0';",message:'effective timer unavailable or unsupported'},
    {id:'unsupported-effective-unit',sessionSql:"set statement_timeout='1min';",message:'effective timer unavailable or unsupported'},
    {id:'excess-effective-lock',sessionSql:"set lock_timeout='8s';",message:'effective timer exceeds approved field'},
    {id:'startup-statement-mismatch',sessionSql:"set statement_timeout='14s';",message:'effective startup timer mismatch'},
    {id:'effective-gate-too-small',sessionSql:"set lock_timeout='6s';",message:'effective profile relationship mismatch'},
    {id:'timezone',sessionSql:"set timezone='Etc/GMT+1';",message:'effective profile relationship mismatch'},
    {id:'datestyle',sessionSql:"set datestyle='ISO, DMY';",message:'effective profile relationship mismatch'},
    {id:'role-setting-absent',roleSettingAbsent:true,message:'approved limits binding unavailable'},
  ];
}
function doc71SyntheticProfileInstallation(profile,mutation={}) {
  // Driver uses this ONLY in a separately authorized empty disposable database.
  // ALTER ROLE settings must exist BEFORE the fresh writer connection starts.
  // No SET LOCAL pretends to prove startup timing. The three identities here
  // come from that driver's observed disposable role/database OIDs, not guesses.
  const quoteName=name=>'"'+name.replaceAll('"','""')+'"';
  const modified=copy(profile);mutation.mutate?.(modified);
  let raw=JSON.stringify(modified);if(mutation.raw)raw=mutation.raw(raw);
  const digest=sha(raw),anchor=mutation.anchor==='absent'?null:
    'RHQOC_APPROVED_LIMITS_V1:'+(mutation.anchor==='mismatched'?'0'.repeat(64):digest);
  const role=quoteName(profile.loginRole.name),database=quoteName(profile.database.name);
  const p=profile.writer; // startup settings stay valid when only the carrier is negative.
  const statements=[`alter role ${role} in database ${database} set research_health_quick_order.approved_limits=${q(raw)};`];
  for(const [name,value] of [['lock_timeout',p.lockTimeoutMs],['statement_timeout',p.statementTimeoutMs],
    ['transaction_timeout',p.transactionTimeoutMs],['idle_in_transaction_session_timeout',p.idleTimeoutMs],
    ['deadlock_timeout',p.deadlockTimeoutMs]]) statements.push(`alter role ${role} in database ${database} set ${name}=${q(value+'ms')};`);
  statements.push(`alter role ${role} in database ${database} set timezone=${q(profile.timeZone)};`,
    `alter role ${role} in database ${database} set datestyle=${q(profile.dateStyle)};`,
    `comment on table ${PREFIX}currentness_scope_inputs is ${anchor===null?'null':q(anchor)};`);
  if(mutation.roleSettingAbsent)statements.push(`alter role ${role} in database ${database} reset research_health_quick_order.approved_limits;`);
  return {raw,digest,adminSql:statements.join('\n'),sessionSql:mutation.sessionSql??'',
    disclosure:'Synthetic attestation digests are fixture claims; no deployed enforcement proof'};
}
async function doc71RunProfileControls(h,binding) {
  const row=doc71RelationFixtures().find(r=>r.table==='research_product_content'),results=[];
  for(const mutation of doc71ProfileMutations()) {
    // An adjacent fresh positive uses exactly the same canonical ancestors,
    // projected UPDATE, candidate, roles and caller. Only the named profile
    // field, raw encoding, anchor or effective session setting then changes.
    for(const negative of [false,true]) await doc71WithFresh(h,binding,{seedSql:row.ancestors+row.seed,
      profile:negative?{mutation}:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
      const before=await doc71Head(ctx.observer),prior=(await ctx.observer.query(row.snapshot)).rows;
      if(negative) {
        await doc71ExpectRefusal(ctx.writer,row.update,'55000',mutation.message);
        assert.deepEqual(await doc71Head(ctx.observer),before);
        assert.deepEqual((await ctx.observer.query(row.snapshot)).rows,prior);
      } else {
        assert.equal((await ctx.writer.query(row.update)).rowCount,1);
        assert.equal(BigInt((await doc71Head(ctx.observer)).epoch)-BigInt(before.epoch),1n);
      }
      results.push({id:`profile-${mutation.id}-${negative?'refusal':'positive'}`});
    });
  }
  // READ COMMITTED is checked before a zero-row fast path; profile absence is
  // only irrelevant after this isolation check. Equal projection is distinct.
  for(const isolation of ['repeatable read','serializable']) await doc71WithFresh(h,binding,
    {seedSql:row.ancestors+row.seed,profile:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
      const before=await doc71Head(ctx.observer);
      await doc71ExpectRefusal(ctx.writer,`begin isolation level ${isolation};${row.emptyUpdate}`,'55000','requires READ COMMITTED');
      await ctx.writer.query('rollback;');assert.deepEqual(await doc71Head(ctx.observer),before);
      results.push({id:`isolation-${isolation}-zero-row-refusal`});
    });
  for(const [id,statement] of [['empty',row.emptyUpdate],['equal',row.equalUpdate],
    ['unprojected',`update public.research_product_content set heading='Synthetic prose only' where id=${q(DOC71_FIXTURE_IDS.content)};`]]) {
    await doc71WithFresh(h,binding,{seedSql:row.ancestors+row.seed,profile:{mutation:{anchor:'absent'}},authority:'pristine'},async ctx=>{
      const before=await doc71Head(ctx.observer);await ctx.writer.query(statement);
      assert.deepEqual(await doc71Head(ctx.observer),before,'Nonmaterial fast path must not need the writer profile');
      results.push({id:'missing-profile-'+id+'-bypass'});
    });
  }
  const legal=doc71RelationFixtures().find(r=>r.table==='research_early_access_legal_bindings');
  await doc71WithFresh(h,binding,{seedSql:'',profile:{mutation:{anchor:'absent'}},authority:'pristine'},async ctx=>{
    const before=await doc71Head(ctx.observer);
    const aliasFree=legal.insert.replace(`array[${q('eac_'+'2'.repeat(32))}]::text[]`,()=>"'{}'::text[]");
    assert.notEqual(aliasFree,legal.insert);assert.equal((await ctx.writer.query(aliasFree)).rowCount,1);
    assert.deepEqual(await doc71Head(ctx.observer),before);
    results.push({id:'unrelated-alias-free-legal-insert-no-profile-bypass'});
  });
  return results;
}
async function doc71RunUpsertControls(h,binding) {
  const row=doc71RelationFixtures().find(r=>r.table==='research_product_content');
  const values=id=>`(${q(id)},${q(DOC71_FIXTURE_IDS.product)},'overview','in_review')`;
  const base=`insert into public.research_product_content(id,product_id,section,state) values `;
  // Single INSERT event, single conflict UPDATE event, both events empty/no-op,
  // and mixed new+conflict rows. AFTER INSERT/UPDATE events are counted by their
  // own material transition sets; a mixed statement must advance twice.
  const cases=[
    {id:'insert-path',seed:false,sql:base+values(DOC71_FIXTURE_IDS.content)+' on conflict(id) do update set state=excluded.state;',delta:1},
    {id:'update-path',seed:true,sql:base+values(DOC71_FIXTURE_IDS.content)+' on conflict(id) do update set state=excluded.state;',delta:1},
    {id:'equal-path',seed:true,sql:base+values(DOC71_FIXTURE_IDS.content)+" on conflict(id) do update set state=research_product_content.state;",delta:0},
    {id:'mixed-paths',seed:true,sql:base+values(DOC71_FIXTURE_IDS.content)+
      `,('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',${q(DOC71_FIXTURE_IDS.product)},'specifications','draft') on conflict(id) do update set state=excluded.state;`,delta:2},
  ];
  for(const item of cases)await doc71WithFresh(h,binding,{seedSql:row.ancestors+(item.seed?row.seed:''),
    profile:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
    const before=await doc71Head(ctx.observer);await ctx.writer.query(item.sql);
    assert.equal(BigInt((await doc71Head(ctx.observer)).epoch)-BigInt(before.epoch),BigInt(item.delta),item.id);
  });
  return cases.map(({id,delta})=>({id:'upsert-'+id,expectedEpochDelta:delta}));
}
async function doc71AwaitGate(observer,pid,granted,budgetMs=500) {
  assert.ok(Number.isInteger(pid)&&pid>0);
  const deadline=Date.now()+budgetMs;
  while(Date.now()<deadline) {
    const rows=await observer.query(`select mode,granted from pg_catalog.pg_locks where locktype='advisory'
      and database=(select oid from pg_catalog.pg_database where datname=pg_catalog.current_database())
      and pid=${pid} and classid=1380471107 and objid=1 and objsubid=2;`);
    if(rows.rows.some(row=>row.granted===granted))return rows.rows;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail('Exact backend/gate state was not observed before the fixture deadline');
}
async function doc71RunConcurrencyControls(h,binding) {
  const row=doc71RelationFixtures().find(r=>r.table==='research_product_content');
  await doc71WithFresh(h,binding,{seedSql:row.ancestors+row.seed,profile:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
    const before=await doc71Head(ctx.observer);
    await ctx.holder.query('begin;select pg_catalog.pg_advisory_xact_lock_shared(1380471107,1);');
    const operation=ctx.writer.start('begin;'+row.update+'commit;');
    const waiting=await doc71AwaitGate(ctx.observer,ctx.writer.pid,false);
    assert.ok(waiting.some(lock=>lock.mode==='ExclusiveLock'&&!lock.granted));
    assert.deepEqual(await doc71Head(ctx.observer),before,'Uncommitted invalidation is invisible while waiting');
    await ctx.holder.query('commit;');await operation.done;
    assert.equal(BigInt((await doc71Head(ctx.observer)).epoch)-BigInt(before.epoch),1n);
    const locks=await ctx.observer.query(`select count(*)::int as n from pg_catalog.pg_locks
      where pid=${ctx.writer.pid} and locktype='advisory' and classid=1380471107 and objid=1 and objsubid=2;`);
    assert.equal(locks.rows[0].n,0,'Transaction end releases the gate');
  });
  await doc71WithFresh(h,binding,{seedSql:row.ancestors+row.seed,profile:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
    const before=await doc71Head(ctx.observer),prior=(await ctx.observer.query(row.snapshot)).rows;
    // Active pg_sleep keeps the synthetic holder from its 1s idle timeout. 8s
    // is a fixture-only duration, inside its 15s statement/20s transaction cap.
    const hold=ctx.holder.start('begin;select pg_catalog.pg_advisory_xact_lock_shared(1380471107,1);select pg_catalog.pg_sleep(8);commit;');
    await doc71AwaitGate(ctx.observer,ctx.holder.pid,true);
    await doc71ExpectRefusal(ctx.writer,row.update,'55P03','lock timeout');
    assert.deepEqual(await doc71Head(ctx.observer),before);
    assert.deepEqual((await ctx.observer.query(row.snapshot)).rows,prior,'Timed-out source statement is atomic');
    await hold.done;
    await ctx.writer.query(row.update);
    assert.equal(BigInt((await doc71Head(ctx.observer)).epoch)-BigInt(before.epoch),1n,'Fresh retry after actual release');
  });
  return ['shared-gate-writer-waits','commit-releases-gate','gate-timeout-rolls-back-source','post-release-fresh-retry'];
}
async function doc71RunRollbackControls(h,binding) {
  const row=doc71RelationFixtures().find(r=>r.table==='research_product_content');
  const rollback=rollbackBlock(h.rollbackText);
  const pin=binding.receipt.files.find(item=>item.path===CANDIDATE+'.rollback.md');
  assert.ok(pin);assert.equal(sha(lf(h.rollbackText)),pin.sha256lf,'Use original accepted rollback bytes');
  await doc71WithFresh(h,binding,{seedSql:'',profile:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
    const before=await doc71Head(ctx.observer);assert.equal(before.epoch,'0');assert.equal(before.published,null);
    await ctx.owner.query(rollback);
    assert.equal((await ctx.owner.query(`select pg_catalog.to_regclass(${q(HEAD)}) is null as absent;`)).rows[0].absent,true);
    // Provider predecessor must survive the currentness-only rollback.
    assert.equal((await ctx.owner.query("select pg_catalog.to_regclass('public.research_assisted_order_provider_fence') is not null as present;")).rows[0].present,true);
  });
  await doc71WithFresh(h,binding,{seedSql:row.ancestors+row.seed,profile:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
    await ctx.writer.query(row.update);const before=await doc71Head(ctx.observer);
    assert.notEqual(before.epoch,'0');
    let refusal;try{await ctx.owner.query(rollback);}catch(error){refusal=error;}
    assert.ok(refusal);assert.equal(refusal.code,'55000');
    assert.ok(refusal.message.includes('Retained currentness evidence prevents destructive rollback'),
      'Non-pristine head must be the actual refusal reason');
    await ctx.owner.query('rollback;');assert.deepEqual(await doc71Head(ctx.observer),before);
  });
  return ['rollback-pristine-seed','rollback-material-epoch-refusal'];
}
function doc71SyntheticAuthorityFixture(effectiveFrom) {
  // All bytes here are disposable fixture inputs, including the synthetic
  // census/receipt. None supplies the missing operational implemented-S seal.
  assert.match(effectiveFrom,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const id=DOC71_FIXTURE_IDS,raw={};
  raw.catalog=JSON.stringify({fixtureOnly:true,offer:'synthetic-offering'});
  raw.bindings=JSON.stringify({schemaVersion:1,bindings:[{offeringVariantId:'synthetic-offering',productId:id.product,variantId:id.variant}]});
  raw.reconciliation=JSON.stringify({fixtureOnly:true,selected:['synthetic-offering']});
  raw.health_legal=JSON.stringify({fixtureOnly:true,notApprovedForCustomers:true});
  raw.configuration=JSON.stringify({quickOrderScope:{schemaVersion:1,offers:[
    {offeringVariantId:'synthetic-offering',domains:['synthetic_doc71'],countries:['US']} ]}});
  const censusRaw=JSON.stringify({fixtureOnly:true,sourceCommit:DOC71_CANONICAL_SOURCE_COMMIT,
    relations:DOC71_SOURCE_RELATIONS,profile:'quick-order-canonical-readers-v1'});
  const constructionRaw=JSON.stringify({fixtureOnly:true,sourceCommit:DOC71_CANONICAL_SOURCE_COMMIT,
    readerCensusSha256:sha(censusRaw),warning:'Not an accepted operational census or installation seal'});
  const publication={schemaVersion:'quick-order-authority-v1',revisionId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    sourceCommit:DOC71_CANONICAL_SOURCE_COMMIT,bundleSha256:sha('synthetic-doc71-envelope'),
    artifacts:[...Object.entries(raw).map(([kind,text])=>({kind,path:`synthetic/doc71/${kind}.json`,sha256:sha(text)})),
      {kind:'normalized_decision_inputs',path:'synthetic/doc71/normalized_decision_inputs.json',sha256:'0'.repeat(64)}],
    sourceRefs:['synthetic-source-not-approval'],applicabilityRefs:['synthetic-scope-not-policy'],effectiveFrom,effectiveUntil:null};
  const decision=decisionFixture(publication);
  Object.assign(decision.offerRules[0],{productId:id.product,variantId:id.variant});
  decision.readerCensusSha256=sha(censusRaw);
  const fixture=bindDecision(publication,decision);assertFixtureReferenceBinding(fixture);
  return {...fixture,raw,censusRaw,constructionRaw};
}
async function doc80StageInput(ctx,fixture) {
  // Called by fresh(active-synthetic), after original candidate installation,
  // valid synthetic writer startup and canonical selected P/V row seeding.
  // There is no direct write to head/revisions/activations or seal re-signing.
  assertFixtureReferenceBinding(fixture);
  const p=fixture.publication,d=JSON.parse(fixture.text);
  for(const [kind,raw] of Object.entries(fixture.raw))assert.equal(p.artifacts.find(a=>a.kind===kind).sha256,sha(raw));
  assert.equal(d.readerCensusSha256,sha(fixture.censusRaw));
  await ctx.owner.query(`insert into ${PREFIX}currentness_scope_inputs
    (revision_id,source_commit,decision_text_sha256,reader_census_sha256,canonical_reader_profile,
      artifacts,construction_receipt,construction_receipt_sha256,bindings_raw,configuration_raw)
    values(${q(p.revisionId)},${q(p.sourceCommit)},${q(sha(fixture.text))},${q(d.readerCensusSha256)},
      'quick-order-canonical-readers-v1',${j(p.artifacts.filter(a=>a.kind!=='normalized_decision_inputs'))},
      'synthetic/doc71/construction.json',${q(sha(fixture.constructionRaw))},
      pg_catalog.convert_to(${q(fixture.raw.bindings)},'UTF8'),pg_catalog.convert_to(${q(fixture.raw.configuration)},'UTF8'));`);
}
async function doc71StageSyntheticAuthority(ctx,fixture) {
  await doc80StageInput(ctx,fixture);
  const p=fixture.publication,d=JSON.parse(fixture.text);
  await ctx.writer.query(`select ${publishCall(fixture)};`);
  const held=await doc71Head(ctx.observer);
  assert.equal(held.state,'held');assert.equal(held.published,p.revisionId);
  await ctx.writer.query(`select ${PREFIX}currentness_activate_revision(${q(p.revisionId)},${q(held.epoch)}::bigint,
    ${q(p.sourceCommit)},${q(d.readerCensusSha256)});`);
  const active=await doc71Head(ctx.observer);assert.equal(active.state,'active');assert.equal(active.active,p.revisionId);
  return fixture;
}
async function doc71RunActiveScopeControls(h,binding) {
  const fixtures=doc71RelationFixtures(),content=fixtures.find(r=>r.table==='research_product_content');
  const variant=fixtures.find(r=>r.table==='research_product_variants');
  const outProduct='dddddddd-dddd-4ddd-8ddd-dddddddddddd',outContent='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const seed=variant.ancestors+variant.seed+content.seed+`insert into public.research_products(id,sku,slug,display_name,lane)
    values(${q(outProduct)},'synthetic-out','synthetic-out','Synthetic OUT','research_material');
    insert into public.research_product_content(id,product_id,section) values(${q(outContent)},${q(outProduct)},'overview');`;
  await doc71WithFresh(h,binding,{seedSql:seed,profile:'valid-synthetic-writer',authority:'active-synthetic'},async ctx=>{
    assertFixtureReferenceBinding(ctx.authority);
    const before=await doc71Head(ctx.observer);assert.equal(before.state,'active');
    const strict=await ctx.owner.query(`select ${PREFIX}currentness_read_strict_authority(pg_catalog.clock_timestamp()) as value;`);
    assert.deepEqual(strict.rows[0].value,{state:'active',revisionId:before.active,writerEpoch:before.epoch});
    await ctx.writer.query(`update public.research_product_content set state='in_review' where id=${q(outContent)};`);
    assert.deepEqual(await doc71Head(ctx.observer),before,'Genuine OUT material projection bypasses authority invalidation');
    await ctx.writer.query(`update public.research_product_content set heading='Synthetic unprojected edit',body='Fixture prose' where id=${q(DOC71_FIXTURE_IDS.content)};`);
    assert.deepEqual(await doc71Head(ctx.observer),before,'IN equal projection does not become material from prose');
    await ctx.writer.query(content.update);
    const held=await doc71Head(ctx.observer);assert.equal(held.state,'held');assert.equal(held.active,null);
    assert.equal(BigInt(held.epoch)-BigInt(before.epoch),1n);
    const unavailable=await ctx.owner.query(`select ${PREFIX}currentness_read_strict_authority(pg_catalog.clock_timestamp()) as value;`);
    assert.equal(unavailable.rows[0].value.state,'unavailable');
  });
  await doc71WithFresh(h,binding,{seedSql:seed,profile:'valid-synthetic-writer',authority:'active-synthetic'},async ctx=>{
    const before=await doc71Head(ctx.observer),p=ctx.authority.publication,d=JSON.parse(ctx.authority.text);
    // Source SHARE conflicts with this unrelated ROW EXCLUSIVE lock. Revocation
    // must still complete: its accepted path is gate -> head, no source sweep.
    await ctx.holder.query('begin;lock table public.research_products in row exclusive mode;');
    await doc71ExpectRefusal(ctx.writer,`select ${PREFIX}revoke_revision(${q(p.revisionId)},'synthetic revocation');`,
      '22023','Invalid Quick Order revocation');
    assert.deepEqual(await doc71Head(ctx.observer),before);
    const revoke=ctx.writer.start(`select ${PREFIX}revoke_revision(${q(p.revisionId)},'synthetic-revocation');`);
    await revoke.done;
    // Prove the lock was still held, not silently released by idle timeout.
    const lock=await ctx.observer.query(`select count(*)::int as n from pg_catalog.pg_locks where pid=${ctx.holder.pid}
      and relation='public.research_products'::regclass and mode='RowExclusiveLock' and granted;`);
    assert.equal(lock.rows[0].n,1);await ctx.holder.query('rollback;');
    const revoked=await doc71Head(ctx.observer);assert.equal(revoked.state,'held');assert.equal(revoked.active,null);
    assert.equal(BigInt(revoked.epoch)-BigInt(before.epoch),1n);
    assert.equal((await ctx.owner.query(`select count(*)::int as n from ${PREFIX}authority_revocations
      where revision_id=${q(p.revisionId)} and writer_epoch=${q(revoked.epoch)}::bigint;`)).rows[0].n,1);
    await doc71ExpectRefusal(ctx.writer,`select ${PREFIX}currentness_activate_revision(${q(p.revisionId)},${q(revoked.epoch)}::bigint,
      ${q(p.sourceCommit)},${q(d.readerCensusSha256)});`,'55000','revoked');
    assert.deepEqual(await doc71Head(ctx.observer),revoked,'Refused activation cannot alter revoked authority');
  });
  return ['strict-active-reader','out-projection-bypass','in-prose-bypass','in-material-holds',
    'strict-held-refusal','invalid-spaced-revoke-reason','revoke-with-source-lock','revocation-row-recorded','revoked-reactivation-refusal'];
}
const doc71FixtureChildren=new Set();
function doc71PsqlSession(database) {
  assert.match(containerId??'',/^[a-f0-9]{64}$/);
  assert.match(database,/^qo_doc71_[a-f0-9]{24}$/);
  // No password, URL, host or network is accepted. Existing top-level owned-
  // container identity, environment, image and local-only checks still apply.
  const child=spawn('docker',['exec','-i',containerId,'psql','-X','-A','-t','-P','pager=off',
    '-v','ON_ERROR_STOP=0','-U','postgres','-d',database],
    {windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
  doc71FixtureChildren.add(child);
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdin.on('error',()=>{});
  let pending=null,closed=false,closing=false;
  let resolveExit,rejectExit;
  const exited=new Promise((resolve,reject)=>{resolveExit=resolve;rejectExit=reject;});exited.catch(()=>{});
  const fail=error=>{if(pending){clearTimeout(pending.timer);pending.reject(error);pending=null;}};
  child.on('error',error=>{fail(error);rejectExit(error);});
  child.on('close',(code,signal)=>{
    closed=true;doc71FixtureChildren.delete(child);
    if(!closing||code!==0||signal){const error=new Error('Disposable psql session closed unexpectedly');fail(error);rejectExit(error);}
    else resolveExit();
  });
  const receive=(stream,chunk)=>{
    if(!pending)return;
    pending[stream]+=chunk;pending.bytes+=Buffer.byteLength(chunk);
    if(pending.bytes>4*1024*1024){fail(new Error('Disposable psql output ceiling'));child.kill();return;}
    // Independent stdout AND stderr end markers prevent a server ERROR on
    // stderr being mistaken for success when stdout arrives first.
    if(!pending.stdout.includes(pending.end)||!pending.stderr.includes(pending.end))return;
    const p=pending;pending=null;clearTimeout(p.timer);
    const error=p.stderr.match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s*([^\r\n]*)/);
    if(error){p.reject(Object.assign(new Error(error[2]),{code:error[1]}));return;}
    if(/(?:ERROR|FATAL):/.test(p.stderr)){p.reject(new Error('Unclassified PostgreSQL error'));return;}
    const rows=[],counts=[];
    for(const line of p.stdout.split(/\r?\n/)) {
      if(line.startsWith('{')){try{rows.push(JSON.parse(line));}catch{p.reject(new Error('Malformed fixture JSON output'));return;}}
      const count=line.match(/^(?:INSERT \d+|UPDATE|DELETE) (\d+)$/);if(count)counts.push(Number(count[1]));
    }
    p.resolve({rows,rowCount:counts.length?counts.at(-1):rows.length});
  };
  child.stdout.on('data',chunk=>receive('stdout',chunk));child.stderr.on('data',chunk=>receive('stderr',chunk));
  const session={pid:null,
    query(body){
      assert.equal(closed,false);assert.equal(pending,null,'One in-flight command per backend');
      assert.equal(interrupted,false);
      const trimmed=body.trim(),withoutEnd=trimmed.replace(/;\s*$/,'');
      // Wrap single SELECT results only. Whole migration files, DML, BEGIN and
      // COMMIT are sent unchanged; dollar-quoted candidate bodies are untouched.
      const statement=/^select\s/i.test(trimmed)&&!withoutEnd.includes(';')?
        `select pg_catalog.row_to_json(doc71_result) from (${withoutEnd}) doc71_result;`:body;
      const end='DOC71_END_'+randomUUID().replaceAll('-','');
      return new Promise((resolve,reject)=>{
        pending={stdout:'',stderr:'',bytes:0,end,resolve,reject,timer:setTimeout(()=>{
          fail(new Error('Disposable psql command deadline'));child.kill();
        },45000)};
        child.stdin.write(`\\set VERBOSITY verbose\n${statement}\n\\echo ${end}\n\\warn ${end}\n`);
      });
    },
    start(body){const done=this.query(body);done.catch(()=>{});return {done};},
    async close(){
      if(closed){await exited;return;}closing=true;
      if(pending){fail(new Error('Closing pending disposable fixture'));child.kill();}
      else child.stdin.end('rollback;\n\\q\n');
      const cleanup=setTimeout(()=>child.kill(),3000);
      try{await exited;}finally{clearTimeout(cleanup);}
    },
  };
  return session;
}
async function doc71CreateFutureDriver(binding,loadPinned) {
  const candidateText=await loadPinned(CANDIDATE+'.sql'),rollbackText=await loadPinned(CANDIDATE+'.rollback.md');
  const precheckText=await loadPinned(CANDIDATE+'.precheck.sql'),postcheckText=await loadPinned(CANDIDATE+'.postcheck.sql');
  doc71RequireFutureBindings(binding,candidateText);
  const plan=await doc71CanonicalBootstrapPlan(loadPinned);
  const provider=[];for(const file of BASELINE_SQL)provider.push(await loadPinned(file));
  return {candidateText,rollbackText,precheckText,postcheckText,
    async fresh(options){
      doc71RequireFutureBindings(binding,candidateText);
      const database='qo_doc71_'+randomUUID().replaceAll('-','').slice(0,24),sessions=[];
      let created=false,cleanupDone=false;
      const open=async()=>{
        const session=doc71PsqlSession(database);sessions.push(session);
        session.pid=(await session.query('select pg_catalog.pg_backend_pid() as pid;')).rows[0].pid;
        assert.ok(Number.isInteger(session.pid)&&session.pid>0);return session;
      };
      const cleanup=async()=>{
        if(cleanupDone)return;cleanupDone=true;
        const outcomes=await Promise.allSettled(sessions.map(session=>session.close()));
        if(created)await command('docker',['exec','-i',containerId,'psql','-X','-q','-A','-t',
          '-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{
          input:`drop database ${database} with (force);\n`,cleanup:true});
        for(const outcome of outcomes)if(outcome.status==='rejected')throw outcome.reason;
      };
      try{
        await sql(`create database ${database} template template0;`);created=true;
        const owner=await open();
        // Actual canonical bootstrap roles only, then whole canonical 12-table
        // and session predecessors, then original provider/fence history.
        await owner.query(provider[0]);await doc71InstallCanonicalPredecessors(owner,plan);
        for(const source of provider.slice(1))await owner.query(source);
        await owner.query(options.seedSql);
        if(options.beforeInstallSql)await owner.query(options.beforeInstallSql);
        await owner.query(`set research_health_quick_order.currentness_definition=${q(binding.receipt.definitionSha256)};`);
        await owner.query(precheckText);
        await owner.query(candidateText);
        await owner.query(postcheckText);
        const identities=(await owner.query(`select
          json_build_object('name',current_database(),'oid',(select oid::text from pg_database where datname=current_database())) as database,
          json_build_object('name',session_user,'oid',(select oid::text from pg_roles where rolname=session_user)) as "loginRole",
          json_build_object('name',current_user,'oid',(select oid::text from pg_roles where rolname=current_user)) as "requestRole",
          json_build_object('name',pg_get_userbyid(c.relowner),'oid',c.relowner::text) as "ownerRole"
          from pg_class c where c.oid='public.research_assisted_order_provider_fence'::regclass;`)).rows[0];
        // postgres login/request/owner coincide in this disposable fixture.
        // This covers exact identity comparison, not a deployed role topology.
        const profile=doc71SyntheticProfile(identities),mutation=typeof options.profile==='object'?options.profile.mutation:{};
        const setup=doc71SyntheticProfileInstallation(profile,mutation);
        await owner.query(setup.adminSql);
        const writer=await open(),observer=await open(),holder=await open(),contender=await open();
        if(setup.sessionSql)await writer.query(setup.sessionSql);
        const ctx={owner,writer,observer,holder,contender,profile,database,open,close:cleanup,
          async resetWriter(nextMutation={}){
            await this.writer.close();
            const next=doc71SyntheticProfileInstallation(profile,nextMutation);
            await owner.query(next.adminSql);this.writer=await open();
            if(next.sessionSql)await this.writer.query(next.sessionSql);
          }};
        if(options.authority==='active-synthetic'){
          const now=(await owner.query("select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as instant;")).rows[0].instant;
          ctx.authority=await doc71StageSyntheticAuthority(ctx,doc71SyntheticAuthorityFixture(now));
        }else assert.equal(options.authority,'pristine');
        return ctx;
      }catch(error){try{await cleanup();}catch(cleanupError){error.cleanupFailure=cleanupError.message;}throw error;}
    },
  };
}
// DOC71 QUALITY/PARENT-CLOSURE CONTINUATION. These controls exercise the
// canonical migration already pinned above, not a replacement quality writer:
// 20260727120000_research_inventory_lot_coa_admin.sql:1018,1274,1430.
// Only those RPC bodies set their own command setting. The fixture never sets
// xenios.quality_command, disables a trigger, or forges a quality event.
const DOC71_QUALITY_TEST_KEYS = ['identity','assay','purity','sterility','endotoxin',
  'particulate','residual_solvents','elemental_impurities','chain_of_custody'];
const DOC71_OUT_GRAPH = Object.freeze({product:'b1111111-1111-4111-8111-111111111111',
  variant:'b2222222-2222-4222-8222-222222222222',lot:'b3333333-3333-4333-8333-333333333333'});
function doc71QualityUpload() {
  return {originalFilename:'synthetic-doc71.pdf',bucketId:'research-coa-production',contentType:'application/pdf',
    sizeBytes:5,sha256:sha('synthetic fixture bytes, not an uploaded object'),reportIssuer:'Synthetic issuer',
    reportNumber:'Synthetic report',reportDate:'2030-01-01'};
}
function doc71QualityTests() {
  return DOC71_QUALITY_TEST_KEYS.map(testKey=>({testKey,state:'passed',method:'Synthetic method',result:'Synthetic result',unit:'fixture'}));
}
function doc71QualityCall(g,action,tests,version,key) {
  return `select public.research_manage_lot_quality_document(${q(g.documentId)},${q(action)},${j(tests)},
    ${Number(version)},${q(key)},'Synthetic quality control','synthetic-quality-fixture') as value;`;
}
async function doc71QualitySnapshot(ctx,g) {
  return (await ctx.observer.query(`select jsonb_build_object(
    'document',(select to_jsonb(d) from public.research_lot_quality_documents d where d.id=${q(g.documentId)}),
    'tests',(select coalesce(jsonb_agg(to_jsonb(t) order by t.test_key),'[]'::jsonb) from public.research_lot_quality_tests t where t.quality_document_id=${q(g.documentId)}),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) from public.research_lot_quality_events e where e.quality_document_id=${q(g.documentId)})
    ) as value;`)).rows[0].value;
}
async function doc71AssertHeldDelta(ctx,before,count) {
  const after=await doc71Head(ctx.observer);
  assert.equal(BigInt(after.epoch)-BigInt(before.epoch),BigInt(count),'Exact material statement count, never merely positive');
  assert.equal(after.state,'held');assert.equal(after.active,null);return after;
}
async function doc71PrepareQuality(ctx,lotId,key) {
  const upload=doc71QualityUpload();
  const value=(await ctx.writer.query(`select public.research_prepare_lot_quality_upload(${q(lotId)},${j(upload)},
    ${q(key)},'Synthetic quality preparation','synthetic-quality-fixture') as value;`)).rows[0].value;
  assert.match(value.documentId,/^[0-9a-f-]{36}$/);assert.equal(value.documentVersion,1);
  assert.equal(value.idempotentReplay,false);assert.equal(value.objectConfirmed,false);
  return {documentId:value.documentId,lotId,upload,preparationKey:key};
}
async function doc71ReactivateFixture(ctx,fixture=ctx.authority) {
  const head=await doc71Head(ctx.observer),p=fixture.publication,d=JSON.parse(fixture.text);
  assert.equal(head.state,'held');assert.equal(head.published,p.revisionId);
  await ctx.writer.query(`select ${PREFIX}currentness_activate_revision(${q(p.revisionId)},${q(head.epoch)}::bigint,
    ${q(p.sourceCommit)},${q(d.readerCensusSha256)}) as value;`);
  const active=await doc71Head(ctx.observer);assert.equal(active.active,p.revisionId);assert.equal(active.state,'active');
  assert.equal(BigInt(active.epoch)-BigInt(head.epoch),1n);return active;
}
function doc71OutGraphSeed() {
  const lot=doc71RelationFixtures().find(row=>row.table==='research_inventory_lots');
  let seed=lot.ancestors+lot.seed;
  // Re-key only our literal synthetic INSERT fixture, never canonical/candidate
  // SQL. Both graphs still traverse the real variant lifecycle and lot guard.
  for(const key of ['product','variant','lot'])seed=seed.split(DOC71_FIXTURE_IDS[key]).join(DOC71_OUT_GRAPH[key]);
  return seed.split('synthetic-doc71').join('synthetic-doc71-out');
}
async function doc71WithQualityGraph(h,binding,twoGraphs,run) {
  const lot=doc71RelationFixtures().find(row=>row.table==='research_inventory_lots');
  return doc71WithFresh(h,binding,{seedSql:lot.ancestors+lot.seed+(twoGraphs?doc71OutGraphSeed():''),
    profile:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
    let before=await doc71Head(ctx.observer);
    const inside=await doc71PrepareQuality(ctx,DOC71_FIXTURE_IDS.lot,'synthetic-quality-prepare-in');
    await doc71AssertHeldDelta(ctx,before,10); // one document INSERT + nine separate test INSERTs
    const state=await doc71QualitySnapshot(ctx,inside);
    assert.equal(state.tests.length,9);assert.ok(state.tests.every(row=>row.state==='not_provided'));
    assert.deepEqual(state.tests.map(row=>row.test_key).sort(),[...DOC71_QUALITY_TEST_KEYS].sort());
    let outside=null;
    if(twoGraphs){before=await doc71Head(ctx.observer);outside=await doc71PrepareQuality(ctx,DOC71_OUT_GRAPH.lot,'synthetic-quality-prepare-out');
      await doc71AssertHeldDelta(ctx,before,10);}
    const now=(await ctx.owner.query("select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as instant;")).rows[0].instant;
    ctx.authority=await doc71StageSyntheticAuthority(ctx,doc71SyntheticAuthorityFixture(now));
    return run(ctx,{inside,outside});
  });
}
async function doc71RunQualityCommandControls(h,binding) {
  const cases=[];
  await doc71WithQualityGraph(h,binding,false,async(ctx,{inside:g})=>{
    let before=await doc71Head(ctx.observer);
    const confirmed=(await ctx.writer.query(doc71QualityCall(g,'confirm_upload',[],1,'synthetic-quality-confirm'))).rows[0].value;
    assert.equal(confirmed.version,2);assert.equal(confirmed.idempotentReplay,false);
    await doc71AssertHeldDelta(ctx,before,1);
    let snapshot=await doc71QualitySnapshot(ctx,g);
    assert.equal(snapshot.document.coa_on_file,true);assert.equal(snapshot.document.document_state,'pending');
    assert.equal(snapshot.tests.filter(row=>row.state==='not_provided').length,9);
    cases.push('QC01-document-confirm-material-update');
    await doc71ReactivateFixture(ctx);before=await doc71Head(ctx.observer);
    await doc71ExpectRefusal(ctx.writer,doc71QualityCall(g,'approve',doc71QualityTests(),1,'synthetic-quality-stale'),
      'P0001','lot quality document version conflict');
    assert.deepEqual(await doc71Head(ctx.observer),before);assert.deepEqual(await doc71QualitySnapshot(ctx,g),snapshot);
    cases.push('QC02-stale-version-refusal-leaves-no-effect');
    const invalid=doc71QualityTests();invalid[8].state='failed';
    await doc71ExpectRefusal(ctx.writer,doc71QualityCall(g,'approve',invalid,2,'synthetic-quality-approval'),
      'P0001','required exact-lot quality tests are not approved');
    assert.deepEqual(await doc71Head(ctx.observer),before,'Failed approval leaves no committed epoch effect');
    assert.deepEqual(await doc71QualitySnapshot(ctx,g),snapshot,'All nine test upserts and their events remain atomic');
    cases.push('QC03-post-upsert-readiness-whole-statement-atomicity');
    const approve=doc71QualityCall(g,'approve',doc71QualityTests(),2,'synthetic-quality-approval');
    const approved=(await ctx.writer.query(approve)).rows[0].value;
    assert.equal(approved.version,3);assert.equal(approved.idempotentReplay,false);
    await doc71AssertHeldDelta(ctx,before,10); // nine nonempty UPDATE events + one document UPDATE
    snapshot=await doc71QualitySnapshot(ctx,g);
    assert.equal(snapshot.tests.length,9);assert.ok(snapshot.tests.every(row=>row.state==='passed'&&row.reviewed_by==='synthetic-quality-fixture'));
    assert.equal(snapshot.document.document_state,'available');assert.equal(snapshot.document.verification_state,'document_on_file');
    assert.equal(snapshot.events.filter(row=>row.event_type==='review_approved').length,1);
    cases.push('QC04-nine-test-updates-plus-document-exact-ten');
    before=await doc71Head(ctx.observer);
    const replay=(await ctx.writer.query(approve)).rows[0].value;assert.equal(replay.idempotentReplay,true);
    assert.deepEqual(await doc71Head(ctx.observer),before);assert.deepEqual(await doc71QualitySnapshot(ctx,g),snapshot);
    cases.push('QC05-quality-replay-no-second-epoch');
    await doc71ReactivateFixture(ctx);before=await doc71Head(ctx.observer);
    await ctx.writer.query(doc71QualityCall(g,'withdraw',[],3,'synthetic-quality-withdraw'));
    await doc71AssertHeldDelta(ctx,before,1);snapshot=await doc71QualitySnapshot(ctx,g);
    assert.equal(snapshot.document.document_state,'withdrawn');assert.equal(snapshot.document.version,4);
    cases.push('QC06-document-withdraw-material-update');
  });
  await doc71WithQualityGraph(h,binding,false,async(ctx,{inside:g})=>{
    const before=await doc71Head(ctx.observer);
    await ctx.writer.query(`select public.research_cancel_lot_quality_upload(${q(g.lotId)},${j(g.upload)},1,
      ${q(g.preparationKey)},'synthetic-quality-cancel','Synthetic cancellation','synthetic-quality-fixture') as value;`);
    await doc71AssertHeldDelta(ctx,before,1);const snapshot=await doc71QualitySnapshot(ctx,g);
    assert.equal(snapshot.document.document_state,'withdrawn');assert.equal(snapshot.document.version,2);
    assert.equal(snapshot.events.filter(row=>row.event_type==='upload_abandoned').length,1);
    cases.push('QC07-document-cancel-material-update');
  });
  await doc71WithQualityGraph(h,binding,false,async(ctx,{inside:g})=>{
    await ctx.writer.query(doc71QualityCall(g,'confirm_upload',[],1,'synthetic-quality-confirm-reject'));
    await doc71ReactivateFixture(ctx);const before=await doc71Head(ctx.observer);
    await ctx.writer.query(doc71QualityCall(g,'reject',[],2,'synthetic-quality-reject'));
    await doc71AssertHeldDelta(ctx,before,1);const snapshot=await doc71QualitySnapshot(ctx,g);
    assert.equal(snapshot.document.verification_state,'withdrawn');assert.equal(snapshot.document.version,3);
    cases.push('QC08-document-reject-material-update');
  });
  await doc71WithQualityGraph(h,binding,false,async(ctx,{inside:g})=>{
    const before=await doc71Head(ctx.observer),snapshot=await doc71QualitySnapshot(ctx,g);
    for(const [id,statement,message] of [
      ['QC09-document-delete-canonical-refusal',`delete from public.research_lot_quality_documents where id=${q(g.documentId)};`,'quality records may change only through a reviewed quality command'],
      ['QC10-test-delete-canonical-refusal',`delete from public.research_lot_quality_tests where quality_document_id=${q(g.documentId)};`,'quality tests may change only through a reviewed quality command'],
      ['QC11-lot-cascade-canonical-refusal',`delete from public.research_inventory_lots where id=${q(g.lotId)};`,'quality records may change only through a reviewed quality command'],
    ]){
      await doc71ExpectRefusal(ctx.writer,statement,'P0001',message);
      assert.deepEqual(await doc71Head(ctx.observer),before);assert.deepEqual(await doc71QualitySnapshot(ctx,g),snapshot);
      assert.equal((await ctx.observer.query(`select count(*)::int as n from public.research_inventory_lots where id=${q(g.lotId)};`)).rows[0].n,1);
      cases.push(id);
    }
    // These three are canonical BEFORE/FK lifecycle controls, NOT positive QO
    // DELETE/cascade evidence. No pinned reviewed quality RPC performs DELETE;
    // its immutable quality_events references also retain command-created docs.
  });
  return cases;
}
async function doc71Membership(ctx,revision,relation,rows) {
  return (await ctx.owner.query(`select ${PREFIX}currentness_resolve_scope(${q(revision)},'membership',
    ${j({relation,rows})}) as value;`)).rows[0].value;
}
async function doc71RunMixedParentControls(h,binding) {
  // Visible OUT parents are real canonical rows below. A visible legacy parent
  // with NULL product/variant identities is still a separate unfilled fixture:
  // the pinned inventory identity guard will not create that state. Do not
  // confuse a JSON operand containing NULL with an actual visible NULL parent,
  // or bypass that guard merely to manufacture a positive control.
  const cases=[];
  await doc71WithQualityGraph(h,binding,true,async(ctx,{inside,outside})=>{
    const revision=ctx.authority.publication.revisionId,head=await doc71Head(ctx.observer);
    const missing='ffffffff-ffff-4fff-8fff-ffffffffffff';
    assert.equal((await ctx.observer.query(`select
      (select count(*) from public.research_inventory_lots where id=${q(missing)})+
      (select count(*) from public.research_lot_quality_documents where id=${q(missing)}) as n;`)).rows[0].n,0);
    for(const [kind,relation,a,b,unresolved,message] of [
      ['document','research_lot_quality_documents',{id:inside.documentId,lot_id:inside.lotId},
        {id:outside.documentId,lot_id:outside.lotId},{id:missing,lot_id:missing},'Quick Order document parent provenance unresolved'],
      ['test','research_lot_quality_tests',{quality_document_id:inside.documentId},
        {quality_document_id:outside.documentId},{quality_document_id:missing},'Quick Order test parent provenance unresolved'],
    ]){
      assert.deepEqual(await doc71Membership(ctx,revision,relation,[a,b]),{member:true});
      assert.deepEqual(await doc71Membership(ctx,revision,relation,[b,a]),{member:true});
      cases.push('MP-'+kind+'-mixed-in-out-both-orders');
      assert.deepEqual(await doc71Membership(ctx,revision,relation,[b]),{member:false});
      cases.push('MP-'+kind+'-visible-parent-out');
      for(const [order,rows] of [['in-first',[a,unresolved]],['unresolved-first',[unresolved,a]]]){
        await doc71ExpectRefusal(ctx.owner,`select ${PREFIX}currentness_resolve_scope(${q(revision)},'membership',${j({relation,rows})}) as value;`,
          '55000',message);
        assert.deepEqual(await doc71Head(ctx.observer),head);
        cases.push('MP-'+kind+'-'+order+'-must-not-short-circuit');
      }
    }
    // An explicit synthetic OLD-identity operand models a lost live parent.
    // It proves sealed identity is consulted first; it does not claim a real
    // cascade got past the canonical DELETE prohibition above.
    assert.deepEqual(await doc71Membership(ctx,revision,'research_lot_quality_documents',
      [{id:inside.documentId,lot_id:missing}]),{member:true});
    cases.push('MP-sealed-document-precedes-missing-live-parent');
    assert.deepEqual(await doc71Head(ctx.observer),head,'Resolver controls are read-only');
  });
  return cases;
}
function doc71SelectSyntheticRevision(fixture,revision,product,variant) {
  const next=copy(fixture),p=next.publication;p.revisionId=revision;
  next.raw.bindings=JSON.stringify({schemaVersion:1,bindings:[{offeringVariantId:'synthetic-offering',productId:product,variantId:variant}]});
  p.artifacts.find(row=>row.kind==='bindings').sha256=sha(next.raw.bindings);
  p.bundleSha256=sha('synthetic revision '+revision);
  const d=decisionFixture(p);Object.assign(d.offerRules[0],{productId:product,variantId:variant});
  d.readerCensusSha256=sha(next.censusRaw);
  const rebound=bindDecision(p,d);assertFixtureReferenceBinding(rebound);
  return {...next,...rebound};
}
async function doc71ScopeSeal(ctx,revision) {
  return (await ctx.owner.query(`select ${PREFIX}currentness_resolve_scope(${q(revision)},'verify','{}'::jsonb) as value;`)).rows[0].value;
}
async function doc71OfferScope(ctx,revision) {
  return (await ctx.owner.query(`select ${PREFIX}currentness_resolve_scope(${q(revision)},'offer',
    ${j({offeringVariantIds:['synthetic-offering']})}) as value;`)).rows[0].value.offers[0];
}
async function doc71RunCrossRevisionClosureControls(h,binding) {
  const cases=[];
  await doc71WithQualityGraph(h,binding,true,async(ctx,{inside,outside})=>{
    const first=ctx.authority,r1=first.publication.revisionId,seal1=await doc71ScopeSeal(ctx,r1);
    const second=doc71SelectSyntheticRevision(first,'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',DOC71_OUT_GRAPH.product,DOC71_OUT_GRAPH.variant);
    const beforePublish=await doc71Head(ctx.observer);ctx.authority=await doc71StageSyntheticAuthority(ctx,second);
    const r2=second.publication.revisionId,seal2=await doc71ScopeSeal(ctx,r2),head2=await doc71Head(ctx.observer);
    assert.equal(BigInt(head2.epoch)-BigInt(beforePublish.epoch),2n);
    assert.deepEqual(await doc71ScopeSeal(ctx,r1),seal1);
    const offer1=await doc71OfferScope(ctx,r1),offer2=await doc71OfferScope(ctx,r2);
    assert.equal(offer1.productId,DOC71_FIXTURE_IDS.product);assert.deepEqual(offer1.lotIds,[inside.lotId]);assert.deepEqual(offer1.documentIds,[inside.documentId]);
    assert.equal(offer2.productId,DOC71_OUT_GRAPH.product);assert.deepEqual(offer2.lotIds,[outside.lotId]);assert.deepEqual(offer2.documentIds,[outside.documentId]);
    cases.push('CR01-new-revision-has-own-closure-old-seal-immutable');
    await ctx.writer.query(doc71QualityCall(inside,'confirm_upload',[],1,'synthetic-r1-now-out'));
    assert.deepEqual(await doc71Head(ctx.observer),head2,'Current head r2 makes the former r1 document OUT');
    cases.push('CR02-prior-revision-writer-is-out-for-current-head');
    await ctx.writer.query(doc71QualityCall(outside,'confirm_upload',[],1,'synthetic-r2-now-in'));
    const held=await doc71AssertHeldDelta(ctx,head2,1);cases.push('CR03-current-revision-writer-invalidates');
    await doc71ExpectRefusal(ctx.writer,`select ${PREFIX}currentness_activate_revision(${q(r1)},${q(held.epoch)}::bigint,
      ${q(first.publication.sourceCommit)},${q(JSON.parse(first.text).readerCensusSha256)}) as value;`,
      '55000','Quick Order activation stale or revoked');
    assert.deepEqual(await doc71Head(ctx.observer),held);cases.push('CR04-old-revision-cannot-reactivate-current-head');
    await doc71ReactivateFixture(ctx,second);const active2=await doc71Head(ctx.observer);
    const newLot='b3333333-3333-4333-8333-333333333334';
    await ctx.writer.query(`insert into public.research_inventory_lots(id,lot_id,sku,owner,product_id,variant_id)
      values(${q(newLot)},'synthetic-doc71-added-lot','synthetic-doc71-out-variant','xenios',${q(DOC71_OUT_GRAPH.product)},${q(DOC71_OUT_GRAPH.variant)});`);
    const afterLot=await doc71AssertHeldDelta(ctx,active2,1);
    const added=await doc71PrepareQuality(ctx,newLot,'synthetic-quality-new-closure');
    await doc71AssertHeldDelta(ctx,afterLot,10);
    assert.equal((await ctx.observer.query(`select count(*)::int as n from ${PREFIX}authority_scope_members where revision_id=${q(r2)}
      and (lot_uuid=${q(newLot)} or document_uuid=${q(added.documentId)});`)).rows[0].n,0,'New rows are not retrospectively inserted into the old census');
    assert.deepEqual(await doc71Membership(ctx,r2,'research_lot_quality_documents',[{id:added.documentId,lot_id:newLot}]),{member:true});
    assert.deepEqual(await doc71Membership(ctx,r2,'research_lot_quality_tests',[{quality_document_id:added.documentId}]),{member:true});
    cases.push('CR05-unsealed-new-document-and-test-resolve-visible-selected-parent');
    const changed=await doc71Head(ctx.observer),census=JSON.parse(second.text).readerCensusSha256;
    await doc71ExpectRefusal(ctx.writer,`select ${PREFIX}currentness_activate_revision(${q(r2)},${q(changed.epoch)}::bigint,
      ${q(second.publication.sourceCommit)},${q(census)}) as value;`,'55000','Quick Order closure changed; new revision required');
    assert.deepEqual(await doc71Head(ctx.observer),changed);assert.deepEqual(await doc71ScopeSeal(ctx,r2),seal2);
    cases.push('CR06-changed-lot-document-test-closure-refuses-reactivation');
    await doc71ExpectRefusal(ctx.writer,`select ${publishCall(second)} as value;`,'55000','Quick Order immutable scope closure changed; new revision required');
    assert.deepEqual(await doc71Head(ctx.observer),changed);assert.deepEqual(await doc71ScopeSeal(ctx,r1),seal1);assert.deepEqual(await doc71ScopeSeal(ctx,r2),seal2);
    cases.push('CR07-republishing-same-revision-cannot-reseal-new-closure');
    const third=doc71SelectSyntheticRevision(second,'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',DOC71_OUT_GRAPH.product,DOC71_OUT_GRAPH.variant);
    ctx.authority=await doc71StageSyntheticAuthority(ctx,third);const r3=third.publication.revisionId;
    const offer3=await doc71OfferScope(ctx,r3);
    assert.deepEqual(offer3.lotIds,[outside.lotId,newLot].sort());assert.deepEqual(offer3.documentIds,[outside.documentId,added.documentId].sort());
    const retained=(await ctx.observer.query(`select provenance->'tests' as tests from ${PREFIX}authority_scope_members
      where revision_id=${q(r3)} and row_kind='document' and document_uuid=${q(added.documentId)};`)).rows[0].tests;
    const actual=(await doc71QualitySnapshot(ctx,added)).tests;
    assert.deepEqual(retained,actual.map(row=>[row.id,row.test_key]).sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1])));
    assert.deepEqual(await doc71ScopeSeal(ctx,r1),seal1);assert.deepEqual(await doc71ScopeSeal(ctx,r2),seal2);
    cases.push('CR08-new-revision-captures-complete-child-identities-without-mutation');
  });
  return cases;
}
// DOC80 consolidated source correction. All functions are future callable
// controls, NOT RUN. Session SET/ALTER ROLE below are disposable fixture setup,
// not production pre-BEGIN proof and not SQL-body timeout configuration (CS-26).
const DOC80_FUNCTIONS = [
  'currentness_valid_publication(jsonb)','currentness_valid_decision_inputs(text,jsonb)',
  'currentness_refuse_mutation()','currentness_monotonic_epoch()','currentness_integrity()',
  'currentness_schema_fingerprint()','currentness_read_strict_authority(timestamp with time zone)',
  'currentness_resolve_scope(uuid,text,jsonb)','currentness_activate_revision(uuid,bigint,text,text)',
  'guard_source_write()','publish_revision(jsonb,text)','revoke_revision(uuid,text)','read_current_authority()',
];
const DOC80_TABLES = ['authority_head','authority_revisions','currentness_scope_inputs',
  'authority_scope_members','authority_activations','authority_revocations'];
const doc80SelectedSeed=()=>{
  const lot=doc71RelationFixtures().find(r=>r.table==='research_inventory_lots');return lot.ancestors;
};
async function doc80Snapshot(ctx) {
  const result={};
  for(const table of DOC80_TABLES)result[table]=(await ctx.observer.query(`select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) order by pg_catalog.to_jsonb(t)::pg_catalog.text),'[]'::pg_catalog.jsonb) as rows
    from ${PREFIX}${table} t;`)).rows[0].rows;
  return result;
}
async function doc80Refusal(ctx,statement,code,message,connection=ctx.writer) {
  const before=await doc80Snapshot(ctx);
  await doc71ExpectRefusal(connection,statement,code,message);
  await connection.query('rollback;');
  assert.deepEqual(await doc80Snapshot(ctx),before,'Refusal leaves all six authority relations unchanged');
}
function doc80Activation(fixture,epoch) {
  return `select ${PREFIX}currentness_activate_revision(${q(fixture.publication.revisionId)},${q(epoch)}::pg_catalog.int8,
    ${q(fixture.publication.sourceCommit)},${q(JSON.parse(fixture.text).readerCensusSha256)}) as value;`;
}
async function doc80Held(ctx) {
  const p=ctx.authority.publication;
  await ctx.writer.query(`select ${publishCall(ctx.authority)} as value;`);
  const head=await doc71Head(ctx.observer);assert.equal(head.published,p.revisionId);assert.equal(head.state,'held');return head;
}
async function doc80FunctionInventory(ctx) {
  const values=DOC80_FUNCTIONS.map(signature=>`(${q(PREFIX+signature)},${signature==='guard_source_write()'})`).join(',');
  const rows=(await ctx.owner.query(`select expected.signature,p.prosecdef,p.proconfig,
    p.proowner=(select relowner from pg_catalog.pg_class where oid='public.research_assisted_order_provider_fence'::pg_catalog.regclass) as same_owner
    from (values ${values}) expected(signature,definer)
    left join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(expected.signature)
    order by expected.signature;`)).rows;
  assert.equal(rows.length,13);
  assert.deepEqual(rows,DOC80_FUNCTIONS.map(s=>({signature:PREFIX+s,prosecdef:s==='guard_source_write()',
    proconfig:['search_path=""'],same_owner:true})).sort((a,b)=>a.signature.localeCompare(b.signature)));
  const count=(await ctx.owner.query(`select count(*)::int as n from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and pg_catalog.starts_with(p.proname,'research_health_quick_order_');`)).rows[0].n;
  assert.equal(count,13,'Overloads or extra currentness functions are not part of this family');
}
function doc80SourceAssertions(h) {
  const exceptionBodies=[...h.candidateText.matchAll(/^\s*exception\s+when\s+others\s+then\s+return\s+false\s*;/gim)];
  assert.equal(exceptionBodies.length,2);
  assert.equal([...h.candidateText.matchAll(/^\s*exception\s+when\b/gim)].length,2,'Only the two input validators catch exceptions');
  for(const tag of ['$publish_revision$','$activate_revision$']) {
    const body=section(h.candidateText,tag);
    let previous=-1;
    for(const table of DOC71_SOURCE_RELATIONS){
      const index=body.indexOf(`lock table public.${table} in share mode nowait;`);
      assert.ok(index>previous,`Exact source SHARE NOWAIT order: ${table}`);previous=index;
    }
    const gate=body.indexOf('pg_catalog.pg_advisory_xact_lock(1380471107,1)',previous);
    assert.ok(gate>previous);assert.ok(body.indexOf('for update',gate)>gate,'Head follows the gate');
  }
}
async function doc80RunIntegrityControls(h,binding) {
  const content=doc71RelationFixtures().find(r=>r.table==='research_product_content');
  await doc71WithFresh(h,binding,{seedSql:doc80SelectedSeed()+content.seed,profile:'valid-synthetic-writer',authority:'active-synthetic'},async ctx=>{
    await ctx.owner.query(`select ${PREFIX}currentness_integrity() as value;`);
    await doc80Held(ctx); // Reapply/postcheck require held state, not live activation.
    await ctx.owner.query(h.candidateText);await ctx.owner.query(h.postcheckText);await doc80FunctionInventory(ctx);
    await doc80Refusal(ctx,`begin;alter table ${PREFIX}authority_activations disable row level security;
      select ${PREFIX}currentness_integrity();`,'55000','Quick Order currentness schema drift',ctx.owner);
    // A domain marker would reveal resolution through pg_temp even if it ran
    // under the owner. Zero marker invocations is stronger than checking role.
    await ctx.writer.query(`create temporary table doc80_marker(role_name pg_catalog.text);
      create function pg_temp.doc80_mark() returns pg_catalog.bool language plpgsql as $marker$
      begin insert into pg_temp.doc80_marker values(current_user);return true;end $marker$;
      create domain pg_temp.jsonb as pg_catalog.jsonb check(pg_temp.doc80_mark());
      create domain pg_temp.uuid as pg_catalog.uuid check(pg_temp.doc80_mark());
      create domain pg_temp.text as pg_catalog.text check(pg_temp.doc80_mark());`);
    await ctx.writer.query(content.emptyUpdate);await ctx.writer.query(content.update);
    assert.equal((await ctx.writer.query('select count(*)::int as n from pg_temp.doc80_marker;')).rows[0].n,0);
    const before=await doc80Snapshot(ctx);
    await ctx.owner.query(`create temporary table pg_class as select * from pg_catalog.pg_class where false;
      create temporary table pg_trigger as select * from pg_catalog.pg_trigger where false;`);
    await ctx.owner.query(`select ${PREFIX}currentness_integrity() as value;`);
    const reader=(await ctx.owner.query(`select ${PREFIX}currentness_read_strict_authority(pg_catalog.clock_timestamp()) as value;`)).rows[0].value;
    assert.equal(reader.state,'unavailable');assert.deepEqual(await doc80Snapshot(ctx),before);
  });
  // Structural drift is deliberately invalid disposable DDL, never an adopted
  // replacement source schema. The positive twin retains whole canonical files.
  const structure=[
    ['view',`alter table public.research_product_content rename to doc80_saved_content;create view public.research_product_content as select * from public.doc80_saved_content;`],
    ['partitioned',`alter table public.research_product_content rename to doc80_saved_content;create table public.research_product_content(like public.doc80_saved_content including defaults including constraints) partition by list(section);`],
    ['partition-child',`create table public.doc80_parent(like public.research_product_content including defaults including constraints) partition by list(section);alter table public.doc80_parent attach partition public.research_product_content default;`],
    ['inheritance-parent',`create table public.doc80_child() inherits(public.research_product_content);`],
    ['inheritance-child',`create table public.doc80_parent(like public.research_product_content including defaults including constraints);alter table public.research_product_content inherit public.doc80_parent;`],
    ['rule',`create rule doc80_rule as on update to public.research_product_content do also notify doc80_fixture;`],
  ];
  for(const [id,beforeInstallSql] of structure){
    await doc71WithFresh(h,binding,{seedSql:doc80SelectedSeed(),profile:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
      await ctx.owner.query(`select ${PREFIX}currentness_integrity() as value;`);
    });
    let error;try{const ctx=await h.fresh({seedSql:doc80SelectedSeed(),beforeInstallSql,profile:'valid-synthetic-writer',authority:'pristine'});await ctx.close();}catch(e){error=e;}
    assert.equal(error?.code,'55000',id);assert.ok(error.message.includes('Quick Order source relation structure drift'),id);
  }
  let orphanError;
  try {
    const ctx=await h.fresh({seedSql:doc80SelectedSeed(),profile:'valid-synthetic-writer',authority:'pristine',
      beforeInstallSql:`create table public.doc80_foreign(id pg_catalog.int4);
        create trigger research_health_quick_order_guard_foreign before update on public.doc80_foreign
        for each row execute function pg_catalog.suppress_redundant_updates_trigger();`});
    await ctx.close();
  }catch(error){orphanError=error;}
  assert.equal(orphanError?.code,'55000');
  assert.ok(orphanError.message.includes('Quick Order platform guards without currentness family'));
}
async function doc80RunHeadAndGateControls(h,binding) {
  const content=doc71RelationFixtures().find(r=>r.table==='research_product_content');
  await doc71WithFresh(h,binding,{seedSql:doc80SelectedSeed()+content.seed,profile:'valid-synthetic-writer',authority:'active-synthetic'},async ctx=>{
    const change=`update ${HEAD} set writer_epoch=writer_epoch+1,state='held',active_revision_id=null where singleton;`;
    for(const setup of ['', 'select pg_catalog.pg_advisory_xact_lock_shared(1380471107,1);',
      'select pg_catalog.pg_advisory_xact_lock(5929078257637916673::pg_catalog.int8);']) {
      await doc80Refusal(ctx,'begin;'+setup+change,'55000','Quick Order exclusive authority gate required');
    }
    await ctx.holder.query('begin;select pg_catalog.pg_advisory_xact_lock(1380471107,1);');
    await doc71AwaitGate(ctx.observer,ctx.holder.pid,true);
    await doc80Refusal(ctx,'begin;'+change,'55000','Quick Order exclusive authority gate required');
    await ctx.holder.query('rollback;');
    const before=await doc80Snapshot(ctx);
    await ctx.writer.query('begin;select pg_catalog.pg_advisory_xact_lock(1380471107,1);'+change);
    assert.equal((await doc71Head(ctx.writer)).state,'held');await ctx.writer.query('rollback;');
    assert.deepEqual(await doc80Snapshot(ctx),before);
    await doc80Refusal(ctx,`begin;select pg_catalog.pg_advisory_xact_lock(1380471107,1);
      update ${HEAD} set state='held',active_revision_id=null where singleton;`,'55000','Quick Order authority epoch increase required');
    for(const assignment of ['last_published_revision_id=null',
      `last_revoked_revision_id=${q(ctx.authority.publication.revisionId)},last_revoke_reason='synthetic-reason'`])
      await doc80Refusal(ctx,`begin;select pg_catalog.pg_advisory_xact_lock(1380471107,1);
        update ${HEAD} set ${assignment} where singleton;`,'55000','Quick Order authority epoch increase required');
  });
  for(const operation of ['publish','activate'])await doc71WithFresh(h,binding,
    {seedSql:doc80SelectedSeed(),profile:'valid-synthetic-writer',authority:'active-synthetic'},async ctx=>{
      const held=operation==='activate'?await doc80Held(ctx):null;
      const statement=operation==='publish'?`select ${publishCall(ctx.authority)} as value;`:doc80Activation(ctx.authority,held.epoch);
      await ctx.holder.query('begin;lock table public.research_products in row exclusive mode;');
      const lock=(await ctx.observer.query(`select count(*)::int as n from pg_catalog.pg_locks where pid=${ctx.holder.pid}
        and relation='public.research_products'::pg_catalog.regclass and mode='RowExclusiveLock' and granted;`)).rows[0].n;
      assert.equal(lock,1);await doc80Refusal(ctx,statement,'55P03','could not obtain lock on relation');
      await ctx.holder.query('rollback;');const before=await doc71Head(ctx.observer);
      await ctx.writer.query(statement);assert.equal(BigInt((await doc71Head(ctx.observer)).epoch)-BigInt(before.epoch),1n);
    });
  for(const operation of ['writer','publish','activate','revoke'])for(const shared of [true,false])await doc71WithFresh(h,binding,
    {seedSql:doc80SelectedSeed()+content.seed,profile:'valid-synthetic-writer',authority:'active-synthetic'},async ctx=>{
      const head=operation==='activate'?await doc80Held(ctx):await doc71Head(ctx.observer);
      const statement={writer:content.update,publish:`select ${publishCall(ctx.authority)};`,
        activate:doc80Activation(ctx.authority,head.epoch),revoke:`select ${PREFIX}revoke_revision(${q(ctx.authority.publication.revisionId)},'synthetic-revocation');`}[operation];
      const begin=`begin;select pg_catalog.pg_advisory_xact_lock${shared?'_shared':''}(1380471107,1);`;
      if(shared)await doc80Refusal(ctx,begin+statement,'55000','Quick Order shared authority gate upgrade refused');
      else {await ctx.writer.query(begin+statement);assert.equal(BigInt((await doc71Head(ctx.writer)).epoch)-BigInt(head.epoch),1n);
        await ctx.writer.query('rollback;');assert.deepEqual(await doc71Head(ctx.observer),head);}
    });
}
async function doc80RunPublishedProfileControls(h,binding) {
  const content=doc71RelationFixtures().find(r=>r.table==='research_product_content');
  const selected=['missing-anchor','wrong-anchor','duplicate-key','excess-effective-lock','owner-identity','role-setting-absent'];
  for(const operation of ['writer','publish','activate','revoke'])for(const mutation of doc71ProfileMutations().filter(m=>
    operation==='writer'?selected.includes(m.id):['missing-anchor','excess-effective-lock'].includes(m.id)))for(const negative of [false,true]) {
    await doc71WithFresh(h,binding,{seedSql:doc80SelectedSeed()+content.seed,profile:'valid-synthetic-writer',authority:'active-synthetic'},async ctx=>{
      const head=operation==='activate'?await doc80Held(ctx):await doc71Head(ctx.observer);
      const statement={writer:content.update,publish:`select ${publishCall(ctx.authority)};`,
        activate:doc80Activation(ctx.authority,head.epoch),revoke:`select ${PREFIX}revoke_revision(${q(ctx.authority.publication.revisionId)},'synthetic-revocation');`}[operation];
      if(negative)await ctx.resetWriter(mutation);
      if(negative)await doc80Refusal(ctx,statement,'55000',mutation.message);
      else {await ctx.writer.query(statement);assert.equal(BigInt((await doc71Head(ctx.observer)).epoch)-BigInt(head.epoch),1n);}
    });
  }
}
async function doc80RunIsolationControls(h,binding) {
  const content=doc71RelationFixtures().find(r=>r.table==='research_product_content');
  const outSeed=content.ancestors+content.seed;
  const remap=s=>s.split(DOC71_FIXTURE_IDS.product).join(DOC71_OUT_GRAPH.product)
    .split(DOC71_FIXTURE_IDS.content).join('e6666666-6666-4666-8666-666666666666').split('synthetic-doc71').join('synthetic-doc71-out');
  for(const isolation of ['repeatable read','serializable','read uncommitted'])for(const kind of ['out','equal','zero'])
    await doc71WithFresh(h,binding,{seedSql:doc80SelectedSeed()+content.seed+remap(outSeed),profile:'valid-synthetic-writer',authority:'active-synthetic'},async ctx=>{
      const statement=kind==='out'?remap(content.update):kind==='equal'?content.equalUpdate:content.emptyUpdate;
      const before=await doc71Head(ctx.observer);
      await doc80Refusal(ctx,`begin isolation level ${isolation};${statement}`,'55000','requires READ COMMITTED');
      await ctx.writer.query(statement);assert.deepEqual(await doc71Head(ctx.observer),before,'READ COMMITTED valid nonmaterial twin');
    });
  for(const isolation of ['repeatable read','serializable'])for(const operation of ['publish','activate'])await doc71WithFresh(h,binding,
    {seedSql:doc80SelectedSeed()+content.seed,profile:'valid-synthetic-writer',authority:'active-synthetic'},async ctx=>{
      const held=operation==='activate'?await doc80Held(ctx):null;
      await ctx.writer.query(`begin isolation level ${isolation};select writer_epoch from ${HEAD};`);
      const statement=operation==='publish'?`select ${publishCall(ctx.authority)};`:doc80Activation(ctx.authority,held.epoch);
      await ctx.contender.query(statement);
      const after=await doc80Snapshot(ctx);
      await doc71ExpectRefusal(ctx.writer,content.update,'55000','requires READ COMMITTED');await ctx.writer.query('rollback;');
      assert.deepEqual(await doc80Snapshot(ctx),after,'Stale writer cannot undo concurrent authority transition');
    });
}
function doc80Out(sqlText) {
  let value=sqlText;
  for(const id of Object.values(DOC71_FIXTURE_IDS))value=value.split(id).join('e'+id.slice(1));
  return value.split('synthetic-doc71').join('synthetic-doc80-out').split('synthetic_doc71').join('synthetic_doc80_out')
    .split("'US'").join("'CA'").split('ZZ-FIXTURE').join('ZZ-OUT');
}
async function doc80RunScopeControls(h,binding) {
  const fixtures=doc71RelationFixtures(),byName=name=>fixtures.find(r=>r.table===name),
    product=byName('research_products'),variant=byName('research_product_variants'),
    lot=byName('research_inventory_lots'),document=byName('research_lot_quality_documents');
  const cases=[];
  for(const row of fixtures)for(const inside of [true,false])for(const event of ['insert','update','delete']) {
    // Global identity predicates have no OUT branch. Canonical BEFORE guards
    // remain real refusals, never bypassed to manufacture an AFTER success.
    if(!inside&&['research_early_access_session_bindings','research_early_access_legal_bindings'].includes(row.table))continue;
    if(inside&&row.table==='research_products'&&event==='insert')continue;
    const map=inside?s=>s:doc80Out;
    let seed=doc80SelectedSeed(),statement=map(row[event]);
    if(!inside){
      if(row.table==='research_products') {if(event!=='insert')seed+=doc80Out(doc80SelectedSeed());}
      else if(row.table==='research_product_variants'&&event==='insert')seed+=doc80Out(product.seed);
      else seed+=doc80Out(doc80SelectedSeed());
    }
    if(['research_lot_quality_documents','research_lot_quality_tests'].includes(row.table))seed+=map(lot.seed);
    if(row.table==='research_lot_quality_tests')seed+=map(document.seed);
    if(event!=='insert'&&!['research_products','research_product_variants'].includes(row.table))seed+=map(row.seed);
    if(inside&&row.table==='research_product_variants'&&event==='insert')
      statement=statement.split(DOC71_FIXTURE_IDS.variant).join('d2222222-2222-4222-8222-222222222222')
        .split('synthetic-doc71-variant').join('synthetic-doc80-additional-variant');
    // This field is nonnull in BOTH domain twins; membership must not mistake
    // the optional record selector for an installed reader dependency.
    if(row.table==='research_required_inputs'){
      const enrich=s=>s.replace(/(insert into public\.research_required_inputs \(id,)([^;]*?\)\s*select )('[^']+'),/,
        (_all,columns,between,id)=>`${columns}record_id,${between}${id},'synthetic-record',`);
      seed=enrich(seed);if(event==='insert')statement=enrich(statement);
    }
    await doc71WithFresh(h,binding,{seedSql:seed,profile:'valid-synthetic-writer',authority:'active-synthetic'},async ctx=>{
      const before=await doc71Head(ctx.observer),prior=(await ctx.observer.query(row.snapshot)).rows;
      const refusal=DOC71_CANONICAL_REFUSALS[row.table]?.[event];
      if(refusal){await doc71ExpectRefusal(ctx.writer,statement,'P0001',refusal);
        assert.deepEqual(await doc71Head(ctx.observer),before);assert.deepEqual((await ctx.observer.query(row.snapshot)).rows,prior);
        cases.push({id:`CS10-${row.table}-${inside?'IN':'OUT'}-${event}`,classification:'CANONICAL_BEFORE_REFUSAL_ONLY'});return;}
      assert.equal((await ctx.writer.query(statement)).rowCount,1,'A real row must reach the intended event');
      const sessionInsert=row.table==='research_early_access_session_bindings'&&event==='insert';
      // A selected product DELETE also deletes its selected variant; both
      // guarded events are material. No price/document/audit children exist.
      const delta=!inside||sessionInsert?0:row.table==='research_products'&&event==='delete'?2:1;
      const after=await doc71Head(ctx.observer);assert.equal(BigInt(after.epoch)-BigInt(before.epoch),BigInt(delta));
      if(delta){assert.equal(after.state,'held');assert.equal(after.active,null);}else assert.deepEqual(after,before);
      cases.push({id:`CS10-${row.table}-${inside?'IN':'OUT'}-${event}`,classification:delta?'MATERIAL_EPOCH':'NO_EPOCH'});
    });
  }
  // Supported mutable membership columns: both OLD and NEW membership must
  // invalidate, including the outward move. Price economic keys and canonical
  // session/legal/quality writes are not silently made mutable for this matrix.
  for(const table of ['research_product_content','research_domain_launch_controls','research_required_inputs','research_early_access_shipping_regions'])
    for(const into of [true,false]) {
      const row=byName(table),source=into?doc80Out:s=>s;
      const assignments={research_product_content:`product_id=${q(into?DOC71_FIXTURE_IDS.product:'e'+DOC71_FIXTURE_IDS.product.slice(1))}`,
        research_domain_launch_controls:`domain=${q(into?'synthetic_doc71':'synthetic_doc80_out')}`,
        research_required_inputs:`domain=${q(into?'synthetic_doc71':'synthetic_doc80_out')}`,
        research_early_access_shipping_regions:`country=${q(into?'US':'CA')}`};
      await doc71WithFresh(h,binding,{seedSql:doc80SelectedSeed()+doc80Out(doc80SelectedSeed())+source(row.seed),
        profile:'valid-synthetic-writer',authority:'active-synthetic'},async ctx=>{
        const before=await doc71Head(ctx.observer),where=source(row.update).split(' where ')[1];
        await ctx.writer.query(`update public.${table} set ${assignments[table]} where ${where}`);
        await doc71AssertHeldDelta(ctx,before,1);
      });
    }
  const legal=byName('research_early_access_legal_bindings');
  for(const collision of [true,false])await doc71WithFresh(h,binding,
    {seedSql:doc80SelectedSeed()+legal.seed,profile:'valid-synthetic-writer',authority:'active-synthetic'},async ctx=>{
      const before=await doc71Head(ctx.observer),ref='eac_'+(collision?'2':'3').repeat(32);
      await ctx.writer.query(`insert into public.research_early_access_legal_bindings
        (id,customer_ref,member_id,established_by,verified_at,alias_refs)
        values('d9999999-9999-4999-8999-999999999999',${q(ref)},${q(DOC71_FIXTURE_IDS.member)},
        'verified_link','2030-01-01T00:00:00Z','{}'::pg_catalog.text[]);`);
      if(collision)await doc71AssertHeldDelta(ctx,before,1);else assert.deepEqual(await doc71Head(ctx.observer),before);
    });
  return cases;
}
async function doc80RunHistoryControls(h,binding) {
  await doc71WithFresh(h,binding,{seedSql:doc80SelectedSeed(),profile:'valid-synthetic-writer',authority:'active-synthetic'},async ctx=>{
    const revision=ctx.authority.publication.revisionId;
    await ctx.writer.query(`select ${PREFIX}revoke_revision(${q(revision)},'synthetic-revocation');`);
    for(const [table,column] of [['currentness_scope_inputs','source_commit'],['authority_scope_members','provenance'],
      ['authority_activations','source_commit'],['authority_revocations','reason']])for(const event of ['update','delete','truncate']) {
      const statement=event==='update'?`update ${PREFIX}${table} set ${column}=${column} where revision_id=${q(revision)};`:
        event==='delete'?`delete from ${PREFIX}${table} where revision_id=${q(revision)};`:`truncate ${PREFIX}${table};`;
      await doc80Refusal(ctx,statement,'55000','Quick Order authority history mutation refused');
    }
    for(const kind of ['member','header']) {
      const statement=kind==='member'?`insert into ${PREFIX}authority_scope_members(revision_id,row_kind,identity_key,domain,provenance)
        values(${q(revision)},'domain','synthetic_other','synthetic_other','{}');`:
        `insert into ${PREFIX}authority_scope_members select * from ${PREFIX}authority_scope_members
          where revision_id=${q(revision)} and row_kind='header';`;
      await doc80Refusal(ctx,statement,'55000','Quick Order sealed scope insertion refused');
    }
    await doc80Refusal(ctx,`select ${publishCall(ctx.authority)};`,'55000','Quick Order revoked revision cannot be republished');
    await doc80Refusal(ctx,`select ${PREFIX}revoke_revision(${q(revision)},'synthetic-revocation');`,
      '55000','Quick Order revision unavailable or already revoked');
    await doc80Refusal(ctx,`select ${PREFIX}revoke_revision('dddddddd-dddd-4ddd-8ddd-dddddddddddd','synthetic-revocation');`,
      '55000','Quick Order revision unavailable or already revoked');
    for(const header of [true,false]) {
      await doc71ScopeSeal(ctx,revision);
      const mutation=header?`provenance=pg_catalog.jsonb_set(provenance,'{sourceCommit}',${j('f'.repeat(40))})`:
        `product_identifier='synthetic-tampered'`;
      // Candidate-owned history trigger only; restore ALWAYS before checking.
      // This models corruption without changing source definitions or resealing.
      await doc80Refusal(ctx,`begin;alter table ${PREFIX}authority_scope_members disable trigger research_health_quick_order_history_immutable_3;
        update ${PREFIX}authority_scope_members set ${mutation} where revision_id=${q(revision)} and row_kind=${q(header?'header':'product')};
        alter table ${PREFIX}authority_scope_members enable always trigger research_health_quick_order_history_immutable_3;
        select ${PREFIX}currentness_resolve_scope(${q(revision)},'verify','{}');`,'55000',
        header?'Quick Order scope header binding invalid':'Quick Order sealed scope rows changed');
    }
  });
}
function doc80RebindRaw(fixture,mutate) {
  const changed=copy(fixture);mutate(changed.raw);
  for(const [kind,raw] of Object.entries(changed.raw))changed.publication.artifacts.find(a=>a.kind===kind).sha256=sha(raw);
  const decision=JSON.parse(changed.text);
  for(const artifact of changed.publication.artifacts.filter(a=>a.kind!=='normalized_decision_inputs'))
    decision.artifacts[artifact.kind==='health_legal'?'healthLegal':artifact.kind]={path:artifact.path,sha256:artifact.sha256};
  decision.configurationVersion=decision.artifacts.configuration.sha256;
  return {...changed,...bindDecision(changed.publication,decision)};
}
async function doc80RunCarrierControls(h,binding) {
  const mutations=[
    ['nested-duplicate',raw=>{raw.configuration=raw.configuration.replace('"domains":','"domains":[],"domains":');},'Quick Order scope JSON encoding invalid'],
    ['unknown-scope-key',raw=>{const c=JSON.parse(raw.configuration);c.quickOrderScope.extra=true;raw.configuration=JSON.stringify(c);},'Quick Order scope field contract invalid'],
    ['unknown-offer-key',raw=>{const c=JSON.parse(raw.configuration);c.quickOrderScope.offers[0].extra=true;raw.configuration=JSON.stringify(c);},'Quick Order approved domains or country unavailable'],
    ['ambiguous-binding',raw=>{const b=JSON.parse(raw.bindings);b.bindings.push(copy(b.bindings[0]));raw.bindings=JSON.stringify(b);},'Quick Order binding identity invalid or ambiguous'],
    ['product-control-mismatch',raw=>{const b=JSON.parse(raw.bindings);b.bindings[0].variantId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';raw.bindings=JSON.stringify(b);},'Quick Order canonical Product Control mapping mismatch'],
    ['schema-version-spelling',raw=>{raw.configuration=raw.configuration.replace('"schemaVersion":1','"schemaVersion":1.0');},'Quick Order scope field contract invalid'],
  ];
  for(const [id,mutate,message] of mutations)for(const negative of [false,true])await doc71WithFresh(h,binding,
    {seedSql:doc80SelectedSeed(),profile:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
      const now=(await ctx.owner.query("select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as instant;")).rows[0].instant;
      const base=doc71SyntheticAuthorityFixture(now),fixture=negative?doc80RebindRaw(base,mutate):base;
      await doc80StageInput(ctx,fixture);
      assert.equal((await ctx.owner.query(`select ${decisionCall(fixture)} as valid;`)).rows[0].valid,true,id+' must pass the unrelated decision validator');
      if(negative)await doc80Refusal(ctx,`select ${publishCall(fixture)};`,'55000',message);
      else {await ctx.writer.query(`select ${publishCall(fixture)};`);assert.equal((await doc71Head(ctx.observer)).epoch,'1');}
    });
  for(const kind of ['unstaged','raw-digest'])await doc71WithFresh(h,binding,
    {seedSql:doc80SelectedSeed(),profile:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
      const now=(await ctx.owner.query("select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as instant;")).rows[0].instant;
      const fixture=doc71SyntheticAuthorityFixture(now);
      if(kind==='raw-digest'){
        await doc80StageInput(ctx,fixture);
        await ctx.owner.query(`begin;alter table ${PREFIX}currentness_scope_inputs disable trigger research_health_quick_order_history_immutable_0;
          update ${PREFIX}currentness_scope_inputs set bindings_raw=bindings_raw||pg_catalog.convert_to(' ','UTF8');
          alter table ${PREFIX}currentness_scope_inputs enable always trigger research_health_quick_order_history_immutable_0;commit;`);
      }
      await doc80Refusal(ctx,`select ${publishCall(fixture)};`,'55000',kind==='unstaged'?
        'Quick Order exact scope input unavailable':'Quick Order raw input byte binding mismatch');
    });
  for(const numeric of [false,true])await doc71WithFresh(h,binding,
    {seedSql:doc80SelectedSeed(),profile:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
      const now=(await ctx.owner.query("select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as instant;")).rows[0].instant;
      let fixture=doc80RebindRaw(doc71SyntheticAuthorityFixture(now),raw=>{
        const b=JSON.parse(raw.bindings),c=JSON.parse(raw.configuration);
        b.bindings[0].offeringVariantId='7';c.quickOrderScope.offers[0].offeringVariantId=numeric?7:'7';
        raw.bindings=JSON.stringify(b);raw.configuration=JSON.stringify(c);
      });
      const decision=JSON.parse(fixture.text);decision.offerRules[0].offeringVariantId='7';
      fixture={...fixture,...bindDecision(fixture.publication,decision)};await doc80StageInput(ctx,fixture);
      assert.equal((await ctx.owner.query(`select ${decisionCall(fixture)} as valid;`)).rows[0].valid,true);
      if(numeric)await doc80Refusal(ctx,`select ${publishCall(fixture)};`,'55000','Quick Order approved domains or country unavailable');
      else {await ctx.writer.query(`select ${publishCall(fixture)};`);assert.equal((await doc71Head(ctx.observer)).epoch,'1');}
    });
  for(const swapped of [false,true])await doc71WithFresh(h,binding,
    {seedSql:doc80SelectedSeed(),profile:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
      const now=(await ctx.owner.query("select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as instant;")).rows[0].instant;
      const fixture=doc71SyntheticAuthorityFixture(now);
      if(swapped)[fixture.publication.artifacts[0],fixture.publication.artifacts[1]]=
        [fixture.publication.artifacts[1],fixture.publication.artifacts[0]];
      const before=await doc80Snapshot(ctx);
      if(swapped){let error;try{await doc80StageInput(ctx,fixture);}catch(e){error=e;}
        assert.equal(error?.code,'23514');assert.ok(error.message.includes('artifacts'));assert.deepEqual(await doc80Snapshot(ctx),before);}
      else {await doc80StageInput(ctx,fixture);await ctx.writer.query(`select ${publishCall(fixture)};`);}
    });
}
async function doc80RunStatementAndDriftControls(h,binding) {
  const content=doc71RelationFixtures().find(r=>r.table==='research_product_content');
  const table='public.research_product_content',newId='d6666666-6666-4666-8666-666666666666';
  const insert=`insert into ${table}(id,product_id,section) values(${q(newId)},${q(DOC71_FIXTURE_IDS.product)},'specifications')`;
  for(const [event,empty,noOp] of [['insert',false,false],['update',false,false],['delete',false,false],
    ['insert',true,false],['update',true,false],['delete',true,false],['update',false,true]]) {
    await doc71WithFresh(h,binding,{seedSql:doc80SelectedSeed()+(event==='insert'?'':content.seed),
      profile:'valid-synthetic-writer',authority:'active-synthetic'},async ctx=>{
      const before=await doc71Head(ctx.observer),id=event==='insert'?newId:DOC71_FIXTURE_IDS.content;
      const action=event==='insert'?`when not matched then insert(id,product_id,section) values(s.id,${q(DOC71_FIXTURE_IDS.product)},'overview')`:
        event==='delete'?'when matched then delete':`when matched then update set ${noOp?'heading=t.heading':"state='in_review'"}`;
      await ctx.writer.query(`merge into ${table} t using(select ${q(id)}::pg_catalog.uuid as id${empty?' where false':''}) s
        on t.id=s.id ${action};`);
      const after=await doc71Head(ctx.observer);assert.equal(BigInt(after.epoch)-BigInt(before.epoch),empty||noOp?0n:1n);
      if(empty||noOp)assert.deepEqual(after,before);else {assert.equal(after.state,'held');assert.equal(after.active,null);}
    });
  }
  for(const rollback of [false,true])await doc71WithFresh(h,binding,
    {seedSql:doc80SelectedSeed()+content.seed,profile:'valid-synthetic-writer',authority:'active-synthetic'},async ctx=>{
      const before=await doc80Snapshot(ctx),head=await doc71Head(ctx.observer),rows=(await ctx.observer.query(content.snapshot)).rows;
      await ctx.writer.query(`begin;with inserted as (${insert} returning id), changed as (
        update ${table} set state='in_review' where id=${q(DOC71_FIXTURE_IDS.content)} returning id)
        select (select count(*) from inserted)+(select count(*) from changed) as changed;`);
      assert.equal(BigInt((await doc71Head(ctx.writer)).epoch)-BigInt(head.epoch),2n,'One material epoch for each statement event');
      if(rollback){await ctx.writer.query('rollback;');assert.deepEqual(await doc80Snapshot(ctx),before);assert.deepEqual((await ctx.observer.query(content.snapshot)).rows,rows);}
      else {await ctx.writer.query('commit;');await doc71AssertHeldDelta(ctx,head,2);}
    });
  for(const empty of [false,true])await doc71WithFresh(h,binding,
    {seedSql:doc80SelectedSeed(),profile:'valid-synthetic-writer',authority:'active-synthetic'},async ctx=>{
      const before=await doc71Head(ctx.observer);
      await ctx.writer.query(`copy ${table}(id,product_id,section) from stdin with (format csv);
${empty?'':newId+','+DOC71_FIXTURE_IDS.product+',overview\n'}\\.
`);
      const after=await doc71Head(ctx.observer);assert.equal(BigInt(after.epoch)-BigInt(before.epoch),empty?0n:1n);
      assert.equal((await ctx.observer.query(`select count(*)::int as n from ${table} where id=${q(newId)};`)).rows[0].n,empty?0:1);
    });
  const drift=[
    ['foreign-prefixed-trigger',`create table public.doc80_foreign(id pg_catalog.int4);
      create trigger research_health_quick_order_guard_foreign after insert on public.doc80_foreign
      referencing new table as qo_new_rows for each statement execute function ${PREFIX}guard_source_write();`,
      'Quick Order exact platform guard inventory drift'],
    ['disabled-guard',`alter table ${table} disable trigger research_health_quick_order_guard_u;`,'Quick Order exact platform guard inventory drift'],
    ['missing-guard',`drop trigger research_health_quick_order_guard_u on ${table};`,'Quick Order exact platform guard inventory drift'],
    ['overloaded-guard',`create function ${PREFIX}guard_source_write(pg_catalog.int4) returns pg_catalog.bool language sql
      set search_path='' as 'select true';`,'Quick Order exact function inventory mismatch'],
    ['wrong-transition-alias',`drop trigger research_health_quick_order_guard_u on ${table};
      create trigger research_health_quick_order_guard_u after update on ${table} referencing old table as wrong_old new table as qo_new_rows
      for each statement execute function ${PREFIX}guard_source_write();alter table ${table} enable always trigger research_health_quick_order_guard_u;`,
      'Quick Order exact platform guard inventory drift'],
    ['guard-column-list',`drop trigger research_health_quick_order_guard_t on ${table};
      create trigger research_health_quick_order_guard_t before update of state on ${table}
      for each statement execute function ${PREFIX}guard_source_write();alter table ${table} enable always trigger research_health_quick_order_guard_t;`,
      'Quick Order exact platform guard inventory drift'],
    ['guard-argument',`drop trigger research_health_quick_order_guard_t on ${table};
      create trigger research_health_quick_order_guard_t before truncate on ${table}
      for each statement execute function ${PREFIX}guard_source_write('synthetic-argument');
      alter table ${table} enable always trigger research_health_quick_order_guard_t;`,
      'Quick Order exact platform guard inventory drift'],
    ['function-proconfig',`alter function ${PREFIX}read_current_authority() set work_mem='8MB';`,'Quick Order exact function inventory mismatch'],
    ['function-owner',`alter function ${PREFIX}read_current_authority() owner to service_role;`,'Quick Order exact function inventory mismatch'],
    ['function-acl',`grant execute on function ${PREFIX}read_current_authority() to anon;`,'Quick Order currentness schema drift'],
    ['table-acl',`grant select on ${PREFIX}authority_scope_members to authenticated;`,'Quick Order currentness schema drift'],
    ['descriptor-live-column',`alter table ${table} add column doc80_unaccepted_column pg_catalog.text;`,'Quick Order source-column descriptor drift'],
    ['history-trigger-disabled',`alter table ${PREFIX}authority_activations disable trigger research_health_quick_order_history_immutable_1;`,'Quick Order currentness schema drift'],
    ['seal-trigger-when',`drop trigger research_health_quick_order_scope_insert_seal on ${PREFIX}authority_scope_members;
      create trigger research_health_quick_order_scope_insert_seal before insert on ${PREFIX}authority_scope_members
      for each row when(false) execute function ${PREFIX}currentness_refuse_mutation();
      alter table ${PREFIX}authority_scope_members enable always trigger research_health_quick_order_scope_insert_seal;`,'Quick Order currentness schema drift'],
  ];
  await doc71WithFresh(h,binding,{seedSql:doc80SelectedSeed(),profile:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
    await doc80FunctionInventory(ctx);
    for(const [id,setup,message] of drift){
      await ctx.owner.query(`select ${PREFIX}currentness_integrity() as value;`);
      await doc80Refusal(ctx,`begin;${setup}select ${PREFIX}currentness_integrity();`,'55000',message,ctx.owner);
      await ctx.owner.query(`select ${PREFIX}currentness_integrity() as value;`);
    }
    for(const phase of [h.precheckText,h.postcheckText]){
      // An already-open fixture transaction contains the whole original phase;
      // its BEGIN does not create a nested transaction. The expected error and
      // ROLLBACK remove the ADD COLUMN, including its descriptor slot.
      await doc80Refusal(ctx,`begin;alter table ${table} add column doc80_unaccepted_column pg_catalog.text;\n${phase}`,
        '55000','Quick Order source-column descriptor drift',ctx.owner);
      await ctx.owner.query(`select ${PREFIX}currentness_integrity();`);
    }
    for(const role of ['anon','authenticated','service_role']) {
      for(const signature of DOC80_FUNCTIONS){
        const name=signature.slice(0,signature.indexOf('(')),args=signature.slice(signature.indexOf('(')+1,-1)
          .split(',').filter(Boolean).map(type=>'null::'+type).join(',');
        await doc80Refusal(ctx,`begin;set local role ${role};select ${PREFIX}${name}(${args});`,
          '42501','permission denied for function',ctx.owner);
      }
      for(const name of DOC80_TABLES)await doc80Refusal(ctx,`begin;set local role ${role};select * from ${PREFIX}${name};`,
        '42501','permission denied for table',ctx.owner);
    }
    await ctx.owner.query(rollbackBlock(h.rollbackText));
    const functions=(await ctx.owner.query(`select count(*)::int as n from pg_catalog.pg_proc p
      where p.pronamespace='public'::pg_catalog.regnamespace and pg_catalog.starts_with(p.proname,'research_health_quick_order_');`)).rows[0].n;
    assert.equal(functions,0,'Rollback removes all thirteen functions, including guard_source_write');
    for(const name of DOC80_TABLES)assert.equal((await ctx.owner.query(`select pg_catalog.to_regclass(${q(PREFIX+name)}) is null as absent;`)).rows[0].absent,true);
  });
  // Real catalog subscription membership, not connect=false (which would have
  // no pg_subscription_rel row). A reviewed future container must enable logical
  // WAL; this explicit prerequisite is not installation or hosted authority.
  await doc71WithFresh(h,binding,{seedSql:doc80SelectedSeed(),profile:'valid-synthetic-writer',authority:'pristine'},async ctx=>{
    assert.equal((await ctx.owner.query("select current_setting('wal_level') as value;")).rows[0].value,'logical',
      'Disposable subscription control requires explicitly configured logical WAL');
    await ctx.owner.query('create publication doc80_publication for table public.research_product_content;');
    let subscribed=false;
    try {
      await ctx.owner.query(`create subscription doc80_subscription connection ${q('host=/var/run/postgresql dbname='+ctx.database+' user=postgres')}
        publication doc80_publication with(connect=true,enabled=false,create_slot=false,copy_data=false,slot_name=NONE);`);
      subscribed=true;
      assert.equal((await ctx.owner.query(`select count(*)::int as n from pg_catalog.pg_subscription_rel
        where srrelid='public.research_product_content'::pg_catalog.regclass;`)).rows[0].n,1);
      await doc80Refusal(ctx,`select ${PREFIX}currentness_integrity();`,'55000','Quick Order source relation structure drift',ctx.owner);
      await doc71ExpectRefusal(ctx.owner,h.precheckText,'55000','Quick Order source relation structure drift');await ctx.owner.query('rollback;');
      await doc71ExpectRefusal(ctx.owner,h.postcheckText,'55000','Quick Order source relation structure drift');await ctx.owner.query('rollback;');
    }finally{
      if(subscribed)await ctx.owner.query('drop subscription doc80_subscription;');
      await ctx.owner.query('drop publication doc80_publication;');
    }
    await ctx.owner.query(`select ${PREFIX}currentness_integrity();`);await ctx.owner.query(h.precheckText);await ctx.owner.query(h.postcheckText);
  });
}
async function doc71RunFutureSuites(binding,loadPinned) {
  // Explicit future entry point; NOT connected to the historical CLI or called
  // by this authored increment. Receipt and NULL gates still precede processes.
  const driver=await doc71CreateFutureDriver(binding,loadPinned);
  doc80SourceAssertions(driver);
  await doc80RunIntegrityControls(driver,binding);
  await doc80RunHeadAndGateControls(driver,binding);
  await doc80RunPublishedProfileControls(driver,binding);
  await doc80RunIsolationControls(driver,binding);
  await doc80RunScopeControls(driver,binding);
  await doc80RunHistoryControls(driver,binding);
  await doc80RunCarrierControls(driver,binding);
  await doc80RunStatementAndDriftControls(driver,binding);
  return {guard:await doc71RunGuardMatrix(driver,binding),profile:await doc71RunProfileControls(driver,binding),
    upsert:await doc71RunUpsertControls(driver,binding),concurrency:await doc71RunConcurrencyControls(driver,binding),
    authority:await doc71RunActiveScopeControls(driver,binding),rollback:await doc71RunRollbackControls(driver,binding),
    qualityCommands:await doc71RunQualityCommandControls(driver,binding),mixedParents:await doc71RunMixedParentControls(driver,binding),
    crossRevision:await doc71RunCrossRevisionClosureControls(driver,binding)};
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
  assert.deepEqual(Object.keys(receipt).sort(),
    ['schemaVersion','sourceCommit','sourceTree','sourceAcceptance','definitionSha256','currentnessDefinition',
      'currentnessDependency','files','disclosures','execution','publication'].sort());
  assert.deepEqual(Object.keys(receipt.sourceAcceptance ?? {}).sort(), ['reviewCommit','status']);
  assert.equal(receipt.sourceAcceptance.status, 'SOURCE_ACCEPT_WITH_LIMITS',
    'Authored receipt inventory is not independent source acceptance');
  assert.match(receipt.sourceAcceptance.reviewCommit ?? '', /^[0-9a-f]{40}$/);
  assert.match(receipt.sourceTree ?? '', /^[0-9a-f]{40}$/);
  assert.match(receipt.definitionSha256 ?? '', /^[0-9a-f]{64}$/);
  assert.equal(receipt.currentnessDependency, null);
  assert.equal(receipt.currentnessDefinition, receipt.definitionSha256);
  // The source gate does not establish the separate execution reservation.
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
  const bindingPacket = JSON.parse(await load(BINDINGS));
  assert.equal(bindingPacket.schemaVersion, 'doc71-disabled-source-bindings-v1');
  const bindings = bindingPacket.currentness;
  assert.equal(await command('git',['rev-parse',sourceCommit+'^{tree}']),receipt.sourceTree,
    'Exact source tree, independently supplied by the source receipt');
  assert.equal(bindings.review, REVIEW, 'Corrected Doc 51 is the controlling successor design review');
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
  // This is source/receipt binding only. It does not execute the authored
  // canonical bootstrap or any fixture suite, and follows acceptance refusal.
  await doc71CanonicalBootstrapPlan(load);
  // Same repository paths at an older SHA cannot share a current receipt key.
  // Their exact immutable blobs are independently pinned inside this externally
  // pinned successor binding; no historical file is copied over current source.
  const predecessor = bindings.predecessorCurrentness;
  assert.equal(predecessor.source, PREDECESSOR);
  assert.match(predecessor.definition, /^[0-9a-f]{64}$/);
  assert.deepEqual(predecessor.files.map(row => row.path).sort(),
    [CANDIDATE + '.sql',CANDIDATE + '.precheck.sql',CANDIDATE + '.rollback.md'].sort());
  for (const file of predecessor.files) {
    assert.match(file.sha256lf, /^[0-9a-f]{64}$/);
    const text = lf(await command('git', ['show', `${predecessor.source}:${file.path}`], { trim: false }));
    assert.equal(sha(text), file.sha256lf, `Accepted currentness predecessor blob mismatch: ${file.path}`);
    historicalSources.set(file.path, text);
  }
  const oldCandidate = historicalSources.get(CANDIDATE + '.sql');
  assert.equal(sha(section(oldCandidate, '$currentness_install$') + section(oldCandidate, '$currentness_fingerprint$')),
    predecessor.definition, 'Accepted predecessor definition is bound to its historical bytes');
  const candidate = loadedSources.get(CANDIDATE + '.sql');
  definition = sha(section(candidate, '$currentness_install$') + section(candidate, '$currentness_fingerprint$'));
  assert.equal(receipt.currentnessDefinition, definition, 'Successor definition belongs only to its accepted receipt');
  // The prose markers have distinct suffixes; take only the reviewed SQL block.
  const rollbackSql = rollbackBlock(loadedSources.get(CANDIDATE + '.rollback.md'));
  // Canonical bootstrap, synthetic profile/authority fixtures, persistent driver
  // and future controls are authored above. They remain NOT RUN and unaccepted.
  // The exact candidate retains its NULL implemented-S column seal. Synthetic
  // schema construction cannot replace the missing accepted operational binding.
  // A later reviewed execution entry must bind driver/proof receipts and invoke
  // doc71RunFutureSuites; this historical entry never fabricates that authority.
  // Quality UPDATE and mixed/cross-revision closure controls are authored above.
  // Positive quality DELETE/real child-cascade coverage has no supported pinned
  // canonical command path; refusal controls do not stand in for that coverage.
  // Transaction-origin expiry and disconnect measurements remain outstanding.
  assert.ok(!candidate.includes('expected_columns:=null;'),
    'DOC71_ACCEPTED_SCHEMA_BINDING_MISSING: bootstrap and driver authored, exact target still not installable; no Docker or SQL started');
  assert.ok(!/source_column_descriptor_seal\s+(?:constant\s+)?(?:pg_catalog\.)?text\s*:=\s*null/i.test(candidate),
    'DOC80_BOTH_SCHEMA_SEALS_REQUIRED: the descriptor seal is still unbound');
  // CS-16: the historical post-install S0 driver below is retained as source
  // history ONLY. Its pre-admission publish/revoke/head expectations are
  // superseded. No executable path may reach it. Meaningful integrity, role,
  // drift, rollback and immutability controls now live in the doc80Run* suites
  // called explicitly by doc71RunFutureSuites.
  throw new Error('DOC80_HISTORICAL_ENTRY_SUPERSEDED: separately reviewed future dispatch required');
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
  await assertPristineHead();
  await assertHeadProtection();
  await assertDecisionPersistence();
  await assertUnavailable();
  const seeded = await currentRows();
  const schema = await sql(`select ${PREFIX}currentness_schema_fingerprint();`);
  await sql(candidate);
  await sql(postcheck);
  await assertPristineHead();
  await assertHeadProtection();
  await assertDecisionPersistence();
  assert.equal(await currentRows(), seeded, 'Exact reapply retains the seeded head and its audit fields');
  assert.equal(await sql(`select ${PREFIX}currentness_schema_fingerprint();`), schema, 'Exact reapply retains the seal with internal RI triggers excluded');
  assert.equal(await canonical(), before, 'Actual fence unchanged after exact reapply');
  // A non-pristine head alone must block destructive rollback even with no
  // revision. Error rolls back the fixture to the original seed and seal.
  const pristineDriftRollback = rollbackSql.replace('do $empty_currentness_rollback$',
    `update ${HEAD} set writer_epoch=1;\ndo $empty_currentness_rollback$`);
  assert.notEqual(pristineDriftRollback, rollbackSql, 'Bound the exact documented rollback guard');
  await refused(pristineDriftRollback, '55000', 'Retained currentness evidence prevents destructive rollback');
  assert.equal(await currentRows(), seeded, 'Pristine-head drift refusal preserves the seed');
  assert.equal(await sql(`select ${PREFIX}currentness_schema_fingerprint();`), schema);
  assert.equal(await canonical(), before);
  // Exercise the exact documented rollback of an untouched install seed.
  await sql(precheck);
  await sql(rollbackSql);
  assert.equal(await canonical(), before, 'Actual fence unchanged after rollback');
  await sql(precheck);
  assert.equal(await sql(`select count(*) from pg_proc where pronamespace='public'::regnamespace and
    (proname in ('research_health_quick_order_publish_revision','research_health_quick_order_revoke_revision',
      'research_health_quick_order_read_current_authority') or proname like 'research\\_health\\_quick\\_order\\_currentness\\_%' escape '\\');`), '0');
  assert.equal(await sql(`select count(*) from pg_class where relnamespace='public'::regnamespace
    and relname like 'research\\_health\\_quick\\_order\\_authority\\_%' escape '\\';`), '0');
  // Reproduce a real incompatible accepted predecessor installation in this
  // same owned disposable database. The new definition must refuse without
  // converting rows or repairing the old seal. Roll it back with its own exact
  // pristine procedure, then restore the new externally bound definition.
  const successorDefinition = definition;
  definition = predecessor.definition;
  await sql(historicalSources.get(CANDIDATE + '.precheck.sql'));
  await sql(oldCandidate);
  const oldRows = await currentRows();
  const oldSchema = await sql(`select ${PREFIX}currentness_schema_fingerprint();`);
  definition = successorDefinition;
  await refused(precheck, '55000', 'Quick Order currentness definition or schema drift');
  await refused(candidate, '55000', 'Quick Order currentness definition or schema drift');
  assert.equal(await currentRows(), oldRows, 'Successor refuses conversion of accepted incompatible installation');
  assert.equal(await sql(`select ${PREFIX}currentness_schema_fingerprint();`), oldSchema, 'Old seal/fingerprint remains unchanged');
  assert.equal(await canonical(), before);
  definition = predecessor.definition;
  await sql(historicalSources.get(CANDIDATE + '.precheck.sql'));
  await sql(rollbackBlock(historicalSources.get(CANDIDATE + '.rollback.md')));
  assert.equal(await canonical(), before, 'Exact predecessor pristine rollback preserves the fence');
  definition = successorDefinition;
  await sql(precheck);
  await sql(candidate);
  await sql(postcheck);
  await assertPristineHead();
  await assertHeadProtection();
  await assertDecisionPersistence();
  const empty = await currentRows();
  assert.equal(await sql(`select ${PREFIX}currentness_schema_fingerprint();`), schema,
    'Reinstall has the same schema seal despite different internal RI trigger OIDs');

  const envelope = {
    schemaVersion: 'quick-order-authority-v1', revisionId: '00000000-0000-4000-8000-000000000001',
    sourceCommit: '1'.repeat(40), bundleSha256: '2'.repeat(64),
    artifacts: ['catalog','bindings','reconciliation','health_legal','configuration','normalized_decision_inputs']
      .map((kind, i) => ({ kind, path: `synthetic/${kind}.json`, sha256: String(i + 3).repeat(64) })),
    sourceRefs: ['synthetic-reviewed-source','synthetic-shape-source'],
    applicabilityRefs: ['synthetic-shape-applicability','synthetic-unapproved-health-scope'],
    effectiveFrom: '2026-10-06T00:00:00.000Z', effectiveUntil: null,
  };
  const decision = decisionFixture(envelope);
  const fixture = bindDecision(envelope, decision);
  const publication = fixture.publication;
  const decisionText = fixture.text;
  assert.equal(await sql(`select ${decisionCall(fixture)};`), 't', 'Synthetic closed canonical shape is accepted, not operationally approved');
  // Doc58 C-1: check publication predicates directly where the decision layer
  // necessarily supplies an independent refusal (missing mirrored keys or a
  // missing artifact kind). These are component contracts, not assertions that
  // every individual predicate can be removed without another gate refusing.
  const publicationDirectCases = [];
  const directPublicationCase = (name, targetGate, alter, control = publication, limitation = null) => {
    const negative = copy(control); alter(negative);
    publicationDirectCases.push({ name, targetGate, negative, control: copy(control), limitation });
  };
  const mirroredKeys = new Set(['revisionId','sourceCommit','effectiveFrom','effectiveUntil']);
  for (const key of Object.keys(publication)) {
    directPublicationCase(`required-envelope-key-${key}`, 'publication required-key presence', value => { delete value[key]; }, publication,
      mirroredKeys.has(key) ? 'Required-key discrimination is checked only at the publication component; decision required/type/equality guards remain independent.'
        : 'Compound missing-key contract: literal/type/loop/cast or kind-coverage guards may also reject; no single-guard mutation claim.');
  }
  directPublicationCase('impossible-start-calendar-date', 'timestamp conversion and UTC round-trip',
    value => { value.effectiveFrom = '2026-02-30T00:00:00.000Z'; },
    { ...copy(publication), effectiveFrom: '2026-02-28T00:00:00.000Z' },
    'February 30 can be refused by the timestamp cast itself; this does not isolate the subsequent round-trip IF.');
  directPublicationCase('impossible-end-calendar-date', 'timestamp conversion and UTC round-trip',
    value => { value.effectiveUntil = '2026-02-30T00:00:00.000Z'; },
    { ...copy(publication), effectiveFrom: '2026-02-01T00:00:00.000Z', effectiveUntil: '2026-02-28T00:00:00.000Z' },
    'Timestamp conversion/round-trip compound gate; no claim that removing only the final round-trip IF admits the date.');
  directPublicationCase('noncanonical-start-clock-format', 'strict UTC-millisecond grammar and round-trip',
    value => { value.effectiveFrom = '2026-10-06T00:00:00Z'; }, publication,
    'Both the grammar and canonical round-trip can reject the missing millisecond field; no individual-guard isolation.');
  // Exactly six enum-valid entries and distinct paths leave only required-kind
  // coverage invalid. A rebuilt decision cannot represent the missing kind.
  for (const kind of ['catalog','bindings','reconciliation','health_legal','configuration','normalized_decision_inputs']) {
    directPublicationCase(`required-artifact-kind-${kind}`, 'all six required artifact kinds', value => {
      value.artifacts.find(row => row.kind === kind).kind = kind === 'catalog' ? 'bindings' : 'catalog';
    }, publication, 'Kind-coverage discrimination is publication-component only; the missing-kind decision lookup is independent.');
  }
  directPublicationCase('unknown-artifact-kind', 'artifact enum and required-kind coverage', value => {
    value.artifacts.find(row => row.kind === 'bindings').kind = 'unknown';
  }, publication, 'In exactly six slots, an unknown kind also removes required coverage; enum alone cannot be isolated while coverage and count stay enforced.');
  directPublicationCase('five-artifact-lower-count', 'exactly-six count and required-kind coverage',
    value => { value.artifacts.pop(); }, publication,
    'Five slots cannot contain six required kinds; the lower count is necessarily backed by coverage. The independent count case below uses seven distinct paths.');
  for (const testCase of publicationDirectCases) {
    assert.equal(await sql(`select ${PREFIX}currentness_valid_publication(${j(testCase.control)});`), 't',
      `Otherwise-valid publication control: ${testCase.name}`);
    assert.equal(await sql(`select ${PREFIX}currentness_valid_publication(${j(testCase.negative)});`), 'f',
      `Direct publication contract: ${testCase.name}; ${testCase.targetGate}`);
  }
  const publicationReboundCases = [];
  const reboundPublicationCase = (name, targetGate, negative, control, limitation = null) =>
    publicationReboundCases.push({ name, targetGate, negative, control, limitation });
  const finiteControl = { ...copy(publication), effectiveUntil: '2026-10-07T00:00:00.000Z' };
  reboundPublicationCase('end-equals-start', 'effectiveUntil strictly after effectiveFrom',
    { ...copy(publication), effectiveUntil: publication.effectiveFrom }, finiteControl);
  reboundPublicationCase('end-before-start', 'effectiveUntil strictly after effectiveFrom',
    { ...copy(publication), effectiveUntil: '2026-10-05T00:00:00.000Z' }, finiteControl);
  for (const [name, pathValue, targetGate] of [
    ['unsafe-leading-character','@catalog.json','artifact path ASCII grammar'],
    ['unsafe-absolute-path','/synthetic/catalog.json','artifact path ASCII grammar'],
    ['unsafe-path-space','synthetic/has space.json','artifact path ASCII grammar'],
    ['unsafe-overlong-path','A'.repeat(241),'artifact path 240-byte grammar ceiling'],
    ['unsafe-parent-dot-segment','synthetic/../catalog.json','artifact dot/double-slash/trailing-slash refusal'],
    ['unsafe-current-dot-segment','synthetic/./catalog.json','artifact dot/double-slash/trailing-slash refusal'],
    ['unsafe-double-slash','synthetic//catalog.json','artifact dot/double-slash/trailing-slash refusal'],
    ['unsafe-trailing-slash','synthetic/catalog/','artifact dot/double-slash/trailing-slash refusal'],
  ]) {
    const negative = copy(publication); negative.artifacts.find(row => row.kind === 'catalog').path = pathValue;
    const control = copy(publication);
    if (name === 'unsafe-overlong-path') control.artifacts.find(row => row.kind === 'catalog').path = 'A'.repeat(240);
    assert.equal(new Set(negative.artifacts.map(row => row.path)).size, 6, 'Unsafe-path fixture has no repeated-path backstop');
    if (name.includes('dot-segment') || name === 'unsafe-double-slash' || name === 'unsafe-trailing-slash') {
      assert.match(pathValue, /^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/, 'Dot/slash fixtures must pass the earlier path grammar');
    } else {
      assert.doesNotMatch(pathValue, /(^|\/)\.{1,2}(\/|$)|\/\/|\/$/,
        'Grammar fixtures must not also fail the dot/double-slash/trailing-slash predicate');
    }
    reboundPublicationCase(name, targetGate, negative, control);
  }
  for (const field of ['sourceRefs','applicabilityRefs']) {
    const negative = copy(publication), control = copy(publication);
    negative[field] = ['a-synthetic-control','https://synthetic.invalid/',...publication[field]]
      .sort((a,b) => Buffer.compare(Buffer.from(a),Buffer.from(b)));
    control[field] = ['a-synthetic-control','https-synthetic-control',...publication[field]]
      .sort((a,b) => Buffer.compare(Buffer.from(a),Buffer.from(b)));
    assert.equal(negative[field][0], 'a-synthetic-control', 'The invalid URL is unused by decision references');
    assert.equal(control[field][0], negative[field][0]);
    assert.equal(new Set(negative[field]).size, negative[field].length);
    assert.ok(negative[field].length <= 32);
    reboundPublicationCase(`unused-unsafe-${field}`, 'publication reference ASCII grammar', negative, control,
      'Invalid URL remains unused; nested decision-reference grammar and membership are not alternate causes.');
  }
  for (const testCase of publicationReboundCases) {
    const negative = bindDecision(testCase.negative,decisionFixture(testCase.negative));
    const control = bindDecision(testCase.control,decisionFixture(testCase.control));
    for (const paired of [negative,control]) assertFixtureReferenceBinding(paired);
    if (testCase.name.startsWith('unused-unsafe-')) {
      assert.equal(negative.text, control.text, 'Only the unused envelope reference is invalid; the decision document is byte-identical');
    }
    assert.equal(await sql(`select ${PREFIX}currentness_valid_publication(${j(control.publication)});`), 't', `Rebound envelope control: ${testCase.name}`);
    assert.equal(await sql(`select ${decisionCall(control)};`), 't', `Rebound decision control: ${testCase.name}`);
    assert.equal(await sql(`select ${PREFIX}currentness_valid_publication(${j(negative.publication)});`), 'f', `Intended envelope gate: ${testCase.name}`);
    assert.equal(await sql(`select ${decisionCall(negative)};`), 'f', `Rebound full-layer refusal: ${testCase.name}`);
    await refused(`select ${publishCall(negative)};`, '22023', 'Invalid Quick Order publication');
  }
  const seventhCatalog = copy(publication);
  seventhCatalog.artifacts.push({ ...copy(seventhCatalog.artifacts.find(row => row.kind === 'catalog')),
    path: 'synthetic/extra-catalog.json' });
  assert.equal(seventhCatalog.artifacts.length, 7);
  assert.equal(new Set(seventhCatalog.artifacts.map(row => row.path)).size, 7, 'Seven-kind-count fixture keeps every path distinct');
  assert.equal(new Set(seventhCatalog.artifacts.map(row => row.kind)).size, 6, 'Seven-kind-count fixture covers all six enum-valid kinds');
  assert.deepEqual([...new Set(seventhCatalog.artifacts.map(row => row.kind))].sort(),
    ['catalog','bindings','reconciliation','health_legal','configuration','normalized_decision_inputs'].sort());
  assert.equal(seventhCatalog.artifacts.filter(row => row.kind === 'catalog').length, 2);
  const seventhFixture = bindDecision(seventhCatalog,decisionFixture(seventhCatalog));
  assert.equal(seventhFixture.text, decisionText, 'Original first-match references remain intact; the extra distinct-path catalog is last');
  assert.equal(await sql(`select ${PREFIX}currentness_valid_publication(${j(publication)});`), 't', 'Exactly-six valid count control');
  assert.equal(await sql(`select ${PREFIX}currentness_valid_publication(${j(seventhFixture.publication)});`), 'f',
    'Seven distinct paths and complete kinds isolate the exactly-six gate in the publication component');
  assert.equal(await sql(`select ${decisionCall(seventhFixture)};`), 'f', 'Seven-artifact end-to-end refusal, not a promise about duplicate lookup after hypothetical guard removal');
  await refused(`select ${publishCall(seventhFixture)};`, '22023', 'Invalid Quick Order publication');
  // DOC63_BLOCK_BEGIN: new direct component checks; retained Doc58 blocks and
  // their historical wording stay byte-identical. Synthetic format only, NOT RUN.
  const doc63FormatCases = [
    { name: 'schema-version-literal', targetGuard: 'valid_publication schemaVersion literal (SQL 95)',
      alter: value => { value.schemaVersion = 'quick-order-authority-v2'; } },
    { name: 'revision-id-format', targetGuard: 'valid_publication lowercase UUID format (SQL 96)',
      alter: value => { value.revisionId = '00000000-0000-4000-8000-00000000000A'; } },
    { name: 'source-commit-format', targetGuard: 'valid_publication SHA40 format (SQL 97)',
      alter: value => { value.sourceCommit = 'g'.repeat(40); } },
    { name: 'bundle-digest-format', targetGuard: 'valid_publication SHA256 bundle format (SQL 98)',
      alter: value => { value.bundleSha256 = 'g'.repeat(64); } },
    { name: 'artifact-digest-format', targetGuard: 'valid_publication artifact SHA256 format (SQL 118)',
      alter: value => { value.artifacts.find(row => row.kind === 'catalog').sha256 = 'g'.repeat(64); } },
  ];
  for (const testCase of doc63FormatCases) {
    const negative = copy(publication); testCase.alter(negative);
    assert.equal(await sql(`select ${PREFIX}currentness_valid_publication(${j(publication)});`), 't',
      `Existing valid format control: ${testCase.name}`);
    assert.equal(await sql(`select ${PREFIX}currentness_valid_publication(${j(negative)});`), 'f',
      `Direct format guard: ${testCase.name}; ${testCase.targetGuard}`);
  }
  const doc63RoundTripCases = [
    { name: 'start-utc-round-trip', field: 'effectiveFrom', targetGuard: 'valid_publication start UTC round-trip (SQL 103)' },
    { name: 'end-utc-round-trip', field: 'effectiveUntil', targetGuard: 'valid_publication end UTC round-trip arm (SQL 107)' },
  ];
  const doc63NoncanonicalClock = '2026-10-06T24:00:00.000Z';
  const doc63NormalizedClock = '2026-10-07T00:00:00.000Z';
  assert.match(doc63NoncanonicalClock, /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/,
    'The noncanonical clock passes the preceding UTC-millisecond grammar');
  for (const testCase of doc63RoundTripCases) {
    const negative = { ...copy(publication), [testCase.field]: doc63NoncanonicalClock };
    const control = { ...copy(publication), [testCase.field]: doc63NormalizedClock };
    // This ordinary SELECT must succeed before a negative is credited. A cast
    // refusal/timeout/error fails verification; it is never an intended refusal.
    assert.equal(await sql(`select to_char(${q(doc63NoncanonicalClock)}::timestamptz at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');`), doc63NormalizedClock,
      `Conversion must normalize cleanly to the next day: ${testCase.name}`);
    assert.equal(await sql(`select ${q(doc63NoncanonicalClock)}::timestamptz=${q(doc63NormalizedClock)}::timestamptz;`),
      't', `Noncanonical and control clocks denote the same instant: ${testCase.name}`);
    if (testCase.field === 'effectiveUntil') {
      assert.equal(await sql(`select ${q(doc63NoncanonicalClock)}::timestamptz>${q(publication.effectiveFrom)}::timestamptz;`),
        't', 'The end case cannot refuse through finish <= start');
    } else {
      assert.equal(negative.effectiveUntil, null, 'Start case does not enter the end-validation branch');
    }
    assert.equal(await sql(`select ${PREFIX}currentness_valid_publication(${j(control)});`), 't',
      `Canonical next-day valid control: ${testCase.name}`);
    assert.equal(await sql(`select ${PREFIX}currentness_valid_publication(${j(negative)});`), 'f',
      `Only the checked UTC reconstruction differs: ${testCase.name}; ${testCase.targetGuard}`);
  }
  // DOC63_BLOCK_END: PostgreSQL conversion and discrimination remain authored
  // assumptions until separately authorized execution establishes these checks.
  // Runtime integrity checks the missing head before either publication routine
  // reaches its own NOT FOUND branch. These cases prove end-to-end refusal;
  // they do not isolate the downstream defensive branches (HI4 carry-forward).
  for (const call of [`publish_revision(${j(publication)},${q(decisionText)})`,
    `revoke_revision(${q(publication.revisionId)},'synthetic-absent-head')`]) {
    await refused(absentHeadFixture(`select ${PREFIX}${call};`), '55000', 'Quick Order authority head unavailable');
    assert.equal(await currentRows(), empty, 'Absent-head refusal restores seed and creates no revision');
    await assertHeadProtection();
    assert.equal(await canonical(), before);
  }
  const absentRead = parseLastJson(await sql(absentHeadFixture(`select ${PREFIX}read_current_authority()::text;rollback;`)));
  assert.deepEqual(absentRead, UNAVAILABLE, 'Absent head never produces usable authority');
  assert.equal(await currentRows(), empty);
  for (const key of Object.keys(publication)) {
    const missing = { ...publication }; delete missing[key];
    await refused(`select ${PREFIX}publish_revision(${j(missing)},${q(decisionText)});`, '22023');
  }
  for (const invalid of [null, [], { ...publication, active: true }, { ...publication, token: 'synthetic-never-accepted' },
    { ...publication, effectiveFrom: '2026-02-30T00:00:00.000Z' },
    { ...publication, effectiveUntil: publication.effectiveFrom },
    { ...publication, sourceRefs: ['https://synthetic.invalid/'] },
    { ...publication, artifacts: publication.artifacts.map((a,i) => i ? a : { ...a, path: '../catalog.json' }) },
    { ...publication, artifacts: publication.artifacts.map((a,i) => i ? a : { ...a, url: 'https://synthetic.invalid/' }) },
    { ...publication, artifacts: publication.artifacts.slice(0, 5) },
    { ...publication, artifacts: [...publication.artifacts, publication.artifacts[0]] },
    { ...publication, artifacts: publication.artifacts.map((a,i) => i === 1 ? { ...a, kind: 'catalog' } : a) },
    { ...publication, artifacts: publication.artifacts.map((a,i) => i === 1 ? { ...a, kind: 'unknown' } : a) },
    { ...publication, sourceRefs: [...publication.sourceRefs].reverse() },
    { ...publication, sourceRefs: [publication.sourceRefs[0],publication.sourceRefs[0]] },
    { ...publication, applicabilityRefs: [...publication.applicabilityRefs].reverse() },
  ]) await refused(`select ${PREFIX}publish_revision(${j(invalid)},${q(decisionText)});`, '22023', 'Invalid Quick Order publication');
  // CF2 replaces the three original-envelope-text cases with the same target
  // alterations rebuilt from their own envelopes, each paired with a valid
  // control. Removing the target publication gate must make these cases fail.
  const envelopeCauseCases = [];
  const repeatedPath = copy(envelope);
  repeatedPath.artifacts.find(row => row.kind === 'bindings').path = repeatedPath.artifacts.find(row => row.kind === 'catalog').path;
  envelopeCauseCases.push({ name: 'repeated-artifact-path', altered: repeatedPath, control: copy(envelope) });
  for (const field of ['sourceRefs','applicabilityRefs']) {
    const altered = copy(envelope);
    altered[field] = Array.from({ length: 33 }, (_, index) => `synthetic-ref-${String(index).padStart(2,'0')}`);
    const control = { ...copy(altered), [field]: altered[field].slice(0,32) };
    assert.equal(altered[field].length, 33); assert.equal(control[field].length, 32);
    assert.equal(new Set(altered[field]).size, 33);
    for (const [index, ref] of altered[field].entries()) {
      assert.match(ref, /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/);
      if (index) assert.ok(Buffer.compare(Buffer.from(altered[field][index-1]),Buffer.from(ref)) < 0);
    }
    envelopeCauseCases.push({ name: `${field}-33-reference-bound`, altered, control });
  }
  for (const target of envelopeCauseCases) {
    const invalid = bindDecision(target.altered,decisionFixture(target.altered));
    const control = bindDecision(target.control,decisionFixture(target.control));
    for (const paired of [invalid,control]) assertFixtureReferenceBinding(paired);
    if (target.name !== 'repeated-artifact-path') {
      assert.equal(invalid.text, control.text, 'Only the final unused envelope reference crosses the 32-entry bound');
    }
    assert.equal(await sql(`select ${PREFIX}currentness_valid_publication(${j(control.publication)});`), 't', `Otherwise-valid envelope control: ${target.name}`);
    assert.equal(await sql(`select ${decisionCall(control)};`), 't', `Otherwise-valid canonical decision control: ${target.name}`);
    assert.equal(await sql(`select ${PREFIX}currentness_valid_publication(${j(invalid.publication)});`), 'f', `Intended publication gate: ${target.name}`);
    assert.equal(await sql(`select ${decisionCall(invalid)};`), 'f', `Bound canonical text leaves only the intended envelope defect: ${target.name}`);
    await refused(`select ${publishCall(invalid)};`, '22023', 'Invalid Quick Order publication');
  }
  const decisionRefusals = [];
  const badDecision = (name, edit) => {
    const value = copy(decision); edit(value);
    decisionRefusals.push({ name, ...bindDecision(envelope, value) });
  };
  const badBytes = (name, text) => {
    assert.notEqual(text, decisionText, `Malformed-byte fixture must differ: ${name}`);
    decisionRefusals.push({ name, ...bindDecision(envelope, text) });
  };
  for (const key of Object.keys(decision)) badDecision(`missing-${key}`, value => { delete value[key]; });
  badDecision('unknown-root-key', value => { value.extra = true; });
  for (const key of ['catalog','bindings','reconciliation','healthLegal','configuration']) {
    badDecision(`missing-artifact-${key}`, value => { delete value.artifacts[key]; });
    badDecision(`artifact-path-mismatch-${key}`, value => { value.artifacts[key].path = 'synthetic/mismatch.json'; });
    badDecision(`artifact-hash-mismatch-${key}`, value => { value.artifacts[key].sha256 = 'f'.repeat(64); });
    badDecision(`artifact-extra-key-${key}`, value => { value.artifacts[key].extra = true; });
  }
  for (const [name, select] of [
    ['agreement', value => value.healthAgreements[0]], ['offer', value => value.offerRules[0]],
    ['quantity', value => value.offerRules[0].quantity], ['price', value => value.offerRules[0].price],
    ['destination', value => value.offerRules[0].destination],
  ]) {
    const keys = Object.keys(select(decision));
    for (const key of keys) badDecision(`missing-${name}-${key}`, value => { delete select(value)[key]; });
    badDecision(`unknown-${name}-key`, value => { select(value).extra = true; });
  }
  badDecision('unknown-schema-version', value => { value.schemaVersion = 'quick-order-decision-inputs-v2'; });
  badDecision('revision-mismatch', value => { value.revisionId = '00000000-0000-4000-8000-000000000099'; });
  badDecision('source-mismatch', value => { value.sourceCommit = 'f'.repeat(40); });
  badDecision('effective-start-mismatch', value => { value.effectiveFrom = '2026-10-07T00:00:00.000Z'; });
  badDecision('effective-end-mismatch', value => { value.effectiveUntil = '2026-10-08T00:00:00.000Z'; });
  badDecision('configuration-version-mismatch', value => { value.configurationVersion = '0'.repeat(64); });
  badDecision('unknown-reader-profile', value => { value.canonicalReaderProfile = 'unknown'; });
  badDecision('unknown-projection-version', value => { value.relationProjectionVersion = 'unknown'; });
  badDecision('uppercase-census-hash', value => { value.readerCensusSha256 = 'A'.repeat(64); });
  badDecision('unknown-decision-self-reference', value => { value.artifacts.normalizedDecisionInputs = { path: 'synthetic/self.json', sha256: 'a'.repeat(64) }; });
  badDecision('forbidden-bundle-self-reference', value => { value.bundleSha256 = envelope.bundleSha256; });
  badDecision('forbidden-delivery-commit', value => { value.deliveryCommit = 'f'.repeat(40); });
  badDecision('empty-agreements', value => { value.healthAgreements = []; });
  badDecision('too-many-agreements', value => { value.healthAgreements = Array.from({ length: 31 }, (_, i) => ({ ...copy(value.healthAgreements[0]), kind: `Synthetic Health ${String(i).padStart(2,'0')}` })); });
  badDecision('duplicate-agreement-kind-different-version', value => { value.healthAgreements[1].kind = value.healthAgreements[0].kind; value.healthAgreements[1].version = 'synthetic-v2'; });
  badDecision('unsorted-agreement-tuples', value => { value.healthAgreements.reverse(); });
  badDecision('text64-leading-space', value => { value.healthAgreements[0].kind = ' Synthetic Health A'; });
  badDecision('text64-trailing-space', value => { value.healthAgreements[0].version = 'synthetic-v1 '; });
  badDecision('text64-empty', value => { value.healthAgreements[0].version = ''; });
  badDecision('text64-overlong', value => { value.healthAgreements[0].version = 'A'.repeat(65); });
  badDecision('text64-nonascii', value => { value.healthAgreements[0].version = 'synthetic-\u00e9'; });
  badDecision('text64-control', value => { value.healthAgreements[0].version = 'synthetic\tversion'; });
  badDecision('text64-nonbreaking-space', value => { value.healthAgreements[0].version = 'synthetic\u00a0version'; });
  badDecision('text64-format-control', value => { value.healthAgreements[0].version = 'synthetic\u200bversion'; });
  badDecision('empty-offers', value => { value.offerRules = []; });
  const secondOffer = () => ({ ...copy(decision.offerRules[0]), offeringVariantId: 'synthetic-offering-z',
    productId: 'synthetic-product-z', variantId: 'synthetic-variant-z' });
  badDecision('duplicate-offering-id', value => { const row = secondOffer(); row.offeringVariantId = value.offerRules[0].offeringVariantId; value.offerRules.push(row); });
  badDecision('duplicate-product-variant-pair', value => { const row = copy(value.offerRules[0]); row.offeringVariantId = 'synthetic-offering-z'; value.offerRules.push(row); });
  badDecision('unsorted-offer-tuples', value => { value.offerRules.unshift(secondOffer()); });
  for (const field of ['offeringVariantId','productId','variantId']) {
    for (const [name, text] of [['unbound-prefix','unbound:synthetic'],['leading-space',' synthetic'],
      ['trailing-space','synthetic '],['internal-space','synthetic identity'],['nonascii','synthetic-\u00e9'],
      ['empty',''],['overlong','A'.repeat(201)],['control','synthetic\nidentity'],['surrogate','synthetic\ud800']]) {
      badDecision(`${field}-${name}`, value => { value.offerRules[0][field] = text; });
    }
  }
  for (const [name, select, envelopeKey] of [
    ['agreement-source', value => value.healthAgreements[0].sourceApprovalRefs, 'sourceRefs'],
    ['agreement-applicability', value => value.healthAgreements[0].applicabilityRefs, 'applicabilityRefs'],
    ['offer-source', value => value.offerRules[0].sourceApprovalRefs, 'sourceRefs'],
    ['offer-applicability', value => value.offerRules[0].applicabilityRefs, 'applicabilityRefs'],
    ['destination-source', value => value.offerRules[0].destination.sourceApprovalRefs, 'sourceRefs'],
    ['destination-applicability', value => value.offerRules[0].destination.applicabilityRefs, 'applicabilityRefs'],
  ]) {
    badDecision(`${name}-empty`, value => { select(value).length = 0; });
    badDecision(`${name}-duplicate`, value => { select(value).push(select(value)[0]); });
    badDecision(`${name}-unsorted`, value => { select(value).splice(0,1,...[...envelope[envelopeKey]].reverse()); });
    badDecision(`${name}-outside-envelope`, value => { select(value)[0] = 'synthetic-unlisted-reference'; });
  }
  badDecision('unknown-workflow', value => { value.offerRules[0].workflowModes = ['unknown']; });
  badDecision('empty-workflows', value => { value.offerRules[0].workflowModes = []; });
  badDecision('duplicate-workflows', value => { value.offerRules[0].workflowModes = ['request_pricing','request_pricing']; });
  badDecision('unsorted-workflows', value => { value.offerRules[0].workflowModes.reverse(); });
  badDecision('unknown-audience-admin', value => { value.offerRules[0].price.audiences = ['admin']; });
  badDecision('audience-case-folding', value => { value.offerRules[0].price.audiences = ['Member']; });
  badDecision('empty-audiences', value => { value.offerRules[0].price.audiences = []; });
  badDecision('duplicate-audiences', value => { value.offerRules[0].price.audiences = ['member','member']; });
  badDecision('unsorted-audiences', value => { value.offerRules[0].price.audiences = ['retail','member']; });
  badDecision('currency-mismatch', value => { value.offerRules[0].price.currency = 'EUR'; });
  badDecision('request-pricing-contradiction', value => { value.offerRules[0].price.unpriced = 'refuse'; });
  badDecision('direct-only-unpriced-contradiction', value => { value.offerRules[0].workflowModes = ['direct_order_request']; });
  badDecision('unknown-unpriced-rule', value => { value.offerRules[0].price.unpriced = 'zero'; });
  badDecision('destination-country-mismatch', value => { value.offerRules[0].destination.countryCode = 'CA'; });
  badDecision('empty-regions', value => { value.offerRules[0].destination.regions = []; });
  badDecision('unknown-wildcard-region', value => { value.offerRules[0].destination.regions = ['*']; });
  badDecision('duplicate-regions', value => { value.offerRules[0].destination.regions = ['CA','CA']; });
  badDecision('unsorted-regions', value => { value.offerRules[0].destination.regions.reverse(); });
  for (const [name, quantity] of [
    ['zero-minimum',{ minimum: 0, maximum: 10, increment: 1 }],
    ['reversed-band',{ minimum: 11, maximum: 10, increment: 1 }],
    ['over-ceiling',{ minimum: 1, maximum: 100001, increment: 1 }],
    ['zero-increment',{ minimum: 1, maximum: 10, increment: 0 }],
    ['over-increment',{ minimum: 1, maximum: 10, increment: 100001 }],
    ['fractional-minimum',{ minimum: 1.5, maximum: 10, increment: 1 }],
    ['string-minimum',{ minimum: '1', maximum: 10, increment: 1 }],
  ]) badDecision(`quantity-${name}`, value => { value.offerRules[0].quantity = quantity; });
  for (const [name, text] of [['empty',''],['malformed','{'],['array','[]'],['null-json','null'],
    ['bom','\ufeff' + decisionText],['leading-whitespace',' ' + decisionText],['trailing-newline',decisionText + '\n'],
    ['trailing-space',decisionText + ' '],['pretty-whitespace',JSON.stringify(decision,null,2)],
    ['reordered-keys',JSON.stringify(Object.fromEntries(Object.entries(decision).reverse()))],
    ['duplicate-object-key',decisionText.replace('{"schemaVersion":','{"schemaVersion":"quick-order-decision-inputs-v1","schemaVersion":')],
    ['duplicate-nested-key',decisionText.replace('"minimum":1','"minimum":1,"minimum":1')],
    ['alternate-unicode-escape',decisionText.replace('synthetic-product',String.raw`\u0073ynthetic-product`)],
    ['alternate-slash-escape',decisionText.replace('synthetic/catalog.json',String.raw`synthetic\/catalog.json`)],
    ['integer-fraction-spelling',decisionText.replace('"minimum":1','"minimum":1.0')],
    ['integer-exponent-spelling',decisionText.replace('"minimum":1','"minimum":1e0')],
    ['invalid-leading-zero',decisionText.replace('"minimum":1','"minimum":01')],
  ]) badBytes(`raw-${name}`, text);
  const nestedSwap = copy(decision);
  const originalQuantity = nestedSwap.offerRules[0].quantity;
  nestedSwap.offerRules[0].quantity = { maximum: originalQuantity.maximum, minimum: originalQuantity.minimum, increment: originalQuantity.increment };
  const nestedSwapText = JSON.stringify(nestedSwap);
  assert.deepEqual(JSON.parse(nestedSwapText), decision, 'Nested key swap changes serialization order only');
  badBytes('raw-nested-quantity-key-order', nestedSwapText);
  for (const invalid of decisionRefusals) {
    assert.equal(await sql(`select ${decisionCall(invalid)};`), 'f', `Pure validator refusal: ${invalid.name}`);
    await refused(`select ${publishCall(invalid)};`, '22023', 'Invalid Quick Order publication');
  }
  assert.equal(await sql(`select ${PREFIX}currentness_valid_decision_inputs(null::text,${j(publication)});`), 'f');
  assert.equal(await sql(`select ${PREFIX}currentness_valid_decision_inputs(${q(decisionText)},null::jsonb);`), 'f');
  assert.equal(await sql(`select ${PREFIX}currentness_valid_decision_inputs(repeat(' ',8388609),${j(publication)});`),
    'f', 'Historical whitespace-only refusal; it does not discriminate the byte ceiling');
  const byteEdge = canonicalByteEdge(envelope);
  for (const paired of [byteEdge.at,byteEdge.over]) {
    assert.equal(await sql(`select ${PREFIX}currentness_valid_publication(${j(paired.publication)});`), 't', 'Both byte-edge envelopes are otherwise admitted');
  }
  assert.equal(await sql(`select ${decisionCall(byteEdge.at)};`), 't', 'Otherwise-valid canonical decision at exactly 8 MiB');
  assert.equal(await sql(`select ${decisionCall(byteEdge.over)};`), 'f', 'Otherwise-valid canonical decision at exactly 8 MiB + 1 refuses solely at the ceiling');
  await refused(`select ${publishCall(byteEdge.over)};`, '22023', 'Invalid Quick Order publication');
  await refused(`select ${PREFIX}publish_revision(${j(publication)},null::text);`, '22023', 'Invalid Quick Order publication');
  const wrongDigest = copy(fixture); wrongDigest.publication.artifacts.find(a => a.kind === 'normalized_decision_inputs').sha256 = '0'.repeat(64);
  assert.equal(await sql(`select ${decisionCall(wrongDigest)};`), 'f', 'Compare raw canonical text digest with the sole envelope artifact');
  await refused(`select ${publishCall(wrongDigest)};`, '22023', 'Invalid Quick Order publication');
  await refused(`select ${PREFIX}publish_revision(${j(publication)});`, '42883', 'does not exist');
  const rowPublication = { ...publication, revisionId: '00000000-0000-4000-8000-000000000002' };
  await refused(`insert into ${REVISIONS}(revision_id,publication) values(${q(rowPublication.revisionId)},${j(rowPublication)});`, '23502', 'decision_inputs_text');
  await refused(`insert into ${REVISIONS}(revision_id,publication,decision_inputs_text)
    values(${q(rowPublication.revisionId)},${j(rowPublication)},'{}');`, '23514', 'research_health_quick_order_decision_inputs_shape');
  const positives = [];
  const positive = (name, edit) => { const value = copy(decision); edit(value); positives.push({ name, ...bindDecision(envelope,value) }); };
  positive('text64-quotes-backslash-internal-space', value => { value.healthAgreements[0].version = 'synthetic "quoted" \\ version'; });
  positive('text64-exact-limit', value => { value.healthAgreements[0].version = 'A'.repeat(64); });
  positive('identifier-exact-limit', value => { value.offerRules[0].offeringVariantId = 'A'.repeat(200); });
  positive('identifier-no-case-folding-or-substring-ban', value => { value.offerRules[0].productId = 'Unbound:synthetic'; value.offerRules[0].variantId = 'synthetic-unbound:variant'; });
  positive('direct-only-with-refuse-unpriced', value => { value.offerRules[0].workflowModes = ['direct_order_request']; value.offerRules[0].price.unpriced = 'refuse'; });
  positive('quantity-format-ceilings-not-policy', value => { value.offerRules[0].quantity = { minimum: 1, maximum: 100000, increment: 100000 }; });
  positive('all-five-pricing-identities', value => { value.offerRules[0].price.audiences = ['member','private_early_access','professional','retail','wholesale']; });
  positive('all-state-and-dc-codes-format-only', value => { value.offerRules[0].destination.regions =
    'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ').sort(); });
  positive('plural-agreements-at-bound', value => { value.healthAgreements = Array.from({ length: 30 }, (_, i) => ({ ...copy(value.healthAgreements[0]), kind: `Synthetic Health ${String(i).padStart(2,'0')}` })); });
  positive('sorted-distinct-offer-tuples', value => { value.offerRules.push(secondOffer()); });
  const boundedEnvelope = copy(envelope);
  boundedEnvelope.sourceRefs = Array.from({ length: 32 }, (_, i) => `synthetic-source-${String(i).padStart(2,'0')}`);
  boundedEnvelope.applicabilityRefs = Array.from({ length: 32 }, (_, i) => `synthetic-scope-${String(i).padStart(2,'0')}`);
  const boundedDecision = decisionFixture(boundedEnvelope);
  for (const row of [...boundedDecision.healthAgreements,...boundedDecision.offerRules,
    ...boundedDecision.offerRules.map(rule => rule.destination)]) {
    row.sourceApprovalRefs = [...boundedEnvelope.sourceRefs]; row.applicabilityRefs = [...boundedEnvelope.applicabilityRefs];
  }
  positives.push({ name: 'all-reference-sets-at-bound', ...bindDecision(boundedEnvelope,boundedDecision) });
  const finiteEnvelope = { ...copy(envelope), effectiveUntil: '2026-10-08T00:00:00.000Z' };
  positives.push({ name: 'matching-finite-utc-millisecond-interval', ...bindDecision(finiteEnvelope,decisionFixture(finiteEnvelope)) });
  const reorderedEnvelope = { ...copy(envelope), artifacts: [...envelope.artifacts].reverse() };
  positives.push({ name: 'envelope-artifact-order-retains-existing-semantics', ...bindDecision(reorderedEnvelope,decisionFixture(reorderedEnvelope)) });
  for (const accepted of positives) {
    assert.equal(await sql(`select ${decisionCall(accepted)};`), 't', `Synthetic format only: ${accepted.name}`);
  }
  assert.equal(await currentRows(), empty, 'Refused publication preserves the seeded head and creates no revision');
  const published = parseLastJson(await sql(`select ${publishCall(fixture)}::text;`));
  assert.deepEqual(published, { state: 'held', revisionId: publication.revisionId, writerEpoch: '1' });
  const retained = await sql(`select to_jsonb(r)::text from ${PREFIX}authority_revisions r;`);
  assert.equal(parseLastJson(retained).published_by, 'postgres', 'Audit identity is database-derived');
  assert.equal(parseLastJson(retained).decision_inputs_text, decisionText, 'Persist exact canonical decision bytes, never jsonb::text');
  await assertUnavailable();
  await sql(`select ${publishCall(fixture)};`);
  assert.equal(await sql(`select to_jsonb(r)::text from ${PREFIX}authority_revisions r;`), retained);
  const current = await currentRows();
  const currentEpoch = await sql(`select writer_epoch from ${HEAD} where singleton;`);
  const increasedEpoch = (BigInt(currentEpoch) + 1n).toString();
  await refused(`select ${publishCall({ publication: { ...publication, bundleSha256: 'f'.repeat(64) }, text: decisionText })};`, '23505', 'Quick Order publication conflict');
  const changedDecision = copy(decision); changedDecision.offerRules[0].quantity.maximum = 11;
  const changedFixture = bindDecision(envelope, changedDecision);
  await refused(`select ${publishCall(changedFixture)};`, '23505', 'Quick Order publication conflict');
  await refused(`select ${publishCall({ publication, text: decisionText + '\n' })};`, '22023', 'Invalid Quick Order publication');
  assert.equal(await currentRows(), current);
  // The revisions-only TRUNCATE is refused by PostgreSQL's FK precondition.
  // The joint TRUNCATE reaches the shared history-refusal message, which cannot
  // attribute that refusal to one table's trigger. The revisions TRUNCATE event
  // remains structural evidence only (type58 above; HI2 carry-forward).
  // https://www.postgresql.org/docs/17/sql-truncate.html
  await refused(`truncate ${REVISIONS};`, '0A000', 'cannot truncate a table referenced in a foreign key constraint');
  assert.equal(await currentRows(), current, 'FK prerequisite refusal preserves history');
  assert.equal(await canonical(), before);
  for (const statement of [
    `update ${REVISIONS} set publication=publication where revision_id=${q(publication.revisionId)}`,
    `delete from ${REVISIONS} where revision_id=${q(publication.revisionId)}`,
    `truncate ${REVISIONS},${HEAD}`,
    `delete from ${HEAD} where singleton`,
    `truncate ${HEAD}`,
  ]) {
    await refused(statement + ';', '55000', 'Quick Order authority history mutation refused');
    assert.equal(await currentRows(), current, 'History refusal preserves the complete head and revisions');
    assert.equal(await canonical(), before);
  }
  for (const epoch of ['0','-1']) {
    await refused(`update ${HEAD} set writer_epoch=${epoch} where singleton;`, '55000',
      'Quick Order writer epoch decrease refused');
    assert.equal(await currentRows(), current, 'Epoch reset/decrease refusal preserves publication history');
  }
  await refused(`begin;update ${HEAD} set writer_epoch=${increasedEpoch} where singleton;
    update ${HEAD} set writer_epoch=${currentEpoch} where singleton;`, '55000', 'Quick Order writer epoch decrease refused');
  assert.equal(await currentRows(), current, 'Positive decrease fixture rolls back the earlier increase');
  for (const epoch of [currentEpoch,increasedEpoch]) {
    assert.equal(await sql(`begin;update ${HEAD} set writer_epoch=${epoch} where singleton returning writer_epoch;rollback;`),
      epoch, 'Same epoch and increase are allowed by the monotonic guard');
    assert.equal(await currentRows(), current, 'Allowed epoch fixture does not mutate retained source evidence');
  }
  const referenceAssignments = (column, revision) =>
    `state=${q(column === 'active_revision_id' ? 'active' : 'held')},` +
    ['active_revision_id','last_published_revision_id','last_revoked_revision_id']
      .map(key => `${key}=${key === column ? q(revision) : 'null'}`).join(',') +
    `,last_revoke_reason=${column === 'last_revoked_revision_id' ? q('synthetic-fk-check') : 'null'}`;
  for (const [constraint, column] of FOREIGN_KEYS) {
    await refused(`update ${HEAD} set ${referenceAssignments(column,'00000000-0000-4000-8000-000000000099')}
      where singleton;`, '23503', constraint);
    assert.equal(await currentRows(), current, 'Dangling head reference is refused without modifying evidence');
    // Isolate each ON DELETE RESTRICT action from the earlier revision guard.
    // Only this candidate's immutable trigger is disabled in this transaction;
    // the internal FK triggers remain enabled and the FK must name itself.
    await refused(`begin;update ${HEAD} set ${referenceAssignments(column,publication.revisionId)} where singleton;
      alter table ${REVISIONS} disable trigger ${REVISION_TRIGGER};
      delete from ${REVISIONS} where revision_id=${q(publication.revisionId)};`, '23503', constraint);
    assert.equal(await currentRows(), current, 'FK deletion refusal rolls back both fixture and trigger change');
    await assertHeadProtection();
    assert.equal(await sql(`select ${PREFIX}currentness_schema_fingerprint();`), schema, 'FK fixture restored exact schema seal');
    assert.equal(await canonical(), before);
  }
  const forced = parseLastJson(await sql(`begin;update ${PREFIX}authority_head set state='active',
    active_revision_id=${q(publication.revisionId)};select ${PREFIX}read_current_authority()::text;rollback;`));
  assert.deepEqual(forced, UNAVAILABLE, 'Manual active head confers no authority');
  await sql(`select ${PREFIX}revoke_revision(${q(publication.revisionId)},'synthetic-hold');`);
  await assertUnavailable();
  assert.equal(await sql(`select to_jsonb(r)::text from ${PREFIX}authority_revisions r;`), retained);
  await refused(rollbackSql, '55000', 'Retained currentness evidence prevents destructive rollback');
  assert.equal(await sql(`select to_jsonb(r)::text from ${PREFIX}authority_revisions r;`), retained, 'Rollback retains evidence');

  for (const role of ['anon','authenticated','service_role']) {
    for (const call of [`publish_revision(${j(publication)},${q(decisionText)})`,
      `revoke_revision(${q(publication.revisionId)},'synthetic-denied')`, 'read_current_authority()',
      'currentness_integrity()', 'currentness_schema_fingerprint()', `currentness_valid_publication(${j(publication)})`,
      `currentness_valid_decision_inputs(${q(decisionText)},${j(publication)})`]) {
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
    `grant execute on function ${PREFIX}publish_revision(jsonb,text) to service_role;`,
    `grant execute on function ${PREFIX}currentness_valid_decision_inputs(text,jsonb) to authenticated;`,
    `grant select(publication) on ${PREFIX}authority_revisions to authenticated;`,
    `alter table ${PREFIX}authority_head disable row level security;`,
    `alter table ${PREFIX}authority_head add column unexpected text;`,
    `create function ${PREFIX}publish_revision(text) returns boolean language sql as 'select true';`,
    `create function ${PREFIX}publish_revision(jsonb) returns jsonb language sql as 'select null::jsonb';`,
    `alter function ${PREFIX}currentness_valid_decision_inputs(text,jsonb) volatile;`,
    `alter table ${REVISIONS} alter column decision_inputs_text drop not null;`,
    `alter table ${REVISIONS} drop constraint research_health_quick_order_decision_inputs_shape;`,
    `create or replace function ${PREFIX}read_current_authority() returns jsonb language sql as 'select null::jsonb';`,
  ]) await refused('begin;' + drift + '\n' + candidate, '55000');
  await sql(candidate);
  await sql(precheck);
  await sql(postcheck);
  await assertDecisionPersistence();
  assert.equal(await sql(`select to_jsonb(r)::text from ${PREFIX}authority_revisions r;`), retained);
  assert.equal(await canonical(), before);
  for (const [file, original] of loadedSources) assert.equal(lf(await readFile(file, 'utf8')), original, 'Source changed during verification');
  console.log(JSON.stringify({ kind: 'bounded_checks_complete', disposition: 'HELD_NOT_IMPLEMENTED',
    checked: ['exact absent/install/seeded reapply/pristine rollback','canonical fence and nineteen trigger states (requests 8/events 7/outbox 4)',
      'seeded held singleton and integrity-first absent-head publish/revoke refusal',
      'revision UPDATE/DELETE, head DELETE/TRUNCATE and joint TRUNCATE refusal; revisions-only FK precondition refusal; type58 structural TRUNCATE event',
      'epoch decrease/reset refusal and same/increase acceptance','three isolated ON DELETE RESTRICT foreign keys',
      'pristine-head drift and retained-history rollback refusal','internal-trigger-independent seal across reinstall',
      'accepted f581 installed predecessor refuses successor without conversion, then exact old pristine rollback',
      'six unique artifact kinds/paths and five decision references/raw decision digest',
      'canonical closed ASCII v1 format, sorted bounded sets, plural agreements and pricing-identity shape',
      'CF1 canonical valid-shape 8 MiB/8 MiB + 1 paired ceiling controls and nested key-order refusal',
      'CF2 repeated-path and 33-reference gates with rebuilt decision text, aligned references/digests and valid controls',
      'Doc58 C-1 direct publication-key/date/kind contracts and rebound effectivity/path/unused-reference controls',
      'Doc58 C-1 seven distinct-path artifacts with duplicate catalog discriminate the publication exactly-six upper bound',
      'decision NOT NULL and CHECK IS TRUE, absent legacy overload and validator ACL/property drift',
      'byte-preserving identical replay, valid changed-content conflict and invalid digest refusal',
      'closed held metadata publication','role denial','retained revision evidence','schema/ACL drift refusal'],
    syntheticDecisionFormatCases: { negative: decisionRefusals.length, positive: positives.length + 1,
      evidenceMeaning: 'format and envelope consistency only; no real artifact, policy, approval or census proof' },
    doc53Discrimination: { atBytes: Buffer.byteLength(byteEdge.at.text), overBytes: Buffer.byteLength(byteEdge.over.text),
      offerCount: byteEdge.offerCount, differingOfferIndex: byteEdge.differingOfferIndex,
      envelopeCases: envelopeCauseCases.map(row => row.name), nestedKeySwap: 'quantity maximum/minimum order only',
      limits: 'Existing SQL deadline/output/resource ceilings unchanged; no throughput or artifact-capacity qualification' },
    doc58Discrimination: {
      directComponentCases: publicationDirectCases.map(row => ({ name: row.name, targetGate: row.targetGate, limitation: row.limitation })),
      reboundCases: publicationReboundCases.map(row => ({ name: row.name, targetGate: row.targetGate, limitation: row.limitation })),
      sevenArtifactCase: 'Exactly-six upper bound isolated directly; all required kinds and seven distinct paths are present. End-to-end duplicate-lookup behavior after hypothetical guard removal is not qualified.',
      inheritedBackstops: 'Original altered-envelope/original-decision publish checks remain as fail-closed backstops; only the named direct or rebound pairs establish intended gate coverage.',
      limits: 'Timestamp conversion/round-trip and non-mirrored missing keys, unknown-kind enum and five-artifact lower-count cases retain explicit compound-gate limits. All cases require execution and exact successor acceptance.' },
    doc63Discrimination: {
      directFormatCases: doc63FormatCases.map(row => ({ name: row.name, targetGuard: row.targetGuard })),
      directRoundTripCases: doc63RoundTripCases.map(row => ({ name: row.name, field: row.field, targetGuard: row.targetGuard })),
      noncanonicalClock: doc63NoncanonicalClock, normalizedControl: doc63NormalizedClock,
      prerequisite: 'Each conversion/normalization SELECT must succeed; end conversion must be strictly after start. Conversion failure is never credited as a round-trip refusal.',
      retainedLabelCorrection: 'The new Doc63 closure supersedes historical Doc58 labels: presence SQL 90–92, closed keys SQL 93–94; missing bundleSha256/sourceRefs/applicabilityRefs isolate publication presence through downstream NULL propagation, while missing schemaVersion/artifacts remain compound.',
      limits: 'Authored NOT RUN; PostgreSQL 24:00 conversion semantics and individual-guard discrimination remain unexecuted. No optional path or replay expansion, policy, capacity, timing or activation proof.' },
    historicalSource: { source: predecessor.source, definition: predecessor.definition, files: predecessor.files },
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

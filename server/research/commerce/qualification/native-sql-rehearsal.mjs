/**
 * Disposable LOCAL PostgreSQL rehearsal. Never constructs a remote connection.
 *
 * Usage (no installation or repository dependency change):
 *   node server/research/commerce/qualification/native-sql-rehearsal.mjs --runtime <absolute @electric-sql/pglite package directory>
 * Alternatively set XENIOS_PGLITE_PACKAGE_PATH to that same local directory.
 *
 * Runs the checked-in SQL bytes, not rewritten copies. All fixture mutations and
 * negative controls affect one newly created in-memory PGlite instance only.
 * This is not managed Supabase/PostgREST, provider, production, or concurrency proof.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(import.meta.url);
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const DRIVER = 'server/research/commerce/qualification/native-sql-rehearsal.mjs';
const CHECKOUT = 'supabase/candidates/20260909150000_research_checkout_executions';
const RECOVERY = 'supabase/candidates/20260910120000_research_checkout_execution_recovery';
const FILES = [
  'supabase/production/research-track-b-commerce.sql',
  `${CHECKOUT}.precheck.sql`, `${CHECKOUT}.sql`, `${CHECKOUT}.postcheck.sql`, `${CHECKOUT}.rehearsal.sql`,
  `${RECOVERY}.precheck.sql`, `${RECOVERY}.sql`, `${RECOVERY}.postcheck.sql`,
];
const SIGNATURE = 'public.research_checkout_executions_list_recoverable(timestamptz,integer,timestamptz,uuid)';
const INDEX = 'public.research_checkout_executions_recoverable_idx';
const NOW = '2026-09-10T12:00:00.000Z';
const CURSOR_ID = '00000000-0000-4000-8000-000000000001';
const lf = bytes => bytes.toString('utf8').replaceAll('\r\n', '\n');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);

class RehearsalError extends Error {
  constructor(code, sqlstate = null) { super(code); this.code = code; this.sqlstate = sqlstate; }
}
const requireFact = (fact, code) => { if (!fact) throw new RehearsalError(code); };
const sqlstate = error => typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : null;
const safeFailure = error => ({ code: error instanceof RehearsalError ? error.code : 'unexpected_local_error', sqlstate: error instanceof RehearsalError ? error.sqlstate : sqlstate(error) });
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 }).trim();
}
function runtimeArgument() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    emit({ usage: `node ${DRIVER} --runtime <absolute local @electric-sql/pglite package directory>`, environment: 'XENIOS_PGLITE_PACKAGE_PATH', scope: 'LOCAL_MEMORY_ONLY' });
    return null;
  }
  requireFact(args.length === 0 || (args.length === 2 && args[0] === '--runtime'), 'arguments_invalid');
  const selected = args.length ? args[1] : process.env.XENIOS_PGLITE_PACKAGE_PATH;
  requireFact(typeof selected === 'string' && isAbsolute(selected) && !/^[\\/]{2}/.test(selected) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(selected), 'explicit_local_runtime_directory_required');
  return selected;
}
async function localRuntime(directory) {
  const root = await realpath(directory);
  requireFact(!/^[\\/]{2}/.test(root), 'network_runtime_path_refused');
  const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  requireFact(metadata.name === '@electric-sql/pglite' && metadata.version === '0.5.8', 'runtime_identity_or_version_mismatch');
  // The exact pinned package's ESM entry points. Resolve locally; never accept a URL.
  const within = async path => {
    const actual = await realpath(resolve(root, path));
    const rel = relative(root, actual);
    requireFact(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), 'runtime_entry_outside_package');
    return actual;
  };
  const entry = await within('dist/index.js');
  const extension = await within('dist/contrib/pgcrypto.js');
  const [{ PGlite }, { pgcrypto }] = await Promise.all([import(pathToFileURL(entry).href), import(pathToFileURL(extension).href)]);
  requireFact(typeof PGlite === 'function' && pgcrypto, 'runtime_exports_missing');
  return { PGlite, pgcrypto, identity: { package: metadata.name, version: metadata.version, entrySha256: sha256(await readFile(entry)), pgcryptoEntrySha256: sha256(await readFile(extension)) } };
}

async function main() {
  const selected = runtimeArgument();
  if (selected === null) return;
  const root = await realpath(ROOT);
  requireFact(await realpath(git(['rev-parse', '--show-toplevel'])) === root, 'repository_identity_mismatch');
  const inputs = new Map();
  for (const path of FILES) {
    const text = lf(await readFile(resolve(root, path)));
    inputs.set(path, { path, text, lfSha256: sha256(text), bytes: Buffer.byteLength(text) });
  }
  const headSha = git(['rev-parse', 'HEAD']);
  const treeSha = git(['rev-parse', 'HEAD^{tree}']);
  requireFact(/^[a-f0-9]{40}$/.test(headSha) && /^[a-f0-9]{40}$/.test(treeSha), 'source_identity_invalid');
  const source = {
    headSha, treeSha, driverLfSha256: sha256(lf(await readFile(HERE))),
    relevantWorkingTreeDirty: git(['status', '--porcelain', '--untracked-files=normal', '--', DRIVER, ...FILES]) !== '',
    binding: 'Executed identities are the LF hashes below; HEAD/tree identify their checkout, not an assertion that dirty bytes were committed.',
  };
  const runtime = await localRuntime(selected);
  emit({ type: 'identity', scope: 'LOCAL_MEMORY_ONLY', source, runtime: runtime.identity, sqlInputs: [...inputs.values()].map(({ text, ...identity }) => identity) });
  const results = [];
  let db = null;
  let failure = null;
  let closed = false;
  const check = async (id, kind, operation, identity = {}) => {
    try {
      const detail = await operation();
      const result = { id, kind, status: 'PASS', ...identity, ...(detail ?? {}) };
      results.push(result); emit({ type: 'check', ...result });
    } catch (error) {
      const result = { id, kind, status: 'FAIL', ...identity, failure: safeFailure(error) };
      results.push(result); emit({ type: 'check', ...result });
      throw error;
    }
  };
  const runFile = async path => {
    const input = inputs.get(path);
    requireFact(input, 'sql_input_missing');
    await check(path, 'sql_file', () => db.exec(input.text).then(() => undefined), { lfSha256: input.lfSha256 });
  };
  const refuse = async (operation, marker) => {
    let rejection;
    try { await operation(); } catch (error) { rejection = error; }
    // Check scripts own BEGIN READ ONLY/ROLLBACK. A raised DO leaves an aborted
    // transaction, which must be cleared before any fixture restoration.
    await db.exec('ROLLBACK');
    requireFact(rejection !== undefined, 'expected_refusal_not_observed');
    if (sqlstate(rejection) !== 'P0001' || !String(rejection.message).includes(marker)) {
      throw new RehearsalError('unexpected_refusal_reason', sqlstate(rejection));
    }
    return { expectedSqlstate: 'P0001', observedSqlstate: 'P0001' };
  };
  const recoveryPrecheck = () => db.exec(inputs.get(`${RECOVERY}.precheck.sql`).text);
  const recoveryPostcheck = () => db.exec(inputs.get(`${RECOVERY}.postcheck.sql`).text);
  try {
    // No dataDir, URL, connection string, external filesystem, or remote adapter.
    db = new runtime.PGlite({ extensions: { pgcrypto: runtime.pgcrypto } });
    await check('local_engine_and_roles', 'setup', async () => {
      const { rows } = await db.query("select current_setting('server_version') as version, current_setting('server_version_num')::integer as version_num");
      requireFact(rows.length === 1 && rows[0].version_num >= 180000 && rows[0].version_num < 190000, 'expected_local_postgres_18');
      await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
      return { postgresVersion: rows[0].version, connections: 1 };
    });
    for (const path of FILES.slice(0, 5)) await runFile(path);

    // Test each prerequisite independently before discovery is installed, so a
    // different failure (already-installed function) cannot manufacture success.
    for (const column of ['updated_at', 'phase', 'settled_at']) {
      await check(`recovery_missing_${column}_refuses`, 'negative', async () => {
        await db.exec(`ALTER TABLE public.research_checkout_executions RENAME COLUMN ${column} TO qa_missing_${column}`);
        try {
          return await refuse(recoveryPrecheck, `research_checkout_executions lacks column ${column}`);
        } finally {
          await db.exec(`ALTER TABLE public.research_checkout_executions RENAME COLUMN qa_missing_${column} TO ${column}`);
        }
      });
    }
    for (const path of FILES.slice(5)) await runFile(path);
    await check('checkout_reinstallation_refuses', 'negative', () => refuse(() => db.exec(inputs.get(`${CHECKOUT}.precheck.sql`).text), 'public.research_checkout_executions already exists'));
    await check('recovery_reinstallation_refuses', 'negative', () => refuse(recoveryPrecheck, 'the discovery function already exists'));
    await check('recovery_public_execute_grant_refuses', 'negative', async () => {
      await db.exec(`GRANT EXECUTE ON FUNCTION ${SIGNATURE} TO PUBLIC`);
      try { return await refuse(recoveryPostcheck, 'is executable by a public role'); }
      finally { await db.exec(`REVOKE EXECUTE ON FUNCTION ${SIGNATURE} FROM PUBLIC`); }
    });
    const indexResult = await db.query('select pg_get_indexdef($1::regclass) as definition', [INDEX]);
    const originalIndex = indexResult.rows[0]?.definition;
    requireFact(typeof originalIndex === 'string' && originalIndex.startsWith('CREATE INDEX '), 'restorable_index_definition_missing');
    for (const [id, replacement, marker] of [
      ['recovery_missing_index_refuses', null, 'discovery index'],
      ['recovery_phase_only_index_refuses', "phase <> 'committed'", 'discovery index'],
      // Contains IS NULL but is still broader than the required grouped AND/OR.
      // A substring-only postcheck MUST fail this retained negative control.
      ['recovery_wrongly_grouped_index_refuses', "phase <> 'committed' OR settled_at IS NULL", 'discovery index'],
    ]) {
      await check(id, 'negative', async () => {
        await db.exec(`DROP INDEX ${INDEX}`);
        try {
          if (replacement !== null) await db.exec(`CREATE INDEX research_checkout_executions_recoverable_idx ON public.research_checkout_executions (updated_at, id) WHERE ${replacement}`);
          return await refuse(recoveryPostcheck, marker);
        } finally {
          await db.exec(`DROP INDEX IF EXISTS ${INDEX}`);
          await db.exec(originalIndex);
        }
      });
    }
    for (const [id, afterTime, afterId] of [
      ['recovery_timestamp_only_cursor_refuses', NOW, null],
      ['recovery_id_only_cursor_refuses', null, CURSOR_ID],
    ]) {
      await check(id, 'negative', () => refuse(() => db.query(`select * from public.research_checkout_executions_list_recoverable($1::timestamptz,$2::integer,$3::timestamptz,$4::uuid)`, [NOW, 1, afterTime, afterId]), 'the page cursor is incomplete'));
    }
    await check('recovery_restored_postcheck', 'restoration', () => recoveryPostcheck().then(() => undefined));
    await check('recovery_empty_bounded_read', 'positive', async () => {
      const { rows } = await db.query('select * from public.research_checkout_executions_list_recoverable($1::timestamptz,$2::integer,$3::timestamptz,$4::uuid)', [NOW, 1, null, null]);
      requireFact(rows.length === 0, 'rolled_back_fixtures_left_recoverable_rows');
      return { returnedRows: rows.length, requestedLimit: 1, provesNonemptyPaginationOrConcurrency: false };
    });
    await check('tested_source_bytes_unchanged', 'identity', async () => {
      requireFact(git(['rev-parse', 'HEAD']) === headSha, 'source_head_changed_during_run');
      requireFact(sha256(lf(await readFile(HERE))) === source.driverLfSha256, 'driver_changed_during_run');
      for (const input of inputs.values()) requireFact(sha256(lf(await readFile(resolve(root, input.path)))) === input.lfSha256, 'sql_input_changed_during_run');
    });
  } catch (error) {
    failure = safeFailure(error);
  } finally {
    if (db) {
      try { await db.close(); closed = true; }
      catch (error) { failure ??= safeFailure(error); }
    }
  }
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const filesPassed = results.filter(r => r.kind === 'sql_file' && r.status === 'PASS').length;
  const negativePassed = results.filter(r => r.kind === 'negative' && r.status === 'PASS').length;
  const localPassed = failure === null && closed && filesPassed === FILES.length && negativePassed === 11;
  emit({ type: 'summary', scope: 'LOCAL_MEMORY_ONLY', localPassed, closed, source,
    checks: { completed: results.length, passed, failed }, sqlFiles: { required: FILES.length, passed: filesPassed }, negativeControls: { required: 11, passed: negativePassed }, failure,
    managedQualified: false, productionQualified: false,
    limitations: ['Disposable PGlite/PostgreSQL 18; not the managed PostgreSQL 17 environment.', 'One connection: no independent-session concurrency, pooler, PostgREST, Auth, network, or managed permissions proof.', 'Empty recovery read proves invocation only, not nonempty pagination or query-planner performance.', 'No provider calls, external notifications, production installation, activation, or migration-history writes.'] });
  if (!localPassed) process.exitCode = 1;
}

main().catch(error => {
  // Raw SQL/framework errors and source contents are intentionally not logged.
  emit({ type: 'not_run', scope: 'LOCAL_MEMORY_ONLY', localPassed: false, failure: safeFailure(error) });
  process.exitCode = 2;
});

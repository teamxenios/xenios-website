// Synthetic disposable PostgreSQL harness, never a hosted connection. The
// service-role model proves database boundaries, not provider authentication.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const runFile = promisify(execFile);
export const migrationPath = 'supabase/migrations/20261001085559_research_assisted_order_quote_provider_journal.sql';
export const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const request = n => id(1, n);
export const member = n => id(2, n);
export const line = n => id(3, n);
export const actor = id(4, 1);
export const otherActor = id(4, 2);
export const actorLabel = 'synthetic-provider-journal@example.test';
export const reference = n => `XRR-20261001-ABCDEF${String(n).padStart(4, '0')}`;
export const q = value => value == null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
export const j = value => `${q(JSON.stringify(value))}::jsonb`;
export const service = sql => `set role service_role;${sql}`;
export const jsonRows = output => output.split(/\r?\n/).filter(row => row.startsWith('{') || row.startsWith('[')).map(row => JSON.parse(row));
export const json = output => {
  const rows = jsonRows(output);
  assert.ok(rows.length, 'Expected structured SQL JSON');
  return rows.at(-1);
};

const predecessors = [
  'supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql',
  'supabase/migrations/20260815150000_research_assisted_order_bridge.sql',
  'supabase/migrations/20260930191323_research_assisted_order_quote_payment_guard.sql',
  'supabase/migrations/20260930193033_research_assisted_order_quote_paid_hold.sql',
  'supabase/migrations/20260930202413_research_assisted_order_quote_payment_authority.sql',
  'supabase/migrations/20260930205725_research_assisted_order_quote_access_finance_bound.sql',
  'supabase/migrations/20260930230541_research_assisted_order_quote_evidence_corrections.sql',
  'supabase/migrations/20260930234614_research_assisted_order_quote_provider_hold.sql',
  'supabase/migrations/20261001024018_research_assisted_order_quote_history_immutability.sql',
];

export function fixture(n, status = 'reviewing') {
  return `insert into public.research_assisted_order_requests(id,public_reference,idempotency_key_hash,request_fingerprint,
    actor_member_id,normalized_email,full_legal_name,mobile_phone,shipping_address,billing_address,age_confirmed,source,status)
    values('${request(n)}','${reference(n)}','synthetic-provider-key-${n}','synthetic-provider-fp-${n}','${member(n)}',
    'synthetic-provider-${n}@example.test','Synthetic Provider Buyer','+10000000000',
    '{"line1":"1 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}',
    '{"line1":"1 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}',true,'early_access_manual_order_bridge','${status}');
    insert into public.research_assisted_order_lines(id,request_id,product_id,variant_id,product_name,quantity,minimum_quantity,
    quantity_increment,workflow_mode,customer_action_label,unit_price_cents,line_estimate_cents,catalog_version,authoritative_fingerprint)
    values('${line(n)}','${request(n)}','P-SYNTHETIC-${n}','V-SYNTHETIC-${n}','Synthetic journal item',2,1,1,'direct_order_request',
    'Request order',2500,5000,'synthetic-cat','synthetic-fp');`;
}
export const statusExpr = (n, from, to, evidence = {}) =>
  `public.research_assisted_order_set_status('${request(n)}','${from}','${to}','synthetic-admin','admin',null,null,${j(evidence)})`;

export class ProviderJournalHarness {
  containerId = null;
  refusals = 0;
  races = 0;
  quotes = new Map();
  acceptances = new Map();
  observations = new Map();

  async start() {
    assert.equal(process.version, 'v20.19.0', 'Use the isolated pinned Node runtime');
    const image = JSON.parse((await runFile('docker', ['image', 'inspect', 'postgres:17-alpine'], { windowsHide: true })).stdout)[0];
    const started = await runFile('docker', ['run', '-d', '--rm', '--pull=never', '--name',
      `xenios-hl12-provider-journal-${process.pid}-local`, '--network', 'none', '--tmpfs', '/var/lib/postgresql/data',
      '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine'], { windowsHide: true });
    this.containerId = started.stdout.trim();
    assert.match(this.containerId, /^[0-9a-f]{64}$/);
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        await runFile('docker', ['exec', this.containerId, 'pg_isready', '-U', 'postgres'], { windowsHide: true });
        ready = true;
        break;
      } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    assert.ok(ready, 'Disposable PostgreSQL did not become ready');
    console.log(JSON.stringify({ node: process.version, postgres: await this.psql('show server_version;'),
      imageId: image.Id, imageDigests: image.RepoDigests, network: 'none', publishedPorts: false, syntheticOnly: true }));
  }

  startSql(sql, marker = null) {
    assert.match(this.containerId ?? '', /^[0-9a-f]{64}$/);
    let markResolve, markReject;
    const marked = marker ? new Promise((resolve, reject) => { markResolve = resolve; markReject = reject; }) : null;
    let output = '';
    const done = new Promise((resolve, reject) => {
      const child = spawn('docker', ['exec', '-i', this.containerId, 'psql', '-X', '-q', '-A', '-t',
        '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], { windowsHide: true });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => child.kill(), 45_000);
      child.stdout.on('data', chunk => { stdout += chunk; output = stdout; if (marker && stdout.includes(marker)) markResolve(); });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('error', error => { clearTimeout(timer); markReject?.(error); reject(error); });
      child.on('close', code => {
        clearTimeout(timer);
        if (code === 0) { markResolve?.(); resolve(stdout.trim()); }
        else {
          const error = Object.assign(new Error(`Disposable psql exited ${code}`), { code, stdout, stderr });
          markReject?.(error); reject(error);
        }
      });
      child.stdin.end(`\\set VERBOSITY verbose\nset statement_timeout='30s';\n${sql}\n`);
    });
    done.catch(() => {}); marked?.catch(() => {});
    return { done, marked, output: () => output };
  }
  psql(sql) { return this.startSql(sql).done; }
  checkError(error, state = 'P0001', detail = null) {
    assert.ok(error, `Expected SQLSTATE ${state}, detail ${detail}`);
    assert.match(error.stderr ?? '', new RegExp(`ERROR:\\s+${state}:`));
    if (detail) assert.match(error.stderr, new RegExp(`DETAIL:\\s+${detail}(?:\\r?\\n|$)`));
    this.refusals++;
  }
  async refused(sql, ...expected) {
    let error;
    try { await this.psql(sql); } catch (failure) { error = failure; }
    this.checkError(error, ...expected);
    return error;
  }
  async lockedRace(firstSql, secondSql, expected = null) {
    const first = this.startSql(`begin;${firstSql}\nselect 'synthetic-lock-held';select pg_sleep(2);commit;`, 'synthetic-lock-held');
    await first.marked;
    const peerSql = typeof secondSql === 'function' ? secondSql(json(first.output())) : secondSql;
    const peer = this.startSql(`set application_name='synthetic-provider-journal-peer';${peerSql}`);
    let blocked = false;
    for (let attempt = 0; attempt < 15; attempt++) {
      if (await this.psql("select count(*) from pg_stat_activity where application_name='synthetic-provider-journal-peer' and wait_event_type='Lock';") === '1') {
        blocked = true; break;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(blocked, true, 'Peer must wait on a real database lock');
    await first.done;
    let value, error;
    try { value = await peer.done; } catch (failure) { error = failure; }
    if (expected) this.checkError(error, ...expected); else if (error) throw error;
    this.races++;
    return value ? json(value) : null;
  }
  async baseline() {
    for (const path of predecessors.slice(0, 2)) await this.psql(await readFile(path, 'utf8'));
    // Historical labels deliberately predate the financial guards. They are
    // never backfilled with fabricated observations or verifications.
    await this.psql(`${fixture(990, 'paid')}${fixture(991)}
      insert into public.research_assisted_order_events(request_id,status,actor_type,actor_id,evidence)
      values('${request(991)}','paid','admin','synthetic-history','{}');`);
    for (const path of predecessors.slice(2)) await this.psql(await readFile(path, 'utf8'));
    await this.psql('create schema extensions;create extension pgcrypto with schema extensions;');
    await this.psql(await readFile('supabase/research-notification-outbox.sql', 'utf8'));
    // Deliberately permissive bootstrap defaults make explicit new-table and
    // function revokes meaningful. This is not a managed Supabase ACL claim.
    await this.psql(`alter role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;
      grant select,insert,update,delete,truncate on public.research_notification_outbox,public.research_notification_attempts to service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
    for (const file of ['20261001040349_research_assisted_order_quote_audit_store.sql',
      '20261001040351_research_assisted_order_quote_effects.sql', '20261001044200_research_assisted_order_quote_history_reissue.sql',
      '20261001062651_research_assisted_order_quote_no_funds_disposition.sql']) {
      await this.psql(await readFile(`supabase/migrations/${file}`, 'utf8'));
    }
    await this.psql(`insert into public.research_assisted_order_payment_verifier_grants(auth_user_id,actor_label,granted_by)
      values('${actor}','${actorLabel}','synthetic-owner');
      insert into public.research_assisted_order_no_funds_grants(auth_user_id,source_namespace,actor_label,granted_by)
      values('${actor}','synthetic-bank-import','${actorLabel}','synthetic-owner');`);
  }
  async setup(n, { accept = true, paymentStage = true, expiresAt = "now()+interval '1 day'" } = {}) {
    await this.psql(fixture(n));
    const quote = json(await this.psql(service(`select public.research_assisted_order_quote_issue('${request(n)}',
      '[{"lineId":"${line(n)}"}]',${expiresAt},'synthetic-admin')::text;`)));
    this.quotes.set(n, quote.quoteId);
    if (accept) {
      await this.psql(service(`select public.research_assisted_order_quote_accept('${quote.quoteId}',1,5000,'${member(n)}');`));
      this.acceptances.set(n, await this.psql(`select acceptance_id from public.research_assisted_order_quotes where id='${quote.quoteId}';`));
    }
    if (paymentStage) await this.psql(service(`select ${statusExpr(n, 'reviewing', 'payment_pending')};
      select ${statusExpr(n, 'payment_pending', 'payment_review')};`));
    return quote;
  }
  observeExpr(n, amount = 5000, evidence = `synthetic-manual-${n}`) {
    return `public.research_assisted_order_payment_observe('${request(n)}','${this.quotes.get(n)}','manual',${amount},'USD',
      '${reference(n)}',${q(evidence)},'2026-01-01T00:00:00.000Z','${actor}')`;
  }
  async observe(n, amount = 5000) {
    const receipt = json(await this.psql(service(`select ${this.observeExpr(n, amount)}::text;`)));
    this.observations.set(n, receipt.observationId);
    return receipt;
  }
  verifyExpr(n) {
    return `public.research_assisted_order_payment_verify_bound('${request(n)}','${this.observations.get(n)}','${actor}')`;
  }
  async stop() {
    if (!this.containerId) return;
    assert.match(this.containerId, /^[0-9a-f]{64}$/);
    await runFile('docker', ['rm', '-f', this.containerId], { windowsHide: true });
    console.log('CLEANUP removed exact disposable no-network container');
    this.containerId = null;
  }
}

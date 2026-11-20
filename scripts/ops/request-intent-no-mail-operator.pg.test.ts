/** Owned Docker PG17 ONLY, authored UNRUN. Temporary self-signed owned TLS
 * cert and synthetic admissions qualify adapter mechanics, NOT provider/action
 * authority, reviewed managed images or an actual seven-unit installation. */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, chmod, stat, readFile, readdir, rm, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { createDurableJourneyFixture, submission } from "../../server/research/assisted-order/request-intent/durable-journey.pg.fixture";
import { canonical, sha256, CODE_PINS, SOURCE_COMMIT, SOURCE_UNITS, assembleSources, CAPTURE_SQL, LOCKS, NEW_RELATIONS, conservationSQL, UNARMED_SQL,
  runNoMailInstall, reconcileNoMailInstall, type Capture, type Catalog, type InstallIntent, type InstallReceipt, type InstallRequest, type NoMailConnection, type NoMailOperator } from "./request-intent-no-mail-install";
import { createNoMailOperatorAdapter, OPERATOR_SOURCE_SHA256, type RootNoMailAdmission, type RootNoMailBindings } from "./request-intent-no-mail-operator";

const six = process.env.XENIOS_NO_MAIL_OPERATOR_PG17_6, eleven = process.env.XENIOS_NO_MAIL_OPERATOR_PG17_11;
for (const value of [six, eleven]) if (value !== undefined && value !== "0" && value !== "1") throw Error("invalid_owned_operator_selector");
if (six === "1" && eleven === "1") throw Error("conflicting_owned_operator_selectors");
const image = six === "1" ? "postgres:17.6" : eleven === "1" ? "postgres:17.11" : null;
const pgIt = image ? it : it.skip;

const CANONICAL_BASELINE_PINS=[
  {
    "path": "supabase/care-access-foundation.sql",
    "bytes": 6227,
    "sha256": "e91331b72820c6ca3f1cb3ce0fa8c79487e70d189d74b853bdaff49b2d7589ce"
  },
  {
    "path": "supabase/candidates/mixed_catalog_request_intent.sql",
    "bytes": 18403,
    "sha256": "c50a54629c5e182dafed61e80831e6f9429c18568aac4dd668c0bad8213d97f8"
  },
  {
    "path": "supabase/research-notification-outbox.sql",
    "bytes": 3651,
    "sha256": "70cee0109dce7401431de9449a1312076ad61b7081ed31b9b8a9659bc6cca7ac"
  },
  {
    "path": "server/research/assisted-order/request-intent/private-contact.candidate.sql",
    "bytes": 5660,
    "sha256": "1cb77c07dc5126b6b5bccc210994a3094877b9c6e4d75db9387f1fb5a7246103"
  },
  {
    "path": "supabase/migrations/20261114133643_early_access_postal_admission.sql",
    "bytes": 4672,
    "sha256": "0bf6e063eb8c08121acd4dfeaa9ea1c0872fec848f5c346c65d0c4478a1800b3"
  },
  {
    "path": "supabase/migrations/20261114133500_early_access_pending_request_reader.sql",
    "bytes": 6145,
    "sha256": "94999e02049f2c4c06a55621734a38c7a1f72288ae9b91f7466315db99c5a973"
  },
  {
    "path": "supabase/migrations/20261115205033_early_access_request_submitted_staff_notice.sql",
    "bytes": 2673,
    "sha256": "71e04a5676a70588ed1bd8edbf18d8ae3c2225713c7ac837cd83c0f76aa4965d"
  },
  {
    "path": "supabase/migrations/20261115222911_early_access_staff_notice_request_detail.sql",
    "bytes": 6945,
    "sha256": "1da7e15da3a888a5b0c758a0f4011e62b50f2f3333de6aa7dd2eeb7675381adc"
  },
  {
    "path": "supabase/migrations/20261118024134_request_intent_workflow.sql",
    "bytes": 21072,
    "sha256": "d6dc7c5737c8ac70a2eb89f21fd563505347049cdad9418e4e1e4e1e76ae325a"
  },
  {
    "path": "supabase/migrations/20261118033449_early_access_request_customer_notices.sql",
    "bytes": 11531,
    "sha256": "852f1f76aeb70f0893a6e5b56424ea5629a4dace6fb4c0ba9374a65da799de75"
  },
  {
    "path": "server/research/assisted-order/quote/delivery/tables.sql",
    "bytes": 1945,
    "sha256": "e4eec74b106d6b385602e057fd2b005ec05bb402db12973c256156c93cad9e06"
  },
  {
    "path": "server/research/assisted-order/quote/delivery/private-pg.sql",
    "bytes": 1556,
    "sha256": "34bcb80686b5a10414885aaba29fec9bbff1f8d4bc979b110a812b62792ac4eb"
  }
] as const;

const sourceText=(path:string)=>readFileSync(path,"utf8");
const literal=(value:string)=>"'"+value.replaceAll("'","''")+"'";
async function fixture(canonicalChain=false) {
  if (!image) throw Error("explicit_owned_image_required");
  const db = createDurableJourneyFixture(), directory = await mkdtemp(join(tmpdir(), "xenios-owned-no-mail-tls-"));
  await chmod(directory, 0o700); const custody = join(directory, "custody");
  await mkdir(custody, { mode: 0o700 });
  let pool: ReturnType<typeof db.poolForLogin> | undefined, platform: ReturnType<typeof db.poolForLogin> | undefined;
  const cleanup = async () => {
    try { try { await pool?.end(); } finally { await platform?.end(); } } finally {
      await db.close();
      if (!resolve(directory).startsWith(resolve(tmpdir()) + "/") && !resolve(directory).startsWith(resolve(tmpdir()) + "\\")) throw Error("owned_cleanup_scope");
      await rm(directory, { recursive: true, force: true });
    }
  };
  try {
    if(canonicalChain)for(const pin of CANONICAL_BASELINE_PINS){const bytes=readFileSync(pin.path);expect(bytes.length).toBe(pin.bytes);expect(sha256(bytes)).toBe(pin.sha256);}
    await db.start({ image, dockerOnly: true, managedCareSchema:canonicalChain, bootstrapProfile: "separate_owned_superuser" });
    if(canonicalChain){
      await db.sql("create schema if not exists extensions;alter extension pgcrypto set schema extensions");
      // One actual mounted canonical OWNED request; unrelated to managed actors.
      const {app}=db.application(db.adapter().client);
      expect((await db.post(app,"",submission(),"a")).status).toBe(200);
      for(const path of ["supabase/research-notification-outbox.sql","server/research/assisted-order/request-intent/private-contact.candidate.sql",
        "supabase/migrations/20261114133643_early_access_postal_admission.sql","supabase/migrations/20261114133500_early_access_pending_request_reader.sql",
        "supabase/migrations/20261115205033_early_access_request_submitted_staff_notice.sql","supabase/migrations/20261115222911_early_access_staff_notice_request_detail.sql",
        "supabase/migrations/20261118024134_request_intent_workflow.sql","supabase/migrations/20261118033449_early_access_request_customer_notices.sql"])await db.sql(sourceText(path));
      await db.sql("create schema quote_delivery_private");
      await db.sql("set search_path=quote_delivery_private,pg_catalog;\n"+sourceText("server/research/assisted-order/quote/delivery/tables.sql")+sourceText("server/research/assisted-order/quote/delivery/private-pg.sql"));
    }
    const container = db.ownedDockerContainer();
    const key = join(directory, "server.key"), cert = join(directory, "server.crt");
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert,
      "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1"], { timeout: 10000, stdio: "pipe" });
    await chmod(key, 0o600);
    for (const [from, to] of [[key, "/tmp/xenios-no-mail-server.key"], [cert, "/tmp/xenios-no-mail-server.crt"]])
      execFileSync("docker", ["cp", from, container + ":" + to], { timeout: 10000, stdio: "pipe" });
    execFileSync("docker", ["exec", "--user", "0", container, "chown", "postgres:postgres", "/tmp/xenios-no-mail-server.key", "/tmp/xenios-no-mail-server.crt"], { timeout: 5000, stdio: "pipe" });
    execFileSync("docker", ["exec", "--user", "0", container, "chmod", "600", "/tmp/xenios-no-mail-server.key"], { timeout: 5000, stdio: "pipe" });
    // Owned-only setup under genuine source/bootstrap profile. Separate queries:
    // ALTER SYSTEM is not hidden inside a transaction or managed operation.
    await db.sql("alter system set ssl_cert_file='/tmp/xenios-no-mail-server.crt'");
    await db.sql("alter system set ssl_key_file='/tmp/xenios-no-mail-server.key'");
    await db.sql("alter system set ssl='on'");
    await db.sql("select pg_reload_conf()");
    // Actual observed native setting, no sleep/retry/poll or timeout waiver.
    await db.sql("do $guard$ begin if current_setting('ssl')<>'on' then raise exception 'owned_tls_not_loaded';end if;end $guard$");
    if(canonicalChain){
    const platformName="no_mail_platform_"+randomUUID().replaceAll("-",""),authOwner="no_mail_auth_"+randomUUID().replaceAll("-",""),platformPassword=randomUUID();
    await db.sql(`create role ${platformName} login superuser password ${literal(platformPassword)}`);
    platform=db.poolForLogin(platformName,platformPassword);
    await platform.query(`create role ${authOwner} nologin nosuperuser nobypassrls;
      alter schema auth owner to ${platformName};alter table auth.users owner to ${authOwner};alter function auth.uid() owner to ${authOwner};
      grant usage on schema auth to postgres;grant select,references on auth.users to postgres;
      grant anon,authenticated,service_role to postgres;
      alter default privileges for role postgres in schema public grant all on tables to postgres,anon,authenticated,service_role;
      alter default privileges for role postgres in schema public grant all on functions to postgres,anon,authenticated,service_role;
      alter default privileges for role postgres in schema public grant all on sequences to postgres,anon,authenticated,service_role;
      alter default privileges for role ${platformName} in schema public grant all on tables to postgres,anon,authenticated,service_role;
      alter default privileges for role ${platformName} in schema public grant all on functions to postgres,anon,authenticated,service_role;
      alter default privileges for role ${platformName} in schema public grant all on sequences to postgres,anon,authenticated,service_role;
      create schema no_mail_owned_guard;
      create function no_mail_owned_guard.source_actor() returns event_trigger language plpgsql security invoker set search_path='' as $f$
      begin if current_user<>'postgres' or session_user<>'postgres' or (select rolsuper from pg_catalog.pg_roles where rolname=current_user)
       then raise exception using errcode='42501',message='genuine_nonsuper_postgres_required';end if;end $f$;
      revoke all on function no_mail_owned_guard.source_actor() from public,anon,authenticated,service_role;
      grant usage on schema no_mail_owned_guard to postgres;
      grant execute on function no_mail_owned_guard.source_actor() to postgres;
      create event trigger no_mail_source_actor on ddl_command_end execute function no_mail_owned_guard.source_actor();
      alter role postgres nosuperuser bypassrls createdb createrole login inherit;`);
    }
    const password = randomUUID();
    await db.sql(canonicalChain ? "alter role postgres password '"+password+"'"
      : "alter role postgres nosuperuser bypassrls login password '"+password+"'");
    pool = db.poolForLogin("postgres", password);
    const port = Number(pool.options.port); if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error("owned_port");
    const ca=await readFile(cert,"utf8");
    Object.assign(pool.options,{ssl:{rejectUnauthorized:true,ca},statement_timeout:30000,lock_timeout:5000,
      idle_in_transaction_session_timeout:5000,query_timeout:0,options:"-c transaction_timeout=40000 -c search_path=pg_catalog -c timezone=UTC -c DateStyle=ISO,YMD"});
    const capture=async()=>(await pool!.query(CAPTURE_SQL)).rows[0].evidence as Capture;
    const ordinary=async()=>{const values:Record<string,unknown>={};for(const [name]of LOCKS)values[name]=(await pool!.query(conservationSQL(name))).rows[0];return canonical(values);};
    let before:Catalog={relations:[],routines:[]},after:Catalog=before,oldRows:string|null=null;
    if(canonicalChain){
      const reference=await pool.connect();
      try{
        await reference.query("SET search_path=pg_catalog;SET TimeZone='UTC';SET DateStyle='ISO,YMD'");
        const native=(await reference.query(CAPTURE_SQL)).rows[0].evidence as Capture;
        expect(native.identity).toMatchObject({sessionUser:"postgres",currentUser:"postgres",superuser:false,bypassRls:true,version:image==="postgres:17.6"?170006:170011});
        expect((await reference.query("select oid<>10 as value from pg_roles where rolname=current_user")).rows[0].value).toBe(true);
        before=native.catalog;
        await reference.query("BEGIN");for(const unit of assembleSources())await reference.query(unit.sql);
        after=((await reference.query(CAPTURE_SQL)).rows[0].evidence as Capture).catalog;
        expect((await reference.query("ROLLBACK")).command).toBe("ROLLBACK");
        expect(canonical(((await reference.query(CAPTURE_SQL)).rows[0].evidence as Capture).catalog)).toBe(canonical(before));
      }finally{reference.release();}
      oldRows=await ordinary();
    }
    const info = await stat(custody, { bigint: true }), validUntil = Date.now() + 120000;
    const request: InstallRequest = { executionId: "owned_native_" + randomUUID(), implementationSource: "f".repeat(40),
      target: { project: "owned_target_no_mail", service: container }, expectedVersion: image === "postgres:17.6" ? 170006 : 170011,
      wallMs: canonicalChain?20000:10000, reviewedPreimage: before, reviewedPostimage: after, preimageSha256: sha256(canonical(before)), postimageSha256: sha256(canonical(after)) };
    const { reviewedPreimage: _pre, reviewedPostimage: _post, ...rest } = request;
    const intent: InstallIntent = { ...rest, source: SOURCE_COMMIT, codePins: CODE_PINS, sourcePins: SOURCE_UNITS.map(unit => unit.sha256) };
    const bindings: RootNoMailBindings = { actionId: "OWNED_NATIVE_MECHANICS", custodyDirectory: custody,
      target: { ...request.target, expectedVersion: request.expectedVersion },
      verifyAdmission: async (input): Promise<RootNoMailAdmission> => {
        expect(input.intent.target).toEqual(request.target);expect(input.intent.expectedVersion).toBe(request.expectedVersion);
        expect(input.intent.preimageSha256).toBe(request.preimageSha256);expect(input.intent.postimageSha256).toBe(request.postimageSha256);
        expect(input.intent.codePins).toEqual(CODE_PINS);expect(input.intent.sourcePins).toEqual(SOURCE_UNITS.map(unit=>unit.sha256));
        return { actionId: "OWNED_NATIVE_MECHANICS",
        evidenceId: input.purpose === "install" ? "OWNED_SYNTHETIC_INSTALL" : "OWNED_SYNTHETIC_OBSERVE", providerEvidenceId: "OWNED_TLS_NOT_PROVIDER_PROOF",
        purpose: input.purpose, intentSha256: sha256(canonical(input.intent)), adapterSha256: OPERATOR_SOURCE_SHA256,
        validUntilUnixMs: validUntil, custodyDirectory: custody, custodyDevice: String(info.dev), custodyInode: String(info.ino) }; },
      targetSecret: async () => ({ ...request.target, providerEvidenceId: "OWNED_TLS_NOT_PROVIDER_PROOF", host: "127.0.0.1", port,
        database: "request_intent_disposable", user: "postgres", password, ca }) };
    return { request, intent, custody, password, bindings, adapter: createNoMailOperatorAdapter(bindings)!, capture, ordinary, oldRows, before, after,
      query:(sql:string)=>pool!.query(sql), cleanup };
  } catch (error) { await cleanup(); throw error; }
}

pgIt("ownedTLS17: actual dedicated Client identity, native transaction wire states and immutable journals", async () => {
  const f = await fixture(), abort = new AbortController(), timer = setTimeout(() => abort.abort(), 20000); let c: NoMailConnection | undefined;
  try {
    await f.adapter.operator.authorizeAndReserve(f.intent, abort.signal); c = await f.adapter.operator.openFreshConnection(f.intent, abort.signal);
    const saved = JSON.parse(await readFile(join(f.custody, "no-mail-install-once/connection.json"), "utf8"));
    const identity = await c.query("select pg_backend_pid() as pid,current_user,session_user,(select oid<>10 from pg_roles where rolname=current_user) as not_bootstrap");
    expect(identity.wire).toBe("I"); expect(identity.rows[0]).toMatchObject({ pid: saved.payload.pid, current_user: "postgres", session_user: "postgres", not_bootstrap: true });
    const begun = await c.query("BEGIN"); expect(begun.wire).toBe("T"); expect(begun.backendPid).toBe(identity.backendPid);
    await expect(c.query("select 1/0")).rejects.toMatchObject({ code: "22012" });
    const ended = await c.query("ROLLBACK"); expect(ended.commands).toEqual(["ROLLBACK"]); expect(ended.wire).toBe("I");
    const receipt: InstallReceipt = { executionId: f.intent.executionId, intentSha256: sha256(canonical(f.intent)), outcome: "refused", replayAllowed: false,
      phase: "prepared_journal", commitSent: false, commitAcknowledged: false, pid: identity.backendPid, backendStart: saved.payload.backendStart,
      actualPreimageSha256: f.intent.preimageSha256, actualPostimageSha256: f.intent.postimageSha256,
      ordinaryBeforeSha256: "c".repeat(64), ordinaryAfterSha256: "c".repeat(64), unarmedVerified: true,
      preparedJournal: null, finalJournal: null, sqlState: null, observations: [] };
    // Explicit synthetic receipt projection tests journal mechanics only; this
    // is NOT runNoMailInstall, reviewed-image or installed-unarmed evidence.
    receipt.preparedJournal = await f.adapter.operator.journal("prepared", receipt, abort.signal);
    await c.query("BEGIN"); expect((await c.query("COMMIT")).commands).toEqual(["COMMIT"]);
    const final: InstallReceipt = { ...receipt, phase: "final_journal", commitSent: true, commitAcknowledged: true, outcome: "committed_verified_unarmed" };
    const finalRef = await f.adapter.operator.journal("final", final, abort.signal); expect(finalRef).toMatch(/^journal_[a-f0-9]{64}$/);
    await expect(f.adapter.operator.journal("final", final, abort.signal)).rejects.toThrow();
    await expect(f.adapter.operator.openFreshConnection(f.intent, abort.signal)).rejects.toThrow();
    const bytes = (await Promise.all((await readdir(join(f.custody, "no-mail-install-once"))).map(name => readFile(join(f.custody, "no-mail-install-once", name), "utf8")))).join("\n");
    expect(bytes).not.toContain(f.password); expect(bytes).not.toContain("BEGIN CERTIFICATE"); expect(bytes).not.toContain("host");
  } finally { c?.destroy(); abort.abort(); clearTimeout(timer); await f.cleanup(); }
}, 60000);

pgIt("ownedTLS17: a new observer is read-only/independent and cannot reopen the spent writer after uncertainty", async () => {
  const f = await fixture(), abort = new AbortController(), timer = setTimeout(() => abort.abort(), 20000); let writer: NoMailConnection | undefined;
  let observer: NoMailConnection | undefined;
  try {
    await f.adapter.operator.authorizeAndReserve(f.intent, abort.signal); writer = await f.adapter.operator.openFreshConnection(f.intent, abort.signal);
    const row = JSON.parse(await readFile(join(f.custody, "no-mail-install-once/connection.json"), "utf8")).payload;
    await writer.query("BEGIN"); writer.destroy(); writer = undefined;
    const unknown: InstallReceipt = { executionId: f.intent.executionId, intentSha256: sha256(canonical(f.intent)), outcome: "cleanup_unverified", replayAllowed: false,
      phase: "locks", commitSent: false, commitAcknowledged: false, pid: row.pid, backendStart: row.backendStart,
      actualPreimageSha256: null, actualPostimageSha256: null, ordinaryBeforeSha256: null, ordinaryAfterSha256: null,
      unarmedVerified: false, preparedJournal: null, finalJournal: null, sqlState: null, observations: [] };
    const restarted = createNoMailOperatorAdapter(f.bindings)!;
    observer = await restarted.observer.openForRecordedIntent(f.request, unknown, abort.signal);
    const own = await observer.query("select pg_backend_pid() as pid,current_setting('default_transaction_read_only') as readonly");
    expect(own.wire).toBe("I"); expect(own.backendPid).not.toBe(row.pid); expect(own.rows[0].readonly).toBe("on");
    await expect(observer.query("create table public.owned_must_not_exist(id integer)")).rejects.toMatchObject({ code: "25006" });
    await expect(restarted.operator.authorizeAndReserve(f.intent, abort.signal)).rejects.toThrow();
    await expect(restarted.operator.openFreshConnection(f.intent, abort.signal)).rejects.toThrow("no_local_reservation");
    await expect(restarted.observer.openForRecordedIntent(f.request, unknown, abort.signal)).rejects.toThrow();
    expect((await readdir(join(f.custody, "no-mail-install-once"))).sort()).toEqual(["connection.json", "observer-connection.json", "observer-opening.json", "opening.json", "reservation.json"]);
  } finally { observer?.destroy(); writer?.destroy(); abort.abort(); clearTimeout(timer); await f.cleanup(); }
}, 60000);


pgIt("ownedTLS17: actual COMMIT socket cut retains unknown and durable prepared evidence without replay", async () => {
  const f = await fixture(), abort = new AbortController(), timer = setTimeout(() => abort.abort(), 20000); let writer: NoMailConnection | undefined;
  let observer: NoMailConnection | undefined;
  try {
    await f.adapter.operator.authorizeAndReserve(f.intent, abort.signal); writer = await f.adapter.operator.openFreshConnection(f.intent, abort.signal);
    const row = JSON.parse(await readFile(join(f.custody, "no-mail-install-once/connection.json"), "utf8")).payload;
    await writer.query("BEGIN"); await writer.query("create table public.owned_commit_boundary(id integer)");
    const receipt: InstallReceipt = { executionId: f.intent.executionId, intentSha256: sha256(canonical(f.intent)), outcome: "refused", replayAllowed: false,
      phase: "prepared_journal", commitSent: false, commitAcknowledged: false, pid: row.pid, backendStart: row.backendStart,
      actualPreimageSha256: f.intent.preimageSha256, actualPostimageSha256: f.intent.postimageSha256,
      ordinaryBeforeSha256: "c".repeat(64), ordinaryAfterSha256: "c".repeat(64), unarmedVerified: true,
      preparedJournal: null, finalJournal: null, sqlState: null, observations: [] };
    // Synthetic controller projection, real native transaction/COMMIT/socket.
    receipt.preparedJournal = await f.adapter.operator.journal("prepared", receipt, abort.signal);
    const committed = writer.query("COMMIT").then(value => ({ observed: "ack" as const, value }),
      () => ({ observed: "lost" as const })); // Observe BOTH arms immediately.
    writer.destroy(); writer = undefined;
    const settled = await committed; expect(["ack", "lost"]).toContain(settled.observed);
    // Deliberately conservative lost-caller projection; no success/rollback is
    // inferred even if this owned test happened to receive an acknowledgement.
    const unknown: InstallReceipt = { ...receipt, phase: "commit", commitSent: true, commitAcknowledged: false, outcome: "commit_unknown" };
    const restarted = createNoMailOperatorAdapter(f.bindings)!;
    observer = await restarted.observer.openForRecordedIntent(f.request, unknown, abort.signal);
    const observed = await observer.query("select to_regclass('public.owned_commit_boundary') is not null as committed");
    expect(typeof observed.rows[0].committed).toBe("boolean"); // Either real outcome remains a held action, not retry clearance.
    await expect(restarted.operator.authorizeAndReserve(f.intent, abort.signal)).rejects.toThrow();
    expect((await readdir(join(f.custody, "no-mail-install-once"))).sort()).toEqual([
      "connection.json", "observer-connection.json", "observer-opening.json", "opening.json", "prepared.json", "reservation.json",
    ]);
    expect(unknown.outcome).toBe("commit_unknown"); expect(unknown.replayAllowed).toBe(false);
  } finally { observer?.destroy(); writer?.destroy(); abort.abort(); clearTimeout(timer); await f.cleanup(); }
}, 60000);


/** Full seven-unit cases: REAL canonical rows/images, native new factory and
 * filesystem journals. Only admission/provider authority is OWNED_SYNTHETIC. */
type OwnedFixture=Awaited<ReturnType<typeof fixture>>;
async function actualInstalled(f:OwnedFixture,receipt:InstallReceipt){
  expect(receipt.unarmedVerified).toBe(true);
  expect(receipt.actualPreimageSha256).toBe(f.request.preimageSha256);
  expect(receipt.actualPostimageSha256).toBe(f.request.postimageSha256);
  expect(f.oldRows).not.toBeNull();expect(receipt.ordinaryBeforeSha256).toBe(sha256(f.oldRows!));
  expect(receipt.ordinaryAfterSha256).toBe(receipt.ordinaryBeforeSha256);
  expect(canonical((await f.capture()).catalog)).toBe(canonical(f.after));
  expect(await f.ordinary()).toBe(f.oldRows);
  for(const name of NEW_RELATIONS)expect((await f.query(`select exists(select 1 from ${name} limit 1) as value`)).rows[0].value).toBe(false);
  expect((await f.query(UNARMED_SQL)).rows).toEqual([{n:1,unarmed:true}]);
  expect((await f.query("select public.request_intent_fixture_mail_guard_status() as value")).rows[0].value)
    .toMatchObject({protocol:"request-intent/fixture-no-mail/v1",ready:true});
  const connection=JSON.parse(await readFile(join(f.custody,"no-mail-install-once/connection.json"),"utf8")).payload;
  expect(receipt.pid).toBe(connection.pid);expect(receipt.backendStart).toBe(connection.backendStart);
  expect(receipt.observations.every(row=>row.pid===connection.pid)).toBe(true);
  expect(receipt.observations.some(row=>row.wire==="T"&&row.commands.includes("LOCK"))).toBe(true);
  const prepared=JSON.parse(await readFile(join(f.custody,"no-mail-install-once/prepared.json"),"utf8"));
  expect(receipt.preparedJournal).toBe("journal_"+prepared.digest);
  expect(prepared.payload.receipt.actualPreimageSha256).toBe(f.request.preimageSha256);
  expect(prepared.payload.receipt.actualPostimageSha256).toBe(f.request.postimageSha256);
}
async function observerAndNoReplay(f:OwnedFixture,receipt:InstallReceipt){
  expect(await reconcileNoMailInstall(f.request,receipt,f.adapter.observer)).toBe("postimage_unarmed_observed");
  const observer=JSON.parse(await readFile(join(f.custody,"no-mail-install-once/observer-connection.json"),"utf8")).payload;
  expect(observer.pid).not.toBe(receipt.pid);
  const replay=await runNoMailInstall(f.request,f.adapter.operator);
  expect(replay.outcome).toBe("refused");expect(replay.replayAllowed).toBe(false);expect(replay.pid).toBeNull();
  expect(canonical((await f.capture()).catalog)).toBe(canonical(f.after));expect(await f.ordinary()).toBe(f.oldRows);
  expect(await reconcileNoMailInstall(f.request,receipt,f.adapter.observer)).toBe("unresolved");
}
pgIt("ownedTLS17 full7: new native factory and durable journals commit exact UNARMED catalog and conserve ordinary rows",async()=>{
  const f=await fixture(true);
  try{
    const receipt=await runNoMailInstall(f.request,f.adapter.operator);
    expect(receipt.outcome).toBe("committed_verified_unarmed");expect(receipt.commitAcknowledged).toBe(true);
    expect(receipt.observations.at(-1)).toMatchObject({phase:"commit",wire:"I",commands:["COMMIT"]});
    await actualInstalled(f,receipt);
    const final=JSON.parse(await readFile(join(f.custody,"no-mail-install-once/final.json"),"utf8"));
    expect(receipt.finalJournal).toBe("journal_"+final.digest);
    expect(final.payload.receipt.preparedJournal).toBe(receipt.preparedJournal);
    expect(final.payload.receipt.commitAcknowledged).toBe(true);
    await observerAndNoReplay(f,receipt);
  }finally{await f.cleanup();}
},60000);
pgIt("ownedTLS17 full7: actual committed transaction with withheld ACK stays unknown, independently observed and never replayed",async()=>{
  const f=await fixture(true);let commitCalls=0;
  try{
    const operator:NoMailOperator={...f.adapter.operator,openFreshConnection:async(intent,signal)=>{
      const native=await f.adapter.operator.openFreshConnection(intent,signal);
      return{...native,query:async(sql)=>{
        const result=await native.query(sql);
        if(sql==="COMMIT"){commitCalls++;native.destroy();throw Error("owned_commit_ack_withheld_after_real_commit");}
        return result;
      }};
    }};
    const receipt=await runNoMailInstall(f.request,operator);
    expect(commitCalls).toBe(1);expect(receipt.outcome).toBe("commit_unknown");
    expect(receipt.commitSent).toBe(true);expect(receipt.commitAcknowledged).toBe(false);expect(receipt.finalJournal).toBeNull();
    await actualInstalled(f,receipt);
    expect((await readdir(join(f.custody,"no-mail-install-once"))).sort()).toEqual(["connection.json","opening.json","prepared.json","reservation.json"]);
    await observerAndNoReplay(f,receipt);
    expect(receipt.outcome).toBe("commit_unknown");expect(receipt.replayAllowed).toBe(false);
  }finally{await f.cleanup();}
},60000);
pgIt("ownedTLS17 full7: real final-file exclusion failure preserves installed UNARMED state and missing journal uncertainty",async()=>{
  const f=await fixture(true);let finals=0;
  try{
    const operator:NoMailOperator={...f.adapter.operator,journal:async(stage,receipt,signal)=>{
      if(stage==="final"){
        finals++;
        // Actual owned filesystem failure at the real adapter O_EXCL boundary,
        // not a substituted status/authority/driver response or fabricated row.
        await mkdir(join(f.custody,"no-mail-install-once/final.json"),{mode:0o700});
      }
      return f.adapter.operator.journal(stage,receipt,signal);
    }};
    const receipt=await runNoMailInstall(f.request,operator);
    expect(finals).toBe(1);expect(receipt.outcome).toBe("committed_unjournaled");
    expect(receipt.commitSent).toBe(true);expect(receipt.commitAcknowledged).toBe(true);expect(receipt.finalJournal).toBeNull();
    expect((await stat(join(f.custody,"no-mail-install-once/final.json"))).isDirectory()).toBe(true);
    await actualInstalled(f,receipt);await observerAndNoReplay(f,receipt);
    expect(receipt.outcome).toBe("committed_unjournaled");expect(receipt.replayAllowed).toBe(false);
  }finally{await f.cleanup();}
},60000);

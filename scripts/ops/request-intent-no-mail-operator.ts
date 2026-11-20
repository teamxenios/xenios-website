/** Private proposed leaf: no CLI, env/credential lookup or managed authority.
 * Exact8893 controller interfaces; genuine Root bindings remain mandatory. */
import { Client } from "pg";
import { constants } from "node:fs";
import { open, mkdir, lstat, realpath } from "node:fs/promises";
import { isAbsolute, resolve, join } from "node:path";
import { readFileSync } from "node:fs";
import {
  canonical, sha256, CODE_PINS, SOURCE_COMMIT, SOURCE_UNITS, IDENTITY_SQL, noMailPgConnection,
  type InstallIntent, type InstallRequest, type InstallReceipt, type NoMailConnection,
  type NoMailOperator, type NoMailReadOnlyObserver, type Capture,
} from "./request-intent-no-mail-install";

export const OPERATOR_SOURCE_SHA256 = sha256(readFileSync(new URL(import.meta.url)));
const protocol = "request-intent/no-mail-operator-custody/v1";
const slotName = "no-mail-install-once"; // Fixed: executionId cannot select a fresh slot.
const hex = /^[a-f0-9]{64}$/;
const opaque = /^[A-Za-z0-9_-]{8,128}$/;
const phases = ["unavailable", "authorization", "connect", "identity", "begin", "locks", "locked_preimage",
  "unit_1", "unit_2", "unit_3", "unit_4", "unit_5", "unit_6", "unit_7", "postimage", "prepared_journal", "commit", "final_journal", "complete", "rollback"];
const commands = ["SELECT", "SET", "BEGIN", "COMMIT", "ROLLBACK", "LOCK", "DO", "ALTER", "CREATE", "DROP", "GRANT", "REVOKE", "COMMENT", "INSERT", "UPDATE", "DELETE"];
const fail = (code: string): never => { throw Error("no_mail_operator_" + code); };
function need(value: unknown, code: string): asserts value { if (!value) fail(code); }
function live(signal: AbortSignal) { need(!signal.aborted, "aborted"); }
function closed(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  need(value !== null && typeof value === "object" && !Array.isArray(value), "shape");
  const actual = Reflect.ownKeys(value);
  need(actual.length === keys.length && actual.every(key => typeof key === "string" && keys.includes(key)
    && "value" in Object.getOwnPropertyDescriptor(value, key)!), "shape");
}

/** New callback TYPES only, not an implementation/boolean substitute for Root.
 * Root's real verifier must bind nonrenewable action/custody/source/provider,
 * independent images, closed consumers, DDL and data-hash scope and expiry.
 * Observe is a separately admitted read, never a renewal of install authority. */
export type RootNoMailAdmission = Readonly<{
  actionId: string; evidenceId: string; providerEvidenceId: string; purpose: "install" | "observe";
  intentSha256: string; adapterSha256: string; validUntilUnixMs: number;
  custodyDirectory: string; custodyDevice: string; custodyInode: string;
}>;
export type RootNoMailSecret = Readonly<{
  project: string; service: string; providerEvidenceId: string;
  host: string; port: number; database: string; user: "postgres"; password: string;
  ca: string; // Explicit reviewed CA; strict TLS required, no env/default fallback.
}>;
export type RootNoMailBindings = Readonly<{
  actionId: string; custodyDirectory: string;
  target: Readonly<{ project: string; service: string; expectedVersion: 170006 | 170011 }>;
  verifyAdmission(input: Readonly<{ purpose: "install" | "observe"; intent: Readonly<InstallIntent>;
    adapterSha256: string; originalReservationSha256: string | null; observerReceiptSha256: string | null }>, signal: AbortSignal): Promise<RootNoMailAdmission | null>;
  targetSecret(admission: Readonly<RootNoMailAdmission>, signal: AbortSignal): Promise<RootNoMailSecret>;
}>;
type Reservation = { actionId: string; intent: InstallIntent; intentSha256: string; adapterSha256: string;
  evidenceId: string; providerEvidenceId: string; validUntilUnixMs: number; custodyDevice: string; custodyInode: string };
type ConnectionRecord = { actionId: string; intentSha256: string; reservationSha256: string; pid: number; backendStart: string };
type Sealed = { protocol: string; payload: Record<string, unknown>; digest: string };
const names = ["reservation", "opening", "connection", "prepared", "final", "observer-opening", "observer-connection"] as const;
type Name = typeof names[number];

function strictIntent(value: Readonly<InstallIntent>): InstallIntent {
  closed(value, ["executionId", "implementationSource", "target", "expectedVersion", "wallMs", "preimageSha256", "postimageSha256", "source", "codePins", "sourcePins"]);
  closed(value.target, ["project", "service"]);
  need(typeof value.executionId === "string" && /^[A-Za-z0-9_-]{8,96}$/.test(value.executionId)
    && typeof value.implementationSource === "string" && /^[a-f0-9]{40}$/.test(value.implementationSource), "intent");
  need(typeof value.target.project === "string" && opaque.test(value.target.project)
    && typeof value.target.service === "string" && opaque.test(value.target.service), "target");
  need(value.expectedVersion === 170006 || value.expectedVersion === 170011, "version");
  need(Number.isInteger(value.wallMs) && value.wallMs >= 1000 && value.wallMs <= 60000, "wall");
  need(typeof value.preimageSha256 === "string" && hex.test(value.preimageSha256)
    && typeof value.postimageSha256 === "string" && hex.test(value.postimageSha256), "images");
  closed(value.codePins, ["capture", "controller", "lockfile"]);
  need(Array.isArray(value.sourcePins) && value.sourcePins.length === SOURCE_UNITS.length
    && value.sourcePins.every((pin, index) => typeof pin === "string" && pin === SOURCE_UNITS[index].sha256), "source");
  need(value.source === SOURCE_COMMIT && canonical(value.codePins) === canonical(CODE_PINS)
    && canonical(value.sourcePins) === canonical(SOURCE_UNITS.map(unit => unit.sha256)), "source");
  return { executionId: value.executionId, implementationSource: value.implementationSource, target: { ...value.target },
    expectedVersion: value.expectedVersion, wallMs: value.wallMs, preimageSha256: value.preimageSha256, postimageSha256: value.postimageSha256,
    source: SOURCE_COMMIT, codePins: { ...CODE_PINS }, sourcePins: SOURCE_UNITS.map(unit => unit.sha256) };
}
function fromRequest(request: Readonly<InstallRequest>): InstallIntent {
  need(sha256(canonical(request.reviewedPreimage)) === request.preimageSha256
    && sha256(canonical(request.reviewedPostimage)) === request.postimageSha256, "recorded_images");
  const { reviewedPreimage: _pre, reviewedPostimage: _post, ...rest } = request;
  return strictIntent({ ...rest, source: SOURCE_COMMIT, codePins: CODE_PINS, sourcePins: SOURCE_UNITS.map(unit => unit.sha256) });
}
function receiptProjection(value: Readonly<InstallReceipt>): InstallReceipt {
  closed(value, ["executionId", "intentSha256", "outcome", "replayAllowed", "phase", "commitSent", "commitAcknowledged", "pid", "backendStart",
    "actualPreimageSha256", "actualPostimageSha256", "ordinaryBeforeSha256", "ordinaryAfterSha256", "unarmedVerified", "preparedJournal", "finalJournal", "sqlState", "observations"]);
  need(typeof value.executionId === "string" && opaque.test(value.executionId) && typeof value.intentSha256 === "string"
    && hex.test(value.intentSha256) && value.replayAllowed === false, "receipt");
  need(["unavailable", "refused", "rolled_back_verified", "cleanup_unverified", "commit_unknown", "committed_verified_unarmed", "committed_unjournaled"].includes(value.outcome)
    && typeof value.phase === "string" && phases.includes(value.phase), "receipt_state");
  need(typeof value.commitSent === "boolean" && typeof value.commitAcknowledged === "boolean"
    && (!value.commitAcknowledged || value.commitSent) && typeof value.unarmedVerified === "boolean", "receipt_flags");
  need(Number.isInteger(value.pid) && Number(value.pid) > 0 && typeof value.backendStart === "string"
    && /^\d{4}-\d\d-\d\dT[0-9:.]+Z$/.test(value.backendStart), "receipt_backend");
  for (const digest of [value.actualPreimageSha256, value.actualPostimageSha256, value.ordinaryBeforeSha256, value.ordinaryAfterSha256])
    need(digest === null || typeof digest === "string" && hex.test(digest), "receipt_digest");
  for (const ref of [value.preparedJournal, value.finalJournal]) need(ref === null || typeof ref === "string" && /^journal_[a-f0-9]{64}$/.test(ref), "journal_reference");
  need(value.sqlState === null || typeof value.sqlState === "string" && /^[0-9A-Z]{5}$/.test(value.sqlState), "sqlstate");
  need(Array.isArray(value.observations) && value.observations.length <= 512, "observations");
  for (const row of value.observations) {
    closed(row, ["phase", "pid", "wire", "commands"]);
    need(typeof row.phase === "string" && phases.includes(row.phase) && Number.isInteger(row.pid) && row.pid === value.pid
      && ["I", "T", "E"].includes(row.wire) && Array.isArray(row.commands) && row.commands.length <= 256
      && row.commands.every(tag => typeof tag === "string" && commands.includes(tag)), "observation");
  }
  return { ...value, observations: value.observations.map(row => ({ phase: row.phase, pid: row.pid, wire: row.wire, commands: [...row.commands] })) };
}

/** POSIX fsync durability, exact realpath/device/inode and owner-only custody.
 * Unsupported directory fsync (including Windows) FAILS CLOSED. No fallback,
 * mkdir-recursive root, alternate slot, overwrite, release, unlink or retry. */
class Custody {
  constructor(readonly root: string, readonly admission: RootNoMailAdmission) {}
  async directory(path: string, signal: AbortSignal) {
    live(signal); need(process.platform !== "win32", "directory_fsync_unavailable");
    need(isAbsolute(path) && resolve(path) === await realpath(path), "canonical_custody_path");
    const st = await lstat(path, { bigint: true });
    need(st.isDirectory() && !st.isSymbolicLink() && (Number(st.mode) & 0o077) === 0
      && (typeof process.getuid !== "function" || st.uid === BigInt(process.getuid())), "custody_permissions");
    live(signal); return st;
  }
  async rootCheck(signal: AbortSignal) {
    const st = await this.directory(this.root, signal);
    need(String(st.dev) === this.admission.custodyDevice && String(st.ino) === this.admission.custodyInode, "custody_identity");
  }
  async sync(path: string, signal: AbortSignal) {
    live(signal); const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await handle.sync(); } finally { await handle.close(); } live(signal);
  }
  async reserve(signal: AbortSignal) {
    await this.rootCheck(signal); await mkdir(join(this.root, slotName), { mode: 0o700 });
    // Even a later failed/partial record leaves this durable, permanently spent slot.
    await this.sync(this.root, signal);
  }
  async slot(signal: AbortSignal) {
    await this.rootCheck(signal); await this.directory(join(this.root, slotName), signal);
  }
  async put(name: Name, payload: Record<string, unknown>, signal: AbortSignal): Promise<string> {
    need(names.includes(name), "record_name"); await this.slot(signal);
    const record: Sealed = { protocol, payload, digest: sha256(canonical({ protocol, payload })) };
    const bytes = Buffer.from(canonical(record) + "\n"); need(bytes.length <= 262144, "record_bound");
    const handle = await open(join(this.root, slotName, name + ".json"), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await this.sync(join(this.root, slotName), signal); return record.digest;
  }
  async get(name: Name, signal: AbortSignal): Promise<Sealed> {
    await this.slot(signal); live(signal);
    const handle = await open(join(this.root, slotName, name + ".json"), constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes: Buffer;
    try {
      const st = await handle.stat(); need(st.isFile() && st.nlink === 1 && st.size <= 262144 && (st.mode & 0o077) === 0
        && (typeof process.getuid !== "function" || st.uid === process.getuid()), "record_permissions");
      bytes = await handle.readFile();
    } finally { await handle.close(); }
    live(signal); const value: unknown = JSON.parse(bytes.toString("utf8")); closed(value, ["protocol", "payload", "digest"]);
    need(value.protocol === protocol && typeof value.digest === "string" && hex.test(value.digest)
      && value.digest === sha256(canonical({ protocol: value.protocol, payload: value.payload })), "record_integrity");
    return value as unknown as Sealed;
  }
}

/** Returns unavailable before custody/native/secret I/O when Root callbacks are absent. */
export function createNoMailOperatorAdapter(bindings?: RootNoMailBindings | null):
  Readonly<{ operator: NoMailOperator; observer: NoMailReadOnlyObserver }> | undefined {
  if (!bindings || typeof bindings.verifyAdmission !== "function" || typeof bindings.targetSecret !== "function"
    || typeof bindings.custodyDirectory !== "string" || !isAbsolute(bindings.custodyDirectory) || !opaque.test(bindings.actionId)) return undefined;
  const b = bindings, root = b.custodyDirectory, actionId = b.actionId, target = Object.freeze({ ...b.target });
  const verifyAdmission = b.verifyAdmission.bind(b), targetSecret = b.targetSecret.bind(b);
  let local: { intent: InstallIntent; reservation: Reservation; digest: string; admission: RootNoMailAdmission; custody: Custody } | undefined;
  async function admitted(purpose: "install" | "observe", intent: InstallIntent, original: string | null, signal: AbortSignal, observerReceiptSha256: string | null = null) {
    live(signal); const hash = sha256(canonical(intent));
    need(intent.target.project === target.project && intent.target.service === target.service && intent.expectedVersion === target.expectedVersion, "target_pin");
    let a: RootNoMailAdmission | null;
    try { a = await verifyAdmission(Object.freeze({ purpose, intent: Object.freeze(structuredClone(intent)), adapterSha256: OPERATOR_SOURCE_SHA256,
      originalReservationSha256: original, observerReceiptSha256 }), signal); } catch { fail("admission_unavailable"); }
    live(signal);
    closed(a, ["actionId", "evidenceId", "providerEvidenceId", "purpose", "intentSha256", "adapterSha256", "validUntilUnixMs", "custodyDirectory", "custodyDevice", "custodyInode"]);
    need(a && a.purpose === purpose && a.actionId === actionId && typeof a.evidenceId === "string" && opaque.test(a.evidenceId)
      && typeof a.providerEvidenceId === "string" && opaque.test(a.providerEvidenceId)
      && a.intentSha256 === hash && a.adapterSha256 === OPERATOR_SOURCE_SHA256 && a.custodyDirectory === root
      && typeof a.custodyDevice === "string" && /^[0-9]+$/.test(a.custodyDevice)
      && typeof a.custodyInode === "string" && /^[0-9]+$/.test(a.custodyInode)
      && Number.isSafeInteger(a.validUntilUnixMs) && a.validUntilUnixMs >= Date.now() + (purpose === "install" ? intent.wallMs : 6000), "admission_unavailable");
    return structuredClone(a);
  }
  async function native(intent: InstallIntent, admission: RootNoMailAdmission, purpose: "install" | "observe", signal: AbortSignal) {
    live(signal); let secret: RootNoMailSecret;
    try { secret = await targetSecret(Object.freeze(admission), signal); } catch { fail("secret_port_unavailable"); }
    live(signal);
    closed(secret, ["project", "service", "providerEvidenceId", "host", "port", "database", "user", "password", "ca"]);
    need(secret.project === intent.target.project && secret.service === intent.target.service && secret.providerEvidenceId === admission.providerEvidenceId
      && typeof secret.host === "string" && /^[a-zA-Z0-9.:-]{1,253}$/.test(secret.host) && Number.isInteger(secret.port) && secret.port > 0 && secret.port <= 65535
      && typeof secret.database === "string" && /^[a-zA-Z0-9_]{1,63}$/.test(secret.database) && secret.user === "postgres"
      && typeof secret.password === "string" && secret.password.length > 0 && typeof secret.ca === "string" && secret.ca.length > 0, "secret_port_unavailable");
    const left = Math.min(8000, admission.validUntilUnixMs - Date.now()); need(left > 0, "expiry");
    const client = new Client({ host: secret.host, port: secret.port, database: secret.database, user: secret.user, password: secret.password,
      ssl: { rejectUnauthorized: true, ca: secret.ca }, connectionTimeoutMillis: left, query_timeout: 0,
      statement_timeout: purpose === "install" ? 30000 : 5000, lock_timeout: 5000,
      idle_in_transaction_session_timeout: purpose === "install" ? 5000 : 3000,
      options: "-c transaction_timeout=" + (purpose === "install" ? "40000" : "5000")
        + " -c search_path=pg_catalog -c timezone=UTC -c default_transaction_read_only=" + (purpose === "observe" ? "on" : "off"),
      application_name: purpose === "install" ? "xenios-no-mail-install" : "xenios-no-mail-observer" });
    type Transport = { connection?: { stream?: { destroy(): void } } };
    const transport = client as unknown as Transport;
    const destroy = () => { transport.connection?.stream?.destroy(); };
    client.on("error", () => undefined); signal.addEventListener("abort", destroy, { once: true });
    try {
      need(transport.connection?.stream?.destroy, "owned_transport"); live(signal);
      await client.connect(); live(signal);
      const base = noMailPgConnection(client);
      const q = await base.query(IDENTITY_SQL); live(signal);
      const i = q.rows[0]?.identity as Capture["identity"];
      need(q.wire === "I" && q.backendPid === i?.pid && i.version === intent.expectedVersion && i.role === "none"
        && i.sessionUser === "postgres" && i.currentUser === "postgres" && i.superuser === false && i.bypassRls === true
        && i.transactionMs > 0 && i.transactionMs <= (purpose === "install" ? 40000 : 5000)
        && i.statementMs > 0 && i.statementMs <= (purpose === "install" ? 30000 : 5000)
        && i.idleMs > 0 && i.idleMs <= (purpose === "install" ? 5000 : 3000) && i.lockMs > 0 && i.lockMs <= 5000, "native_actor_or_caps");
      need(/^\d{4}-\d\d-\d\dT[0-9:.]+Z$/.test(i.backendStart), "backend_start");
      const readOnly = await base.query("select pg_catalog.current_setting('default_transaction_read_only') as value");
      need(readOnly.wire === "I" && readOnly.backendPid === i.pid && readOnly.rows[0]?.value === (purpose === "observe" ? "on" : "off"), "native_read_scope");
      return { identity: i, connection: { ...base, destroy: () => { signal.removeEventListener("abort", destroy); base.destroy(); },
        close: async () => { try { await base.close(); } finally { signal.removeEventListener("abort", destroy); } } } satisfies NoMailConnection };
    } catch {
      destroy(); signal.removeEventListener("abort", destroy); void client.end().catch(() => undefined); fail("native_unavailable");
    }
  }
  async function recorded(custody: Custody, intent: InstallIntent, signal: AbortSignal) {
    const seal = await custody.get("reservation", signal), r = seal.payload;
    closed(r, ["actionId", "intent", "intentSha256", "adapterSha256", "evidenceId", "providerEvidenceId", "validUntilUnixMs", "custodyDevice", "custodyInode"]);
    need(r.actionId === actionId && r.adapterSha256 === OPERATOR_SOURCE_SHA256 && r.intentSha256 === sha256(canonical(intent))
      && canonical(strictIntent(r.intent as InstallIntent)) === canonical(intent), "reservation_binding");
    return { value: r as unknown as Reservation, digest: seal.digest };
  }
  async function connectionRecord(custody: Custody, intent: InstallIntent, digest: string, signal: AbortSignal) {
    const c = (await custody.get("connection", signal)).payload;
    closed(c, ["actionId", "intentSha256", "reservationSha256", "pid", "backendStart"]);
    need(c.actionId === actionId && c.intentSha256 === sha256(canonical(intent)) && c.reservationSha256 === digest
      && Number.isInteger(c.pid) && Number(c.pid) > 0 && typeof c.backendStart === "string" && /^\d{4}-\d\d-\d\dT[0-9:.]+Z$/.test(c.backendStart), "connection_binding");
    return c as unknown as ConnectionRecord;
  }
  const operator: NoMailOperator = {
    authorizeAndReserve: async (raw, signal) => {
      const intent = strictIntent(raw), admission = await admitted("install", intent, null, signal), custody = new Custody(root, admission);
      await custody.reserve(signal);
      const reservation: Reservation = { actionId: actionId, intent, intentSha256: sha256(canonical(intent)), adapterSha256: OPERATOR_SOURCE_SHA256,
        evidenceId: admission.evidenceId, providerEvidenceId: admission.providerEvidenceId, validUntilUnixMs: admission.validUntilUnixMs,
        custodyDevice: admission.custodyDevice, custodyInode: admission.custodyInode };
      const digest = await custody.put("reservation", reservation, signal);
      local = { intent, reservation, digest, admission, custody };
      return { intentSha256: reservation.intentSha256, evidenceId: admission.evidenceId, validUntilUnixMs: admission.validUntilUnixMs };
    },
    openFreshConnection: async (raw, signal) => {
      const intent = strictIntent(raw); need(local && canonical(local.intent) === canonical(intent), "no_local_reservation");
      const { custody, digest, reservation } = local; await recorded(custody, intent, signal);
      const admission = await admitted("install", intent, digest, signal);
      need(admission.evidenceId === reservation.evidenceId && admission.providerEvidenceId === reservation.providerEvidenceId
        && admission.validUntilUnixMs === reservation.validUntilUnixMs, "authority_renewal_refused");
      await custody.put("opening", { actionId: actionId, intentSha256: reservation.intentSha256, reservationSha256: digest }, signal);
      const n = await native(intent, admission, "install", signal);
      try {
        await custody.put("connection", { actionId: actionId, intentSha256: reservation.intentSha256, reservationSha256: digest,
          pid: n.identity.pid, backendStart: n.identity.backendStart }, signal);
        live(signal); return n.connection;
      } catch { n.connection.destroy(); fail("connection_record_unavailable"); }
    },
    journal: async (stage, raw, signal) => {
      need(stage === "prepared" || stage === "final", "journal_stage");
      need(local, "no_local_reservation"); const { custody, intent, digest } = local, receipt = receiptProjection(raw);
      await recorded(custody, intent, signal); const connection = await connectionRecord(custody, intent, digest, signal);
      need(receipt.executionId === intent.executionId && receipt.intentSha256 === sha256(canonical(intent)) && receipt.pid === connection.pid
        && receipt.backendStart === connection.backendStart && receipt.unarmedVerified && receipt.actualPreimageSha256 === intent.preimageSha256
        && receipt.actualPostimageSha256 === intent.postimageSha256 && receipt.ordinaryBeforeSha256 !== null
        && receipt.ordinaryBeforeSha256 === receipt.ordinaryAfterSha256, "journal_receipt_binding");
      if (stage === "prepared") need(receipt.phase === "prepared_journal" && !receipt.commitSent && !receipt.commitAcknowledged
        && receipt.preparedJournal === null && receipt.finalJournal === null, "prepared_state");
      else {
        const prepared = await custody.get("prepared", signal);
        need(receipt.phase === "final_journal" && receipt.commitSent && receipt.commitAcknowledged
          && receipt.outcome === "committed_verified_unarmed" && receipt.finalJournal === null
          && receipt.preparedJournal === "journal_" + prepared.digest, "final_state");
      }
      const record = await custody.put(stage, { actionId: actionId, intentSha256: receipt.intentSha256, reservationSha256: digest,
        receipt }, signal); return "journal_" + record;
    },
  };
  const observer: NoMailReadOnlyObserver = { openForRecordedIntent: async (request, rawReceipt, signal) => {
    const intent = fromRequest(request), receipt = receiptProjection(rawReceipt);
    const admission = await admitted("observe", intent, null, signal, sha256(canonical(receipt))), custody = new Custody(root, admission);
    const r = await recorded(custody, intent, signal), c = await connectionRecord(custody, intent, r.digest, signal);
    need(receipt.executionId === intent.executionId && receipt.intentSha256 === sha256(canonical(intent)) && receipt.pid === c.pid
      && receipt.backendStart === c.backendStart && r.value.providerEvidenceId === admission.providerEvidenceId, "observer_original_binding");
    // Genuine observation authorization is bound AGAIN to the durable original.
    const bound = await admitted("observe", intent, r.digest, signal, sha256(canonical(receipt)));
    need(canonical(bound) === canonical(admission), "observer_admission_changed");
    if (receipt.commitSent) {
      const prepared = await custody.get("prepared", signal);
      need(prepared.payload.actionId === actionId && prepared.payload.intentSha256 === receipt.intentSha256
        && prepared.payload.reservationSha256 === r.digest && receipt.preparedJournal === "journal_" + prepared.digest, "missing_precommit_journal");
    }
    if (receipt.finalJournal !== null) {
      const final = await custody.get("final", signal);
      need(final.payload.actionId === actionId && final.payload.intentSha256 === receipt.intentSha256
        && final.payload.reservationSha256 === r.digest && receipt.finalJournal === "journal_" + final.digest, "missing_final_journal");
    }
    await custody.put("observer-opening", { actionId: actionId, intentSha256: receipt.intentSha256, reservationSha256: r.digest }, signal);
    const n = await native(intent, bound, "observe", signal);
    try {
      need(n.identity.pid !== c.pid, "observer_not_independent");
      await custody.put("observer-connection", { actionId: actionId, intentSha256: receipt.intentSha256, reservationSha256: r.digest,
        pid: n.identity.pid, backendStart: n.identity.backendStart }, signal);
      live(signal); return n.connection;
    } catch { n.connection.destroy(); fail("observer_record_unavailable"); }
  } };
  return Object.freeze({ operator, observer });
}

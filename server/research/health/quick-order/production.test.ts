import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import { createQuickOrderHandler, submissionHash, type QuickOrderHttpRequest } from "./handler.mjs";
import { attributionSnapshot, estimate, validateSubmission } from "./core.mjs";
import { createQuickOrderTransactionExtension, QUICK_ORDER_COMMIT_RPC, QUICK_ORDER_REPLAY_RPC, type QuickOrderCandidateDependencies, type QuickOrderCandidateRpcResult } from "../../assisted-order/quick-order-repository";
import type { AssistedOrderViewer } from "../../assisted-order/ports";
import { createQuickOrderProductionPorts, type QuickOrderProductionWiring } from "./production";
import { quickOrderAgreements } from "./legal";
import { assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments } from "../../../../shared/research/assisted-order/form";
import { publishedResearchUsePolicyAgreement } from "../../policies-data";
import type { CommitArguments, QuickOrderDisabledTransactionExtension, QuickOrderPorts, QuickOrderPrivateContext } from "./ports";

vi.mock("../../rate-limit", () => ({ rateLimitHit: vi.fn(async () => true), requestIp: () => "127.0.0.1" }));
const viewer: AssistedOrderViewer = {
  actorType: "member", memberId: "member-synthetic", authUserId: "00000000-0000-4000-8000-000000000001",
  earlyAccessSessionHash: null, normalizedEmail: "synthetic@example.test",
  capabilities: new Set(["assisted_orders:submit"]),
};
const pair = publishedResearchUsePolicyAgreement()!;
const config = { enabled: true, code: null, formId: "assisted_order_form_v1", requiredAgreements: [pair], formAcknowledgments: [] } as const;
function fixture(overrides: Partial<QuickOrderProductionWiring> = {}) {
  const wiring: QuickOrderProductionWiring = {
    viewers: { customer: vi.fn(async () => viewer) },
    enteredAtMonotonicMsFor: () => null,
    service: { config: vi.fn(async () => config) },
    catalog: { listCatalog: vi.fn(), resolveItem: vi.fn() },
    csrfSecret: "synthetic-only-test-secret-with-32-bytes",
    approvedHealthAgreementPairs: [], assistedOrderExtension: null,
    ...overrides,
  };
  return { wiring, ports: createQuickOrderProductionPorts(wiring) };
}
const request = (bearer = "synthetic-session-a") => ({ headers: { authorization: `Bearer ${bearer}` }, method: "GET" }) as Request;

describe("Quick Order concrete canonical bindings", () => {
  it("cannot activate through a readiness flag or existing bridge legal set", async () => {
    const { ports } = fixture({ approvedHealthAgreementPairs: [pair] });
    const session = (await ports.session(request()))!;
    expect(ports.productionReady).toBe(false);
    expect((await ports.config(session)).enabled).toBe(false);
    await expect(ports.commit(session, {} as never)).rejects.toThrow("not qualified");
    await expect(ports.getExisting(session, "synthetic-key-0001")).rejects.toThrow("replay unavailable");
  });
  it("uses canonical actor identity and scopes CSRF to the verified session", async () => {
    const { ports } = fixture();
    const a = (await ports.session(request()))!;
    const b = (await ports.session(request("synthetic-session-b")))!;
    expect(a.actorId).toBe(`member:${viewer.authUserId}`);
    expect(a.actorId).toBe(b.actorId);
    expect(a.csrfToken).not.toBe(b.csrfToken);
    expect(a.csrfToken).toBe((await ports.session(request()))!.csrfToken);
    await expect(ports.config({ ...a })).rejects.toThrow("session unavailable");
  });
  it("refuses missing credentials, guest identity, capability or signing secret", async () => {
    expect(await fixture().ports.session({ headers: {}, method: "GET" } as Request)).toBeNull();
    expect(await fixture({ csrfSecret: null }).ports.session(request())).toBeNull();
    const anonymous = { ...viewer, actorType: "early_access_session" as const, memberId: null, authUserId: null, capabilities: new Set<never>() };
    expect(await fixture({ viewers: { customer: async () => anonymous } }).ports.session(request())).toBeNull();
  });
  it("passes the canonical viewer to catalog and actor-scoped receipt recovery", async () => {
    const getExisting = vi.fn(async () => null);
    const { ports, wiring } = fixture({ assistedOrderExtension: { getExisting, commit: vi.fn() } });
    const session = (await ports.session(request()))!;
    const query = { page: 2, pageSize: 24, search: "synthetic" };
    await ports.listCatalog(session, query);
    expect(wiring.catalog.listCatalog).toHaveBeenCalledWith(viewer, query);
    await ports.getExisting(session, "synthetic-key-0001");
    expect(getExisting).toHaveBeenCalledWith(viewer, session.actorId, "synthetic-key-0001");
  });
  it("requires separate Health legal applicability and reuses canonical acknowledgment bytes", () => {
    expect(quickOrderAgreements(config, [])).toBeNull();
    expect(quickOrderAgreements({ ...config, requiredAgreements: [{ kind: "demo_terms", version: "v1" }] }, [{ kind: "demo_terms", version: "v1" }])).toBeNull();
    const agreements = quickOrderAgreements(config, [pair])!;
    expect(agreements[0]).toMatchObject({ ...pair, type: "legal", url: "/research/policies/research-use" });
    for (const ack of requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: false })) {
      expect(agreements).toContainEqual({ ...assistedOrderFormPair(ack), label: ack.copy, url: null, type: "form_acknowledgment" });
    }
  });
});

// AUTHORED / NOT RUN. Injected clock, transport and resolver controls; no Auth,
// root WeakMap, installed timers, database, cancellation or deployment proof.
const HASH = "a".repeat(64), KEY = "synthetic-key-0001";
function stubCandidate() {
  const beginAttempt = vi.fn((_viewer: AssistedOrderViewer, _actorId: string, enteredAtMonotonicMs: number) => Object.freeze({ enteredAtMonotonicMs }));
  const candidate: QuickOrderDisabledTransactionExtension = {
    monotonicNow: vi.fn(() => 100), beginAttempt,
    commitAttempt: vi.fn(async () => { throw new Error("synthetic uncertain outcome"); }),
    getExisting: vi.fn(async () => null), commit: vi.fn(),
  };
  return { candidate, beginAttempt };
}
const boundArgs = (key = KEY, payloadHash = HASH) => ({ input: { idempotencyKey: key }, payloadHash }) as CommitArguments;

describe("Original entry stamp and single-use adapter admission (source controls only)", () => {
  it("retains the root stamp across delayed auth, deduplicates the request, and recovers before begin", async () => {
    const events: string[] = [], f = stubCandidate();
    let clock = 100;
    f.candidate.monotonicNow = () => clock;
    f.candidate.getExisting = vi.fn(async () => { events.push("recovery"); clock = 500; return null; });
    f.beginAttempt.mockImplementation((_v, _a, stamp) => { events.push("begin"); return { enteredAtMonotonicMs: stamp }; });
    const entry = vi.fn(() => 10);
    const customer = vi.fn(async () => { events.push("auth"); clock = 350; return viewer; });
    const { ports } = fixture({ assistedOrderExtension: f.candidate, enteredAtMonotonicMsFor: entry, viewers: { customer } });
    const req = request();
    const [a, b] = await Promise.all([ports.session(req), ports.session(req)]);
    expect(a).toBe(b);
    expect(entry).toHaveBeenCalledOnce();
    expect(entry).toHaveBeenCalledWith(req);
    expect(customer).toHaveBeenCalledOnce();
    expect(f.beginAttempt).not.toHaveBeenCalled();
    await ports.getExisting(a!, KEY, HASH);
    expect(events).toEqual(["auth", "recovery", "begin"]);
    expect(f.beginAttempt).toHaveBeenCalledWith(viewer, a!.actorId, 10);
    expect(Object.keys(a!).sort()).toEqual(["actorId", "csrfToken"]);
    expect(Object.isFrozen(a)).toBe(true);
    expect(ports.productionReady).toBe(false);
    expect((await ports.config(a!)).enabled).toBe(false);
    await expect(ports.commit(a!, boundArgs())).rejects.toThrow("synthetic uncertain outcome");
    await ports.getExisting(a!, KEY, HASH);
    await expect(ports.commit(a!, boundArgs())).rejects.toThrow("not qualified");
    expect(f.beginAttempt).toHaveBeenCalledOnce();
    expect(f.candidate.commitAttempt).toHaveBeenCalledOnce();
    expect(f.candidate.commit).not.toHaveBeenCalled();
  });

  it.each([null, -1, Number.NaN, Number.POSITIVE_INFINITY, 101])("refuses new admission with invalid/missing/future stamp %s while retaining receipt recovery", async stamp => {
    const f = stubCandidate();
    const { ports } = fixture({ assistedOrderExtension: f.candidate, enteredAtMonotonicMsFor: () => stamp });
    const session = (await ports.session(request()))!;
    await ports.getExisting(session, KEY, HASH);
    await expect(ports.commit(session, boundArgs())).rejects.toThrow("not qualified");
    expect(f.beginAttempt).not.toHaveBeenCalled();
    const saved = { payloadHash: HASH, publicReceipt: publicReceipt() };
    vi.mocked(f.candidate.getExisting).mockResolvedValue(saved);
    await expect(ports.getExisting(session, KEY, HASH)).resolves.toEqual(saved);
    expect(f.candidate.commitAttempt).not.toHaveBeenCalled();
  });

  it("does not replace a failed timestamp lookup or failed/backward clock with now", async () => {
    for (const mode of ["missing-reader", "reader-throws", "clock-throws", "clock-backwards"] as const) {
      const f = stubCandidate();
      if (mode === "clock-throws") f.candidate.monotonicNow = () => { throw new Error("clock unavailable"); };
      const { ports } = fixture({ assistedOrderExtension: f.candidate,
        enteredAtMonotonicMsFor: mode === "missing-reader" ? undefined as never : () => {
          if (mode === "reader-throws") throw new Error("entry unavailable"); return 50;
        } });
      const session = (await ports.session(request()))!;
      if (mode === "clock-backwards") f.candidate.monotonicNow = () => 49;
      await ports.getExisting(session, KEY, HASH);
      await expect(ports.commit(session, boundArgs())).rejects.toThrow("not qualified");
      expect(f.beginAttempt).not.toHaveBeenCalled();
    }
  });

  it("receipt hits, malformed/failed lookups and recovery-only calls never mint an attempt", async () => {
    for (const result of ["hit", "undefined", "throws", "read-only"] as const) {
      const f = stubCandidate();
      f.candidate.getExisting = vi.fn(async () => {
        if (result === "throws") throw new Error("recovery unavailable");
        if (result === "undefined") return undefined as never;
        return result === "hit" ? { payloadHash: HASH, publicReceipt: publicReceipt() } : null;
      });
      const { ports } = fixture({ assistedOrderExtension: f.candidate, enteredAtMonotonicMsFor: () => 10 });
      const session = (await ports.session(request()))!;
      const read = ports.getExisting(session, KEY, result === "read-only" ? undefined : HASH);
      if (result === "throws" || result === "undefined") await expect(read).rejects.toThrow(); else await read;
      f.candidate.getExisting = vi.fn(async () => null);
      await ports.getExisting(session, KEY, HASH);
      await expect(ports.commit(session, boundArgs())).rejects.toThrow("not qualified");
      expect(f.beginAttempt).not.toHaveBeenCalled();
    }
  });

  it.each(["changed-key", "changed-hash", "cloned-session", "another-session"] as const)("refuses %s without sending and cannot rearm the consumed attempt", async variant => {
    const f = stubCandidate();
    const { ports } = fixture({ assistedOrderExtension: f.candidate, enteredAtMonotonicMsFor: () => 10 });
    const session = (await ports.session(request()))!;
    await ports.getExisting(session, KEY, HASH);
    const other = variant === "cloned-session" ? { ...session } : variant === "another-session" ? (await ports.session(request()))! : session;
    await expect(ports.commit(other, boundArgs(variant === "changed-key" ? "another-key-0001" : KEY, variant === "changed-hash" ? "b".repeat(64) : HASH))).rejects.toThrow();
    expect(f.candidate.commitAttempt).not.toHaveBeenCalled();
    if (other === session) {
      await ports.getExisting(session, KEY, HASH);
      await expect(ports.commit(session, boundArgs())).rejects.toThrow("not qualified");
    }
    expect(f.beginAttempt).toHaveBeenCalledOnce();
  });

  it("cannot mint an attempt after a premature refused commit while recovery is pending", async () => {
    const f = stubCandidate(); let finish!: (value: null) => void;
    f.candidate.getExisting = vi.fn(() => new Promise<null>(resolve => { finish = resolve; }));
    const { ports } = fixture({ assistedOrderExtension: f.candidate, enteredAtMonotonicMsFor: () => 10 });
    const session = (await ports.session(request()))!;
    const read = ports.getExisting(session, KEY, HASH);
    await expect(ports.commit(session, boundArgs())).rejects.toThrow("not qualified");
    finish(null); await read;
    await expect(ports.commit(session, boundArgs())).rejects.toThrow("not qualified");
    expect(f.beginAttempt).not.toHaveBeenCalled();
    expect(f.candidate.commitAttempt).not.toHaveBeenCalled();
  });

  it("claims the admission slot before asynchronous lookup and keeps the constructor-bound extension", async () => {
    const f = stubCandidate();
    let finish!: (value: null) => void;
    f.candidate.getExisting = vi.fn(() => new Promise<null>(resolve => { finish = resolve; }));
    const { ports, wiring } = fixture({ assistedOrderExtension: f.candidate, enteredAtMonotonicMsFor: () => 10 });
    const session = (await ports.session(request()))!;
    const first = ports.getExisting(session, KEY, HASH);
    const finishFirst = finish;
    const second = ports.getExisting(session, "another-key-0001", HASH);
    finish(null); await second;
    expect(f.beginAttempt).not.toHaveBeenCalled();
    finishFirst(null); await first;
    expect(f.beginAttempt).toHaveBeenCalledOnce();
    const replacement = stubCandidate().candidate;
    wiring.assistedOrderExtension = replacement;
    const recovery = ports.getExisting(session, KEY, HASH); finish(null); await recovery;
    expect(replacement.getExisting).not.toHaveBeenCalled();
    const one = ports.commit(session, boundArgs());
    const two = ports.commit(session, boundArgs());
    await expect(one).rejects.toThrow("synthetic uncertain outcome");
    await expect(two).rejects.toThrow("not qualified");
    expect(f.candidate.commitAttempt).toHaveBeenCalledOnce();
  });
});

function submissionArguments(): CommitArguments {
  const address = { line1: "1 Synthetic Way", line2: "", city: "Test City", region: "IL", postalCode: "60000", countryCode: "US" };
  const input = validateSubmission({
    schemaVersion: "quick-order-v1", idempotencyKey: KEY,
    contact: { fullLegalName: "Synthetic Customer", email: "synthetic@example.invalid", mobilePhone: "+12025550100", organizationName: "", ageConfirmed: true,
      shippingAddress: address, billingSameAsShipping: true },
    referral: { kind: "direct", detail: "", declaredCode: "", confirmed: true }, affiliation: { kind: "none", detail: "" },
    lines: [{ productId: "synthetic-product", variantId: "synthetic-variant", quantity: 1, expectedCatalogVersion: "synthetic-catalog", expectedPriceVersion: "synthetic-price" }],
    agreements: quickOrderAgreements(config, [pair])!.map(({ kind, version }) => ({ kind, version })), requestAcknowledged: true,
  });
  const receivedAt = "2026-10-11T00:00:00.000Z";
  const snapshots: CommitArguments["snapshots"] = [{ productId: "synthetic-product", variantId: "synthetic-variant", quantity: 1,
    workflowMode: "direct_order_request", unitPriceCents: 2500, catalogVersion: "synthetic-catalog", priceVersion: "synthetic-price" }];
  return { input, payloadHash: submissionHash(input), receivedAt, snapshots, computedEstimate: estimate(snapshots), attribution: attributionSnapshot(input, receivedAt) };
}
function publicReceipt() {
  return { requestId: "00000000-0000-4000-8000-000000000003", publicReference: "XRR-20261011-ABCDEF1234", attributionState: "direct_no_referrer" as const, estimate: submissionArguments().computedEstimate };
}
function sourceCandidate(overrides: Partial<QuickOrderCandidateDependencies> = {}) {
  let clock = 100;
  const raw = JSON.stringify({
    schemaVersion: "quick-order-approved-limits-v1", profileId: "synthetic-nonproduction", profileVersion: "synthetic-v1",
    database: { name: "synthetic_db", oid: "10" }, loginRole: { name: "synthetic_login", oid: "11" },
    requestRole: { name: "service_role", oid: "12" }, ownerRole: { name: "synthetic_owner", oid: "13" },
    routeClass: "intake", routeId: "synthetic-route", timeZone: "UTC", dateStyle: "ISO, YMD",
    intake: { lockTimeoutMs: 250, statementTimeoutMs: 4000, transactionTimeoutMs: 5000, idleTimeoutMs: 1000, deadlockTimeoutMs: 1000, cleanupMs: 1000, attemptDeadlineMs: 8000, acquisitionMs: 1000, responseMs: 1000 },
    writer: { lockTimeoutMs: 7000, statementTimeoutMs: 15000, transactionTimeoutMs: 20000, idleTimeoutMs: 1000, deadlockTimeoutMs: 1000, cleanupMs: 1000, attemptDeadlineMs: 24000, acquisitionMs: 1000, responseMs: 2000, gateWaitMs: 7000, postGateReserveMs: 1000 },
    enforcement: { preBeginAttestationSha256: "a".repeat(64), writerOrderAttestationSha256: "b".repeat(64), singleRpcAutocommit: true },
  });
  const context: QuickOrderPrivateContext = { rawStoredSessionHash: "e".repeat(64), configuredOwnerId: "00000000-0000-4000-8000-000000000002", actorScope: 'member:' + viewer.authUserId, requiredRole: "synthetic-role" };
  const rpc = vi.fn(async (name: string, _args: Readonly<Record<string, unknown>>, _options?: { readonly signal: AbortSignal }): Promise<QuickOrderCandidateRpcResult> =>
    name === QUICK_ORDER_REPLAY_RPC ? { data: null, error: null } : { data: { ...publicReceipt(), persisted: true, replayed: false }, error: null, transactionOutcome: "committed" });
  const cancel = vi.fn(), schedule = vi.fn((_delay: number, _expire: () => void) => cancel), privateContextFor = vi.fn(() => context);
  const extension = createQuickOrderTransactionExtension({ rpc, approvedLimitsJson: raw, expectedConfigurationDigest: createHash("sha256").update(raw).digest("hex"),
    notificationRecipient: "synthetic-operator@example.invalid", privateContextFor, runtime: { now: () => clock, maximumDelayMs: 24000, schedule }, ...overrides });
  return { extension, rpc, schedule, cancel, privateContextFor, context, setClock: (value: number) => { clock = value; } };
}

describe("Handler/admission composition awaiting real root integration (source controls only)", () => {
  it("counts auth and all later preflight work from the original entry and never serializes timing as private context", async () => {
    const f = sourceCandidate(), args = submissionArguments();
    const { ports } = fixture({ assistedOrderExtension: f.extension, enteredAtMonotonicMsFor: () => 0,
      viewers: { customer: async () => { f.setClock(1000); return viewer; } } });
    const session = (await ports.session(request()))!;
    f.setClock(3000); // Auth, body, replay and catalog costs cannot reset origin.
    await ports.getExisting(session, args.input.idempotencyKey, args.payloadHash);
    await expect(ports.commit(session, args)).resolves.toMatchObject({ persisted: true });
    expect(f.schedule).toHaveBeenCalledWith(5000, expect.any(Function));
    const sent = f.rpc.mock.calls.find(([name]) => name === QUICK_ORDER_COMMIT_RPC)![1] as { p_payload: { context: QuickOrderPrivateContext } };
    expect(sent.p_payload.context).toEqual(f.context);
    expect(Object.keys(sent.p_payload.context).sort()).toEqual(["actorScope", "configuredOwnerId", "rawStoredSessionHash", "requiredRole"]);
    expect(Object.keys(session).sort()).toEqual(["actorId", "csrfToken"]);
    expect(f.cancel).toHaveBeenCalledOnce();
  });

  it("refuses an already-expired original deadline before any commit RPC", async () => {
    const f = sourceCandidate(), args = submissionArguments();
    const { ports } = fixture({ assistedOrderExtension: f.extension, enteredAtMonotonicMsFor: () => 0 });
    const session = (await ports.session(request()))!;
    f.setClock(8000);
    await ports.getExisting(session, args.input.idempotencyKey, args.payloadHash);
    await expect(ports.commit(session, args)).rejects.toMatchObject({ outcome: "DEFINITE_REFUSAL_RETRYABLE" });
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual([QUICK_ORDER_REPLAY_RPC]);
    expect(f.schedule).not.toHaveBeenCalled();
  });

  it.each(["expectedConfigurationDigest", "approvedLimitsJson", "notificationRecipient", "privateContextFor", "runtime"] as const)("keeps missing %s admission fail-closed without hiding replay", async field => {
    const f = sourceCandidate({ [field]: undefined }), args = submissionArguments();
    const { ports } = fixture({ assistedOrderExtension: f.extension, enteredAtMonotonicMsFor: () => 0 });
    const session = (await ports.session(request()))!;
    await ports.getExisting(session, KEY, args.payloadHash);
    await expect(ports.commit(session, args)).rejects.toThrow("not qualified");
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual([QUICK_ORDER_REPLAY_RPC]);
  });

  it("preserves early-access viewer double hash for CSRF without substituting it for the stored hash", async () => {
    const rawStoredHash = "e".repeat(64), doubleHash = createHash("sha256").update(rawStoredHash).digest("hex");
    const ea: AssistedOrderViewer = { ...viewer, actorType: "early_access_session", memberId: null, authUserId: null,
      earlyAccessCustomerRef: "eac_" + "f".repeat(32), earlyAccessSessionHash: doubleHash };
    const context = { rawStoredSessionHash: rawStoredHash, configuredOwnerId: "00000000-0000-4000-8000-000000000002", actorScope: "early_access:" + ea.earlyAccessCustomerRef, requiredRole: "synthetic-role" };
    const contextFor = vi.fn((resolved: AssistedOrderViewer) => resolved === ea ? context : null);
    const f = sourceCandidate({ privateContextFor: contextFor });
    const { ports } = fixture({ assistedOrderExtension: f.extension, enteredAtMonotonicMsFor: () => 0, viewers: { customer: async () => ea } });
    const session = (await ports.session(request()))!, args = submissionArguments();
    expect(contextFor).not.toHaveBeenCalled();
    await ports.getExisting(session, KEY, args.payloadHash);
    await ports.commit(session, args);
    const payload = f.rpc.mock.calls.find(([name]) => name === QUICK_ORDER_COMMIT_RPC)![1] as { p_payload: { context: QuickOrderPrivateContext } };
    expect(contextFor).toHaveBeenCalledWith(ea);
    expect(payload.p_payload.context).toEqual(context);
    expect(JSON.stringify(session)).not.toContain(rawStoredHash);
    expect(JSON.stringify(session)).not.toContain(doubleHash);
  });

  it("uses the original key after an uncertain commit, cannot mint a replacement, and recovers without private proof", async () => {
    const args = submissionArguments();
    let stored = false;
    const rpc = vi.fn(async (name: string): Promise<QuickOrderCandidateRpcResult> => {
      if (name === QUICK_ORDER_REPLAY_RPC) return { data: stored ? { payloadHash: args.payloadHash, publicReceipt: publicReceipt() } : null, error: null };
      stored = true; throw new Error("synthetic lost response");
    });
    const f = sourceCandidate({ rpc });
    const { ports } = fixture({ assistedOrderExtension: f.extension, enteredAtMonotonicMsFor: () => 0 });
    const session = (await ports.session(request()))!;
    await ports.getExisting(session, KEY, args.payloadHash);
    await expect(ports.commit(session, args)).rejects.toMatchObject({ outcome: "OUTCOME_UNCERTAIN" });
    f.setClock(9000);
    await expect(ports.getExisting(session, KEY, args.payloadHash)).resolves.toMatchObject({ payloadHash: args.payloadHash });
    await expect(ports.commit(session, args)).rejects.toThrow("not qualified");
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([QUICK_ORDER_REPLAY_RPC, QUICK_ORDER_COMMIT_RPC, QUICK_ORDER_REPLAY_RPC]);
    expect(f.privateContextFor).toHaveBeenCalledOnce();
    expect(args.input.idempotencyKey).toBe(KEY);
  });
});

async function invokeHandler(ports: QuickOrderPorts, input: unknown, overrides: Record<string, string> = {}, bodyRead?: () => void) {
  const bytes = Buffer.from(JSON.stringify(input));
  const req = Readable.from((async function* () { bodyRead?.(); yield bytes; })()) as unknown as QuickOrderHttpRequest;
  req.method = "POST"; req.url = "/api/health/quick-order/requests";
  req.headers = { authorization: "Bearer synthetic-session-a", origin: "https://quick-order.example.test", "content-type": "application/json", "content-length": String(bytes.length), ...overrides };
  const session = await ports.session(req);
  req.headers["x-csrf-token"] = session?.csrfToken;
  let body = "";
  const headers: Record<string, string> = {};
  const res = { statusCode: 200, setHeader(key: string, value: string) { headers[key] = value; }, end(value: string) { body = value; } };
  await createQuickOrderHandler(ports, { origin: "https://quick-order.example.test", enabled: true })(req, res as unknown as ServerResponse);
  return { status: res.statusCode, body: JSON.parse(body), headers };
}

describe("Handler recovery ordering and disabled public boundary (source controls only)", () => {
  it("charges authentication, raw body, recovery, legal and catalog delays to the same original deadline", async () => {
    const events: string[] = [];
    let tick!: (value: number) => void;
    const rpc = vi.fn(async (name: string): Promise<QuickOrderCandidateRpcResult> => {
      if (name === QUICK_ORDER_REPLAY_RPC) { events.push("recovery"); tick(3000); return { data: null, error: null }; }
      events.push("commit"); return { data: { ...publicReceipt(), persisted: true, replayed: false }, error: null, transactionOutcome: "committed" };
    });
    const f = sourceCandidate({ rpc }); tick = f.setClock;
    const { ports } = fixture({ assistedOrderExtension: f.extension, enteredAtMonotonicMsFor: () => 0,
      viewers: { customer: async () => { events.push("auth"); tick(1000); return viewer; } } });
    // Deliberate test-only wrapper reaches the authored admission contract.
    // Concrete production flags remain false; this is not mounted-root proof.
    const staged: QuickOrderPorts = { ...ports, productionReady: true,
      config: async () => { events.push("legal"); tick(4000); return { enabled: true, agreements: quickOrderAgreements(config, [pair])! }; },
      resolveItem: async () => { events.push("catalog"); tick(5000); return {
        productId: "synthetic-product", variantId: "synthetic-variant", productName: "Synthetic item", specification: null,
        family: "wellness", workflowMode: "direct_order_request", unitPriceCents: 2500, currency: "USD",
        catalogVersion: "synthetic-catalog", priceVersion: "synthetic-price", minimumQuantity: 1, maximumQuantity: 50, quantityIncrement: 1,
        researchUseOnly: false, requestable: true, accessNotice: null,
      }; },
    };
    const response = await invokeHandler(staged, submissionArguments().input, {}, () => { events.push("body"); tick(2000); });
    expect(response.status).toBe(201);
    expect(events).toEqual(["auth", "body", "recovery", "legal", "catalog", "commit"]);
    expect(f.schedule).toHaveBeenCalledWith(3000, expect.any(Function));
    expect(ports.productionReady).toBe(false);
  });

  it("rejects browser-supplied private context or timing in the body before recovery", async () => {
    for (const field of ["rawStoredSessionHash", "configuredOwnerId", "actorScope", "requiredRole", "enteredAtMonotonicMs"]) {
      const f = stubCandidate();
      const { ports } = fixture({ assistedOrderExtension: f.candidate, enteredAtMonotonicMsFor: () => 0 });
      const response = await invokeHandler(ports, { ...submissionArguments().input, [field]: "synthetic-client-claim" });
      expect(response.status).toBe(422);
      expect(f.candidate.getExisting).not.toHaveBeenCalled();
      expect(f.beginAttempt).not.toHaveBeenCalled();
    }
  });

  it.each([null, 101, 0])("recovers a valid receipt with stamp %s and without new-write/private authority", async stamp => {
    const f = stubCandidate(), args = submissionArguments();
    f.candidate.getExisting = vi.fn(async () => ({ payloadHash: args.payloadHash, publicReceipt: publicReceipt() }));
    const { ports, wiring } = fixture({ assistedOrderExtension: f.candidate, enteredAtMonotonicMsFor: () => stamp });
    const response = await invokeHandler(ports, args.input);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ replayed: true, publicReference: publicReceipt().publicReference, paymentStatus: "not_collected" });
    expect(response.headers["Cache-Control"]).toBe("no-store, private");
    expect(response.headers["Referrer-Policy"]).toBe("no-referrer");
    expect(f.beginAttempt).not.toHaveBeenCalled();
    expect(wiring.service.config).not.toHaveBeenCalled();
    expect(f.candidate.commitAttempt).not.toHaveBeenCalled();
  });

  it("refuses conflicting payloads and undefined recovery without new-write preflight", async () => {
    for (const result of [undefined, { payloadHash: HASH, publicReceipt: publicReceipt() }]) {
      const f = stubCandidate(); f.candidate.getExisting = vi.fn(async () => result as never);
      const { ports, wiring } = fixture({ assistedOrderExtension: f.candidate, enteredAtMonotonicMsFor: () => 0 });
      const response = await invokeHandler(ports, submissionArguments().input);
      expect(response.status).toBe(result === undefined ? 503 : 409);
      expect(f.beginAttempt).not.toHaveBeenCalled();
      expect(wiring.service.config).not.toHaveBeenCalled();
    }
  });

  it("binds the handler-derived hash and refuses disabled writes despite valid injected context and client timing claims", async () => {
    const f = stubCandidate(), args = submissionArguments();
    const { ports } = fixture({ assistedOrderExtension: f.candidate, enteredAtMonotonicMsFor: () => 10, approvedHealthAgreementPairs: [pair] });
    const read = vi.spyOn(ports, "getExisting");
    const response = await invokeHandler(ports, args.input, { "x-entered-at-monotonic-ms": "99", "x-required-role": "owner", "x-raw-stored-session-hash": "f".repeat(64) });
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'member:' + viewer.authUserId }), KEY, args.payloadHash);
    expect(f.beginAttempt).toHaveBeenCalledWith(viewer, 'member:' + viewer.authUserId, 10);
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("feature_disabled");
    expect(f.candidate.commitAttempt).not.toHaveBeenCalled();
    expect(ports.productionReady).toBe(false);
  });
});

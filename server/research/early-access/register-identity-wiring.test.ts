import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";

import { registerPrivateEarlyAccessApi, type EarlyAccessRegistrationOptions } from "./register";
import {
  createEarlyAccessSessionIdReader,
  type PrivateAccessRouteDependencies,
} from "./private-access-routes";
import { InMemoryPrivateAccessSessionRepository, SupabasePrivateAccessSessionRepository,
  PRIVATE_ACCESS_SESSION_RPC, PRIVATE_ACCESS_LIVE_SESSION_EXPIRY_RPC, type PrivateAccessSessionDatabaseCall } from "./private-access-session-repository";
import { OriginalGuestProofUnavailableError } from "./identity/original-guest-proof";
import {
  InMemoryEarlyAccessCustomerRepository,
  createEarlyAccessCustomer,
  transitionEarlyAccessCustomer,
} from "./identity/early-access-customer";
import { InMemorySessionBindingStore } from "./identity/identity-verification";
import { EARLY_ACCESS_CONTINUITY_COOKIE, earlyAccessCustomerRefForSession } from "./identity/session-scoped-identity";
import { createAssistedOrderViewerResolvers } from "../assisted-order/express";
import { requestIntentOwner } from "../assisted-order/request-intent/service";
import { sha256AssistedOrderHasher } from "../assisted-order/defaults";
import { createHash } from "node:crypto";
import {
  EARLY_ACCESS_TEST_CONFIG,
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_BODY,
  StubAgreementGate,
  StubReferralResolver,
  StubShippingPolicy,
  StubSupplierDirectory,
  SUPPLIER_ASSIGNMENT,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  sequentialOrderNumbers,
  sequentialProofIds,
} from "./routes/route-fixtures";

const UNLOCK = "/api/research/early-access/unlock";
const ORDERS = "/api/research/early-access/orders";

const NOW_ISO = "2026-08-04T12:00:00.000Z";

/**
 * THE DEFAULT IDENTITY IS THE REAL DIRECTORY, WIRED THROUGH THE SESSION LANE.
 *
 * This file pins the one piece of glue the integration session owns: when no
 * `identity` is injected, `registerPrivateEarlyAccessApi` resolves customers
 * through `EarlyAccessCustomerDirectory`, keyed by the SAME hashed session id
 * `createEarlyAccessSessionIdReader` derives from the cookie. A binding
 * written under that id is found for the same cookie; a session that never
 * went through a verification door stays nobody, so the shared password alone
 * still buys no orders.
 */
describe("register.ts default identity wiring", () => {
  async function harness() {
    const customers = new InMemoryEarlyAccessCustomerRepository();
    const sessionBindings = new InMemorySessionBindingStore();

    const created = createEarlyAccessCustomer({
      id: "cus_wiring",
      email: "wiring@example.invalid",
      legalName: "Wiring Test Customer",
      phone: "+1 555 0199",
      now: NOW_ISO,
    });
    if (!created.ok) throw new Error("customer fixture invalid");
    const approved = transitionEarlyAccessCustomer({
      customer: created.value,
      to: "APPROVED",
      by: "Samuel Boadu",
      reason: "Identity wiring regression fixture",
      now: NOW_ISO,
    });
    if (!approved.ok) throw new Error("customer approval fixture invalid");
    await customers.insert(approved.value);

    const unit = cleanUnit();
    const app = express();
    app.use(express.json());
    registerPrivateEarlyAccessApi(app, {
      // This suite proves the PRICED order engine: it places an order. Quote-only is
      // the production default and refuses a new order, so it is switched off here.
      quoteOnly: false,
      config: EARLY_ACCESS_TEST_CONFIG,
      catalog: catalogOf([unit]),
      releases: await approvedLedgerFor(unit),
      customers,
      sessionBindings,
      agreements: new StubAgreementGate(true),
      suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT),
      shipping: new StubShippingPolicy(true),
      referrals: new StubReferralResolver(null),
      orderNumber: sequentialOrderNumbers(),
      proofId: sequentialProofIds(),
    });

    // The same derivation the registration hands the directory: config-driven
    // cookie port, hashed session handle. The repository below is unused by
    // the reader; it satisfies the dependency shape.
    const readSessionId = createEarlyAccessSessionIdReader({
      config: EARLY_ACCESS_TEST_CONFIG,
      repository: new InMemoryPrivateAccessSessionRepository(),
      now: () => Date.now(),
      randomToken: () => "unused",
    } as PrivateAccessRouteDependencies);

    return { app, customers, sessionBindings, readSessionId };
  }

  async function openSession(app: express.Express): Promise<string> {
    const unlocked = await request(app)
      .post(UNLOCK)
      .send({ password: EARLY_ACCESS_TEST_PASSWORD });
    expect(unlocked.status).toBe(200);
    const raw = unlocked.headers["set-cookie"];
    const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    return cookies.map((entry) => entry.split(";")[0]).join("; ");
  }

  it("resolves a bound session to the approved customer through the default directory", async () => {
    const { app, sessionBindings, readSessionId } = await harness();
    const cookie = await openSession(app);

    // The verification door's write, keyed by the canonical hashed session id.
    const sessionId = readSessionId(cookie);
    expect(sessionId).not.toBeNull();
    expect(await sessionBindings.bind(sessionId as string, "cus_wiring")).toBe(true);

    const placed = await request(app).post(ORDERS).set("Cookie", cookie).send(ORDER_BODY);
    expect(placed.status).toBe(201);
    expect(placed.body.ok).toBe(true);
  });

  it("refuses IDENTITY_REQUIRED for a password-only session with no binding", async () => {
    const { app } = await harness();
    const cookie = await openSession(app);

    const placed = await request(app).post(ORDERS).set("Cookie", cookie).send(ORDER_BODY);
    expect(placed.status).toBe(403);
    expect(placed.body.code).toBe("IDENTITY_REQUIRED");
  });

  it("refuses a bound session whose customer is not approved to own orders", async () => {
    const { app, customers, sessionBindings, readSessionId } = await harness();

    const created = createEarlyAccessCustomer({
      id: "cus_suspended",
      email: "suspended@example.invalid",
      legalName: "Suspended Customer",
      phone: "+1 555 0198",
      now: NOW_ISO,
    });
    if (!created.ok) throw new Error("customer fixture invalid");
    await customers.insert(created.value);

    const cookie = await openSession(app);
    const sessionId = readSessionId(cookie);
    expect(sessionId).not.toBeNull();
    // Bound, but the customer never reached APPROVED, so the directory
    // resolves nobody and the roster's status stays authoritative.
    expect(await sessionBindings.bind(sessionId as string, "cus_suspended")).toBe(true);

    const placed = await request(app).post(ORDERS).set("Cookie", cookie).send(ORDER_BODY);
    expect(placed.status).toBe(403);
    expect(placed.body.code).toBe("IDENTITY_REQUIRED");
  });
});

type ObservedDoorSources = Parameters<NonNullable<EarlyAccessRegistrationOptions["onDoorSources"]>>[0];
describe("registration's distinct original guest proof observation", () => {
  async function harness(overrides: Pick<EarlyAccessRegistrationOptions, "identity" | "sessionIdentity" | "originalGuestProofExpiry" | "repository"> = {}, missingExpiry = false) {
    const app = express(), backing = new InMemoryPrivateAccessSessionRepository(), nonces = new Set<string>();
    const customers = new InMemoryEarlyAccessCustomerRepository(), sessionBindings = new InMemorySessionBindingStore();
    const now = Date.parse("2026-11-19T02:00:00.000Z"), unit = cleanUnit();
    const ownerId = "72000000-0000-4000-8000-000000000001";
    // Unit-only RPC transport. The owned PG suite loads the canonical SQL and
    // repeats this actual registration path with real nonce/session rows.
    const query = vi.fn(async (call: PrivateAccessSessionDatabaseCall) => {
      if (call.args.p_owner_id !== ownerId || call.args.p_access_role !== "private_early_access_member") return null;
      if (call.fn === PRIVATE_ACCESS_SESSION_RPC.issueNonce) { nonces.add(call.args.p_nonce_hash); return new Date(now + 60_000).toISOString(); }
      if (call.fn === PRIVATE_ACCESS_SESSION_RPC.exchangeNonce) {
        if (!nonces.delete(call.args.p_nonce_hash)) return null;
        const created = await backing.create({ sessionHash: call.args.p_session_hash, ownerId, issuedAt: now, expiresAt: now + 60 * 60_000 });
        return created.ok ? new Date(created.value.expiresAtEpochMs!).toISOString() : null;
      }
      if (call.fn === PRIVATE_ACCESS_SESSION_RPC.revokeSession) { const result = await backing.revoke(call.args.p_session_hash, now); return result.ok && result.value; }
      const result = await backing.resolve(call.args.p_session_hash, now);
      if (!result.ok) throw new Error("Synthetic unit backend failure");
      if (call.fn === PRIVATE_ACCESS_SESSION_RPC.sessionActive) return result.value !== null;
      if (call.fn === PRIVATE_ACCESS_LIVE_SESSION_EXPIRY_RPC) return result.value ? new Date(result.value.expiresAtEpochMs!).toISOString() : null;
      throw new Error("Unexpected unit RPC");
    });
    const repository = new SupabasePrivateAccessSessionRepository({ ownerId, query });
    if (missingExpiry) Object.defineProperty(repository, "resolveWithExpiry", { value: undefined });
    let observed: ObservedDoorSources | undefined;
    app.use(express.json());
    registerPrivateEarlyAccessApi(app, {
      config: { ...EARLY_ACCESS_TEST_CONFIG, openAccess: true }, repository, now: () => now,
      catalog: catalogOf([unit]), releases: await approvedLedgerFor(unit), customers, sessionBindings,
      sessionIdentity: true, originalGuestProofExpiry: "canonical-live-row-v1", env: {}, ...overrides, onDoorSources: sources => { observed = sources; },
    });
    if (!observed) throw new Error("Canonical door sources were not observed");
    const unlocked = await request(app).post(UNLOCK).send({}); expect(unlocked.status).toBe(200);
    const raw = unlocked.headers["set-cookie"], cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    const cookie = cookies.map(entry => entry.split(";")[0]).join("; ");
    return { app, repository, query, customers, sessionBindings, doors: observed, cookie, now };
  }

  it.each([{ label: "continuity", legacy: false }, { label: "legacy session", legacy: true }])(
    "preserves exact $label proof through a real stronger-primary binding without changing normal identity selection", async ({ legacy }) => {
      const f = await harness();
      const readProof = f.doors.readOriginalGuestProof;
      if (!readProof) throw new Error("Selected canonical capability missing");
      const cookie = legacy ? f.cookie.split("; ").filter(pair => !pair.startsWith(EARLY_ACCESS_CONTINUITY_COOKIE + "=")).join("; ") : f.cookie;
      const original = await readProof(cookie), h1 = f.doors.readSessionId(cookie);
      expect(original).not.toBeNull();
      if (!original || !h1) throw new Error("Original canonical guest proof missing");
      if (legacy) expect(original.customerRef).toBe(earlyAccessCustomerRefForSession(h1));
      const before = await f.doors.identity.resolve({ cookieHeader: cookie });
      expect(before?.customerRef).toBe(original.customerRef);
      const viewer = await createAssistedOrderViewerResolvers({ resolveMember: async () => null,
        earlyAccess: () => f.doors, earlyAccessBindings: () => null, adminEmail: () => "" }).customer({ headers: { cookie } } as Request);
      const originalOwner = requestIntentOwner(viewer, sha256AssistedOrderHasher);
      const created = createEarlyAccessCustomer({ id: "cus_original_guest_proof", email: "original-proof@example.invalid",
        legalName: "Synthetic Original Guest", now: NOW_ISO });
      if (!created.ok) throw new Error("Synthetic primary fixture invalid");
      const approved = transitionEarlyAccessCustomer({ customer: created.value, to: "APPROVED", by: "Synthetic reviewer",
        reason: "Original guest primary-promotion fixture", now: NOW_ISO });
      if (!approved.ok) throw new Error("Synthetic primary approval invalid");
      await f.customers.insert(approved.value);
      expect(await f.sessionBindings.bind(h1, approved.value.id, "verified_link")).toBe(true);
      const promoted = await f.doors.identity.resolve({ cookieHeader: cookie });
      expect(promoted?.boundBy).toBe("verified_link"); expect(promoted?.customerRef).not.toBe(original.customerRef);
      if (!legacy) expect(promoted?.aliasRefs).toContain(original.customerRef);
      const proof = await readProof(cookie);
      expect(proof).toEqual(original);
      expect(await f.repository.resolveWithExpiry(h1, f.now)).toEqual({ ok: true, value: proof?.expiresAtEpochMs });
      expect(await f.doors.resolveSession(cookie)).toEqual({ authenticated: true, expiresAtEpochMs: null });
      expect(originalOwner).toBe(sha256AssistedOrderHasher.stableHash(["request-intent-owner", "session", proof!.customerRef,
        createHash("sha256").update(proof!.sessionHandleHash, "utf8").digest("hex")]));
      // The server-only proof never becomes a new HTTP/session response field.
      const session = await request(f.app).get("/api/research/early-access/session").set("Cookie", cookie);
      expect(session.status).toBe(200); expect(JSON.stringify(session.body)).not.toMatch(/customerRef|sessionHandleHash|eac_/);
    },
  );

  it("does not adopt a custom identity's primary, aliases or similarly named proof method", async () => {
    const custom = { resolve: vi.fn(async () => ({ customerRef: `eac_${"f".repeat(32)}`, displayName: "Custom",
      boundBy: "verified_link" as const, aliasRefs: [`eac_${"e".repeat(32)}`] })),
      readOriginalGuestProof: vi.fn(async () => ({ customerRef: `eac_${"e".repeat(32)}`, sessionHandleHash: "a".repeat(64), expiresAtEpochMs: Date.now() + 60_000 })) };
    const f = await harness({ identity: custom });
    expect((await f.doors.resolveSession(f.cookie)).authenticated).toBe(true);
    expect(f.doors.readOriginalGuestProof).toBeNull();
    expect(custom.resolve).not.toHaveBeenCalled(); expect(custom.readOriginalGuestProof).not.toHaveBeenCalled();
  });

  it("keeps proof unavailable when the canonical session identity mode is disabled", async () => {
    const f = await harness({ sessionIdentity: false });
    expect((await f.doors.resolveSession(f.cookie)).authenticated).toBe(true);
    expect(f.doors.readOriginalGuestProof).toBeNull();
  });

  it.each(["unselected", "noncanonical", "missing expiry"])("exposes no callable proof for %s while ordinary admission still works", async kind => {
    const f = await harness(kind === "unselected" ? { originalGuestProofExpiry: undefined }
      : kind === "noncanonical" ? { repository: new InMemoryPrivateAccessSessionRepository() } : {}, kind === "missing expiry");
    expect(f.doors.readOriginalGuestProof).toBeNull();
    expect((await f.doors.resolveSession(f.cookie)).authenticated).toBe(true);
    expect(f.query.mock.calls.some(([call]) => call.fn === PRIVATE_ACCESS_LIVE_SESSION_EXPIRY_RPC)).toBe(false);
  });

  it("preserves an unavailable optional backend separately from absent proof and normal HTTP admission", async () => {
    const f = await harness(), readProof = f.doors.readOriginalGuestProof, normal = f.query.getMockImplementation()!;
    if (!readProof) throw new Error("Selected canonical capability missing");
    f.query.mockImplementation(async call => { if (call.fn === PRIVATE_ACCESS_LIVE_SESSION_EXPIRY_RPC) throw new Error("PRIVATE_BACKEND_DIAGNOSTIC"); return normal(call); });
    await expect(readProof(f.cookie)).rejects.toBeInstanceOf(OriginalGuestProofUnavailableError);
    expect(await readProof("forged-cookie")).toBeNull();
    expect(await f.doors.resolveSession(f.cookie)).toEqual({ authenticated: true, expiresAtEpochMs: null });
  });
});

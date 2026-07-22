import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Identity verification at the vendor boundary: the consent gate that fails
// closed, the disabled default, the deterministic test-provider lifecycle
// (start, idempotent restart, resolve, expiry, bounded retries, purge), real
// webhook verification on the boundary provider, the truthful "no vendor
// adapter" refusal, and the STRUCTURAL no-raw-data contract: the persisted
// types have no field that could carry an ID image or a biometric. No network.
// ---------------------------------------------------------------------------

const caps = vi.hoisted(() => ({ enabled: true }));

vi.mock("./capabilities", () => ({
  capabilityEnabled: () => caps.enabled,
}));

import {
  IDENTITY_FORBIDDEN_FIELD_PATTERNS,
  IDENTITY_MAX_ATTEMPTS,
  IDENTITY_PERSISTED_FIELDS,
  IDENTITY_SESSION_TTL_MINUTES,
  TEST_IDENTITY_WEBHOOK_SECRET,
  TestIdentityProvider,
  VendorBoundaryIdentityProvider,
  disabledIdentityProvider,
  failClosedConsent,
  missingIdentityEnv,
  selectIdentityProvider,
  testIdentityProvider,
  toAdminReviewItem,
  vendorBoundaryIdentityProvider,
  type IdentitySessionRecord,
} from "./identity-provider";

const T0 = Date.parse("2026-07-22T00:00:00.000Z");
const NOW = new Date(T0);
const MINUTE_MS = 60 * 1000;

const ENV_KEYS = [
  "IDENTITY_PROVIDER",
  "IDENTITY_API_KEY",
  "IDENTITY_WEBHOOK_SECRET",
  "RESEARCH_IDENTITY_ENABLED",
] as const;
const envSnapshot: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ENV_KEYS) envSnapshot[key] = process.env[key];
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (envSnapshot[key] === undefined) delete process.env[key];
    else process.env[key] = envSnapshot[key];
  }
});

beforeEach(() => {
  caps.enabled = true;
  for (const key of ENV_KEYS) delete process.env[key];
  testIdentityProvider.reset();
});

function configureEnv() {
  process.env.IDENTITY_PROVIDER = "unit-test-vendor-name";
  process.env.IDENTITY_API_KEY = "unit-test-identity-key-placeholder";
  process.env.IDENTITY_WEBHOOK_SECRET = "unit-test-identity-webhook-secret";
}

// ---------------------------------------------------------------------------
// Selection and the disabled default
// ---------------------------------------------------------------------------

describe("provider selection", () => {
  it("defaults to the disabled provider, and every call refuses truthfully", async () => {
    caps.enabled = false;
    expect(selectIdentityProvider()).toBe(disabledIdentityProvider);

    const start = await disabledIdentityProvider.startSession({ memberId: "m1", now: NOW });
    const result = await disabledIdentityProvider.getResult({ memberId: "m1", sessionRef: "x", now: NOW });
    const webhook = disabledIdentityProvider.verifyWebhook({ secretHeader: "any", rawBody: "{}" });
    const purge = await disabledIdentityProvider.purgeMember({ memberId: "m1", now: NOW });
    for (const refusal of [start, result, webhook, purge]) {
      expect(refusal.ok).toBe(false);
      if (!refusal.ok) expect(refusal.code).toBe("DISABLED");
    }
  });

  it("selects the deterministic test provider under NODE_ENV=test with the capability on", () => {
    caps.enabled = true;
    expect(selectIdentityProvider()).toBe(testIdentityProvider);
  });

  it("reports missing environment variable NAMES only", () => {
    expect(missingIdentityEnv()).toEqual([
      "IDENTITY_PROVIDER",
      "IDENTITY_API_KEY",
      "IDENTITY_WEBHOOK_SECRET",
    ]);
  });
});

// ---------------------------------------------------------------------------
// The consent gate
// ---------------------------------------------------------------------------

describe("the consent gate", () => {
  it("refuses to start a session without consent, and creates nothing", async () => {
    const provider = new TestIdentityProvider(async () => false);
    const result = await provider.startSession({ memberId: "m1", now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONSENT_REQUIRED");
    const lookup = await provider.getResult({ memberId: "m1", sessionRef: "ids_test_1", now: NOW });
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) expect(lookup.code).toBe("NOT_FOUND");
  });

  it("the vendor boundary FAILS CLOSED on consent even when fully configured", async () => {
    configureEnv();
    // The default consent check refuses everyone until the counsel-approved
    // agreement exists; a configured deployment cannot bypass the gate.
    const provider = new VendorBoundaryIdentityProvider();
    const result = await provider.startSession({ memberId: "m1", now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("CONSENT_REQUIRED");
    expect(await failClosedConsent("anyone")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The deterministic test-provider lifecycle
// ---------------------------------------------------------------------------

describe("the test provider flow", () => {
  it("starts a session, restarts idempotently, and resolves to a pass", async () => {
    const provider = new TestIdentityProvider();
    const started = await provider.startSession({ memberId: "m1", now: NOW });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const session = started.value.session;
    expect(session.status).toBe("started");
    expect(session.attempt).toBe(1);
    expect(session.providerRef).toBe("test-provider-ref-1");
    expect(started.value.vendorFlowUrl).toContain(session.sessionRef);
    expect(session.expiresAt).toBe(new Date(T0 + IDENTITY_SESSION_TTL_MINUTES * MINUTE_MS).toISOString());

    // Starting again while a session is live returns the SAME session.
    const again = await provider.startSession({ memberId: "m1", now: NOW });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value.session.sessionRef).toBe(session.sessionRef);

    provider.resolve(session.sessionRef, "passed", new Date(T0 + MINUTE_MS));
    const result = await provider.getResult({
      memberId: "m1",
      sessionRef: session.sessionRef,
      now: new Date(T0 + 2 * MINUTE_MS),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("passed");
      expect(result.value.completedAt).toBe(new Date(T0 + MINUTE_MS).toISOString());
      expect(result.value.failureReasonCode).toBeNull();
    }

    // A member who already passed never opens a second attempt.
    const after = await provider.startSession({ memberId: "m1", now: new Date(T0 + 3 * MINUTE_MS) });
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.value.session.status).toBe("passed");
      expect(after.value.vendorFlowUrl).toBeNull();
    }
  });

  it("expires an overdue session and counts the attempt as spent", async () => {
    const provider = new TestIdentityProvider();
    const started = await provider.startSession({ memberId: "m1", now: NOW });
    if (!started.ok) throw new Error("start failed");
    const late = new Date(T0 + (IDENTITY_SESSION_TTL_MINUTES + 1) * MINUTE_MS);

    const result = await provider.getResult({
      memberId: "m1",
      sessionRef: started.value.session.sessionRef,
      now: late,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe("expired");

    // The next start is a NEW session, attempt 2.
    const retry = await provider.startSession({ memberId: "m1", now: late });
    expect(retry.ok).toBe(true);
    if (retry.ok) {
      expect(retry.value.session.attempt).toBe(2);
      expect(retry.value.session.sessionRef).not.toBe(started.value.session.sessionRef);
    }
  });

  it("exhausts the bounded attempt budget and routes the case to human review", async () => {
    const provider = new TestIdentityProvider();
    let lastRecord: IdentitySessionRecord | null = null;
    for (let attempt = 1; attempt <= IDENTITY_MAX_ATTEMPTS; attempt += 1) {
      const now = new Date(T0 + attempt * MINUTE_MS);
      const started = await provider.startSession({ memberId: "m1", now });
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      expect(started.value.session.attempt).toBe(attempt);
      provider.resolve(started.value.session.sessionRef, "failed", now, "not_verified");
      const result = await provider.getResult({
        memberId: "m1",
        sessionRef: started.value.session.sessionRef,
        now,
      });
      if (result.ok) lastRecord = result.value;
    }

    const exhausted = await provider.startSession({ memberId: "m1", now: new Date(T0 + 10 * MINUTE_MS) });
    expect(exhausted.ok).toBe(false);
    if (!exhausted.ok) expect(exhausted.code).toBe("ATTEMPTS_EXHAUSTED");

    // The admin review surface flags the case for a named human.
    expect(lastRecord).not.toBeNull();
    const review = toAdminReviewItem(lastRecord as IdentitySessionRecord);
    expect(review.needsManualReview).toBe(true);
    expect(review.status).toBe("failed");
  });

  it("purges everything held for a member, provider references included", async () => {
    const provider = new TestIdentityProvider();
    const started = await provider.startSession({ memberId: "m1", now: NOW });
    if (!started.ok) throw new Error("start failed");
    const purged = await provider.purgeMember({ memberId: "m1", now: NOW });
    expect(purged).toEqual({ ok: true, value: { purgedSessions: 1 } });

    const result = await provider.getResult({
      memberId: "m1",
      sessionRef: started.value.session.sessionRef,
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("purged");
      expect(result.value.providerRef).toBeNull();
      expect(result.value.failureReasonCode).toBeNull();
    }

    // Purging again is a no-op, not a double count.
    const again = await provider.purgeMember({ memberId: "m1", now: NOW });
    expect(again).toEqual({ ok: true, value: { purgedSessions: 0 } });
  });

  it("verifies its webhook against the fixed test secret", () => {
    const provider = new TestIdentityProvider();
    expect(provider.verifyWebhook({ secretHeader: TEST_IDENTITY_WEBHOOK_SECRET, rawBody: "{}" }).ok).toBe(true);
    const wrong = provider.verifyWebhook({ secretHeader: "nope", rawBody: "{}" });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.code).toBe("UNVERIFIED");
  });
});

// ---------------------------------------------------------------------------
// The vendor boundary: real webhook verification, truthful refusals
// ---------------------------------------------------------------------------

describe("the vendor boundary provider", () => {
  it("answers PROVIDER_ERROR (never a fake session) when configured and consented but no adapter exists", async () => {
    configureEnv();
    const provider = new VendorBoundaryIdentityProvider(async () => true);
    const started = await provider.startSession({ memberId: "m1", now: NOW });
    expect(started.ok).toBe(false);
    if (!started.ok) {
      expect(started.code).toBe("PROVIDER_ERROR");
      expect(started.message).toContain("vendor");
    }
    const result = await provider.getResult();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PROVIDER_ERROR");
  });

  it("throws IdentityNotConfigured naming variable NAMES only when credentials are absent", async () => {
    const provider = new VendorBoundaryIdentityProvider(async () => true);
    await expect(provider.startSession({ memberId: "m1", now: NOW })).rejects.toMatchObject({
      name: "IdentityNotConfigured",
      missing: ["IDENTITY_PROVIDER", "IDENTITY_API_KEY", "IDENTITY_WEBHOOK_SECRET"],
    });
  });

  it("verifies the webhook constant-time against the configured secret", () => {
    expect(vendorBoundaryIdentityProvider.verifyWebhook({ secretHeader: "x", rawBody: "{}" })).toMatchObject(
      { ok: false, code: "NOT_CONFIGURED" },
    );
    configureEnv();
    const good = vendorBoundaryIdentityProvider.verifyWebhook({
      secretHeader: "unit-test-identity-webhook-secret",
      rawBody: "{}",
    });
    expect(good.ok).toBe(true);
    const bad = vendorBoundaryIdentityProvider.verifyWebhook({ secretHeader: "wrong", rawBody: "{}" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("UNVERIFIED");
  });
});

// ---------------------------------------------------------------------------
// THE NO-RAW-DATA CONTRACT, asserted structurally
// ---------------------------------------------------------------------------

describe("the provider-reference-only persistence contract", () => {
  it("every produced record has exactly the pinned reference-only fields", async () => {
    const provider = new TestIdentityProvider();
    const started = await provider.startSession({ memberId: "m1", now: NOW });
    if (!started.ok) throw new Error("start failed");
    provider.resolve(started.value.session.sessionRef, "failed", NOW, "expired_document");
    const result = await provider.getResult({
      memberId: "m1",
      sessionRef: started.value.session.sessionRef,
      now: NOW,
    });
    if (!result.ok) throw new Error("lookup failed");

    for (const record of [started.value.session, result.value]) {
      expect(Object.keys(record).sort()).toEqual([...IDENTITY_PERSISTED_FIELDS].sort());
    }

    // The start value itself carries only the session and the vendor's own
    // flow URL; there is no field through which a document could travel.
    expect(Object.keys(started.value).sort()).toEqual(["session", "vendorFlowUrl"]);
  });

  it("no persisted or review field name can carry an image, document, or biometric", async () => {
    const provider = new TestIdentityProvider();
    const started = await provider.startSession({ memberId: "m1", now: NOW });
    if (!started.ok) throw new Error("start failed");
    const review = toAdminReviewItem(started.value.session);

    const fieldNames = [
      ...IDENTITY_PERSISTED_FIELDS,
      ...Object.keys(started.value.session),
      ...Object.keys(review),
    ];
    for (const field of fieldNames) {
      for (const forbidden of IDENTITY_FORBIDDEN_FIELD_PATTERNS) {
        expect(forbidden.test(field), `field "${field}" matches forbidden ${forbidden}`).toBe(false);
      }
    }
  });
});

import { capabilityEnabled } from "./capabilities";
import { constantTimeEqual } from "./telegram-provider";

// ---------------------------------------------------------------------------
// xenios research member platform: the identity verification provider seam,
// built to the VENDOR BOUNDARY and deliberately no further.
//
// EXTERNAL INPUTS REQUIRED before a real vendor adapter may exist:
//   1. Samuel's vendor choice (the value behind IDENTITY_PROVIDER).
//   2. A signed vendor contract, reflected in IDENTITY_API_KEY and
//      IDENTITY_WEBHOOK_SECRET being provisioned.
//   3. Counsel-approved consent language, recorded through the agreements
//      machinery (agreements.ts, hasAcceptedCurrent) as its own separately
//      accepted agreement. Until that agreement exists, the consent check
//      here FAILS CLOSED and no session can start.
// Nothing in this file fabricates a vendor: with the capability on and
// credentials present but no adapter built, every call answers with a
// truthful PROVIDER_ERROR, never a fake session or a fake pass.
//
// THE PERSISTENCE CONTRACT (structural, not a promise):
// This system stores provider REFERENCES only. No raw ID images, no document
// scans, no selfies, no biometric templates, embeddings, or descriptors,
// ever, in any ordinary table. The vendor holds the evidence on its side of
// the boundary; what crosses back is pass/fail, a coarse machine reason code,
// and an opaque reference. The record types below have NO FIELD that could
// carry an image or a biometric, and a test asserts that structurally, so the
// contract cannot erode silently.
//
// Selection is capability-driven (selectIdentityProvider):
//   identity_verification off -> DisabledIdentityProvider (every call refuses)
//   NODE_ENV === "test"       -> TestIdentityProvider (deterministic, in memory)
//   otherwise                 -> VendorBoundaryIdentityProvider (truthful
//                                refusals until a real adapter exists)
// ---------------------------------------------------------------------------

// DISABLED: the capability is off. NOT_CONFIGURED: credentials are missing.
// CONSENT_REQUIRED: the member has not given the counsel-approved consent, so
// no session may start. NOT_FOUND: no such session for that member. EXPIRED:
// the session's window closed before completion. ATTEMPTS_EXHAUSTED: the
// bounded retry budget is spent; the case moves to human review.
// UNVERIFIED: a webhook could not be authenticated. PROVIDER_ERROR: the
// adapter itself failed (including "no vendor adapter is built").
export type IdentityErrorCode =
  | "DISABLED"
  | "NOT_CONFIGURED"
  | "CONSENT_REQUIRED"
  | "NOT_FOUND"
  | "EXPIRED"
  | "ATTEMPTS_EXHAUSTED"
  | "UNVERIFIED"
  | "PROVIDER_ERROR";

export type IdentityResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: IdentityErrorCode; message?: string };

// ---------------------------------------------------------------------------
// Expiry and retry semantics
// ---------------------------------------------------------------------------

// A session is a short window to complete the vendor flow, not a standing
// door. An expired session counts as a spent attempt; after the attempt
// budget, the path is a named human reviewing the case, never an unbounded
// machine loop against an identity vendor.
export const IDENTITY_SESSION_TTL_MINUTES = 30;
export const IDENTITY_MAX_ATTEMPTS = 3;

export const IDENTITY_SESSION_STATUSES = [
  "started",
  "passed",
  "failed",
  "expired",
  "purged",
] as const;
export type IdentitySessionStatus = (typeof IDENTITY_SESSION_STATUSES)[number];

// ---------------------------------------------------------------------------
// The provider-reference-only persistence contract
// ---------------------------------------------------------------------------

// Everything this system is allowed to persist about a verification. Note
// what has no field here: images, documents, selfies, biometrics, names,
// birth dates. providerRef is the vendor's opaque handle; failureReasonCode
// is a coarse machine code (e.g. "expired_document"), never extracted
// document content.
export type IdentitySessionRecord = {
  sessionRef: string;
  memberId: string;
  providerRef: string | null;
  status: IdentitySessionStatus;
  attempt: number;
  startedAt: string;
  expiresAt: string;
  completedAt: string | null;
  failureReasonCode: string | null;
};

export const IDENTITY_PERSISTED_FIELDS = [
  "sessionRef",
  "memberId",
  "providerRef",
  "status",
  "attempt",
  "startedAt",
  "expiresAt",
  "completedAt",
  "failureReasonCode",
] as const;

// Compile-time pin: the persisted-fields list and the record type cannot
// drift apart. Adding a field to one without the other is a type error.
type PersistedField = (typeof IDENTITY_PERSISTED_FIELDS)[number];
type MustBeNever<T extends never> = T;
export type _IdentityFieldContractA = MustBeNever<Exclude<keyof IdentitySessionRecord, PersistedField>>;
export type _IdentityFieldContractB = MustBeNever<Exclude<PersistedField, keyof IdentitySessionRecord>>;

// Field-name patterns that must never appear on a persisted identity type.
// The structural test walks every produced record and review item with these.
export const IDENTITY_FORBIDDEN_FIELD_PATTERNS: readonly RegExp[] = [
  /image/i,
  /photo/i,
  /selfie/i,
  /face/i,
  /biometric/i,
  /template/i,
  /embedding/i,
  /document/i,
  /scan/i,
  /dob/i,
  /birth/i,
  /ssn/i,
  /passport/i,
  /licen[cs]e/i,
];

// ---------------------------------------------------------------------------
// The provider interface
// ---------------------------------------------------------------------------

export type StartIdentitySessionInput = { memberId: string; now: Date };

// vendorFlowUrl is where the member completes the vendor's own flow. It is
// the vendor's page, on the vendor's side of the boundary; no document ever
// travels through this system.
export type StartIdentitySessionValue = {
  session: IdentitySessionRecord;
  vendorFlowUrl: string | null;
};

export type IdentityWebhookInput = {
  secretHeader: string | undefined;
  rawBody: string;
};

export interface IdentityVerificationProvider {
  startSession(input: StartIdentitySessionInput): Promise<IdentityResult<StartIdentitySessionValue>>;
  getResult(input: {
    memberId: string;
    sessionRef: string;
    now: Date;
  }): Promise<IdentityResult<IdentitySessionRecord>>;
  verifyWebhook(input: IdentityWebhookInput): IdentityResult<{ verified: true }>;
  // The delete path: everything held for a member becomes purged, provider
  // references included, so nothing is left to resolve against the vendor.
  purgeMember(input: { memberId: string; now: Date }): Promise<IdentityResult<{ purgedSessions: number }>>;
}

// ---------------------------------------------------------------------------
// The consent gate
// ---------------------------------------------------------------------------

// Injected so the boundary is testable. The production wiring is the
// agreements machinery (hasAcceptedCurrent in agreements.ts) against the
// counsel-approved identity consent agreement, once counsel has approved one.
export type IdentityConsentCheck = (memberId: string) => Promise<boolean>;

// The production default until that agreement exists: NO consent, for anyone.
// A consent gate that cannot check must refuse, never wave through.
export const failClosedConsent: IdentityConsentCheck = async () => false;

// ---------------------------------------------------------------------------
// The admin review surface shape
// ---------------------------------------------------------------------------

// What Samuel's review queue may see: the same reference-only fields, plus
// whether the case needs a human. No document data has a field to ride in on.
export type IdentityAdminReviewItem = {
  memberId: string;
  sessionRef: string;
  providerRef: string | null;
  status: IdentitySessionStatus;
  attempt: number;
  startedAt: string;
  expiresAt: string;
  completedAt: string | null;
  needsManualReview: boolean;
};

export function toAdminReviewItem(record: IdentitySessionRecord): IdentityAdminReviewItem {
  return {
    memberId: record.memberId,
    sessionRef: record.sessionRef,
    providerRef: record.providerRef,
    status: record.status,
    attempt: record.attempt,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
    completedAt: record.completedAt,
    // A failure or a spent attempt budget is a person's identity in question;
    // that decision belongs to a named human, never to a retry loop.
    needsManualReview: record.status === "failed" || record.attempt >= IDENTITY_MAX_ATTEMPTS,
  };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export class IdentityNotConfigured extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Identity verification is not configured: ${missing.join(", ")}`);
    this.name = "IdentityNotConfigured";
    this.missing = missing;
  }
}

const REQUIRED_ENV = ["IDENTITY_PROVIDER", "IDENTITY_API_KEY", "IDENTITY_WEBHOOK_SECRET"] as const;

export function missingIdentityEnv(): string[] {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

// ---------------------------------------------------------------------------
// Disabled (the keys-later default)
// ---------------------------------------------------------------------------

export class DisabledIdentityProvider implements IdentityVerificationProvider {
  private refuse(): { ok: false; code: IdentityErrorCode; message: string } {
    return { ok: false, code: "DISABLED", message: "Identity verification is disabled." };
  }
  async startSession(): Promise<IdentityResult<StartIdentitySessionValue>> {
    return this.refuse();
  }
  async getResult(): Promise<IdentityResult<IdentitySessionRecord>> {
    return this.refuse();
  }
  verifyWebhook(): IdentityResult<{ verified: true }> {
    return this.refuse();
  }
  async purgeMember(): Promise<IdentityResult<{ purgedSessions: number }>> {
    return this.refuse();
  }
}

export const disabledIdentityProvider = new DisabledIdentityProvider();

// ---------------------------------------------------------------------------
// Test (deterministic, in memory, no network)
// ---------------------------------------------------------------------------

export const TEST_IDENTITY_WEBHOOK_SECRET = "test-identity-webhook-secret";

export class TestIdentityProvider implements IdentityVerificationProvider {
  private readonly sessions: IdentitySessionRecord[] = [];
  private counter = 0;
  consent: IdentityConsentCheck;

  constructor(consent: IdentityConsentCheck = async () => true) {
    this.consent = consent;
  }

  reset() {
    this.sessions.length = 0;
    this.counter = 0;
    this.consent = async () => true;
  }

  private forMember(memberId: string): IdentitySessionRecord[] {
    return this.sessions.filter((session) => session.memberId === memberId);
  }

  // Lazy expiry: a started session past its window becomes expired the moment
  // anything looks at it. The attempt stays spent.
  private applyExpiry(record: IdentitySessionRecord, now: Date) {
    if (record.status === "started" && now.getTime() >= Date.parse(record.expiresAt)) {
      record.status = "expired";
    }
  }

  async startSession(
    input: StartIdentitySessionInput,
  ): Promise<IdentityResult<StartIdentitySessionValue>> {
    // The consent gate comes FIRST. No consent, no session, no vendor call.
    if (!(await this.consent(input.memberId))) {
      return {
        ok: false,
        code: "CONSENT_REQUIRED",
        message: "Identity verification requires the member's separate, counsel-approved consent first.",
      };
    }

    const mine = this.forMember(input.memberId);
    for (const record of mine) this.applyExpiry(record, input.now);

    // Idempotency: a member who already passed, or who has a live session,
    // gets the existing record back rather than a new attempt.
    const passed = mine.find((record) => record.status === "passed");
    if (passed) return { ok: true, value: { session: { ...passed }, vendorFlowUrl: null } };
    const active = mine.find((record) => record.status === "started");
    if (active) {
      return {
        ok: true,
        value: {
          session: { ...active },
          vendorFlowUrl: `https://identity.test.invalid/flow/${active.sessionRef}`,
        },
      };
    }

    const spentAttempts = mine.filter((record) => record.status !== "purged").length;
    if (spentAttempts >= IDENTITY_MAX_ATTEMPTS) {
      return {
        ok: false,
        code: "ATTEMPTS_EXHAUSTED",
        message: "The verification attempt budget is spent; the case is with a human reviewer.",
      };
    }

    this.counter += 1;
    const session: IdentitySessionRecord = {
      sessionRef: `ids_test_${this.counter}`,
      memberId: input.memberId,
      providerRef: `test-provider-ref-${this.counter}`,
      status: "started",
      attempt: spentAttempts + 1,
      startedAt: input.now.toISOString(),
      expiresAt: new Date(input.now.getTime() + IDENTITY_SESSION_TTL_MINUTES * 60 * 1000).toISOString(),
      completedAt: null,
      failureReasonCode: null,
    };
    this.sessions.push(session);
    return {
      ok: true,
      value: {
        session: { ...session },
        vendorFlowUrl: `https://identity.test.invalid/flow/${session.sessionRef}`,
      },
    };
  }

  // Test-only: what the vendor webhook would do, deterministically. Carries a
  // coarse reason CODE at most, matching the persistence contract.
  resolve(sessionRef: string, outcome: "passed" | "failed", now: Date, failureReasonCode?: string) {
    const record = this.sessions.find((session) => session.sessionRef === sessionRef);
    if (!record || record.status !== "started") return;
    record.status = outcome;
    record.completedAt = now.toISOString();
    record.failureReasonCode = outcome === "failed" ? (failureReasonCode ?? "not_verified") : null;
  }

  async getResult(input: {
    memberId: string;
    sessionRef: string;
    now: Date;
  }): Promise<IdentityResult<IdentitySessionRecord>> {
    const record = this.sessions.find(
      (session) => session.sessionRef === input.sessionRef && session.memberId === input.memberId,
    );
    if (!record) return { ok: false, code: "NOT_FOUND", message: "No session with that reference." };
    this.applyExpiry(record, input.now);
    return { ok: true, value: { ...record } };
  }

  verifyWebhook(input: IdentityWebhookInput): IdentityResult<{ verified: true }> {
    if (typeof input.secretHeader !== "string" || input.secretHeader.length === 0) {
      return { ok: false, code: "UNVERIFIED", message: "The webhook secret header is missing." };
    }
    if (!constantTimeEqual(input.secretHeader, TEST_IDENTITY_WEBHOOK_SECRET)) {
      return { ok: false, code: "UNVERIFIED", message: "The webhook secret did not match." };
    }
    return { ok: true, value: { verified: true } };
  }

  async purgeMember(input: {
    memberId: string;
    now: Date;
  }): Promise<IdentityResult<{ purgedSessions: number }>> {
    let purged = 0;
    for (const record of this.forMember(input.memberId)) {
      if (record.status === "purged") continue;
      record.status = "purged";
      record.providerRef = null;
      record.failureReasonCode = null;
      record.completedAt = record.completedAt ?? input.now.toISOString();
      purged += 1;
    }
    return { ok: true, value: { purgedSessions: purged } };
  }
}

export const testIdentityProvider = new TestIdentityProvider();

// ---------------------------------------------------------------------------
// The vendor boundary (the real slot; NO adapter is fabricated)
// ---------------------------------------------------------------------------

// This class is the exact edge of what can be built without Samuel's vendor
// choice and counsel's consent sign-off. verifyWebhook is real (constant-time
// against the configured secret, no vendor needed). Everything that would
// require a vendor answers with a truthful PROVIDER_ERROR; the consent gate
// still runs first and fails closed, so even a misconfigured deployment can
// never start a verification nobody consented to.
export class VendorBoundaryIdentityProvider implements IdentityVerificationProvider {
  private readonly consent: IdentityConsentCheck;

  constructor(consent: IdentityConsentCheck = failClosedConsent) {
    this.consent = consent;
  }

  private requireConfig() {
    const missing = missingIdentityEnv();
    if (missing.length > 0) throw new IdentityNotConfigured(missing);
  }

  private noAdapter(method: string): { ok: false; code: IdentityErrorCode; message: string } {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message:
        `No identity vendor adapter is built (${method}). Building one requires Samuel's vendor ` +
        "choice and counsel-approved consent; see the header of identity-provider.ts.",
    };
  }

  async startSession(
    input: StartIdentitySessionInput,
  ): Promise<IdentityResult<StartIdentitySessionValue>> {
    if (!(await this.consent(input.memberId))) {
      return {
        ok: false,
        code: "CONSENT_REQUIRED",
        message: "Identity verification requires the member's separate, counsel-approved consent first.",
      };
    }
    this.requireConfig();
    return this.noAdapter("startSession");
  }

  async getResult(): Promise<IdentityResult<IdentitySessionRecord>> {
    this.requireConfig();
    return this.noAdapter("getResult");
  }

  verifyWebhook(input: IdentityWebhookInput): IdentityResult<{ verified: true }> {
    const secret = process.env.IDENTITY_WEBHOOK_SECRET;
    if (!secret) {
      return { ok: false, code: "NOT_CONFIGURED", message: "No webhook secret is configured." };
    }
    if (typeof input.secretHeader !== "string" || input.secretHeader.length === 0) {
      return { ok: false, code: "UNVERIFIED", message: "The webhook secret header is missing." };
    }
    if (!constantTimeEqual(input.secretHeader, secret)) {
      return { ok: false, code: "UNVERIFIED", message: "The webhook secret did not match." };
    }
    return { ok: true, value: { verified: true } };
  }

  async purgeMember(): Promise<IdentityResult<{ purgedSessions: number }>> {
    this.requireConfig();
    return this.noAdapter("purgeMember");
  }
}

export const vendorBoundaryIdentityProvider = new VendorBoundaryIdentityProvider();

// Resolved per call, never memoized at import: capability state depends on
// environment that can change between requests (and between tests).
export function selectIdentityProvider(): IdentityVerificationProvider {
  if (!capabilityEnabled("identity_verification")) return disabledIdentityProvider;
  if (process.env.NODE_ENV === "test") return testIdentityProvider;
  return vendorBoundaryIdentityProvider;
}

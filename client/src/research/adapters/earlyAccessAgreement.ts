// ---------------------------------------------------------------------------
// The Private Early Access agreement: reading the policy, reading whether this
// customer has agreed, and recording that they now do.
//
// Session-cookie authenticated, like the rest of the private area.
//
// THIS ADAPTER IS NOT THE AUTHORITY ON ANYTHING. It does not decide who has
// agreed, when they agreed, or who they are. It asks the server all three and
// carries the answers across unchanged. Nothing here is written to browser
// storage, deliberately: a value the browser remembers is a value the browser
// can be made to invent, and this one guards a checkout.
// ---------------------------------------------------------------------------

import { apiGet, apiPost, type ApiResult } from "../lib/api";

export const RESEARCH_POLICIES_PATH = "/api/research/policies";
export const EARLY_ACCESS_AGREEMENT_STATUS_PATH = "/api/research/early-access/agreements";
export const EARLY_ACCESS_AGREEMENT_ACCEPT_PATH =
  "/api/research/early-access/agreements/accept";

/** The exact configured identity returned by the server's agreement read. */
export type EarlyAccessAgreementPair = Readonly<{
  kind: string;
  version: string;
}>;

const AGREEMENT_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const UNREADABLE_AGREEMENT_IDENTITY =
  "The agreement service returned an unreadable agreement identity.";

function agreementIdentifier(value: unknown): string | null {
  return typeof value === "string" &&
    value === value.trim() &&
    AGREEMENT_IDENTIFIER.test(value)
    ? value
    : null;
}

function agreementPair(
  value: unknown,
  exactKeys: boolean,
): EarlyAccessAgreementPair | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    exactKeys &&
    (Object.keys(record).length !== 2 ||
      !Object.prototype.hasOwnProperty.call(record, "kind") ||
      !Object.prototype.hasOwnProperty.call(record, "version"))
  ) {
    return null;
  }
  const kind = agreementIdentifier(record.kind);
  const version = agreementIdentifier(record.version);
  return kind === null || version === null
    ? null
    : Object.freeze({ kind, version });
}

function singleRequiredAgreement(value: unknown): EarlyAccessAgreementPair | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  return agreementPair(value[0], true);
}

/** The slug of the policy document rendered on the acceptance screen. */
export const RESEARCH_USE_POLICY_SLUG = "research-use";

export type ResearchPolicySection = Readonly<{
  heading: string;
  paragraphs: readonly string[];
  bullets: readonly string[];
}>;

export type ResearchPolicyView = Readonly<{
  title: string;
  /** Empty when the server sent none. Never invented. */
  updated: string;
  /** The exact agreement row this served policy is allowed to create. */
  agreement: EarlyAccessAgreementPair;
  sections: readonly ResearchPolicySection[];
}>;

export type ResearchPolicyLoad =
  | { kind: "ok"; policy: ResearchPolicyView }
  | { kind: "missing" }
  | { kind: "unreadable"; reason: string }
  | { kind: "error"; message: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readStrings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

/**
 * Reads the Research Use Policy.
 *
 * A policy missing its title, or with no readable section, is `unreadable`
 * rather than rendered with a gap. A consent screen that shows a heading and
 * nothing beneath it collects an agreement to a blank page, which is worse than
 * one that says it could not load.
 */
export async function loadResearchUsePolicy(
  get: <T>(path: string) => Promise<ApiResult<T>> = (path) => apiGet(path),
): Promise<ResearchPolicyLoad> {
  const result = await get<{ policies?: unknown }>(RESEARCH_POLICIES_PATH);

  if (result.kind === "unavailable") return { kind: "missing" };
  if (result.kind === "unauthorized" || result.kind === "forbidden") {
    return { kind: "unreadable", reason: "The policy could not be read." };
  }
  if (result.kind === "denied") {
    return { kind: "unreadable", reason: result.message ?? result.code };
  }
  if (result.kind === "error") return { kind: "error", message: result.message };

  const policies = (result.data ?? {}).policies;
  if (typeof policies !== "object" || policies === null) {
    return { kind: "unreadable", reason: "The policy response was not in a readable shape." };
  }
  const raw = (policies as Record<string, unknown>)[RESEARCH_USE_POLICY_SLUG];
  if (typeof raw !== "object" || raw === null) {
    // The required policy is absent. Not an empty policy: an absent one.
    return { kind: "missing" };
  }

  const record = raw as Record<string, unknown>;
  if (!isNonEmptyString(record.title)) {
    return { kind: "unreadable", reason: "The policy had no title." };
  }
  const agreement = agreementPair(record.agreement, true);
  if (agreement === null) {
    return {
      kind: "unreadable",
      reason: "The policy had no readable agreement identity.",
    };
  }

  const sections: ResearchPolicySection[] = [];
  if (Array.isArray(record.sections)) {
    for (const entry of record.sections) {
      if (typeof entry !== "object" || entry === null) continue;
      const section = entry as Record<string, unknown>;
      const paragraphs = readStrings(section.paragraphs);
      const bullets = readStrings(section.bullets);
      if (!isNonEmptyString(section.heading) && paragraphs.length === 0 && bullets.length === 0) {
        continue;
      }
      sections.push(
        Object.freeze({
          heading: isNonEmptyString(section.heading) ? section.heading : "",
          paragraphs,
          bullets,
        }),
      );
    }
  }
  if (sections.length === 0) {
    return { kind: "unreadable", reason: "The policy had no readable content." };
  }

  return {
    kind: "ok",
    policy: Object.freeze({
      title: record.title,
      updated: isNonEmptyString(record.updated) ? record.updated : "",
      agreement,
      sections: Object.freeze(sections),
    }),
  };
}

// ---------------------------------------------------------------------------
// Has this customer already agreed?
// ---------------------------------------------------------------------------

export type EarlyAccessAgreementState =
  | { kind: "accepted"; agreement: EarlyAccessAgreementPair }
  | { kind: "required"; agreement: EarlyAccessAgreementPair }
  /** The private session lapsed. Not the same as "has not agreed". */
  | { kind: "locked" }
  /**
   * The session is fine, but it is not bound to an approved Early Access
   * customer, so the server has nobody to record an acceptance FOR.
   *
   * This is a different fact from a lapsed session and must not be reported as
   * one. Telling a signed-in customer their session ended sends them to unlock
   * again, which succeeds, changes nothing, and leaves them in a loop; the real
   * next step is verifying their identity. Production said exactly this
   * (`IDENTITY_REQUIRED` on a live session) and the screen claimed the session
   * had ended.
   */
  | { kind: "unverified" }
  | { kind: "error"; message: string };

/**
 * Asks the SERVER whether this session's customer has agreed.
 *
 * This is the only thing that survives a refresh, and it must be: the order
 * route asks the same gate for itself, so anything the browser remembered
 * instead could unlock a checkout the server then refuses. A fault reads as
 * `error`, never as `accepted`, so an unreachable server can only ever leave
 * the agreement in front of the customer.
 */
export async function loadEarlyAccessAgreementState(
  get: <T>(path: string) => Promise<ApiResult<T>> = (path) => apiGet(path),
): Promise<EarlyAccessAgreementState> {
  const result = await get<{ accepted?: unknown; required?: unknown }>(
    EARLY_ACCESS_AGREEMENT_STATUS_PATH,
  );

  if (result.kind === "unauthorized" || result.kind === "forbidden") return { kind: "locked" };
  if (result.kind === "denied") {
    // IDENTITY_REQUIRED means the session resolved NO CUSTOMER. The session
    // itself is fine, so this is reported as unverified rather than lapsed;
    // conflating the two is what put a false "your session has ended" in front
    // of a customer who was signed in.
    return result.code === "IDENTITY_REQUIRED"
      ? { kind: "unverified" }
      : { kind: "error", message: result.message ?? result.code };
  }
  if (result.kind === "unavailable") {
    return { kind: "error", message: "The agreement service is not available." };
  }
  if (result.kind === "error") return { kind: "error", message: result.message };

  // This screen can collect exactly one agreement. The configured identity
  // must therefore be a single, exact {kind, version} pair and acceptance must
  // be an explicit boolean. Missing, ambiguous, or malformed provenance is a
  // fault, never permission and never a client-invented default.
  const agreement = singleRequiredAgreement((result.data ?? {}).required);
  const accepted = (result.data ?? {}).accepted;
  if (agreement === null || typeof accepted !== "boolean") {
    return { kind: "error", message: UNREADABLE_AGREEMENT_IDENTITY };
  }
  return accepted
    ? { kind: "accepted", agreement }
    : { kind: "required", agreement };
}

// ---------------------------------------------------------------------------
// Recording the acceptance
// ---------------------------------------------------------------------------

export type EarlyAccessAcceptResult =
  | {
      kind: "accepted";
      alreadyAccepted: boolean;
      agreement: EarlyAccessAgreementPair;
    }
  | { kind: "locked" }
  /** Signed in, but no approved customer to record the acceptance for. */
  | { kind: "unverified" }
  | { kind: "refused"; code: string }
  | { kind: "error"; message: string };

/**
 * Records that this customer accepts the Research Use Policy.
 *
 * The body carries the configured pair and NOTHING else. No customer
 * reference, no timestamp, no evidence: the server derives every one of those
 * from the session and from its own clock, and a browser-supplied claim about
 * who agreed, or when, is not evidence of anything.
 *
 * A second acceptance is a success, not a fault. The server's table refuses the
 * duplicate row and reports `alreadyAccepted: true`, and a customer who
 * double-clicks is agreed either way.
 */
export async function acceptEarlyAccessAgreement(
  agreement: EarlyAccessAgreementPair,
  post: <T>(path: string, body: unknown) => Promise<ApiResult<T>> = (path, body) =>
    apiPost(path, body),
): Promise<EarlyAccessAcceptResult> {
  const required = agreementPair(agreement, true);
  if (required === null) {
    return { kind: "error", message: UNREADABLE_AGREEMENT_IDENTITY };
  }

  const result = await post<{
    kind?: unknown;
    version?: unknown;
    alreadyAccepted?: unknown;
  }>(EARLY_ACCESS_AGREEMENT_ACCEPT_PATH, {
    kind: required.kind,
    version: required.version,
  });

  if (result.kind === "unauthorized" || result.kind === "forbidden") return { kind: "locked" };
  if (result.kind === "denied") {
    // Same distinction as the read: no customer is not a lapsed session.
    if (result.code === "IDENTITY_REQUIRED") return { kind: "unverified" };
    // NOT_RECORDED is the server telling us the write genuinely failed. It is
    // reported as itself so the screen can say "not recorded, try again"
    // instead of quietly leaving the customer thinking they agreed.
    return { kind: "refused", code: result.code };
  }
  if (result.kind === "unavailable") {
    return { kind: "error", message: "The agreement service is not available." };
  }
  if (result.kind === "error") return { kind: "error", message: result.message };

  // The write response must confirm the same identity that was requested.
  // A 2xx body naming another pair (or no pair) cannot prove this agreement is
  // on file, so it remains closed instead of showing a false accepted state.
  const recorded = agreementPair(result.data, false);
  if (
    recorded === null ||
    recorded.kind !== required.kind ||
    recorded.version !== required.version
  ) {
    return { kind: "error", message: UNREADABLE_AGREEMENT_IDENTITY };
  }

  return {
    kind: "accepted",
    alreadyAccepted: (result.data ?? {}).alreadyAccepted === true,
    agreement: recorded,
  };
}

// ---------------------------------------------------------------------------
// Identity verification: binding this session to an approved customer
// ---------------------------------------------------------------------------

export const EARLY_ACCESS_VERIFICATION_REQUEST_PATH =
  "/api/research/early-access/verification/request";
export const EARLY_ACCESS_VERIFY_PATH = "/api/research/early-access/verify";

/**
 * Ask for a verification link.
 *
 * The server answers 202 whether or not the email names an approved customer,
 * deliberately, so this endpoint cannot be used to discover who is an Early
 * Access customer. This adapter reports that single outcome and does not try to
 * infer more from it: any "we could not find you" message here would rebuild
 * the oracle the server refuses to be.
 */
export type EarlyAccessVerificationRequestResult =
  | { kind: "requested" }
  | { kind: "locked" }
  | { kind: "error"; message: string };

export async function requestEarlyAccessVerification(
  email: string,
  post: <T>(path: string, body: unknown) => Promise<ApiResult<T>> = (path, body) =>
    apiPost(path, body),
): Promise<EarlyAccessVerificationRequestResult> {
  const result = await post<Record<string, unknown>>(EARLY_ACCESS_VERIFICATION_REQUEST_PATH, {
    email,
  });
  if (result.kind === "unauthorized" || result.kind === "forbidden") return { kind: "locked" };
  if (result.kind === "denied") {
    return result.code === "SESSION_REQUIRED"
      ? { kind: "locked" }
      : { kind: "error", message: result.message ?? result.code };
  }
  if (result.kind === "unavailable") {
    return { kind: "error", message: "The verification service is not available." };
  }
  if (result.kind === "error") return { kind: "error", message: result.message };
  return { kind: "requested" };
}

export type EarlyAccessVerifyResult =
  | { kind: "verified" }
  /** The token was not accepted. Never says why: it is single-use and bound. */
  | { kind: "refused" }
  | { kind: "locked" }
  | { kind: "error"; message: string };

/**
 * Redeem a verification link.
 *
 * The token is minted against the customer AND this session, and is single use.
 * The browser carries it across and nothing else: it names no customer, no
 * email and no session of its own, so a token pasted into the wrong session
 * binds nobody.
 */
export async function redeemEarlyAccessVerification(
  token: string,
  post: <T>(path: string, body: unknown) => Promise<ApiResult<T>> = (path, body) =>
    apiPost(path, body),
): Promise<EarlyAccessVerifyResult> {
  const result = await post<Record<string, unknown>>(EARLY_ACCESS_VERIFY_PATH, { token });
  if (result.kind === "unauthorized" || result.kind === "forbidden") return { kind: "locked" };
  if (result.kind === "denied") {
    return result.code === "SESSION_REQUIRED" ? { kind: "locked" } : { kind: "refused" };
  }
  if (result.kind === "unavailable") {
    return { kind: "error", message: "The verification service is not available." };
  }
  if (result.kind === "error") return { kind: "error", message: result.message };
  return { kind: "verified" };
}

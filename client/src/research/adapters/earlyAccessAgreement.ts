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

/**
 * The one policy a customer must accept, exactly as the deployment configures
 * it in RESEARCH_EARLY_ACCESS_REQUIRED_AGREEMENTS.
 *
 * The persisted identity is `early_access_terms` / `v1`, which is what the
 * order gate reads. The DOCUMENT shown is the Research Use Policy: the founder
 * decision is that a customer agrees to the live research-use policy and not to
 * a Terms document that labels itself a draft. These two names differing is
 * intentional, and changing either one without the other would record an
 * acceptance of something nobody was shown.
 */
export const EARLY_ACCESS_REQUIRED_AGREEMENT = Object.freeze({
  kind: "early_access_terms",
  version: "v1",
});

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
      sections: Object.freeze(sections),
    }),
  };
}

// ---------------------------------------------------------------------------
// Has this customer already agreed?
// ---------------------------------------------------------------------------

export type EarlyAccessAgreementState =
  | { kind: "accepted" }
  | { kind: "required" }
  /** The private session lapsed. Not the same as "has not agreed". */
  | { kind: "locked" }
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
  const result = await get<{ accepted?: unknown }>(EARLY_ACCESS_AGREEMENT_STATUS_PATH);

  if (result.kind === "unauthorized" || result.kind === "forbidden") return { kind: "locked" };
  if (result.kind === "denied") {
    // IDENTITY_REQUIRED arrives here: the session did not resolve a customer.
    return result.code === "IDENTITY_REQUIRED"
      ? { kind: "locked" }
      : { kind: "error", message: result.message ?? result.code };
  }
  if (result.kind === "unavailable") {
    return { kind: "error", message: "The agreement service is not available." };
  }
  if (result.kind === "error") return { kind: "error", message: result.message };

  // Only an explicit true is acceptance. A missing or oddly-typed field leaves
  // the agreement in front of the customer, which is the safe direction.
  return (result.data ?? {}).accepted === true ? { kind: "accepted" } : { kind: "required" };
}

// ---------------------------------------------------------------------------
// Recording the acceptance
// ---------------------------------------------------------------------------

export type EarlyAccessAcceptResult =
  | { kind: "accepted"; alreadyAccepted: boolean }
  | { kind: "locked" }
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
  post: <T>(path: string, body: unknown) => Promise<ApiResult<T>> = (path, body) =>
    apiPost(path, body),
): Promise<EarlyAccessAcceptResult> {
  const result = await post<{ alreadyAccepted?: unknown }>(EARLY_ACCESS_AGREEMENT_ACCEPT_PATH, {
    kind: EARLY_ACCESS_REQUIRED_AGREEMENT.kind,
    version: EARLY_ACCESS_REQUIRED_AGREEMENT.version,
  });

  if (result.kind === "unauthorized" || result.kind === "forbidden") return { kind: "locked" };
  if (result.kind === "denied") {
    if (result.code === "IDENTITY_REQUIRED") return { kind: "locked" };
    // NOT_RECORDED is the server telling us the write genuinely failed. It is
    // reported as itself so the screen can say "not recorded, try again"
    // instead of quietly leaving the customer thinking they agreed.
    return { kind: "refused", code: result.code };
  }
  if (result.kind === "unavailable") {
    return { kind: "error", message: "The agreement service is not available." };
  }
  if (result.kind === "error") return { kind: "error", message: result.message };

  return { kind: "accepted", alreadyAccepted: (result.data ?? {}).alreadyAccepted === true };
}

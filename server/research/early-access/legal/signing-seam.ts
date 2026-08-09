/**
 * Private Early Access: starting a signing session, in either real mode.
 *
 * WHY THIS FILE EXISTS
 *
 * A signing seam shaped as "return a URL to send the browser to" quietly
 * assumes external redirect signing is the only kind. This tree's working
 * signing path is the opposite: native signing happens IN the page, with no new
 * tab, no redirect and no external login, and the authenticated POST is the
 * completion. Describing it as a URL would force a real, shipped, in-page flow
 * through a shape that cannot hold it.
 *
 * So the seam is a union. A native session names the document to render and
 * sign in place. An external session names the provider document and the URL
 * the browser is sent to. Callers switch on `kind` and neither mode is bent to
 * fit the other.
 *
 * TWO RULES THIS FILE ENFORCES IN CODE
 *
 * 1. A return URL is never built from the request. Host, X-Forwarded-Host,
 *    req.hostname and req.protocol are all attacker-influenced on a normal
 *    deployment, and a return URL built from them is an open redirect that
 *    Xenios itself hands to the customer. Only a configured canonical origin is
 *    accepted, and it is validated before use. The existing esign provider
 *    already takes its redirect from OPENSIGN_REDIRECT_URL and passes
 *    `redirectUrl: null` at the call site; this keeps that property rather than
 *    introducing the weakness alongside it.
 *
 * 2. A redirect back is never completion. There is deliberately no function
 *    here that turns a return into a signed state. `interpretRedirectReturn`
 *    exists precisely so the only available answer is "recheck the records",
 *    because the browser saying "done" is a claim by the least trusted party in
 *    the transaction. Completion is recomputed in package-completion.ts from
 *    immutable records, on every read.
 */

import {
  EARLY_ACCESS_RETURN_IS_NOT_COMPLETION,
  type EarlyAccessSigningStart,
} from "@shared/research/early-access-hardening";

/**
 * The session shape is the frozen contract's, not this lane's.
 *
 * `EarlyAccessSigningStart` is a union of a native in-page session and a
 * provider-hosted one, which is exactly the shape this lane needs, so it is
 * re-exported rather than restated. A second vocabulary for the same fact would
 * have to be translated at every boundary, and translations are where a native
 * session quietly becomes a redirect.
 *
 * Note what the frozen union does NOT carry: a return or redirect URL. That is
 * deliberate and this lane agrees with it. The provider path here advances only
 * on a verified webhook and already passes `redirectUrl: null` when creating a
 * session, so a return URL would be decoration on a security boundary.
 */
export type { EarlyAccessSigningStart };

export const SIGNING_SEAM_REFUSALS = [
  "signing_disabled",
  "no_signing_mode_available",
  "document_not_signable",
  "no_published_version",
  "canonical_origin_missing",
  "canonical_origin_invalid",
  "return_path_invalid",
] as const;

export type SigningSeamRefusal = (typeof SIGNING_SEAM_REFUSALS)[number];

export type StartSigningResult =
  | Readonly<{ ok: true; session: EarlyAccessSigningStart }>
  | Readonly<{ ok: false; code: SigningSeamRefusal; detail?: string }>;

/**
 * Which real signing modes this deployment has.
 *
 * Native needs only RESEARCH_ESIGN_ENABLED; it carries no provider credential.
 * External additionally needs the provider selected and configured. The
 * defaults below mean an unconfigured deployment signs nothing.
 */
export type SigningModeAvailability = Readonly<{
  nativeEnabled: boolean;
  externalEnabled: boolean;
}>;

/** The frozen contract's mode names, so the seam has one vocabulary. */
export type SigningMode = "native" | "provider_hosted";

export type SigningModeSelection =
  | Readonly<{ ok: true; mode: SigningMode }>
  | Readonly<{ ok: false; code: "signing_disabled" | "no_signing_mode_available" }>;

/**
 * Choose the signing mode.
 *
 * Native wins whenever it is available. That is not a preference: it is the
 * mode this tree has actually wired to the shipped UI, it keeps the member
 * inside an authenticated page, and it produces the immutable SignatureRecord
 * the completion check reads. External redirect is used only where native is
 * unavailable and a provider is genuinely configured, so nothing is ever pushed
 * out to an external signer merely because that path exists.
 */
export function selectSigningMode(availability: SigningModeAvailability): SigningModeSelection {
  if (availability.nativeEnabled) return Object.freeze({ ok: true, mode: "native" } as const);
  if (availability.externalEnabled) {
    return Object.freeze({ ok: true, mode: "provider_hosted" } as const);
  }
  return Object.freeze({ ok: false, code: "signing_disabled" } as const);
}

export type CanonicalOriginResult =
  | Readonly<{ ok: true; origin: string }>
  | Readonly<{ ok: false; code: "canonical_origin_missing" | "canonical_origin_invalid" }>;

/**
 * Validate the one configured origin any Xenios-built external URL may use.
 *
 * Refuses anything that is not a bare https origin: no http, no credentials in
 * the authority, no path, query or fragment. Those are the shapes that let a
 * configured value carry a second destination or a leaked secret.
 */
export function resolveCanonicalOrigin(configured: unknown): CanonicalOriginResult {
  if (typeof configured !== "string" || configured.trim().length === 0) {
    return Object.freeze({ ok: false, code: "canonical_origin_missing" } as const);
  }
  let url: URL;
  try {
    url = new URL(configured.trim());
  } catch {
    return Object.freeze({ ok: false, code: "canonical_origin_invalid" } as const);
  }
  if (url.protocol !== "https:") {
    return Object.freeze({ ok: false, code: "canonical_origin_invalid" } as const);
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return Object.freeze({ ok: false, code: "canonical_origin_invalid" } as const);
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    return Object.freeze({ ok: false, code: "canonical_origin_invalid" } as const);
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    return Object.freeze({ ok: false, code: "canonical_origin_invalid" } as const);
  }
  return Object.freeze({ ok: true, origin: url.origin } as const);
}

export type ReturnUrlResult =
  | Readonly<{ ok: true; url: string }>
  | Readonly<{ ok: false; code: "canonical_origin_missing" | "canonical_origin_invalid" | "return_path_invalid" }>;

/**
 * Build a Xenios URL from the canonical origin and a same-site path.
 *
 * The frozen signing union carries no return URL, so this has one real
 * consumer today: validating a configured redirect before it is handed to an
 * external provider. `OPENSIGN_REDIRECT_URL` is currently read straight from
 * the environment and passed through with no validation at all, so an operator
 * typo or a copied staging value becomes a destination Xenios sends signers to.
 * Running it through here refuses anything that is not a plain https URL on the
 * canonical origin.
 *
 * The path must be a plain absolute path on this site. A protocol-relative
 * `//evil.example` and a backslash variant both parse as another authority in
 * at least one common client, so both are refused rather than normalized.
 *
 * There is no overload of this function that accepts a request. That absence is
 * the control: an open redirect cannot be introduced by passing the wrong
 * argument, because the wrong argument has nowhere to go.
 */
export function buildReturnUrl(configuredOrigin: unknown, path: string): ReturnUrlResult {
  const origin = resolveCanonicalOrigin(configuredOrigin);
  if (!origin.ok) return Object.freeze({ ok: false, code: origin.code } as const);
  if (typeof path !== "string" || !path.startsWith("/")) {
    return Object.freeze({ ok: false, code: "return_path_invalid" } as const);
  }
  if (path.startsWith("//") || path.startsWith("/\\") || path.includes("\\")) {
    return Object.freeze({ ok: false, code: "return_path_invalid" } as const);
  }
  let candidate: URL;
  try {
    candidate = new URL(path, `${origin.origin}/`);
  } catch {
    return Object.freeze({ ok: false, code: "return_path_invalid" } as const);
  }
  if (candidate.origin !== origin.origin) {
    return Object.freeze({ ok: false, code: "return_path_invalid" } as const);
  }
  return Object.freeze({ ok: true, url: candidate.toString() } as const);
}

/**
 * What a browser coming back from an external signer proves.
 *
 * Exactly one thing, always: that the records must be read again. The return
 * carries no completion, no signature and no timestamp, whatever query
 * parameters it arrives with. This function has one possible outcome by
 * design, so no caller can find a branch where a redirect advanced the gate.
 */
export type RedirectReturnInterpretation = Readonly<{
  outcome: "recheck_required";
  /** Stated so a reader does not have to infer it from the absence of fields. */
  proves: "nothing";
  /** The frozen contract's named rule, carried so a test can cite it. */
  rule: typeof EARLY_ACCESS_RETURN_IS_NOT_COMPLETION;
}>;

export function interpretRedirectReturn(): RedirectReturnInterpretation {
  return Object.freeze({
    outcome: "recheck_required",
    proves: "nothing",
    rule: EARLY_ACCESS_RETURN_IS_NOT_COMPLETION,
  } as const);
}

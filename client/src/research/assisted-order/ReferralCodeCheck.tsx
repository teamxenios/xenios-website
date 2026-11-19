import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { normalizeReadableReferralCode, type RecommendationCapture, type RecommendationContext } from "@shared/research/referral-v1";

/**
 * An explicit check of a typed referral code against the canonical Referral V1
 * authority, on the same resolve -> bootstrap -> capture path as a shared link.
 *
 * The typed text is still sent with the request as customer-reported text; this
 * check never changes that. It only records a provisional V1 touch for this
 * browser, and the server alone decides attribution, first-valid winner and any
 * account binding. Nothing here states a discount, credit or commission.
 */

type Result<T> = { kind: "ok"; data: T } | { kind: "error"; code: string; status: number };
/** The current sign-in, read once: `session` is the account and sign-in session, `token` the credential. */
export type ReferralCheckIdentity = Readonly<{ session: string | null; token: string | null }>;
export interface ReferralCheckDeps {
  resolve(code: string): Promise<Result<RecommendationContext>>;
  bootstrap(): Promise<Result<{ csrfToken: string }>>;
  identity(): Promise<ReferralCheckIdentity>;
  /** Capture with exactly the credential that `identity` returned, never a fresh lookup. */
  capture(code: string, csrf: string, token: string | null): Promise<Result<RecommendationCapture>>;
  /** Calls back when the sign-in may have changed; returns the unsubscribe. */
  watchIdentity?(onChange: () => void): () => void;
}

export type ReferralCheckOutcome =
  | "visit" | "visit_signed_in" | "saved" | "kept_earlier" | "own_code" | "retained_ineligible"
  | "not_recognized" | "cookies" | "busy" | "signed_out" | "sign_in_changed" | "withdrawn" | "unavailable";
export type ReferralCheckResult = Readonly<{ outcome: ReferralCheckOutcome; session: string | null }>;

export const REFERRAL_CHECK_MESSAGES: Readonly<Record<ReferralCheckOutcome, string>> = {
  visit: "Code recognized for this visit on this browser. It was shared by an approved Xenios partner. If you sign in or create an account, Xenios may connect it to that account. An earlier valid referral is not replaced.",
  visit_signed_in: "Code recognized for this visit: shared by an approved Xenios partner. It is not saved to your account. An earlier valid referral is not replaced.",
  saved: "Code recognized and saved to your signed-in account.",
  kept_earlier: "An earlier referral is already recognized, and it stays in place. This code did not replace it.",
  own_code: "This is your own code, so it is not counted as a referral.",
  retained_ineligible: "An earlier referral is kept but is not currently eligible. This code did not replace it.",
  not_recognized: "This code isn't recognized. It may be mistyped, expired or no longer active. You can still send your request.",
  cookies: "The code was not confirmed. Allow site cookies for Xenios, then try again.",
  busy: "Too many checks just now. Wait a moment, then try again.",
  signed_out: "Your sign-in has ended. Sign in again, then check the code.",
  sign_in_changed: "Your sign-in changed while the code was being checked, so no result is shown. Check the code again.",
  withdrawn: "Your sign-in changed, so the earlier result no longer applies. Check the code again.",
  unavailable: "We can't check the code right now. You can still send your request.",
};

const RETRYABLE: ReadonlySet<ReferralCheckOutcome> = new Set(["cookies", "busy", "signed_out", "sign_in_changed", "withdrawn", "unavailable"]);
/** Answers from a capture, which depend on the sign-in they were given under. Only these are withdrawn when it changes. */
const SIGN_IN_SCOPED: ReadonlySet<ReferralCheckOutcome> = new Set(["visit", "visit_signed_in", "saved", "kept_earlier", "own_code", "retained_ineligible"]);

/**
 * Only the authority's own answer means "not recognized": an unknown opaque link,
 * or a readable code that is missing, expired or revoked (`code_unavailable`).
 * Any other 404, and every 503, is a check that could not run.
 */
const NOT_RECOGNIZED_CODES: ReadonlySet<string> = new Set(["invalid_link", "not_found", "code_unavailable"]);

function fromError(result: { status: number; code: string }, stage: "resolve" | "bootstrap" | "capture"): ReferralCheckOutcome {
  if (result.status === 429) return "busy";
  if (result.status === 401) return "signed_out";
  if (result.status === 403) return "cookies";
  if (stage !== "bootstrap" && (result.status === 404 || result.status === 410) && NOT_RECOGNIZED_CODES.has(result.code)) return "not_recognized";
  return "unavailable";
}

/**
 * Resolve first, so an unknown code records nothing; capture only a verified context.
 * `current` reports whether the customer still has this exact text. Once it is false
 * the check stops before the next call and returns null, so edited-away text is never
 * captured.
 */
export async function checkReferralCode(code: string, deps: ReferralCheckDeps, current: () => boolean = () => true): Promise<ReferralCheckResult | null> {
  const done = (outcome: ReferralCheckOutcome, session: string | null = null): ReferralCheckResult => ({ outcome, session });
  const resolved = await deps.resolve(code);
  if (!current()) return null;
  if (resolved.kind === "error") return done(fromError(resolved, "resolve"));
  if (resolved.data.valid !== true || resolved.data.sharedBy !== "an approved Xenios partner") return done("not_recognized");
  const boot = await deps.bootstrap();
  if (!current()) return null;
  if (boot.kind === "error") return done(fromError(boot, "bootstrap"));
  const csrf = boot.data.csrfToken;
  if (typeof csrf !== "string" || !csrf || csrf.length > 2048 || /[\r\n]/.test(csrf)) return done("cookies");
  // A credential whose account and session cannot be told apart cannot be fenced, so it is not sent.
  const before = await deps.identity();
  if (!current()) return null;
  if (before.token && !before.session) return done("unavailable");
  const captured = await deps.capture(code, csrf, before.token);
  if (!current()) return null;
  if (captured.kind === "error") return done(fromError(captured, "capture"));
  // An answer about one sign-in is never described to another.
  const after = await deps.identity();
  if (!current()) return null;
  if (after.session !== before.session) return done("sign_in_changed");
  const { attribution, accountBinding, conflictPreserved, bindingConflictPreserved } = captured.data;
  if (attribution === "self_referral") return done("own_code", before.session);
  if (attribution === "retained_ineligible") return done("retained_ineligible", before.session);
  if (attribution !== "recognized") return done("unavailable");
  if (conflictPreserved === true || bindingConflictPreserved === true) return done("kept_earlier", before.session);
  return done(accountBinding === "bound" ? "saved" : accountBinding === "not_bound" ? "visit_signed_in" : "visit", before.session);
}

/** Loaded only when the customer asks for a check, so the guest form does not carry the sign-in client. */
async function defaultDeps(): Promise<ReferralCheckDeps> {
  const [api, auth] = await Promise.all([import("../recommendation/api"), import("@/lib/supabaseBrowser")]);
  return {
    resolve: api.resolveRecommendation,
    bootstrap: api.bootstrapRecommendation,
    async identity() {
      const token = await api.recommendationMemberToken();
      return { token, session: token ? api.readableAliasSession(token) : null };
    },
    capture: (code, csrf, token) => api.captureRecommendation(code, csrf, token),
    watchIdentity(onChange) {
      let stopped = false;
      let subscription: { unsubscribe(): void } | undefined;
      void auth.getSupabaseBrowser().then(client => {
        if (stopped || !client) return;
        subscription = client.auth.onAuthStateChange(() => onChange()).data.subscription;
      }).catch(() => undefined);
      // Another tab may have signed out or in while this one was hidden.
      const visible = () => { if (document.visibilityState === "visible") onChange(); };
      document.addEventListener("visibilitychange", visible);
      return () => { stopped = true; subscription?.unsubscribe(); document.removeEventListener("visibilitychange", visible); };
    },
  };
}

export function ReferralCodeCheck({ code, disabled, deps }: { code: string; disabled?: boolean; deps?: ReferralCheckDeps }) {
  const trimmed = code.trim();
  // The readable-code syntax of the Referral V1 authority; the reported field keeps its own 2-24 contract.
  const typed = normalizeReadableReferralCode(trimmed) !== null ? trimmed : "";
  const [boundResult, setBoundResult] = useState<Readonly<{
    code: string; deps: ReferralCheckDeps | undefined; value: ReferralCheckResult;
  }> | null>(null);
  // A previous dependency's answer is not displayed even before layout cleanup.
  const result = boundResult?.code === typed && boundResult.deps === deps ? boundResult.value : null;
  const [checking, setChecking] = useState(false);
  const generation = useRef(0);
  const alive = useRef(true);
  const resolvedDeps = useRef<ReferralCheckDeps | null>(deps ?? null);
  useLayoutEffect(() => { resolvedDeps.current = deps ?? null; }, [deps]);
  useEffect(() => () => { alive.current = false; generation.current++; }, []);
  // Retire pending and displayed checks on a committed code or dependency change.
  // Control-only renders with the same inputs retain the existing check.
  useLayoutEffect(() => { generation.current++; setBoundResult(null); setChecking(false); }, [typed, deps]);

  // A result also belongs to the sign-in it was given under. Withdraw it when that changes.
  useEffect(() => {
    const current = resolvedDeps.current;
    if (!result || !SIGN_IN_SCOPED.has(result.outcome) || !current?.watchIdentity) return;
    const shown = generation.current;
    return current.watchIdentity(() => {
      if (!alive.current || shown !== generation.current) return;
      void current.identity().then(now => {
        if (alive.current && shown === generation.current && now.session !== result.session) {
          generation.current++;
          // Say so, rather than letting the answer the customer just read disappear.
          setBoundResult({ code: typed, deps, value: { outcome: "withdrawn", session: null } });
        }
      }, () => undefined);
    });
  }, [result, typed, deps]);

  const run = async () => {
    if (!typed || checking) return;
    const current = ++generation.current;
    setChecking(true);
    setBoundResult(null);
    const stillCurrent = () => alive.current && current === generation.current;
    let next: ReferralCheckResult | null;
    try {
      const active = resolvedDeps.current ?? await defaultDeps();
      if (!stillCurrent()) return;
      resolvedDeps.current = active;
      next = stillCurrent() ? await checkReferralCode(typed, active, stillCurrent) : null;
    } catch { next = { outcome: "unavailable", session: null }; }
    if (!stillCurrent() || !next) return;
    setChecking(false);
    setBoundResult({ code: typed, deps, value: next });
  };

  if (!typed) return null;
  const outcome = result?.outcome ?? null;
  return <div className="xenios-order-referral-check" data-testid="referral-code-check">
    {/* Stays enabled while checking, so keyboard focus is not dropped; run() ignores a second press. */}
    <button type="button" className="xenios-order-link" disabled={disabled} aria-disabled={checking || undefined} onClick={() => void run()}>
      {checking ? "Checking…" : outcome && RETRYABLE.has(outcome) ? "Check the code again" : "Check this code"}
    </button>
    <p role="status" aria-live="polite">{checking ? "Checking the code…" : outcome ? REFERRAL_CHECK_MESSAGES[outcome] : ""}</p>
    {/* Shown before the first press: a recognized code is recorded, and a signed-in check may bind the account. The capture keeps an earlier winning referral, so that is said too. */}
    <p>If the code is recognized, checking records it for this browser and, when you&rsquo;re signed in, may save it to your account. An earlier valid referral is not replaced. Checking does not apply a discount, create an account or place an order.</p>
  </div>;
}

import { useEffect, useRef, useState } from "react";
import type { RecommendationCapture, RecommendationContext } from "@shared/research/referral-v1";

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
export interface ReferralCheckDeps {
  resolve(code: string): Promise<Result<RecommendationContext>>;
  bootstrap(): Promise<Result<{ csrfToken: string }>>;
  capture(code: string, csrf: string): Promise<Result<RecommendationCapture>>;
}

/**
 * The readable-code syntax of the Referral V1 alias authority (3-24 letters, digits or
 * hyphens, starting with a letter or digit). The reported intake field keeps its own
 * 2-24 contract; a code outside this syntax is never sent for a check.
 * When the authority's `normalizeReadableReferralCode` is composed, use it here instead.
 */
export const CHECKABLE_REFERRAL_CODE = /^[A-Za-z0-9][A-Za-z0-9-]{2,23}$/;

export type ReferralCheckOutcome =
  | "visit" | "visit_signed_in" | "saved" | "kept_earlier" | "own_code" | "retained_ineligible"
  | "not_recognized" | "cookies" | "busy" | "signed_out" | "unavailable";

export const REFERRAL_CHECK_MESSAGES: Readonly<Record<ReferralCheckOutcome, string>> = {
  visit: "Code recognized. It belongs to an approved Xenios partner and is recognized for this visit on this browser. If you sign in or create an eligible account, Xenios may connect it to that account. An earlier valid referral is not replaced.",
  visit_signed_in: "Code recognized for this visit: shared by an approved Xenios partner. An earlier valid referral is not replaced.",
  saved: "Code recognized and saved to your signed-in account.",
  kept_earlier: "An earlier referral is already recognized, and it stays in place. This code did not replace it.",
  own_code: "This is your own code, so it is not counted as a referral.",
  retained_ineligible: "An earlier referral is kept but is not currently eligible. This code did not replace it.",
  not_recognized: "This code isn't recognized. It may be mistyped, expired or no longer active. You can still send your request.",
  cookies: "The code was not confirmed. Allow site cookies for Xenios, then try again.",
  busy: "Too many checks just now. Wait a moment, then try again.",
  signed_out: "Your sign-in has ended. Sign in again, then check the code.",
  unavailable: "We can't check the code right now. You can still send your request.",
};

const RETRYABLE: ReadonlySet<ReferralCheckOutcome> = new Set(["cookies", "busy", "signed_out", "unavailable"]);

/** Only the authority's own answer means "not recognized"; any other 404 is an unavailable check. */
const NOT_RECOGNIZED_CODES: ReadonlySet<string> = new Set(["invalid_link", "not_found"]);

function fromError(result: { status: number; code: string }, stage: "resolve" | "bootstrap" | "capture"): ReferralCheckOutcome {
  if (result.status === 429) return "busy";
  if (result.status === 401) return "signed_out";
  if (result.status === 403) return "cookies";
  if (stage !== "bootstrap" && (result.status === 404 || result.status === 410) && NOT_RECOGNIZED_CODES.has(result.code)) return "not_recognized";
  return "unavailable";
}

/** Resolve first, so an unknown code records nothing; capture only a verified context. */
export async function checkReferralCode(code: string, deps: ReferralCheckDeps): Promise<ReferralCheckOutcome> {
  const resolved = await deps.resolve(code);
  if (resolved.kind === "error") return fromError(resolved, "resolve");
  if (resolved.data.valid !== true || resolved.data.sharedBy !== "an approved Xenios partner") return "not_recognized";
  const boot = await deps.bootstrap();
  if (boot.kind === "error") return fromError(boot, "bootstrap");
  const csrf = boot.data.csrfToken;
  if (typeof csrf !== "string" || !csrf || csrf.length > 2048 || /[\r\n]/.test(csrf)) return "cookies";
  const captured = await deps.capture(code, csrf);
  if (captured.kind === "error") return fromError(captured, "capture");
  const { attribution, accountBinding, conflictPreserved, bindingConflictPreserved } = captured.data;
  if (attribution === "self_referral") return "own_code";
  if (attribution === "retained_ineligible") return "retained_ineligible";
  if (attribution !== "recognized") return "unavailable";
  if (conflictPreserved === true || bindingConflictPreserved === true) return "kept_earlier";
  return accountBinding === "bound" ? "saved" : accountBinding === "not_bound" ? "visit_signed_in" : "visit";
}

/** Loaded only when the customer asks for a check, so the guest form does not carry the sign-in client. */
async function defaultDeps(): Promise<ReferralCheckDeps> {
  const api = await import("../recommendation/api");
  return { resolve: api.resolveRecommendation, bootstrap: api.bootstrapRecommendation, capture: (code, csrf) => api.captureRecommendation(code, csrf) };
}

export function ReferralCodeCheck({ code, disabled, deps }: { code: string; disabled?: boolean; deps?: ReferralCheckDeps }) {
  const trimmed = code.trim();
  const typed = CHECKABLE_REFERRAL_CODE.test(trimmed) ? trimmed : "";
  const [outcome, setOutcome] = useState<ReferralCheckOutcome | null>(null);
  const [checking, setChecking] = useState(false);
  const generation = useRef(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; generation.current++; }, []);
  // A result belongs to the exact text that was checked; editing the code withdraws it.
  useEffect(() => { generation.current++; setOutcome(null); setChecking(false); }, [typed]);

  const run = async () => {
    if (!typed || checking) return;
    const current = ++generation.current;
    setChecking(true);
    setOutcome(null);
    let next: ReferralCheckOutcome;
    try { next = await checkReferralCode(typed, deps ?? await defaultDeps()); }
    catch { next = "unavailable"; }
    if (!alive.current || current !== generation.current) return;
    setChecking(false);
    setOutcome(next);
  };

  if (!typed) return null;
  return <div className="xenios-order-referral-check" data-testid="referral-code-check">
    <button type="button" style={{ minHeight: 44 }} disabled={disabled || checking} onClick={() => void run()}>
      {checking ? "Checking…" : outcome && RETRYABLE.has(outcome) ? "Check the code again" : "Check this code"}
    </button>
    <p role="status" aria-live="polite">{checking ? "Checking the code…" : outcome ? REFERRAL_CHECK_MESSAGES[outcome] : ""}</p>
    {outcome && <p>Checking a code does not apply a discount, create an account or place an order.</p>}
  </div>;
}

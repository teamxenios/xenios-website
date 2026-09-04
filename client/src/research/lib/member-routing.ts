import type { MemberInfo } from "../core";
import { safeResearchReturnTo } from "@shared/research/auth-return-to";
export { safeResearchReturnTo } from "@shared/research/auth-return-to";

const MEMBER_ROOT = "/research/member";
const ACTIVATION_ROOT = "/research/activate";
const ACCESS_STATE_ROOT = "/research/access-state";

/**
 * The distinct screen for a server-issued member denial code. activation
 * already has its own canonical screen; every other coded refusal renders on
 * the access-state page, which keys one distinct screen per code. The code is
 * carried in the query string as transport only: it always originated
 * server-side, and the page grants nothing (it renders explanations, so a
 * hand-typed code can reveal or unlock nothing).
 */
export function denialDestination(code: string): string {
  if (code === "activation_required") return ACTIVATION_ROOT;
  return `${ACCESS_STATE_ROOT}?code=${encodeURIComponent(code)}`;
}

/**
 * Route a server-verified member by their server-reported status, following
 * the STATUS half of the server guard's classification
 * (server/research/member-auth.ts requireActiveMember): pending_activation ->
 * activation flow, past_due -> the billing screen, anything else non-active ->
 * the inactive-membership screen. The status field is the server's own answer
 * from /api/research/member/me; the client maps it to a screen and decides
 * nothing. The guard's SECOND half (billing_state enforcement for
 * status-active members, emitted as dynamic billing_* codes by member-content
 * APIs) is not visible on /member/me and surfaces in place instead, via
 * ResearchDenialNotice with the billing-family copy in lib/denials.ts.
 */
export function memberDestination(member: MemberInfo, requestedReturnTo?: string | null): string {
  const safeReturnTo = safeResearchReturnTo(requestedReturnTo);
  if (member.status === "active") {
    // Public Care/Early Access destinations retain their own gates. Returning
    // there never grants Care or commerce authority. Activation is not a task
    // for an already-active member, and no requested path retains the default.
    const pathname = safeReturnTo?.split("?", 1)[0];
    return safeReturnTo && pathname !== ACTIVATION_ROOT && pathname !== "/research"
      ? safeReturnTo : MEMBER_ROOT;
  }
  if (member.status === "pending_activation") return ACTIVATION_ROOT;
  if (member.status === "past_due") return denialDestination("billing_past_due");
  return denialDestination("membership_inactive");
}

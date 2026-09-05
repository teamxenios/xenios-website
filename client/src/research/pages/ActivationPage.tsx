import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { isRecoveryAccessToken } from "@/lib/supabaseBrowser";
import { researchAuthPath } from "@shared/research/auth-return-to";
import { useResearch } from "../core";
import { ACCOUNT_PORTAL_ROUTES, ACCESS_ROUTES } from "../lib/routes";
import { ResearchPublicShell } from "../ui/shells";
import { ResearchEmptyState, ResearchLoadingState } from "../ui/kit";

// This historical route no longer sells or performs paid membership activation.
// Only the canonical member response establishes active customer access. No
// application label, legacy balance or browser-selected status overrides it.
export default function ActivationPage() {
  const { member, memberToken, memberChecking, memberSessionStatus, recovery } = useResearch();
  const recoveryOnly = recovery !== "none" || (!!memberToken && isRecoveryAccessToken(memberToken));
  const verifiedSession = memberSessionStatus === "authenticated" && !!memberToken;
  const active = verifiedSession && member?.status === "active";

  return (
    <>
      <SeoHead title="Account access, Xenios Research" description="Continue to your approved Xenios customer account or review your account access." path={ACCESS_ROUTES.activate} />
      <ResearchPublicShell eyebrow="Account access" title="Your Xenios account" lead="Account approval and sign-in are separate from product, partner and Care eligibility.">
        {memberChecking || memberSessionStatus === "checking" ? <ResearchLoadingState label="Checking your account" />
          : recoveryOnly ? (
            <ResearchEmptyState title="Finish account recovery first." body="A recovery session cannot open customer access. Complete recovery, then sign in normally."
              action={<Link href={researchAuthPath(ACCESS_ROUTES.signIn, ACCOUNT_PORTAL_ROUTES.home)} className="btn btn-primary">Normal sign-in</Link>} />
          ) : memberSessionStatus === "verification_failed" ? (
            <ResearchEmptyState title="Account access could not be verified." body="Sign in again to check your account. No access or payment requirement is inferred from this failed check."
              action={<Link href={researchAuthPath(ACCESS_ROUTES.signIn, ACCOUNT_PORTAL_ROUTES.home)} className="btn btn-primary">Sign in again</Link>} />
          ) : !verifiedSession ? (
            <ResearchEmptyState title="Sign in to your account." body="Use your normal Xenios email and password. Paid membership activation is not required by this page."
              action={<div className="flex flex-wrap gap-3">
                <Link href={researchAuthPath(ACCESS_ROUTES.signIn, ACCOUNT_PORTAL_ROUTES.home)} className="btn btn-primary">Sign in</Link>
                <Link href={researchAuthPath(ACCESS_ROUTES.resetPassword, ACCOUNT_PORTAL_ROUTES.home)} className="btn btn-secondary">Forgot password</Link>
              </div>} />
          ) : active ? (
            <ResearchEmptyState title="Your customer account is active." body="Your signed-in account has active customer access. No membership activation payment is requested."
              action={<Link href={ACCOUNT_PORTAL_ROUTES.home} className="btn btn-primary">Open my account</Link>} />
          ) : (
            <ResearchEmptyState title="Account access needs review." body="Your signed-in customer account is not active or could not be confirmed. An application approval does not override a pending, paused, past-due, cancelled or closed account. Contact support for the next authorized step."
              action={<Link href={ACCESS_ROUTES.support} className="btn btn-secondary">Contact account support</Link>} />
          )}
        <p className="body-s text-ink-mute mt-8 max-w-[56ch]">Product purchase requirements, referral eligibility and Care authorization remain separate server-controlled decisions.</p>
        <Link href={ACCESS_ROUTES.gateway} className="btn btn-ghost mt-6">Back to Xenios Research</Link>
      </ResearchPublicShell>
    </>
  );
}

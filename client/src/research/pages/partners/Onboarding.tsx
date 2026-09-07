import { useResearch } from "../../core";
import { Link } from "wouter";
import { ResearchPartnerShell } from "../../ui/shells";
import {
  ResearchCapabilityBoundary,
  ResearchDenialNotice,
  ResearchEmptyState,
  ResearchLoadingState,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
  capabilityStatusOrPending,
} from "../../ui/kit";
import { getPartnerOnboarding } from "../../adapters/partner";
import { ACCOUNT_PORTAL_ROUTES, ACCESS_ROUTES, PARTNER_ROUTES } from "../../lib/routes";
import { IDENTITY_RECORD_LABELS, readPartnerOnboardingReport } from "../../partner-crm/onboarding-records";
import { usePartnerCapabilities, usePartnerResource } from "./shared";

// ---------------------------------------------------------------------------
// Existing onboarding GET reports identity and versioned acknowledgement facts,
// not a review receipt or activation decision. Payout navigation retains its
// affiliate_payouts capability boundary; no payout or tax facts are fetched here.
// ---------------------------------------------------------------------------

const STEPS = [
  {
    title: "Identity verification",
    body: "We confirm who you are before your link exists. One account per person, always under a real name.",
  },
  {
    title: "Partner agreement",
    body: "The full Research Rep agreement is presented for review and acceptance. Nothing is shareable before it is accepted.",
  },
  {
    title: "Compliance certification",
    body: "The training modules and certification review. Current training and reviewed evidence are required before activation.",
  },
  {
    title: "Payout and tax clearance",
    body: "Payout readiness and tax documentation are reviewed before certification and activation. No fee or payment is required to begin customer access.",
  },
];

export default function Onboarding() {
  const { memberToken, memberChecking } = useResearch();

  return (
    <ResearchPartnerShell
      title="Onboarding"
      lead="The program steps and onboarding facts returned for your partner account. The steps are guidance; the report does not establish that you are approved, activated, or ready to share."
    >
      <section aria-labelledby="po-steps">
        <h2 id="po-steps" className="mono-cap text-ink-mute">
          The onboarding steps
        </h2>
        <ol className="grid gap-4 mt-4" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {STEPS.map((step, i) => (
            <li key={step.title} className="card flex items-start gap-4">
              <span className="mono-label text-ink-mute" aria-hidden="true">
                {i + 1}
              </span>
              <span>
                <span className="body-m font-700 block">{step.title}</span>
                <span className="body-s text-ink-2 block mt-1">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <nav aria-label="Onboarding help" className="flex flex-wrap gap-3 my-6">
        <Link href={ACCOUNT_PORTAL_ROUTES.home} className="btn btn-secondary">My account</Link>
        <Link href={PARTNER_ROUTES.training} className="btn btn-secondary">Training records</Link>
        <Link href={PARTNER_ROUTES.support} className="btn btn-secondary">Partner support</Link>
      </nav>
      <ResearchSecureNotice>
        Identity and agreement markers are separate from customer approval, partner activation, and sharing or product permissions.
        This report does not start an identity review, accept an agreement, or change account access. A marker is not a review receipt or a promise about the next step.
      </ResearchSecureNotice>

      <section aria-labelledby="po-status" className="mt-10">
        <h2 id="po-status" className="mono-cap text-ink-mute">
          Reported onboarding records
        </h2>
        <div className="mt-4">
          {memberChecking ? <ResearchLoadingState label="Checking your account" />
            : memberToken ? <OnboardingReporting key={memberToken} token={memberToken} /> : <SignInNotice />}
        </div>
      </section>
    </ResearchPartnerShell>
  );
}

function SignInNotice() {
  return <ResearchEmptyState title="Sign in to view reported onboarding records"
    body="Use your Xenios account. The server verifies partner reporting access separately."
    action={<Link href={ACCESS_ROUTES.signIn} className="btn btn-primary">Sign in</Link>} />;
}

function OnboardingReporting({ token }: { token: string }) {
  const { state, denied, data, reload } = usePartnerResource<unknown>(getPartnerOnboarding, token);
  const capabilities = usePartnerCapabilities(token);
  const payoutStatus = capabilityStatusOrPending(capabilities, "affiliate_payouts");
  if (state === "unauthorized") return <SignInNotice />;
  if (denied) return <><ResearchDenialNotice code={denied.code} />
    <p className="body-s mt-4">Partner reporting access is separate from customer approval. No account permissions were changed.</p></>;
  const report = state === "ok" ? readPartnerOnboardingReport(data) : null;
  return <>
    <div className="flex justify-end mb-4"><button type="button" className="btn btn-secondary" onClick={() => void reload()}>Refresh onboarding records</button></div>
    <ResearchRouteBoundary state={state === "ok" && report === null ? "error" : state}
      errorMessage="Onboarding records could not be read safely. Please try again."
      onRetry={() => void reload()}
      unavailableTitle="Onboarding reporting is unavailable right now"
      unavailableBody="The source could not be loaded. This does not establish your identity status, agreement history, or whether action is required.">
      {report && <>
        <div className="card" aria-label="Reported identity marker">
          <p className="mono-label text-ink-mute">Reported identity marker</p>
          <div className="mt-2"><ResearchStatusBadge label={`${IDENTITY_RECORD_LABELS[report.verification.state]} (reported)`} tone="neutral" /></div>
          <p className="body-s text-ink-2 mt-2">The source does not supply an identity review receipt, date, or reviewer here. This marker does not confirm that a new review is queued or that no action is required.</p>
        </div>
        <div className="card mt-4" aria-label="Reported agreement records">
          <p className="mono-label text-ink-mute">Reported agreement records</p>
          <p className="body-s text-ink-2 mt-2">Acknowledgement is reported for each listed key and version. It does not itself confirm current partner eligibility, a signed document, or completion of all onboarding requirements.</p>
          {report.agreements.length === 0 ? <ResearchEmptyState title="No agreement records were returned."
            body="This is not evidence that no agreements exist, none have been presented, or your agreement history is complete." />
            : <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="mt-4 grid gap-3">
              {report.agreements.map((agreement) => <li key={agreement.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="body-s">{agreement.title}<span className="block text-ink-2">Reported version: {agreement.version}</span></span>
                <ResearchStatusBadge label={agreement.acknowledged ? "Acknowledgement recorded (reported)" : "Acknowledgement not recorded for this version"} tone="neutral" />
              </li>)}
            </ul>}
        </div>
        <section aria-labelledby="po-payout" className="mt-10">
          <h2 id="po-payout" className="mono-cap text-ink-mute">Payout and tax clearance</h2>
          <div className="mt-4">
            <ResearchCapabilityBoundary status={payoutStatus}>
              <div className="card" aria-label="Payout reporting handoff">
                <p className="body-m font-700">Payout and tax status are not provided by this report.</p>
                <p className="body-s text-ink-2 mt-2">Current payout readiness and tax clearance are not verified here. Opening a reporting page does not set up a provider, submit tax information, or initiate a payout.</p>
                <Link href={PARTNER_ROUTES.payouts} className="btn btn-secondary mt-4">View payout records</Link>
              </div>
            </ResearchCapabilityBoundary>
          </div>
        </section>
      </>}
    </ResearchRouteBoundary>
  </>;
}

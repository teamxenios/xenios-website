import { useEffect, useState } from "react";
import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { formatMoney, useResearch } from "../core";
import { ResearchPublicShell } from "../ui/shells";
import {
  ResearchAgreementViewer,
  ResearchCapabilityBoundary,
  ResearchRouteBoundary,
  ResearchSecureNotice,
  ResearchStatusBadge,
  capabilityStatusOrPending,
} from "../ui/kit";
import { fetchCapabilities, type CapabilityStatus, type ResearchCapability } from "../lib/capabilities";
import { ACCESS_ROUTES } from "../lib/routes";

// ---------------------------------------------------------------------------
// ActivationPage (/research/activate). The approved applicant's activation
// surface for the Founding Membership: a $50 one-time activation plus a $25
// recurring monthly membership, no annual plan. Every provider-backed step
// (identity verification, billing) renders behind its capability boundary,
// so nothing pretends to be live. No card field ever renders here while
// billing is disabled, and no charge occurs before activation opens.
// ---------------------------------------------------------------------------

const AGREEMENTS = [
  {
    key: "membership",
    title: "Membership Agreement",
    version: "pending",
    summary:
      "The full membership agreement text is published here before acceptance opens. Nothing has been accepted on your behalf.",
  },
  {
    key: "research-use",
    title: "Research Use Terms",
    version: "pending",
    summary:
      "The research use terms are published here before acceptance opens. You will review and accept them yourself.",
  },
] as const;

export default function ActivationPage() {
  const { member, memberChecking, memberToken } = useResearch();
  const [capabilities, setCapabilities] = useState<Map<ResearchCapability, CapabilityStatus> | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchCapabilities(memberToken).then((statuses) => {
      if (alive) setCapabilities(statuses);
    });
    return () => {
      alive = false;
    };
  }, [memberToken]);

  const billingStatus = capabilityStatusOrPending(capabilities, "membership_billing");
  const identityStatus = capabilityStatusOrPending(capabilities, "identity_verification");

  return (
    <>
      <SeoHead
        title="Activate membership, xenios research"
        description="Activate your xenios research Founding Membership: a $50 one-time activation and $25 monthly membership."
        path={ACCESS_ROUTES.activate}
      />
      <ResearchPublicShell
        eyebrow="Membership activation"
        title="You have been approved."
        lead="Activate your Founding Membership to open the in-depth onboarding and begin building your Whole-Life Blueprint."
      >
        <ResearchRouteBoundary state={capabilities === null ? "loading" : "ok"}>
          {/* Founding Membership economics: fixed and public. */}
          <section aria-labelledby="ra-activate-pricing">
            <h2 id="ra-activate-pricing" className="body-m font-700">
              Founding Membership
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="card">
                <p className="mono-label text-ink-mute">One-time activation</p>
                <p className="display-s tabular mt-1">{formatMoney(5000)}</p>
                <p className="body-s text-ink-2 mt-2">
                  Paid once, when your membership starts. No payment was collected before approval.
                </p>
              </div>
              <div className="card">
                <p className="mono-label text-ink-mute">Monthly membership</p>
                <p className="display-s tabular mt-1">{formatMoney(2500)}</p>
                <p className="body-s text-ink-2 mt-2">
                  Recurring monthly, cancel at any time. There is no annual plan.
                </p>
              </div>
            </div>
          </section>

          {/* Account claim status: claimed, or use the secure email link. */}
          <section aria-labelledby="ra-activate-account" className="card mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="ra-activate-account" className="body-m font-700">
                Your member account
              </h2>
              {!memberChecking && (
                <ResearchStatusBadge
                  label={member ? "Account claimed" : "Not claimed yet"}
                  tone={member ? "success" : "pending"}
                />
              )}
            </div>
            <div role="status" aria-live="polite" className="mt-2">
              {memberChecking ? (
                <p className="body-s text-ink-mute">Checking your account...</p>
              ) : member ? (
                <p className="body-s text-ink-2 max-w-[56ch]">
                  You are signed in as {member.firstName}. This account is where your membership lives once
                  activation completes.
                </p>
              ) : (
                <div>
                  <p className="body-s text-ink-2 max-w-[56ch]">
                    Approved but no account? Use the secure link in your approval email. It opens your status
                    page, where you create your account and choose your own password.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Link href={ACCESS_ROUTES.applicationStatus} className="btn btn-secondary">
                      Application status
                    </Link>
                    <Link href={ACCESS_ROUTES.signIn} className="btn btn-ghost">
                      Member Login
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Agreements: published for review; acceptance is never simulated. */}
          <section aria-labelledby="ra-activate-agreements" className="mt-8">
            <h2 id="ra-activate-agreements" className="body-m font-700">
              Agreements
            </h2>
            <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
              You will review and accept these yourself as part of activation. Nothing is accepted on your
              behalf.
            </p>
            <div className="mt-4 grid gap-4">
              {AGREEMENTS.map((agreement) => (
                <ResearchAgreementViewer
                  key={agreement.key}
                  title={agreement.title}
                  version={agreement.version}
                  accepted={null}
                  content={<p>{agreement.summary}</p>}
                />
              ))}
            </div>
          </section>

          {/* Identity verification: provider-backed, honest pending. */}
          <section aria-labelledby="ra-activate-identity" className="mt-8">
            <h2 id="ra-activate-identity" className="body-m font-700">
              Identity verification
            </h2>
            <div className="mt-4">
              <ResearchCapabilityBoundary status={identityStatus}>
                <div className="card">
                  <p className="body-s text-ink-2 max-w-[56ch]">
                    Identity verification runs through our verification provider. You complete it once, and
                    your documents are never handled by this page directly.
                  </p>
                </div>
              </ResearchCapabilityBoundary>
            </div>
          </section>

          {/* Payment: capability-gated. No card field ever renders while
              billing is disabled; even when enabled, payment happens with the
              payment provider, never in a form here. */}
          <section aria-labelledby="ra-activate-payment" className="mt-8">
            <h2 id="ra-activate-payment" className="body-m font-700">
              Payment
            </h2>
            <div className="mt-4">
              <ResearchCapabilityBoundary status={billingStatus}>
                <div className="card">
                  <p className="body-s text-ink-2 max-w-[56ch]">
                    Activation is open. Payment is completed through our secure payment provider; card details
                    are entered there, never on this page.
                  </p>
                </div>
              </ResearchCapabilityBoundary>
            </div>
            <p className="body-s text-ink-mute mt-3 max-w-[56ch]">
              While activation is being finalized, your approval window is honored. You will receive an email
              the moment it opens, and no payment is collected before then.
            </p>
          </section>

          {/* MFA: placeholder pending the security contract. */}
          <section aria-labelledby="ra-activate-mfa" className="card mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="ra-activate-mfa" className="body-m font-700">
                Multi-factor authentication
              </h2>
              <ResearchStatusBadge label="Coming after activation" tone="pending" />
            </div>
            <p className="body-s text-ink-2 mt-2 max-w-[56ch]">
              A second sign-in factor is planned for member accounts. Setup will be offered here once it is
              available; nothing is required from you today.
            </p>
          </section>

          <div className="mt-8">
            <ResearchSecureNotice>
              No charge can occur before you activate. Support will never ask for card details by email.
            </ResearchSecureNotice>
          </div>

          <p className="mt-8 body-s text-ink-mute max-w-[56ch]">
            Membership does not guarantee access to every product, service, or professional pathway.
            Eligibility may depend on location, product category, documentation, and applicable requirements.
          </p>
          <Link href={ACCESS_ROUTES.gateway} className="btn btn-ghost mt-6">
            Back to xenios research
          </Link>
        </ResearchRouteBoundary>
      </ResearchPublicShell>
    </>
  );
}

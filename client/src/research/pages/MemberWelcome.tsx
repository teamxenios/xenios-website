import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { PageIntro } from "../components";

// Approved-applicant activation page. Payment is Phase 5 (Stripe): until it is
// configured, this shows the branded setup-pending state the spec requires
// instead of a broken checkout. No charge can occur before approval either way.

export default function MemberWelcome() {
  return (
    <>
      <SeoHead title="Activate membership, xenios research" description="Activate your xenios research membership to begin the whole-life onboarding." path="/research/member/welcome" />
      <PageIntro
        eyebrow="Membership activation"
        title="You have been approved."
        lead="Activate your xenios research membership to open the in-depth onboarding and begin building your Whole-Life Blueprint."
      />
      <section className="container-x pb-20">
        <div className="max-w-[560px]">
          <div className="card">
            <p className="mono-cap text-ink-mute mb-2">Founding Membership</p>
            <p className="display-s tabular">$50 due today</p>
            <p className="body-s text-ink-mute mt-2">Includes your activation and first 30 days of membership. Then $25 for each additional 30-day membership period. Your first renewal date will be calculated when your activation payment is verified. No payment was collected before approval, and there is no annual plan.</p>
            <div className="rule-top mt-6 pt-6">
              <p className="mono-cap text-ink-mute mb-2">Activation is opening soon</p>
              <p className="body-s text-ink-2">
                Online activation is being finalized. You will receive an email the moment it opens, and your approval window will be honored. No action is needed today.
              </p>
            </div>
          </div>
          <p className="mt-8 body-s text-ink-mute max-w-[52ch]">
            Membership does not guarantee access to every product, service, or professional pathway. Eligibility may depend on location, product category, documentation, and applicable requirements.
          </p>
          <Link href="/research" className="btn btn-ghost mt-6">Back to xenios research</Link>
        </div>
      </section>
    </>
  );
}

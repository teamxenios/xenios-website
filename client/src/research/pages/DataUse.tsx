import SeoHead from "@/components/SeoHead";
import { BusinessPageHero, SectionLead } from "../business-components";

const AREAS = [
  { name: "Identity", purpose: "Account, secure communication, age and eligibility checks", boundary: "Not included in public cards beyond user-approved display fields" },
  { name: "Application", purpose: "Independent membership review and status communication", boundary: "Never exposed to referrers, ambassadors, or ordinary marketing tools" },
  { name: "Whole-life onboarding", purpose: "Draft and review the member's Blueprint", boundary: "Separated from referral attribution and advertising audiences" },
  { name: "Membership and payment", purpose: "Activation, entitlements, invoices, credits, and account support", boundary: "Payment providers receive only what their role requires" },
  { name: "Referral attribution", purpose: "Connect an issued link to privacy-safe qualification events", boundary: "No application answers, decision reasons, health interests, or purchases" },
  { name: "Marketing consent", purpose: "Optional Research education and membership updates", boundary: "Separate consent that can be withdrawn" },
  { name: "Products and orders", purpose: "Eligibility, fulfillment, support, and accounting", boundary: "Not visible to referrers and not merged into the Blueprint by default" },
  { name: "Professional or clinical", purpose: "Separately structured support when appropriate", boundary: "Not part of the general membership or ambassador data rail" },
];

export default function DataUse() {
  return (
    <>
      <SeoHead title="How your data is used, xenios research" description="A plain-language map of the data xenios research expects to use, why it is needed, and which boundaries keep it separated." path="/research/how-your-data-is-used" />
      <BusinessPageHero eyebrow="How your data is used" title="One member experience. Separate data responsibilities." lead="xenios can build a coherent Blueprint without placing every answer into every system. This map explains the intended purpose and boundary of each logical data area." primary={{ label: "Trust center", href: "/research/trust" }} secondary={{ label: "Privacy questions", href: "/research/faq" }} />

      <section className="container-x xr-section">
        <SectionLead eyebrow="The data map" title="Purpose first, access second, retention third." body="These are product-design boundaries. Claude's infrastructure work must implement and verify them before broader launch." />
        <div className="xr-data-grid">
          {AREAS.map((area) => (
            <article key={area.name} className="xr-surface">
              <p className="mono-cap text-pulse">{area.name}</p>
              <h2 className="h3 mt-4">{area.purpose}</h2>
              <div className="rule-top mt-6 pt-5"><p className="mono-label text-ink-mute">Boundary</p><p className="body-s text-ink-2 mt-2">{area.boundary}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="container-x xr-section">
        <div className="xr-two-column">
          <article className="xr-surface xr-surface-dark"><p className="mono-cap" style={{ color: "var(--lilac)" }}>Referral privacy</p><h2 className="display-s mt-5 max-w-[16ch]">A status is enough.</h2><p className="body-m mt-6" style={{ color: "rgba(255,255,255,.74)" }}>Referrers may receive Invited, Pending, Qualified, Reward earned, or Expired. They do not receive a name by default, application content, decision reason, health interest, Blueprint, purchase, or review note.</p></article>
          <article className="xr-surface xr-surface-muted"><p className="mono-cap text-ink-mute">Marketing boundary</p><h2 className="display-s mt-5 max-w-[16ch]">Consent is not context.</h2><p className="body-m text-ink-2 mt-6">Optional marketing consent can support email education. It does not grant a marketing platform access to whole-life onboarding answers, health interests, or private member records.</p></article>
        </div>
      </section>

      <section className="container-x xr-section">
        <div className="xr-disclosure"><p className="mono-cap text-ink-mute">Member-rights roadmap</p><p className="body-m text-ink-2 mt-3">The product plan includes access, correction, deletion, consent history, data export, and a clear appeal path where applicable. Those workflows are not represented as operational until they are implemented and tested.</p><div className="xr-source-links"><a href="https://www.texasattorneygeneral.gov/es/node/259071" target="_blank" rel="noreferrer">Texas Attorney General privacy overview</a></div></div>
      </section>
    </>
  );
}

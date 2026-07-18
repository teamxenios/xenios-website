import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { BusinessPageHero, CheckList, NumberedJourney, SectionLead } from "../business-components";

export default function Ambassadors() {
  return (
    <>
      <SeoHead title="Ambassadors, xenios research" description="A separately approved ambassador pathway for people who can introduce xenios responsibly, disclose compensation, and avoid unauthorized claims." path="/research/ambassadors" />
      <BusinessPageHero
        eyebrow="Ambassador pathway"
        title="Earn trust before you earn a commission."
        lead="The xenios ambassador program is a separate review path for coaches, athletes, trainers, creators, barbers, and community leaders who can introduce the membership clearly and responsibly."
        primary={{ label: "Request ambassador review", href: "/research/access" }}
        secondary={{ label: "Member referrals", href: "/research/referrals" }}
        aside={<div><p className="mono-cap text-pulse">Directional economics</p><p className="h3 mt-4">10%–15% of eligible non-clinical net revenue.</p><p className="body-s text-ink-2 mt-4">No commission is approved until terms, eligible offers, hold periods, and compliance review are complete.</p></div>}
      />

      <section className="container-x xr-section">
        <div className="xr-two-column">
          <div><SectionLead eyebrow="What is separate" title="Member referrals are not affiliate marketing." body="xenios keeps member credit, ambassador compensation, professional partnerships, and clinical referrals in separate programs with separate rules." /></div>
          <div className="xr-surface xr-surface-muted"><CheckList items={["Individual tracking link and code", "Approved public assets", "Defined eligible offers", "Net-revenue commission basis", "Refund and chargeback deductions", "Payment after a holding period", "Clear relationship disclosure", "No unauthorized health or product claims"]} /></div>
        </div>
      </section>

      <section className="container-x xr-section">
        <SectionLead eyebrow="Review path" title="A program with gates, not an open affiliate link." />
        <NumberedJourney steps={[
          { title: "Apply", body: "Explain your audience, channels, experience, and why xenios is relevant." },
          { title: "Review", body: "xenios reviews fit, past claims, audience quality, and potential conflicts." },
          { title: "Agree", body: "Eligible offers, disclosures, prohibited claims, hold periods, and payment terms are documented." },
          { title: "Launch carefully", body: "Use approved assets and truthful first-hand statements with clear compensation disclosure." },
          { title: "Monitor", body: "Refunds, chargebacks, claims, traffic quality, and compliance remain reviewable." },
        ]} />
      </section>

      <section className="container-x xr-section">
        <div className="xr-disclosure">
          <p className="mono-cap text-ink-mute">Disclosure standard</p>
          <p className="body-m text-ink-2 mt-3">People who receive money, discounts, products, or other value must disclose that relationship clearly and conspicuously. Endorsements and testimonials must be truthful and not misleading.</p>
          <div className="xr-source-links">
            <a href="https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews" target="_blank" rel="noreferrer">FTC endorsement guidance</a>
            <a href="https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance" target="_blank" rel="noreferrer">FTC health products guidance</a>
          </div>
        </div>
        <Link href="/research/access" className="btn btn-primary mt-8">Request ambassador review</Link>
      </section>
    </>
  );
}

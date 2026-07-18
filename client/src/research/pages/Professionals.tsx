import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { BusinessPageHero, CheckList, SectionLead } from "../business-components";

export default function Professionals() {
  return (
    <>
      <SeoHead title="For professionals, xenios research" description="Professional membership, education, wholesale, software, and partnership pathways designed separately from clinical referral compensation." path="/research/professionals" />
      <BusinessPageHero
        eyebrow="Professional pathways"
        title="Build the relationship. Keep the incentives clean."
        lead="Coaches, trainers, chiropractors, wellness professionals, clinics, physicians, med spas, and performance facilities need different operating structures. xenios does not place all of them inside one generic affiliate program."
        primary={{ label: "Request professional access", href: "/research/access" }}
        secondary={{ label: "Wholesale review", href: "/research/wholesale" }}
        aside={<div><p className="mono-cap text-pulse">Proposed membership</p><p className="h3 mt-4">$149–$299 monthly.</p><p className="body-s text-ink-2 mt-4">Directional only. Final pricing, scope, eligibility, and contracts are not yet approved.</p></div>}
      />

      <section className="container-x xr-section">
        <SectionLead eyebrow="Potential value" title="Education, tools, access, and legitimate services." body="Professional value should stand on its own and remain independent of referral volume." />
        <div className="xr-three-column">
          <article className="xr-surface"><p className="mono-cap text-pulse">Learn</p><h2 className="h3 mt-4">Professional education</h2><p className="body-s text-ink-2 mt-4">Evidence literacy, member communication, program resources, and responsible product education.</p></article>
          <article className="xr-surface"><p className="mono-cap text-pulse">Operate</p><h2 className="h3 mt-4">Software and resources</h2><p className="body-s text-ink-2 mt-4">Future Atlas or Argos workflows, client-management tools, directories, and structured member support.</p></article>
          <article className="xr-surface"><p className="mono-cap text-pulse">Access</p><h2 className="h3 mt-4">Wholesale and services</h2><p className="body-s text-ink-2 mt-4">Reviewed wholesale arrangements, fixed legitimate services, and separately contracted content or education work.</p></article>
        </div>
      </section>

      <section className="container-x xr-section">
        <div className="xr-two-column">
          <div><SectionLead eyebrow="Separation" title="Four programs, four rule sets." body="The source of value, compensation method, data access, approval process, and legal review differ across every path." /></div>
          <div className="xr-surface xr-surface-muted"><CheckList items={["Member referral credits", "Approved ambassador marketing", "Professional membership and partnerships", "Separately structured clinical referrals"]} /></div>
        </div>
      </section>

      <section className="container-x xr-section">
        <div className="xr-surface xr-surface-dark">
          <p className="mono-cap" style={{ color: "var(--lilac)" }}>Clinical boundary</p>
          <h2 className="display-s mt-5 max-w-[18ch]">No casual percentage payment for patient referrals.</h2>
          <p className="body-m mt-6 max-w-[66ch]" style={{ color: "rgba(255,255,255,.74)" }}>Healthcare arrangements may be subject to federal and state fraud, abuse, self-referral, beneficiary-inducement, fee-splitting, and professional rules. Any clinical pathway requires healthcare counsel and a separate operating structure.</p>
          <div className="xr-source-links">
            <a href="https://oig.hhs.gov/compliance/physician-education/fraud-abuse-laws/" target="_blank" rel="noreferrer" style={{ color: "var(--paper)" }}>HHS OIG fraud and abuse laws</a>
          </div>
        </div>
        <Link href="/research/access" className="btn btn-primary mt-8">Request professional access</Link>
      </section>
    </>
  );
}

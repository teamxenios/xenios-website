import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import { BusinessPageHero, CheckList, SectionLead } from "../business-components";

const CURRENT = [
  "Research remains access-controlled and noindexed during review",
  "Application status tokens do not appear in response bodies or ordinary URLs",
  "Referral UI never exposes application answers or decision reasons",
  "Marketing consent remains separate and optional",
  "Research catalog and policies load only after the review-access gate",
  "The site does not claim that Research membership is medical care",
];

const BEFORE_LAUNCH = [
  "Member authentication, role-based access, and admin multifactor authentication",
  "Consent history, data export, correction, deletion, and request appeals",
  "Referral and ambassador ledgers with least-privilege access",
  "Data-retention rules, vendor inventory, backup, recovery, and incident response",
  "Audit records for sensitive admin actions",
  "Confirmed encryption, session-expiration, and processor-contract controls",
];

export default function Trust() {
  return (
    <>
      <SeoHead title="Trust center, xenios research" description="How xenios research approaches privacy, data separation, responsible AI, access, and the controls required before broader launch." path="/research/trust" />
      <BusinessPageHero
        eyebrow="xenios Trust Center"
        title="Your information exists to serve your Blueprint, not an advertising profile."
        lead="Trust is part of the member experience. xenios separates what the current private preview already does from the controls that must be completed and verified before a broader launch."
        primary={{ label: "How your data is used", href: "/research/how-your-data-is-used" }}
        secondary={{ label: "Membership FAQ", href: "/research/faq" }}
      />

      <section className="container-x xr-section">
        <div className="xr-two-column">
          <article className="xr-surface">
            <p className="mono-cap text-pulse">Current private-preview boundaries</p>
            <h2 className="h3 mt-4">Observable now.</h2>
            <div className="mt-7"><CheckList items={CURRENT} /></div>
          </article>
          <article className="xr-surface xr-surface-muted">
            <p className="mono-cap text-ink-mute">Required before broader launch</p>
            <h2 className="h3 mt-4">Roadmap controls, not current claims.</h2>
            <div className="mt-7"><CheckList items={BEFORE_LAUNCH} /></div>
          </article>
        </div>
      </section>

      <section className="container-x xr-section">
        <SectionLead eyebrow="Principles" title="Collect less. Separate carefully. Explain clearly." />
        <div className="xr-three-column">
          <article className="xr-surface"><p className="mono-cap text-pulse">Purpose</p><h3 className="h3 mt-4">Use data for the member experience.</h3><p className="body-s text-ink-2 mt-4">Whole-life context belongs in the Blueprint workflow, not ordinary advertising profiles or referral dashboards.</p></article>
          <article className="xr-surface"><p className="mono-cap text-pulse">Access</p><h3 className="h3 mt-4">Limit who can see what.</h3><p className="body-s text-ink-2 mt-4">Members, reviewers, support, partners, and marketing systems should receive only the data required for their role.</p></article>
          <article className="xr-surface"><p className="mono-cap text-pulse">Control</p><h3 className="h3 mt-4">Prepare for member rights.</h3><p className="body-s text-ink-2 mt-4">Access, correction, deletion, consent, and clear request paths should be product capabilities, not manual afterthoughts.</p></article>
        </div>
      </section>

      <section className="container-x xr-section">
        <div className="xr-disclosure">
          <p className="mono-cap text-ink-mute">Legal accuracy</p>
          <p className="body-m text-ink-2 mt-3">xenios does not describe this membership as “HIPAA compliant.” That statement would require confirmed legal roles, systems, contracts, and business-associate obligations. Privacy and security claims will follow verified facts.</p>
          <div className="xr-source-links"><a href="https://www.texasattorneygeneral.gov/es/node/259071" target="_blank" rel="noreferrer">Texas Data Privacy and Security Act overview</a></div>
        </div>
        <Link href="/research/how-your-data-is-used" className="btn btn-primary mt-8">See the data map</Link>
      </section>
    </>
  );
}

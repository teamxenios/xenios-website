import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import Wordmark from "@/components/Wordmark";
import "./gateway-editorial.css";

const researchAreas = [
  ["01", "Care access request", "Share contact, current-state, and routing preferences only. A Xenios team member follows up without collecting medical details in the public form."],
  ["02", "Secure intake and licensed review", "When an appropriate handoff is available, clinical information moves to an authorized secure system and a licensed clinician independently reviews it."],
  ["03", "U.S.-based pharmacy fulfillment", "When a prescription is clinically appropriate and serviceable, it may be fulfilled through a U.S.-based, state-licensed compounding pharmacy."],
  ["04", "Personalized lifestyle support", "Eligible Care clients receive a personalized First-Month Foundations Plan from a CSCS professional, with weekly email check-ins."],
  ["05", "Research compounds and documentation", "Research customers can review exact product identity, variants, evidence level, current status, quality records, and authorized next actions."],
  ["06", "Quality and traceability", "Product, formulation, lot, document, testing, storage, fulfillment, and exception records remain distinct and source-aware."],
] as const;

const standards = [
  ["Clinical independence", "Commercial interest never determines diagnosis, treatment, or prescribing. The licensed clinician makes the clinical decision."],
  ["U.S.-based care network", "Care is supported through U.S.-licensed clinicians and U.S.-based, state-licensed compounding pharmacies where serviceable."],
  ["Evidence-aware education", "Public interest, anecdotes, mechanisms, preclinical findings, human evidence, and established uses are labeled separately."],
  ["Exact product and lot context", "A product name never substitutes for exact formulation, strength, source, lot, documentation, status, or pathway."],
] as const;

const accessSteps = [
  ["Choose", "Select Care for personal health or Research for legitimate nonclinical work."],
  ["Open the request", "Care starts with contact and routing details only. Research starts with the exact access requirements for that pathway."],
  ["Move to the secure source", "A human provides an authorized clinical handoff when appropriate. Research customers review exact identity, documentation, agreements, and access status."],
  ["Complete the required review", "Care proceeds through independent licensed review when available. Research proceeds through its authorized request or ordering workflow."],
  ["Follow", "Use the account and support experience for status, documents, tracking, follow-up, and exceptions."],
] as const;

const accountBenefits = [
  "Care request reference and human follow-up",
  "Secure clinical access only after an authorized handoff",
  "Pharmacy and shipment status where applicable",
  "Research requests and order history",
  "Documents and exact-lot records when authorized",
  "A durable support path for questions and exceptions",
] as const;

const faqPreview = [
  ["How does Xenios Care work?", "Submit a non-clinical access request, receive human follow-up, and move to an authorized secure clinical system when an appropriate option is available. A prescription is never guaranteed."],
  ["How is Research different from Care?", "Research is for legitimate nonclinical work. Care is the provider-governed pathway for personal medical evaluation, prescribing, pharmacy activity, and follow-up."],
  ["Are all compounds available to every client?", "No. Exact options depend on the pathway, patient location, clinical eligibility, clinician judgment, pharmacy serviceability, product status, and current availability."],
] as const;

function Arrow() {
  return <span className="rg-arrow" aria-hidden="true">↗</span>;
}

function ResearchHeader() {
  return (
    <header className="rg-header" aria-label="Xenios Research header">
      <Link href="/health" className="rg-brand" aria-label="Xenios Care and Research home">
        <Wordmark size="md" asLink={false} />
        <span className="rg-brand-sub">Care + Research</span>
      </Link>
      <nav className="rg-header-nav rg-header-nav-desktop" aria-label="Research information">
        <Link href="/care">Care</Link>
        <Link href="/research/access-hub">Research</Link>
        <Link href="/research/how-it-works">How it works</Link>
        <Link href="/research/quality">Quality</Link>
        <Link href="/research/about">About</Link>
        <Link href="/research/faq">FAQ</Link>
        <Link href="/research/sign-in">Member sign in</Link>
        <Link href="/research/access-hub" className="rg-header-apply">Access Hub</Link>
      </nav>
      <details className="rg-mobile-menu">
        <summary aria-label="Research navigation menu">Menu</summary>
        <nav aria-label="Research mobile navigation">
          <Link href="/care">Care</Link>
          <Link href="/research/access-hub">Research</Link>
          <Link href="/research/how-it-works">How it works</Link>
          <Link href="/research/quality">Quality</Link>
          <Link href="/research/about">About</Link>
          <Link href="/research/faq">FAQ</Link>
          <Link href="/research/organizations">Organizations</Link>
          <Link href="/research/partners">Partners</Link>
          <Link href="/research/policies">Policies</Link>
          <Link href="/research/sign-in">Member sign in</Link>
          <Link href="/research/support">Contact &amp; support</Link>
        </nav>
      </details>
    </header>
  );
}

function ResearchFooter() {
  return (
    <footer className="rg-footer">
      <div className="rg-shell rg-footer-grid">
        <div>
          <Link href="/health" className="rg-brand rg-footer-brand" aria-label="Xenios Care and Research home">
            <Wordmark size="md" asLink={false} />
            <span className="rg-brand-sub">Care + Research</span>
          </Link>
          <p>Human-guided Care access with a separate secure clinical handoff when appropriate, plus an evidence-led Research pathway with clear product, document, and access status.</p>
        </div>
        <nav aria-label="Research footer">
          <Link href="/research/access-hub">Access Hub</Link>
          <Link href="/research/how-it-works">How it works</Link>
          <Link href="/research/about">About</Link>
          <Link href="/research/faq">FAQ</Link>
          <Link href="/research/organizations">Organizations</Link>
          <Link href="/research/partners">Partners</Link>
          <Link href="/research/affiliates">Affiliates</Link>
          <Link href="/care">Care</Link>
          <Link href="/research/early-access">Early Access</Link>
          <Link href="/research/sign-in">Member sign in</Link>
          <Link href="/research/support">Contact &amp; support</Link>
          <Link href="/research/contact">Contact</Link>
          <Link href="/research/policies">Policy status</Link>
          <Link href="/research/privacy">Privacy</Link>
          <Link href="/research/terms">Terms</Link>
          <Link href="/research/policies/accessibility">Accessibility</Link>
        </nav>
      </div>
      <div className="rg-shell rg-footer-legal">
        <span>© {new Date().getFullYear()} Xenios Technology</span>
        <span>Care and Research are separate by design · No prescription is guaranteed · Research use only where designated</span>
      </div>
    </footer>
  );
}

export default function Gateway() {
  return (
    <div className="research-editorial">
      <SeoHead
        title="Xenios | Care + Research"
        description="Start a human-guided Xenios Care access request or explore the separate evidence-led Xenios Research pathway for legitimate nonclinical work."
        path="/health"
      />

      <a className="rg-skip-link" href="#research-main">Skip to main content</a>
      <ResearchHeader />

      <main id="research-main" tabIndex={-1}>
        <section className="rg-hero" aria-labelledby="rg-hero-title">
          <img
            className="rg-hero-image"
            src="/research/editorial-hero-warm-silver.jpg"
            width="1586"
            height="992"
            alt=""
            aria-hidden="true"
            decoding="async"
            fetchPriority="high"
          />
          <div className="rg-hero-shade" aria-hidden="true" />
          <div className="rg-hero-content">
            <p className="rg-kicker">Care requests open · Evidence-led Research access · Human support</p>
            <h1 id="rg-hero-title">Provider-guided peptide care.<br />Evidence-led Research access.</h1>
            <div className="rg-hero-rule" aria-hidden="true" />
            <p className="rg-hero-intro">
              Xenios brings two distinct pathways into one clear starting point. For personal care, submit contact and routing
              details for human follow-up—never medical information in the public form. If an appropriate option is available,
              the team provides a separate secure clinical handoff. For legitimate nonclinical work, use Xenios Research to
              explore exact products, evidence, documentation, and current access status.
            </p>
            <div className="rg-hero-actions" aria-label="Research homepage actions">
              <Link href="/care/schedule" className="rg-btn rg-btn-light" data-testid="link-gateway-access-hub">
                <span>Start Care request</span><Arrow />
              </Link>
              <Link href="/research/access-hub" className="rg-text-link" data-testid="link-gateway-pathways">
                Explore Research <Arrow />
              </Link>
            </div>
            <p className="rg-research-notice">
              A Care request is not a clinical intake, appointment, provider relationship, treatment decision, or prescription.
              Any later clinical service remains subject to location, licensed review, medical appropriateness, serviceability,
              and current availability. Research-designated materials remain for legitimate nonclinical research only and are
              not for human or veterinary use.
            </p>
          </div>
          <a className="rg-scroll-cue" href="#offering" aria-label="Continue to what Xenios Research offers">
            <span>Discover</span><span aria-hidden="true">↓</span>
          </a>
        </section>

        <section className="rg-section rg-offering" id="offering" aria-labelledby="rg-offering-title">
          <div className="rg-shell rg-two-column">
            <div>
              <p className="rg-section-label">01 · Two pathways</p>
              <h2 id="rg-offering-title">Start with the path that matches what you need.</h2>
            </div>
            <div className="rg-reading-column">
              <p className="rg-lede">
                Xenios Care accepts a non-clinical access request, adds human follow-up, and uses a separate authorized secure
                system for clinical information when appropriate. Xenios Research supports qualified nonclinical work through
                exact product identity, evidence-aware education, documentation, and controlled access. One path never silently
                becomes the other.
              </p>
              <p>
                Care decisions remain with licensed clinicians and dispensing pharmacies. Research actions remain governed
                by exact product, documentation, availability, and account authority.
              </p>
              <Link href="/research/how-it-works" className="rg-inline-link">
                See how access works <Arrow />
              </Link>
            </div>
          </div>
        </section>

        <section className="rg-section rg-categories" aria-labelledby="rg-categories-title">
          <div className="rg-shell">
            <div className="rg-section-heading">
              <p className="rg-section-label">02 · Care + Research</p>
              <h2 id="rg-categories-title">A complete experience around the next responsible step.</h2>
              <p>Each card preserves the authority, evidence boundary, and source status of its pathway.</p>
            </div>
            <div className="rg-category-grid">
              {researchAreas.map(([number, title, description]) => (
                <article className="rg-category-card" key={number}>
                  <span className="rg-card-number" aria-hidden="true">{number}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <span className="rg-card-line" aria-hidden="true" />
                </article>
              ))}
            </div>
            <Link href="/research/access-hub" className="rg-inline-link rg-category-cta">
              Find the right pathway <Arrow />
            </Link>
          </div>
        </section>

        <section className="rg-section rg-standards" aria-labelledby="rg-standards-title">
          <div className="rg-shell">
            <div className="rg-section-heading rg-section-heading-light">
              <p className="rg-section-label">03 · Trust architecture</p>
              <h2 id="rg-standards-title">Care decisions, Research evidence, and operational facts stay separate.</h2>
              <p>Unknown and unavailable remain valid states. They are never quietly converted into approval, a prescription, payment, shipment, or completion.</p>
            </div>
            <div className="rg-standard-grid">
              {standards.map(([title, copy], index) => (
                <article key={title}>
                  <span aria-hidden="true">0{index + 1}</span>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="rg-section rg-current" aria-labelledby="rg-current-title">
          <div className="rg-shell rg-current-grid">
            <div className="rg-current-copy">
              <p className="rg-section-label">04 · Your account</p>
              <h2 id="rg-current-title">One place to follow Care and Research without blending them.</h2>
              <p className="rg-lede">
                Your Care request reference and any later secure clinical account remain separate from Research requests, orders,
                billing, documents, tracking, and support. A later stage is never implied before its source confirms it.
              </p>
              <Link href="/research/sign-in" className="rg-btn rg-btn-dark">Access your account <Arrow /></Link>
            </div>
            <div className="rg-ledger" aria-label="Information evaluated for an exact offering">
              <div><span>Identity</span><strong>Product + exact variant</strong></div>
              <div><span>Format</span><strong>Offering-specific</strong></div>
              <div><span>Documentation</span><strong>Shown when available</strong></div>
              <div><span>Access</span><strong>Server-authorized pathway</strong></div>
              <div><span>Status</span><strong>Evidence-aware and current</strong></div>
            </div>
          </div>
        </section>

        <section className="rg-section rg-quality" id="quality" aria-labelledby="rg-quality-title">
          <div className="rg-quality-art" aria-hidden="true">
            <span className="rg-quality-orbit rg-quality-orbit-one" />
            <span className="rg-quality-orbit rg-quality-orbit-two" />
            <span className="rg-quality-core" />
          </div>
          <div className="rg-shell rg-quality-grid">
            <div>
              <p className="rg-section-label">05 · Quality and documentation</p>
              <h2 id="rg-quality-title">The label is the beginning of the record, not the end.</h2>
            </div>
            <div className="rg-reading-column">
              <p className="rg-lede">
                Xenios treats identity, formulation, receiving, lot capture, documentation, testing where applicable, storage,
                release, dispensing or fulfillment, and later exceptions as separate checkpoints.
              </p>
              <ul className="rg-check-list">
                <li>Exact product, formulation, and lot traceability</li>
                <li>Documentation shown only when it matches the exact item or lot</li>
                <li>Testing described only when the applicable record supports it</li>
                <li>Clear release, hold, unavailable, replacement, and escalation states</li>
              </ul>
              <Link href="/research/support" className="rg-inline-link">
                Ask about documentation <Arrow />
              </Link>
            </div>
          </div>
        </section>

        <section className="rg-section rg-process" id="how-it-works" aria-labelledby="rg-process-title">
          <div className="rg-shell">
            <div className="rg-section-heading">
              <p className="rg-section-label">06 · How it works</p>
              <h2 id="rg-process-title">From first interest to a responsible next action.</h2>
            </div>
            <ol className="rg-process-list">
              {accessSteps.map(([title, copy], index) => (
                <li key={title}>
                  <span className="rg-step-number">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </li>
              ))}
            </ol>
            <Link href="/research/how-it-works" className="rg-inline-link rg-process-cta">
              Review the complete journey <Arrow />
            </Link>
          </div>
        </section>

        <section className="rg-section rg-account" aria-labelledby="rg-account-title">
          <div className="rg-shell rg-current-grid">
            <div className="rg-current-copy">
              <p className="rg-section-label">07 · Ongoing support</p>
              <h2 id="rg-account-title">A relationship that continues after the first form or order.</h2>
              <p className="rg-lede">
                Care follow-up, lifestyle support, Research documentation, order status, tracking, account access, and
                customer service remain available through their appropriate sources and teams.
              </p>
              <Link href="/research/sign-in" className="rg-btn rg-btn-dark">Access your account <Arrow /></Link>
            </div>
            <ul className="rg-benefit-list" aria-label="Account capabilities">
              {accountBenefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
            </ul>
          </div>
        </section>

        <section className="rg-section rg-organizations" aria-labelledby="rg-organizations-title">
          <div className="rg-shell rg-two-column">
            <div>
              <p className="rg-section-label">08 · Organizations &amp; partners</p>
              <h2 id="rg-organizations-title">A dedicated path for every legitimate relationship.</h2>
            </div>
            <div className="rg-reading-column">
              <p className="rg-lede">
                Care organizations, Research customers, clinics, professional buyers, affiliates, suppliers, and strategic
                partners begin with context and review—not automatic approval.
              </p>
              <div className="rg-stacked-actions">
                <Link href="/research/partners" className="rg-btn rg-btn-light">Choose a relationship path <Arrow /></Link>
                <Link href="/research/organizations" className="rg-text-link">Review organization access <Arrow /></Link>
                <Link href="/research/affiliates" className="rg-text-link">Review affiliate access <Arrow /></Link>
              </div>
            </div>
          </div>
        </section>

        <section className="rg-section rg-pathways" aria-labelledby="rg-pathways-title">
          <div className="rg-shell">
            <div className="rg-section-heading">
              <p className="rg-section-label">09 · Research and Care</p>
              <h2 id="rg-pathways-title">Two pathways. No blurred authority.</h2>
            </div>
            <div className="rg-pathway-grid">
              <article>
                <p className="rg-pathway-tag">Xenios Research</p>
                <h3>Nonclinical research materials and documentation</h3>
                <p>Research-use identity, available documentation, request and order pathways, fulfillment, and support.</p>
              </article>
              <article>
                <p className="rg-pathway-tag">Xenios Care</p>
                <h3>Human-guided access and a separate secure clinical handoff</h3>
                <p>Care access requests are open. Any later clinical service, formulation, clinician availability, or pharmacy fulfillment remains subject to location, eligibility, authority, serviceability, and current availability.</p>
                <Link href="/care/schedule" className="rg-inline-link">Start Care request <Arrow /></Link>
              </article>
            </div>
          </div>
        </section>

        <section className="rg-section rg-faq-preview" aria-labelledby="rg-faq-title">
          <div className="rg-shell">
            <div className="rg-section-heading">
              <p className="rg-section-label">10 · Questions, answered plainly</p>
              <h2 id="rg-faq-title">Clarity before commitment.</h2>
              <p>The most important boundaries should be understandable before anyone signs in, applies, or submits a request.</p>
            </div>
            <div className="rg-faq-grid">
              {faqPreview.map(([question, answer]) => (
                <article key={question}><h3>{question}</h3><p>{answer}</p></article>
              ))}
            </div>
            <Link href="/research/faq" className="rg-inline-link rg-category-cta">Read all questions <Arrow /></Link>
          </div>
        </section>

        <section className="rg-final" aria-labelledby="rg-final-title">
          <div className="rg-shell">
            <p className="rg-section-label">Xenios Research</p>
            <h2 id="rg-final-title">Start with Care or explore Research.</h2>
            <p>Choose the path that matches personal health or legitimate nonclinical work without guessing which authority applies.</p>
            <div className="rg-final-actions">
              <Link href="/care/schedule" className="rg-btn rg-btn-dark">Start Care request <Arrow /></Link>
              <Link href="/research/access-hub" className="rg-btn rg-btn-outline" data-testid="link-gateway-apply">Explore Research <Arrow /></Link>
            </div>
          </div>
        </section>
      </main>

      <ResearchFooter />
      <Link href="/care/schedule" className="rg-mobile-access">Start Care request <Arrow /></Link>
    </div>
  );
}

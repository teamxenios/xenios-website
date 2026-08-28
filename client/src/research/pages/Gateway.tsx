import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import Wordmark from "@/components/Wordmark";
import "./gateway-editorial.css";

const researchAreas = [
  ["01", "Peptide research", "Exact identity, strength, format, and current access state stay visible together."],
  ["02", "Blends and formulations", "Formulation differences remain explicit. Similar names are never treated as interchangeable."],
  ["03", "Additional formats", "Non-vial formats are organized by the same identity, documentation, and access rules."],
  ["04", "Cofactors and support materials", "Related research materials are presented without turning association into a clinical claim."],
  ["05", "Request-only access", "Human review remains available when an item is not authorized for a direct action."],
  ["06", "Provider-governed Care", "Where configured and legally available, clinical questions and provider decisions move to a separate licensed-care pathway."],
] as const;

const standards = [
  ["Exact identity", "Product, variant, strength, and format are kept distinct so a near match never becomes an assumed match."],
  ["Evidence-aware status", "Available, request-only, held, provider-required, and unknown states lead to different truthful actions."],
  ["Lot-level context", "Lot and COA information is shown only where the applicable documentation is available and approved."],
  ["Human support", "Questions and exceptions have a clear support path instead of a misleading success state or dead end."],
] as const;

const accessSteps = [
  ["Choose", "Start in the Access Hub and select Research, Care, organization, partner, supplier, or support."],
  ["Verify", "Sign in or follow the appropriate review path. The browser never grants itself a role."],
  ["Review", "Evaluate the exact identity, format, documentation status, and action currently available."],
  ["Request", "Submit only through the authorized path. A request is not represented as a completed order."],
  ["Follow", "Return to your account for source-aware order, billing, document, and support information."],
] as const;

const accountBenefits = [
  "A verified Research account",
  "Member-safe product and request history",
  "Payment and fulfillment designed as separate facts",
  "Documents and COAs only when authorized",
  "Care handoff without copying clinical records",
  "A durable support path for exceptions",
] as const;

const faqPreview = [
  ["Is Research the same as Care?", "No. Research-designated materials and provider-governed Care use separate pathways, authorities, and next actions."],
  ["Does a visible item mean it can be ordered?", "No. Visibility, price, documentation, availability, and purchase permission are separate facts."],
  ["Is every lot backed by the same testing?", "No. Testing and documents are lot- and offering-specific, and the experience must say when they are unavailable."],
] as const;

function Arrow() {
  return <span className="rg-arrow" aria-hidden="true">↗</span>;
}

function ResearchHeader() {
  return (
    <header className="rg-header" aria-label="Xenios Research header">
      <Link href="/research" className="rg-brand" aria-label="Xenios Research home">
        <Wordmark size="md" asLink={false} />
        <span className="rg-brand-sub">Research</span>
      </Link>
      <nav className="rg-header-nav rg-header-nav-desktop" aria-label="Research information">
        <Link href="/research/how-it-works">How it works</Link>
        <Link href="/research/about">About</Link>
        <Link href="/research/faq">FAQ</Link>
        <Link href="/research/policies">Policies</Link>
        <Link href="/research/contact">Contact</Link>
        <Link href="/research/sign-in">Member sign in</Link>
        <Link href="/research/access-hub" className="rg-header-apply">Access Hub</Link>
      </nav>
      <details className="rg-mobile-menu">
        <summary aria-label="Research navigation menu">Menu</summary>
        <nav aria-label="Research mobile navigation">
          <Link href="/research/access-hub">Access Hub</Link>
          <Link href="/research/how-it-works">How it works</Link>
          <Link href="/research/about">About</Link>
          <Link href="/research/faq">FAQ</Link>
          <Link href="/research/policies">Policies</Link>
          <Link href="/research/contact">Contact</Link>
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
          <Link href="/research" className="rg-brand rg-footer-brand" aria-label="Xenios Research home">
            <Wordmark size="md" asLink={false} />
            <span className="rg-brand-sub">Research</span>
          </Link>
          <p>Clear research access, evidence-aware status, and a separate path to provider-governed Care.</p>
        </div>
        <nav aria-label="Research footer">
          <Link href="/research/access-hub">Access Hub</Link>
          <Link href="/research/how-it-works">How it works</Link>
          <Link href="/research/about">About</Link>
          <Link href="/research/faq">FAQ</Link>
          <Link href="/research/access-hub">Organizations &amp; partners</Link>
          <Link href="/care">Care</Link>
          <Link href="/research/early-access">Early Access</Link>
          <Link href="/research/sign-in">Member sign in</Link>
          <Link href="/research/support">Contact &amp; support</Link>
          <Link href="/research/contact">Contact</Link>
          <Link href="/research/policies">Policy status</Link>
          <Link href="/research/privacy">Privacy</Link>
          <Link href="/research/terms">Terms</Link>
        </nav>
      </div>
      <div className="rg-shell rg-footer-legal">
        <span>© {new Date().getFullYear()} Xenios Technology</span>
        <span>Research use only · Not medical advice</span>
      </div>
    </footer>
  );
}

export default function Gateway() {
  return (
    <div className="research-editorial">
      <SeoHead
        title="Xenios Research | Clear, evidence-aware research access"
        description="Explore Xenios Research, understand product and documentation status, and choose the correct Research, Care, organization, or partner pathway."
        path="/research"
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
            <p className="rg-kicker">Research access · Documentation context · Human support</p>
            <h1 id="rg-hero-title">Research products.<br />A clearer standard.</h1>
            <div className="rg-hero-rule" aria-hidden="true" />
            <p className="rg-hero-intro">
              Xenios Research brings exact product identity, available documentation, current status,
              and the correct next action into one considered experience.
            </p>
            <div className="rg-hero-actions" aria-label="Research homepage actions">
              <Link href="/research/access-hub" className="rg-btn rg-btn-light" data-testid="link-gateway-access-hub">
                <span>Choose your access path</span><Arrow />
              </Link>
              <Link href="/research/how-it-works" className="rg-text-link" data-testid="link-gateway-pathways">
                Understand the pathways <Arrow />
              </Link>
            </div>
            <p className="rg-research-notice">
              Research-designated materials are for legitimate nonclinical research only, not for human or veterinary use.
              Access, availability, testing, and documentation vary by exact offering and lot.
            </p>
          </div>
          <a className="rg-scroll-cue" href="#offering" aria-label="Continue to what Xenios Research offers">
            <span>Discover</span><span aria-hidden="true">↓</span>
          </a>
        </section>

        <section className="rg-section rg-offering" id="offering" aria-labelledby="rg-offering-title">
          <div className="rg-shell rg-two-column">
            <div>
              <p className="rg-section-label">01 · The experience</p>
              <h2 id="rg-offering-title">Built to make the next step understandable.</h2>
            </div>
            <div className="rg-reading-column">
              <p className="rg-lede">
                Xenios Research is a product-access and operating platform—not a wall of listings and not a clinical system.
              </p>
              <p>
                Public pages explain the categories, quality model, and available pathways. Authenticated experiences are
                designed to separate product, order, billing, document, and support facts; anything a connected source
                cannot establish must remain unknown or unavailable.
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
              <p className="rg-section-label">02 · Research areas</p>
              <h2 id="rg-categories-title">Explore the field without losing exactness.</h2>
              <p>Categories orient discovery. They never replace exact formulation, documentation, status, or access review.</p>
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
              <h2 id="rg-standards-title">Truth is a product feature.</h2>
              <p>Unknown and unavailable are valid states. They are never quietly converted into zero, approved, paid, shipped, or complete.</p>
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
              <p className="rg-section-label">04 · Current information</p>
              <h2 id="rg-current-title">One protected source of truth.</h2>
              <p className="rg-lede">
                The public homepage does not mirror member product records, pricing, inventory, or private availability.
                Current member-safe information stays inside the authorized account experience.
              </p>
              <Link href="/research/sign-in" className="rg-btn rg-btn-dark">Member sign in <Arrow /></Link>
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
              <p className="rg-section-label">05 · Quality &amp; documentation</p>
              <h2 id="rg-quality-title">Documentation before decoration.</h2>
            </div>
            <div className="rg-reading-column">
              <p className="rg-lede">
                The quality model treats receiving, inspection, lot capture, quarantine, document review, testing where applicable, and release or hold as separate checkpoints.
              </p>
              <ul className="rg-check-list">
                <li>Exact item and lot traceability</li>
                <li>Document status shown in context</li>
                <li>Independent testing described only where applicable</li>
                <li>Clear hold, unavailable, and replacement states</li>
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
              <p className="rg-section-label">06 · How access works</p>
              <h2 id="rg-process-title">A deliberate path from interest to evidence.</h2>
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
              <p className="rg-section-label">07 · Returning customers</p>
              <h2 id="rg-account-title">An account that separates facts.</h2>
              <p className="rg-lede">
                Membership, billing, Research requests, payment, fulfillment, Care, documents, and support are designed
                to remain distinct—so one status cannot overstate another.
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
                Research organizations, clinics, professional buyers, affiliates, suppliers, and strategic partners begin with context and review—not automatic approval.
              </p>
              <div className="rg-stacked-actions">
                <Link href="/research/access-hub" className="rg-btn rg-btn-light">Choose a relationship path <Arrow /></Link>
                <Link href="/research/support" className="rg-text-link">Ask about partner access <Arrow /></Link>
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
                <p className="rg-pathway-tag">Provider-governed Care</p>
                <h3>Provider-governed review where configured and legally available</h3>
                <p>Scheduling, eligibility, provider decisions, clinical records, prescribing, and pharmacy activity remain under their authorized systems. Availability varies by configuration and jurisdiction.</p>
                <Link href="/care" className="rg-inline-link">Understand Care <Arrow /></Link>
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
            <h2 id="rg-final-title">Start with the path that is true for you.</h2>
            <p>Choose Research, Care, organization, partner, supplier, Early Access, account, or support without guessing which door applies.</p>
            <div className="rg-final-actions">
              <Link href="/research/access-hub" className="rg-btn rg-btn-dark">Open the Access Hub <Arrow /></Link>
              <Link href="/research/apply" className="rg-btn rg-btn-outline" data-testid="link-gateway-apply">Review membership access <Arrow /></Link>
            </div>
          </div>
        </section>
      </main>

      <ResearchFooter />
      <Link href="/research/access-hub" className="rg-mobile-access">Choose your access path <Arrow /></Link>
    </div>
  );
}

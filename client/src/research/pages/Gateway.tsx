import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import Wordmark from "@/components/Wordmark";
import "./gateway-editorial.css";

const MEMBER_CATALOG_PATH = "/research/member/products";

const researchAreas = [
  ["01", "Peptide research", "Identity, format, and documentation presented together for careful review."],
  ["02", "Longevity", "A growing area for research into aging and cellular systems."],
  ["03", "Performance", "Research directions centered on output, adaptation, and resilience."],
  ["04", "Recovery", "Materials organized around recovery research and restorative processes."],
  ["05", "Metabolic research", "A structured view of research materials related to metabolic systems."],
  ["06", "Wellness systems", "Broader research context for connected health and wellness domains."],
] as const;

const standards = [
  ["Clear identity", "Names, formats, and available specifications are kept together so the material is easier to evaluate."],
  ["Documentation context", "Available batch and quality documentation is surfaced alongside the relevant listing—not separated from it."],
  ["Disciplined access", "The catalog remains inside the active-member environment, with authorization enforced before product data loads."],
  ["A human support path", "Questions can move to Research support when a listing or document needs more context."],
] as const;

const accessSteps = [
  ["Enter", "Sign in as an active member, or apply if you are new to Xenios Research."],
  ["Explore", "Review the canonical catalog inside the protected member environment."],
  ["Evaluate", "Compare the available specifications, documentation, and access notes."],
  ["Request", "Use the pathway shown for that offering. Availability is never implied by a public page."],
  ["Follow", "Track confirmed next steps through the member account and Research support."],
] as const;

function Arrow() {
  return <span className="rg-arrow" aria-hidden="true">↗</span>;
}

function CatalogLink({ className = "", label = "Explore master catalog" }: { className?: string; label?: string }) {
  return (
    <Link href={MEMBER_CATALOG_PATH} className={className} data-testid="link-gateway-catalog">
      <span>{label}</span>
      <Arrow />
    </Link>
  );
}

export default function Gateway() {
  return (
    <div className="research-editorial">
      <SeoHead
        title="Xenios Research | Private research access"
        description="A private research destination built around clear product information, documentation context, and disciplined access."
        path="/research"
      />

      <a className="rg-skip-link" href="#research-main">Skip to main content</a>

      <header className="rg-header" aria-label="Xenios Research header">
        <Link href="/research" className="rg-brand" aria-label="Xenios Research home">
          <Wordmark size="md" asLink={false} />
          <span className="rg-brand-sub">Research</span>
        </Link>
        <nav className="rg-header-nav" aria-label="Research access">
          <Link href="/research/sign-in" data-testid="link-gateway-signin">Member login</Link>
          <Link href="/research/apply" className="rg-header-apply" data-testid="link-gateway-apply">Apply for access</Link>
        </nav>
      </header>

      <main id="research-main">
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
            <p className="rg-kicker">Private research access · Xenios Research</p>
            <h1 id="rg-hero-title">Research products.<br />A clearer standard.</h1>
            <div className="rg-hero-rule" aria-hidden="true" />
            <p className="rg-hero-intro">
              A premium research destination built around clear product information,
              documentation context, and a more deliberate way to explore what is next.
            </p>
            <dl className="rg-now-next" aria-label="Research availability direction">
              <div><dt>Now</dt><dd>Research materials</dd></div>
              <div><dt>Growing</dt><dd>Wellness, longevity, performance, recovery</dd></div>
            </dl>
            <div className="rg-hero-actions" aria-label="Research homepage actions">
              <CatalogLink className="rg-btn rg-btn-light" />
              <a href="#current-offerings" className="rg-text-link">
                View the offering path <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className="rg-research-notice">
              For research use only. Not for human or veterinary use. Access, availability, and documentation vary by offering.
            </p>
          </div>
          <a className="rg-scroll-cue" href="#offering" aria-label="Continue to the Research offering">
            <span>Discover</span><span aria-hidden="true">↓</span>
          </a>
        </section>

        <section className="rg-section rg-offering" id="offering" aria-labelledby="rg-offering-title">
          <div className="rg-shell rg-two-column">
            <div>
              <p className="rg-section-label">01 · The offering</p>
              <h2 id="rg-offering-title">A growing research catalog, organized for clarity.</h2>
            </div>
            <div className="rg-reading-column">
              <p className="rg-lede">
                Xenios Research is designed to make research materials easier to evaluate without turning the experience into a crowded storefront.
              </p>
              <p>
                Members enter one canonical catalog where the current identity, format, availability, access pathway, and available documentation can be reviewed together.
              </p>
              <CatalogLink className="rg-inline-link" label="Enter the protected catalog" />
            </div>
          </div>
        </section>

        <section className="rg-section rg-categories" aria-labelledby="rg-categories-title">
          <div className="rg-shell">
            <div className="rg-section-heading">
              <p className="rg-section-label">02 · Research areas</p>
              <h2 id="rg-categories-title">Explore the field through a calmer lens.</h2>
              <p>Categories describe the direction of the catalog. Current listings remain private to active members.</p>
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
            <CatalogLink className="rg-inline-link rg-category-cta" label="Explore all research areas" />
          </div>
        </section>

        <section className="rg-section rg-standards" aria-labelledby="rg-standards-title">
          <div className="rg-shell">
            <div className="rg-section-heading rg-section-heading-light">
              <p className="rg-section-label">03 · A clearer standard</p>
              <h2 id="rg-standards-title">Less noise. More useful context.</h2>
              <p>The experience is built to support careful review, not urgency.</p>
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

        <section className="rg-section rg-current" id="current-offerings" aria-labelledby="rg-current-title">
          <div className="rg-shell rg-current-grid">
            <div className="rg-current-copy">
              <p className="rg-section-label">04 · Current offerings</p>
              <h2 id="rg-current-title">One protected source of truth.</h2>
              <p className="rg-lede">
                We do not mirror product records, pricing, or inventory on the public homepage. The member catalog is the current record.
              </p>
              <CatalogLink className="rg-btn rg-btn-dark" label="View current offerings" />
            </div>
            <div className="rg-ledger" aria-label="Information available in the member catalog">
              <div><span>Identity</span><strong>Canonical listing</strong></div>
              <div><span>Format</span><strong>Offering-specific</strong></div>
              <div><span>Documentation</span><strong>Shown when available</strong></div>
              <div><span>Access</span><strong>Member-authorized</strong></div>
              <div><span>Status</span><strong>Current at time of review</strong></div>
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
                Each offering should be understood through the information actually available for it—not through a generalized promise.
              </p>
              <ul className="rg-check-list">
                <li>Offering-specific identity and format</li>
                <li>Available documentation presented in context</li>
                <li>Explicit access and availability states</li>
                <li>A support route when more context is required</li>
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
              <h2 id="rg-process-title">A deliberate path from interest to action.</h2>
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
          </div>
        </section>

        <section className="rg-section rg-organizations" id="organizations" aria-labelledby="rg-organizations-title">
          <div className="rg-shell rg-two-column">
            <div>
              <p className="rg-section-label">07 · Organizations</p>
              <h2 id="rg-organizations-title">A dedicated path for professional and organizational inquiries.</h2>
            </div>
            <div className="rg-reading-column">
              <p className="rg-lede">
                Research teams and organizations can begin with a separate inquiry path designed for context, qualification, and responsible follow-up.
              </p>
              <Link href="/research/support" className="rg-btn rg-btn-light">
                Start an organization inquiry <Arrow />
              </Link>
            </div>
          </div>
        </section>

        <section className="rg-section rg-pathways" aria-labelledby="rg-pathways-title">
          <div className="rg-shell">
            <div className="rg-section-heading">
              <p className="rg-section-label">08 · The distinction</p>
              <h2 id="rg-pathways-title">Research access is not clinical care.</h2>
            </div>
            <div className="rg-pathway-grid">
              <article>
                <p className="rg-pathway-tag">Xenios Research</p>
                <h3>Research materials and education</h3>
                <p>Product information, available documentation, research context, and member-based access.</p>
              </article>
              <article>
                <p className="rg-pathway-tag">Licensed provider</p>
                <h3>Individual medical decisions</h3>
                <p>Diagnosis, treatment, prescribing, and personal medical guidance belong with an appropriately licensed clinician.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="rg-final" aria-labelledby="rg-final-title">
          <div className="rg-shell">
            <p className="rg-section-label">Xenios Research</p>
            <h2 id="rg-final-title">Enter a more considered research environment.</h2>
            <p>Explore the protected catalog if you are already active, or apply to begin the access process.</p>
            <div className="rg-final-actions">
              <CatalogLink className="rg-btn rg-btn-dark" />
              <Link href="/research/apply" className="rg-btn rg-btn-outline">Apply for access <Arrow /></Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="rg-footer">
        <div className="rg-shell rg-footer-grid">
          <div>
            <Link href="/research" className="rg-brand rg-footer-brand" aria-label="Xenios Research home">
              <Wordmark size="md" asLink={false} />
              <span className="rg-brand-sub">Research</span>
            </Link>
            <p>Private research access, presented with clarity.</p>
          </div>
          <nav aria-label="Research footer">
            <Link href={MEMBER_CATALOG_PATH} data-testid="link-gateway-catalog">Master catalog</Link>
            <a href="#quality">Quality</a>
            <a href="#how-it-works">How access works</a>
            <a href="#organizations">Organizations</a>
            <Link href="/research/sign-in">Member login</Link>
            <Link href="/research/apply">Apply</Link>
            <Link href="/research/support">Support</Link>
            <Link href="/research/privacy">Privacy</Link>
            <Link href="/research/terms">Terms</Link>
            <Link href="/about">About Xenios</Link>
            <Link href="/contact">Contact</Link>
          </nav>
        </div>
        <div className="rg-shell rg-footer-legal">
          <span>© {new Date().getFullYear()} Xenios Technology</span>
          <span>Research use only · Not medical advice</span>
        </div>
      </footer>

      <CatalogLink className="rg-mobile-catalog" label="Explore catalog" />
    </div>
  );
}

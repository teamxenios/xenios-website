import { Link } from "wouter";
import SeoHead from "@/components/SeoHead";
import Wordmark from "@/components/Wordmark";
import "./gateway-editorial.css";

const orderSteps = [
  ["Request an order", "Choose the exact product and size, then send an order request."],
  ["We confirm availability", "We review the request and email your quote and payment details."],
  ["We verify payment", "We confirm your payment by hand before we release your order."],
  ["We send tracking", "We email your tracking when your order ships."],
] as const;

function Arrow() {
  return <span className="rg-arrow" aria-hidden="true">↗</span>;
}

function ResearchHeader() {
  return (
    <header className="rg-header" aria-label="Xenios Research header">
      <Link href="/" className="rg-brand" aria-label="Xenios home">
        <Wordmark size="md" asLink={false} />
        <span className="rg-brand-sub">Research</span>
      </Link>
      <nav className="rg-header-nav rg-header-nav-desktop" aria-label="Research information">
        <Link href="/products">Products</Link>
        <Link href="/research/how-it-works">How It Works</Link>
        <Link href="/research/quality">Quality</Link>
        <Link href="/research/faq">FAQ</Link>
        <Link href="/research/support">Support</Link>
        <Link href="/sign-in">Sign In</Link>
        <Link href="/products" className="rg-header-apply">Explore Products</Link>
      </nav>
      <details className="rg-mobile-menu">
        <summary aria-label="Research navigation menu">Menu</summary>
        <nav aria-label="Research mobile navigation">
          <Link href="/products">Products</Link>
          <Link href="/research/how-it-works">How It Works</Link>
          <Link href="/research/quality">Quality</Link>
          <Link href="/research/faq">FAQ</Link>
          <Link href="/research/partners">Partners</Link>
          <Link href="/research/organizations">For Practices</Link>
          <Link href="/research/support">Contact Support</Link>
          <Link href="/sign-in">Sign In</Link>
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
          <Link href="/" className="rg-brand rg-footer-brand" aria-label="Xenios home">
            <Wordmark size="md" asLink={false} />
            <span className="rg-brand-sub">Research</span>
          </Link>
          <p>Research products and order requests remain separate from Care.</p>
        </div>
        <nav aria-label="Research footer">
          <Link href="/products">Products</Link>
          <Link href="/research/how-it-works">How It Works</Link>
          <Link href="/research/quality">Quality</Link>
          <Link href="/research/faq">FAQ</Link>
          <Link href="/research/partners">Partners</Link>
          <Link href="/research/organizations">For Practices</Link>
          <Link href="/care">Care</Link>
          <Link href="/sign-in">Sign In</Link>
          <Link href="/research/support">Contact Support</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>
      <div className="rg-shell rg-footer-legal">
        <span>© 2026 Xenios Technologies, Inc.</span>
        <span>Research products are separate from Care.</span>
      </div>
    </footer>
  );
}

export default function Gateway() {
  return (
    <div className="research-editorial">
      <SeoHead
        title="How research orders work | Xenios"
        description="Request an order, receive confirmed payment details, and get tracking when your order ships."
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
            <p className="rg-kicker">Xenios Research</p>
            <h1 id="rg-hero-title">How research orders work</h1>
            <div className="rg-hero-rule" aria-hidden="true" />
            <p className="rg-hero-intro">
              Research products are sold for research use only. There's no clinical review, and nothing here is medical advice.
            </p>
            <div className="rg-hero-actions" aria-label="Research order actions">
              <Link href="/products" className="rg-btn rg-btn-light">Explore Products <Arrow /></Link>
              <Link href="/status" className="rg-text-link">Check Status <Arrow /></Link>
            </div>
            <p className="rg-research-notice">
              Research products are for legitimate nonclinical research only and are not for human or veterinary use.
              Ordering research products doesn't give you access to Care.
            </p>
          </div>
          <a className="rg-scroll-cue" href="#order-steps" aria-label="Continue to the order steps">
            <span>How it works</span><span aria-hidden="true">↓</span>
          </a>
        </section>

        <section className="rg-section rg-process" id="order-steps" aria-labelledby="rg-order-steps-title">
          <div className="rg-shell">
            <div className="rg-section-heading">
              <p className="rg-section-label">Four clear steps</p>
              <h2 id="rg-order-steps-title">From request to tracking.</h2>
            </div>
            <ol className="rg-process-list">
              {orderSteps.map(([title, copy], index) => (
                <li key={title}>
                  <span className="rg-step-number">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="rg-section rg-current" aria-labelledby="rg-payment-title">
          <div className="rg-shell rg-current-grid">
            <div className="rg-current-copy">
              <p className="rg-section-label">Payment</p>
              <h2 id="rg-payment-title">Payment comes after confirmation.</h2>
              <p className="rg-lede">After we confirm your order, we email payment details. We verify every payment by hand before we release your order.</p>
            </div>
            <div className="rg-reading-column">
              <p className="rg-section-label">Tracking</p>
              <p className="rg-lede">We email your tracking when your order ships.</p>
            </div>
          </div>
        </section>

        <section className="rg-final" aria-labelledby="rg-final-title">
          <div className="rg-shell">
            <p className="rg-section-label">Choose your next step</p>
            <h2 id="rg-final-title">Explore products or check an existing request.</h2>
            <div className="rg-final-actions">
              <Link href="/products" className="rg-btn rg-btn-dark">Explore Products <Arrow /></Link>
              <Link href="/status" className="rg-btn rg-btn-outline">Check Status <Arrow /></Link>
            </div>
          </div>
        </section>
      </main>
      <ResearchFooter />
      <nav className="rg-mobile-access" aria-label="Research account entry">
        <Link href="/sign-in">Sign In</Link>
        <Link href="/products">Explore Products</Link>
      </nav>
    </div>
  );
}

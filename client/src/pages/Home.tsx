import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";

export default function Home() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ position: number } | null>(null);
  const [count, setCount] = useState<number>(551);
  const [honeypot, setHoneypot] = useState("");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    let alive = true;
    const fetchCount = () => {
      fetch("/api/waitlist/count")
        .then((r) => r.json())
        .then((d) => { if (alive && typeof d.count === "number") setCount(d.count); })
        .catch(() => {});
    };
    fetchCount();
    const id = setInterval(fetchCount, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), website: honeypot }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setError(data.message || "Something went wrong. Try again.");
        return;
      }
      setSuccess({ position: data.position ?? 0 });
      if (typeof data.count === "number") setCount(data.count);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="coming-soon-root">
      {/* Top */}
      <header className="cs-topbar">
        <div className="cs-topbar-row">
          <a href="/" className="cs-wordmark" data-testid="link-home">xenios.</a>
          <span className="cs-status" data-testid="status-cohort">
            <span className="cs-dot" aria-hidden="true" />
            <span>Cohort 01 · Open · May 2026</span>
          </span>
        </div>
      </header>

      {/* Right vertical rail (desktop) */}
      <div className="cs-rail-wrap" aria-hidden="true">
        <span className="cs-rail">
          Xenios Technologies, Inc. · Delaware C-Corp · Austin, TX · Confidential · May 2026
        </span>
      </div>

      {/* Bottom-left fixed manifesto (desktop) */}
      <div className="cs-manifesto-fixed" aria-hidden="true">
        A category forming in real time<br />
        as AI memory, regulated care, and<br />
        programmable health converge
      </div>

      {/* Stage */}
      <section className="cs-stage">
        <div className="cs-venn">
          <span className="cs-corner cs-corner-tl">Operating layer</span>
          <span className="cs-corner cs-corner-tr">Identity-aware</span>
          <span className="cs-corner cs-corner-bl">Longitudinal</span>
          <span className="cs-corner cs-corner-br">Continuous</span>

          <svg viewBox="0 0 400 400" className="cs-venn-svg" aria-hidden="true">
            <defs>
              <linearGradient id="xen-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7C3AED" />
                <stop offset="50%" stopColor="#6366F1" />
                <stop offset="100%" stopColor="#06B6D4" />
              </linearGradient>
            </defs>
            <circle cx="155" cy="170" r="110" fill="url(#xen-grad)" opacity="0.14" className="cs-circ cs-circ-a" />
            <circle cx="245" cy="170" r="110" fill="url(#xen-grad)" opacity="0.14" className="cs-circ cs-circ-b" />
            <circle cx="200" cy="245" r="110" fill="url(#xen-grad)" opacity="0.14" className="cs-circ cs-circ-c" />
          </svg>

          <span className="cs-label cs-label-left">the practitioner</span>
          <span className="cs-label cs-label-right">the person</span>
          <span className="cs-label cs-label-bottom">the protocol</span>

          <span className="cs-punchline">xenios.</span>
        </div>

        <div className="cs-copy">
          <p className="cs-eyebrow">The operating system for human performance</p>
          <h1 className="cs-headline" data-testid="text-headline">
            The substrate beneath the work of being well.
          </h1>
          <p className="cs-sub">
            One agent in the practitioner's voice. One companion in the person's pocket. One continuous record across decades.
          </p>

          {success ? (
            <p className="cs-success" data-testid="text-success">
              ▸ On the list · Position #{success.position} · We'll be in touch when your cohort opens
            </p>
          ) : (
            <form className="cs-form" onSubmit={onSubmit} noValidate data-testid="form-quick-waitlist">
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 1, width: 1, overflow: "hidden" }}>
                <label htmlFor="cs-website">Leave empty</label>
                <input id="cs-website" tabIndex={-1} autoComplete="off" type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
              </div>
              <div className="cs-input-wrap">
                <input
                  type="email"
                  required
                  inputMode="email"
                  autoComplete="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  className="cs-input"
                  aria-label="Email address"
                  disabled={submitting}
                  data-testid="input-email"
                />
                <span className="cs-input-underline" style={{ opacity: focused ? 1 : 0 }} aria-hidden="true" />
              </div>
              <button type="submit" disabled={submitting} className="cs-submit" data-testid="button-submit">
                {submitting ? "Sending" : "Request a seat"}
              </button>
            </form>
          )}

          {error && <p className="cs-error" data-testid="text-error">{error}</p>}

          <p className="cs-live-line" data-testid="text-count">
            <span className="cs-dot" aria-hidden="true" />
            <span>Live · {count} already in line · Founder-direct onboarding</span>
          </p>
        </div>

        {/* Mobile manifesto */}
        <div className="cs-manifesto-mobile">
          A category forming in real time<br />
          as AI memory, regulated care, and<br />
          programmable health converge
        </div>
      </section>

      {/* Footer */}
      <footer className="cs-footer">
        <div className="cs-footer-social">
          <a className="cs-foot-link" href="https://x.com/xeniostech" target="_blank" rel="noreferrer noopener" data-testid="link-twitter">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <span className="cs-foot-text">X / Twitter</span>
          </a>
          <a className="cs-foot-link" href="https://www.linkedin.com/company/officialxenios" target="_blank" rel="noreferrer noopener" data-testid="link-linkedin">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M8 10.5v6M8 7.5v.01M12 16.5v-3.75a1.75 1.75 0 013.5 0V16.5M12 16.5v-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <span className="cs-foot-text">LinkedIn</span>
          </a>
          <a className="cs-foot-link" href="https://www.instagram.com/officialxenios/" target="_blank" rel="noreferrer noopener" data-testid="link-instagram">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" /><circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" /></svg>
            <span className="cs-foot-text">Instagram</span>
          </a>
          <a className="cs-foot-link" href="mailto:team@xeniostechnology.com" data-testid="link-email">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <span className="cs-foot-text">team@xeniostechnology.com</span>
          </a>
        </div>
        <div className="cs-footer-legal">
          <span className="cs-foot-col cs-foot-left">Xenios Technologies, Inc. · Delaware C-Corp</span>
          <span className="cs-foot-col cs-foot-center">Austin, TX · Remote First</span>
          <span className="cs-foot-col cs-foot-right">
            <Link href="/privacy" className="cs-foot-inline" data-testid="link-privacy">Privacy</Link>
            <span className="cs-foot-dot" aria-hidden="true"> · </span>
            <Link href="/terms" className="cs-foot-inline" data-testid="link-terms">Terms</Link>
          </span>
        </div>
      </footer>
    </main>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";

export default function Home() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ position: number } | null>(null);
  const [count, setCount] = useState<number>(551);
  const [honeypot, setHoneypot] = useState("");

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
    setError(null);
    setSubmitting(true);
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
    <div className="coming-soon-root">
      {/* Top bar */}
      <header className="cs-topbar">
        <a href="/" className="cs-wordmark" data-testid="link-home">xenios.</a>
        <div className="cs-status" data-testid="status-cohort">
          <span className="cs-dot" aria-hidden="true" />
          <span className="cs-status-text">
            <span className="cs-status-live">LIVE</span>
            <span className="cs-status-sep"> · </span>
            <span className="cs-status-full">FOUNDING COHORT · MAY 2026</span>
          </span>
        </div>
      </header>

      {/* Right margin vertical text */}
      <div className="cs-rail" aria-hidden="true">COHORT 01 / MAY 2026 / CONFIDENTIAL</div>

      {/* Center stage */}
      <main className="cs-stage">
        <div className="cs-venn" aria-hidden="true">
          <span className="cs-circle cs-circle-1" />
          <span className="cs-circle cs-circle-2" />
          <span className="cs-circle cs-circle-3" />
          <span className="cs-venn-label cs-label-coaches">coaches</span>
          <span className="cs-venn-label cs-label-trainers">trainers</span>
          <span className="cs-venn-label cs-label-practitioners">practitioners</span>
          <span className="cs-venn-center">xenios</span>
        </div>

        <section className="cs-pitch">
          <p className="cs-eyebrow">THE AI-ADJUNCT OPERATIONS SYSTEM</p>
          <h1 className="cs-headline" data-testid="text-headline">
            One inbox. One client record. One agent in your voice.
          </h1>
          <p className="cs-sub">
            Founding cohort is open. Founder-direct onboarding. Pricing locked for the life of your account.
          </p>

          {success ? (
            <p className="cs-success" data-testid="text-success">
              ▸ ON THE LIST. POSITION #{success.position}. WE'LL BE IN TOUCH.
            </p>
          ) : (
            <form className="cs-form" onSubmit={onSubmit} noValidate data-testid="form-quick-waitlist">
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 1, width: 1, overflow: "hidden" }}>
                <label htmlFor="cs-website">Leave empty</label>
                <input id="cs-website" tabIndex={-1} autoComplete="off" type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
              </div>
              <input
                type="email"
                required
                inputMode="email"
                autoComplete="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="cs-input"
                aria-label="Email address"
                data-testid="input-email"
              />
              <button type="submit" disabled={submitting} className="cs-submit" data-testid="button-submit">
                {submitting ? "Sending" : "Request access"}
              </button>
            </form>
          )}

          {error && <p className="cs-error" data-testid="text-error">{error}</p>}

          <p className="cs-count" data-testid="text-count">
            <span className="cs-dot" aria-hidden="true" />
            <span>LIVE · {count} ALREADY IN LINE</span>
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer className="cs-footer">
        <div className="cs-footer-row cs-footer-social">
          <a className="cs-foot-link" href="https://www.instagram.com/officialxenios/" target="_blank" rel="noreferrer noopener" data-testid="link-instagram">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
            <span className="cs-foot-text">INSTAGRAM</span>
          </a>
          <span className="cs-foot-dot" aria-hidden="true">·</span>
          <a className="cs-foot-link" href="https://www.linkedin.com/company/officialxenios" target="_blank" rel="noreferrer noopener" data-testid="link-linkedin">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="7" y1="10" x2="7" y2="17" /><circle cx="7" cy="7" r="0.6" fill="currentColor" stroke="none" /><path d="M11 17v-4a2.5 2.5 0 0 1 5 0v4" /><line x1="11" y1="10" x2="11" y2="17" /></svg>
            <span className="cs-foot-text">LINKEDIN</span>
          </a>
          <span className="cs-foot-dot" aria-hidden="true">·</span>
          <a className="cs-foot-link" href="mailto:team@xeniostechnology.com" data-testid="link-email">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
            <span className="cs-foot-text">TEAM@XENIOSTECHNOLOGY.COM</span>
          </a>
        </div>
        <div className="cs-footer-row cs-footer-legal">
          <span className="cs-foot-col cs-foot-left">XENIOS TECHNOLOGIES, INC. · DELAWARE C-CORP</span>
          <span className="cs-foot-col cs-foot-center">AUSTIN, TX · REMOTE FIRST</span>
          <span className="cs-foot-col cs-foot-right">
            <Link href="/privacy" className="cs-foot-link cs-foot-inline" data-testid="link-privacy">PRIVACY</Link>
            <span className="cs-foot-dot" aria-hidden="true">·</span>
            <Link href="/terms" className="cs-foot-link cs-foot-inline" data-testid="link-terms">TERMS</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

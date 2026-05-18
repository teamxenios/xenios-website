import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";

const ROLE_OPTIONS = [
  "Personal trainer / strength coach",
  "Online fitness coach",
  "Nutrition coach / dietitian",
  "Health & wellness coach",
  "Yoga / pilates / movement",
  "Sports performance coach",
  "Recovery / mobility / PT",
  "Endurance / run coach",
  "Functional medicine / integrative",
  "Longevity / biomarker coach",
  "Studio / gym / multi-coach team",
  "Member / individual",
  "Investor / partner",
  "Other",
];

const PRACTICE_OPTIONS = [
  "Solo / just me",
  "2-10 clients",
  "10-50 clients",
  "50-200 clients",
  "200+ clients",
  "Team of coaches",
  "Not applicable",
];

interface FormState {
  name: string;
  email: string;
  role: string;
  practice: string;
  about: string;
  website: string;
}
const EMPTY: FormState = { name: "", email: "", role: "", practice: "", about: "", website: "" };

export default function Home() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ position: number } | null>(null);
  const [count, setCount] = useState<number>(551);

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

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const role = form.role;
    if (!name) { setError("Please enter your name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address."); return; }
    if (!role) { setError("Please pick the role that fits best."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          role,
          practice: form.practice,
          about: form.about.trim(),
          website: form.website,
        }),
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

      {/* Decorative fixed (desktop) */}
      <div className="cs-rail-wrap" aria-hidden="true">
        <span className="cs-rail">
          Xenios Technologies, Inc. · Delaware C-Corp · Austin, TX · Confidential · May 2026
        </span>
      </div>
      <div className="cs-manifesto-fixed" aria-hidden="true">
        A category forming in real time<br />
        as AI memory, regulated care, and<br />
        proactive health converge
      </div>

      {/* Stage — two columns on desktop */}
      <section className="cs-stage">
        {/* Left: Venn */}
        <div className="cs-venn-col">
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

            <span className="cs-label cs-label-left">the coach</span>
            <span className="cs-label cs-label-right">the client</span>
            <span className="cs-label cs-label-bottom">the clinician</span>

            <span className="cs-punchline">xenios.</span>
          </div>
        </div>

        {/* Right: copy + form */}
        <div className="cs-copy">
          <p className="cs-eyebrow">The operating system for proactive health and wellness</p>
          <h1 className="cs-headline" data-testid="text-headline">
            One platform for the professional, the client, and the clinical layer between them.
          </h1>
          <p className="cs-sub">
            Xenios replaces the fifteen-tool stack underneath trainers, coaches, and practitioners with one substrate, and gives every client an AI companion that remembers everything.
          </p>

          {success ? (
            <div className="cs-success" role="status" aria-live="polite" data-testid="text-success">
              ▸ On the list · Position #{success.position}
              <br />
              We'll be in touch when your cohort opens.
            </div>
          ) : (
            <form className="cs-form" onSubmit={onSubmit} noValidate data-testid="form-quick-waitlist">
              {/* Honeypot */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 1, width: 1, overflow: "hidden" }}>
                <label htmlFor="cs-website">Leave empty</label>
                <input id="cs-website" tabIndex={-1} autoComplete="off" type="text" value={form.website} onChange={(e) => update("website", e.target.value)} />
              </div>

              <div className="cs-field-row">
                <Field id="cs-name" label="Name">
                  <input id="cs-name" type="text" required autoComplete="name" maxLength={80} placeholder="Full name" value={form.name} onChange={(e) => update("name", e.target.value)} className="cs-fld-input" disabled={submitting} data-testid="input-name" />
                </Field>
                <Field id="cs-email" label="Email">
                  <input id="cs-email" type="email" required inputMode="email" autoComplete="email" placeholder="your@email.com" value={form.email} onChange={(e) => update("email", e.target.value)} className="cs-fld-input" disabled={submitting} data-testid="input-email" />
                </Field>
              </div>

              <div className="cs-field-row">
                <Field id="cs-role" label="I am a">
                  <select id="cs-role" required value={form.role} onChange={(e) => update("role", e.target.value)} className="cs-fld-input cs-fld-select" disabled={submitting} data-testid="select-role">
                    <option value="">Select your role</option>
                    {ROLE_OPTIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
                  </select>
                </Field>
                <Field id="cs-practice" label="Practice size">
                  <select id="cs-practice" value={form.practice} onChange={(e) => update("practice", e.target.value)} className="cs-fld-input cs-fld-select" disabled={submitting} data-testid="select-practice">
                    <option value="">Optional</option>
                    {PRACTICE_OPTIONS.map((p) => (<option key={p} value={p}>{p}</option>))}
                  </select>
                </Field>
              </div>

              <Field id="cs-about" label="Tell us about your practice (optional)">
                <textarea id="cs-about" maxLength={600} placeholder="What you do, what tools you use today, what would change if you had this" value={form.about} onChange={(e) => update("about", e.target.value)} className="cs-fld-input cs-fld-textarea" rows={2} disabled={submitting} data-testid="textarea-about" />
              </Field>

              <button type="submit" disabled={submitting} className="cs-submit" data-testid="button-submit">
                {submitting ? "Sending" : "Request a seat"}
              </button>

              <p className="cs-form-note">Founder-direct onboarding · We read every response</p>
            </form>
          )}

          {error && <p className="cs-error" role="alert" aria-live="assertive" data-testid="text-error">{error}</p>}

          <p className="cs-live-line" data-testid="text-count">
            <span className="cs-dot" aria-hidden="true" />
            <span>Live · {count} already in line</span>
          </p>

          <p className="cs-universe">
            Built for personal trainers, strength coaches, nutritionists and dietitians, health and wellness coaches, sports performance staff, yoga and movement instructors, recovery and mobility specialists, run and endurance coaches, functional medicine practitioners, longevity coaches, and the studios, gyms, and teams that run them.
          </p>
        </div>

        {/* Mobile manifesto */}
        <div className="cs-manifesto-mobile">
          A category forming in real time<br />
          as AI memory, regulated care, and<br />
          proactive health converge
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

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="cs-field">
      <label htmlFor={id} className="cs-fld-label">{label}</label>
      {children}
    </div>
  );
}

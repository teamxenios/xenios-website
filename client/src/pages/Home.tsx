import { useCallback, useEffect, useState, type FormEvent } from "react";
import SeoHead from "@/components/SeoHead";
import Footer from "@/components/Footer";
import Wordmark from "@/components/Wordmark";
import Turnstile from "@/components/Turnstile";
import { getAttribution } from "@/lib/attribution";
import { trackLead } from "@/lib/tracking";
import { CLIENT_COUNT_OPTIONS } from "@/lib/content";

const NAV_LINKS = [
  { label: "The agents", href: "#agents" },
  { label: "Who it's for", href: "#who" },
];

const WHO_FOR = [
  "Personal trainers",
  "Strength and performance coaches",
  "Health and longevity coaches",
  "Nutritionists and dietitians",
  "Physical therapists",
  "Performance gyms",
  "Wellness and longevity clinics",
  "Sports teams",
  "Corporate wellness teams",
];

const ROLE_OPTIONS = [...WHO_FOR, "Other"];

const INTERESTS = [
  "Professional agent (Xen)",
  "Client agent (Athena)",
  "Gym, clinic, or team",
  "Partnership",
];

interface FormState {
  name: string;
  email: string;
  role: string;
  clientCount: string;
  interestedIn: string[];
  consent: boolean;
  website: string;
}

const EMPTY: FormState = { name: "", email: "", role: "", clientCount: "", interestedIn: [], consent: false, website: "" };

type FieldErrors = Partial<Record<"name" | "email" | "role" | "clientCount" | "consent", string>>;

const ANCHOR_OFFSET = { scrollMarginTop: 88 } as const;

export default function Home() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [count, setCount] = useState<number | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const onTurnstileToken = useCallback((t: string) => setTurnstileToken(t), []);

  useEffect(() => {
    let alive = true;
    const fetchCount = () => {
      fetch("/api/waitlist/count")
        .then((r) => r.json())
        .then((d) => {
          if (alive && typeof d.count === "number") setCount(d.count);
        })
        .catch(() => {});
    };
    fetchCount();
    const id = setInterval(fetchCount, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function toggleInterest(value: string) {
    setForm((f) => ({
      ...f,
      interestedIn: f.interestedIn.includes(value)
        ? f.interestedIn.filter((i) => i !== value)
        : [...f.interestedIn, value],
    }));
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!form.name.trim()) next.name = "Please enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = "Please enter a valid email address.";
    }
    if (!form.role) next.role = "Please choose the role that fits best.";
    if (!form.clientCount) next.clientCount = "Please choose how many clients you work with.";
    if (!form.consent) next.consent = "Please confirm so we can email you about xenios.";
    return next;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const next = validate();
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/waitlist/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          role: form.role,
          clientCount: form.clientCount,
          interestedIn: form.interestedIn,
          consent: form.consent,
          turnstileToken,
          website: form.website,
          ...getAttribution(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setFormError(data.message || "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
      trackLead();
      if (typeof data.count === "number") setCount(data.count);
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <SeoHead
        title="xenios: two AI agents for every coach"
        description="xenios gives every coach two AI agents: one to run the practice, and one to support each client between sessions, in your voice, always disclosed as AI and always yours to approve."
        path="/"
      />

      {/* Header */}
      <header
        className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md rule-bottom"
        data-testid="nav-main"
        style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}
      >
        <div className="container-x">
          <div className="flex items-center justify-between" style={{ minHeight: 64 }}>
            <Wordmark size="md" />
            <nav className="hidden md:flex items-center gap-6 lg:gap-8" aria-label="Primary">
              {NAV_LINKS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  data-testid={`link-nav-${item.label.replace(/[^a-z]+/gi, "-").toLowerCase()}`}
                  className="text-[14px] lg:text-[15px] tracking-[-0.005em] text-ink-2 hover:text-pulse transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <a
              href="#waitlist"
              data-testid="button-nav-waitlist"
              className="btn btn-primary"
              style={{ height: 44, padding: "0 18px", fontSize: 14 }}
            >
              Join the waitlist
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Section 1 — Hero */}
        <section className="container-x" style={{ paddingTop: "var(--space-hero-top)", paddingBottom: "var(--space-hero-bottom)" }}>
          <p className="mono-cap text-pulse mb-6" data-testid="text-motif-hero">
            The AI drafts. The coach decides.
          </p>
          <h1 className="display-xl text-balance" style={{ maxWidth: "16ch" }} data-testid="text-headline">
            Two AI agents for every coach.
          </h1>
          <p className="mt-8 body-l text-ink-2" style={{ maxWidth: "60ch" }}>
            One runs your practice. One supports each client between sessions, in your voice, always disclosed as AI,
            always yours to approve.
          </p>
          <p className="mt-6 body-m text-ink-2" style={{ maxWidth: "56ch" }}>
            xenios is built for coaches who manage real client relationships, real goals, and real follow-up.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <a href="#waitlist" className="btn btn-primary" data-testid="button-hero-waitlist">
              Join the waitlist
            </a>
            <a href="#agents" className="btn btn-ghost" data-testid="button-hero-agents">
              See how it works
            </a>
          </div>
          <p className="mt-8 mono-cap text-ink-mute">
            Built for coaches. Not to replace them.
          </p>
        </section>

        {/* Section 2 — Problem */}
        <section className="container-x section-y rule-top">
          <p className="mono-cap text-ink-mute mb-6">The problem</p>
          <h2 className="display-m text-balance" style={{ maxWidth: "18ch" }}>
            The best coaches are limited by time.
          </h2>
          <p className="mt-8 body-l text-ink-2" style={{ maxWidth: "60ch" }}>
            A great coach can only hold so many real relationships at once. And between sessions, where most of the
            change actually happens, clients are on their own.
          </p>
        </section>

        {/* Section 3 — Two-agent product section */}
        <section id="agents" className="container-x section-y rule-top" style={ANCHOR_OFFSET}>
          <p className="mono-cap text-ink-mute mb-6">The product</p>
          <h2 className="display-m text-balance" style={{ maxWidth: "20ch" }}>
            Two agents. One for you. One for each client.
          </h2>

          {/* Connected-agents visual */}
          <div className="mt-12 agent-diagram" data-testid="visual-agents" role="img" aria-label="Two agents connected through xenios: Xen for the coach, Athena for each client.">
            <div className="agent-node card" data-testid="node-professional">
              <p className="mono-cap text-pulse mb-2">Xen</p>
              <p className="h3">Runs your practice.</p>
            </div>

            <div className="agent-link" aria-hidden="true">
              <span className="agent-line" />
              <span className="agent-core">xenios</span>
              <span className="agent-line" />
            </div>

            <div className="agent-node card" data-testid="node-client">
              <p className="mono-cap text-pulse mb-2">Athena</p>
              <p className="h3">Supports each client.</p>
            </div>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
            <div>
              <p className="mono-cap text-ink-mute mb-3">Xen</p>
              <p className="body-l text-ink-2">
                Xen runs the practice (check-ins, programming, scheduling, notes) and surfaces only what needs your
                judgment.
              </p>
            </div>
            <div>
              <p className="mono-cap text-ink-mute mb-3">Athena</p>
              <p className="body-l text-ink-2">
                Athena keeps each client supported between sessions, in your voice. You stay in control. The
                relationship stays human.
              </p>
            </div>
          </div>

          <p className="mt-12 quote-lead text-ink">The AI drafts. The coach decides.</p>
        </section>

        {/* Section 4 — Who it is for */}
        <section id="who" className="container-x section-y rule-top" style={ANCHOR_OFFSET}>
          <p className="mono-cap text-ink-mute mb-6">Who it's for</p>
          <h2 className="display-m text-balance" style={{ maxWidth: "20ch" }}>
            Built for serious coaches who run real client relationships.
          </h2>
          <ul className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-4">
            {WHO_FOR.map((w) => (
              <li key={w} className="flex items-center gap-3 body-l text-ink-2" data-testid={`who-${w.replace(/\s+/g, "-").toLowerCase()}`}>
                <span aria-hidden="true" className="bg-orange-fire shrink-0" style={{ width: 7, height: 7, borderRadius: 9999 }} />
                {w}
              </li>
            ))}
          </ul>
          <p className="mt-10 body-l text-ink-2" style={{ maxWidth: "56ch" }}>
            If you manage people, protocols, progress, and follow-up, xenios is being built for you.
          </p>
        </section>

        {/* Section 5 — Waitlist */}
        <section id="waitlist" className="container-x section-y rule-top" style={ANCHOR_OFFSET}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-20 items-start">
            <div>
              <p className="mono-cap text-ink-mute mb-6">Waitlist</p>
              <h2 className="display-m">Join the founding waitlist.</h2>
              <p className="mt-8 body-l text-ink-2" style={{ maxWidth: "52ch" }}>
                We are opening xenios to a small founding group of coaches and organizations helping shape the next
                layer of proactive health. Join if you want to support more clients, reduce admin, keep people engaged
                between sessions, and use AI without losing your voice or judgment.
              </p>
              {count !== null && (
                <p className="counter-line text-ink-2 mt-8" data-testid="text-count">
                  <span className="counter-dot" aria-hidden="true" />
                  <span>{count} already in line</span>
                </p>
              )}
            </div>

            <div>
              {success ? (
                <div className="card" role="status" aria-live="polite" data-testid="text-success">
                  <p className="h3 mb-2">You're on the xenios waitlist.</p>
                  <p className="body-m text-ink-2">
                    Check your email for confirmation. We onboard coaches in small groups, so we will reach out as soon
                    as a spot opens. Questions? Reply to team@xeniostechnology.com.
                  </p>
                </div>
              ) : (
                <form onSubmit={onSubmit} noValidate data-testid="form-waitlist">
                  {/* Honeypot */}
                  <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 1, width: 1, overflow: "hidden" }}>
                    <label htmlFor="website">Leave empty</label>
                    <input
                      id="website"
                      tabIndex={-1}
                      autoComplete="off"
                      type="text"
                      value={form.website}
                      onChange={(e) => update("website", e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="f-name" className="form-label">Name</label>
                      <input
                        id="f-name"
                        type="text"
                        autoComplete="name"
                        maxLength={120}
                        placeholder="Full name"
                        value={form.name}
                        onChange={(e) => update("name", e.target.value)}
                        className="input-field"
                        disabled={submitting}
                        aria-invalid={!!errors.name}
                        data-testid="input-name"
                      />
                      {errors.name && <p className="body-s mt-2" role="alert" aria-live="polite" style={{ color: "var(--error)" }} data-testid="error-name">{errors.name}</p>}
                    </div>
                    <div>
                      <label htmlFor="f-email" className="form-label">Email</label>
                      <input
                        id="f-email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="your@email.com"
                        value={form.email}
                        onChange={(e) => update("email", e.target.value)}
                        className="input-field"
                        disabled={submitting}
                        aria-invalid={!!errors.email}
                        data-testid="input-email"
                      />
                      {errors.email && <p className="body-s mt-2" role="alert" aria-live="polite" style={{ color: "var(--error)" }} data-testid="error-email">{errors.email}</p>}
                    </div>
                  </div>

                  <div className="mt-5">
                    <label htmlFor="f-role" className="form-label">Role</label>
                    <select
                      id="f-role"
                      value={form.role}
                      onChange={(e) => update("role", e.target.value)}
                      className="input-field"
                      disabled={submitting}
                      aria-invalid={!!errors.role}
                      data-testid="select-role"
                    >
                      <option value="">Select your role</option>
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    {errors.role && <p className="body-s mt-2" role="alert" aria-live="polite" style={{ color: "var(--error)" }} data-testid="error-role">{errors.role}</p>}
                  </div>

                  <div className="mt-5">
                    <label htmlFor="f-clientcount" className="form-label">Number of clients</label>
                    <select
                      id="f-clientcount"
                      value={form.clientCount}
                      onChange={(e) => update("clientCount", e.target.value)}
                      className="input-field"
                      disabled={submitting}
                      aria-invalid={!!errors.clientCount}
                      data-testid="select-client-count"
                    >
                      <option value="">Select a range</option>
                      {CLIENT_COUNT_OPTIONS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    {errors.clientCount && <p className="body-s mt-2" role="alert" aria-live="polite" style={{ color: "var(--error)" }} data-testid="error-client-count">{errors.clientCount}</p>}
                  </div>

                  <fieldset className="mt-6" data-testid="group-interests">
                    <legend className="form-label" style={{ marginBottom: 12 }}>Interested in (optional)</legend>
                    <div className="flex flex-wrap gap-3">
                      {INTERESTS.map((opt) => {
                        const checked = form.interestedIn.includes(opt);
                        return (
                          <label
                            key={opt}
                            className="chip interest-chip"
                            style={{
                              cursor: "pointer",
                              borderColor: checked ? "var(--pulse)" : "var(--ink)",
                              color: checked ? "var(--pulse)" : "var(--ink)",
                            }}
                            data-testid={`interest-${opt.replace(/[^a-z]+/gi, "-").toLowerCase()}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleInterest(opt)}
                              disabled={submitting}
                              style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
                            />
                            {opt}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <label className="flex items-start gap-3 cursor-pointer text-ink-2 mt-6" data-testid="label-consent">
                    <input
                      type="checkbox"
                      checked={form.consent}
                      onChange={(e) => update("consent", e.target.checked)}
                      disabled={submitting}
                      className="mt-1 w-4 h-4 accent-[var(--pulse)]"
                      aria-invalid={!!errors.consent}
                      data-testid="checkbox-consent"
                    />
                    <span className="body-s">I agree to receive email from xenios about the waitlist and the founding group. I can opt out any time.</span>
                  </label>
                  {errors.consent && <p className="body-s mt-2" role="alert" aria-live="polite" style={{ color: "var(--error)" }} data-testid="error-consent">{errors.consent}</p>}

                  <Turnstile onToken={onTurnstileToken} />

                  {formError && (
                    <p className="body-s mt-5" role="alert" aria-live="assertive" style={{ color: "var(--error)" }} data-testid="text-form-error">
                      {formError}
                    </p>
                  )}

                  <button type="submit" disabled={submitting} className="btn btn-primary w-full mt-6" data-testid="button-submit">
                    {submitting ? "Sending" : "Join the waitlist"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

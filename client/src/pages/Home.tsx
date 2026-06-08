import { useEffect, useState, type FormEvent } from "react";
import SeoHead from "@/components/SeoHead";
import Footer from "@/components/Footer";
import Wordmark from "@/components/Wordmark";

const NAV_LINKS = [
  { label: "The agents", href: "#agents" },
  { label: "Who it's for", href: "#who" },
];

const PROBLEM_LINES = [
  "Clients need support between sessions.",
  "Athletes need context between training days.",
  "Patients need follow-up between visits.",
];

const WHO_FOR = [
  "Personal trainers",
  "Strength coaches",
  "Nutritionists",
  "Health coaches",
  "Physical therapists",
  "Longevity clinicians",
  "Performance gyms",
  "Wellness clinics",
  "Sports teams",
  "Corporate wellness teams",
];

const ROLE_OPTIONS = [
  "Personal trainer or strength coach",
  "Online fitness coach",
  "Nutrition coach or dietitian",
  "Health coach",
  "Physical therapist",
  "Longevity clinician",
  "Performance gym or sports team",
  "Wellness clinic or organization",
  "Investor or partner",
  "Other",
];

const INTERESTS = [
  "Professional agent",
  "Client or athlete agent",
  "Gym, clinic, or team",
  "Partnership",
];

interface FormState {
  name: string;
  email: string;
  role: string;
  interestedIn: string[];
  website: string;
}

const EMPTY: FormState = { name: "", email: "", role: "", interestedIn: [], website: "" };

type FieldErrors = Partial<Record<"name" | "email" | "role", string>>;

const ANCHOR_OFFSET = { scrollMarginTop: 88 } as const;

export default function Home() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ position: number } | null>(null);
  const [count, setCount] = useState<number | null>(null);

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
          interestedIn: form.interestedIn,
          website: form.website,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setFormError(data.message || "Something went wrong. Please try again.");
        return;
      }
      setSuccess({ position: data.position ?? 0 });
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
        title="xenios, two AI agents for every health professional"
        description="xenios gives every health professional two AI agents: one to help run their practice, and one to support each client or athlete between sessions. You stay in control. The relationship stays human."
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
            The AI helps. The professional leads.
          </p>
          <h1 className="display-xl text-balance" style={{ maxWidth: "16ch" }} data-testid="text-headline">
            Two AI agents for every health professional.
          </h1>
          <p className="mt-8 body-l text-ink-2" style={{ maxWidth: "56ch" }}>
            One helps you run the practice. One supports your client or athlete between sessions.
          </p>
          <p className="mt-6 body-m text-ink-2" style={{ maxWidth: "60ch" }}>
            xenios is built for coaches, trainers, clinicians, nutritionists, gyms, and performance teams who manage
            real people, real goals, and real follow-up. Your professional agent helps with the work around the
            client. Your client agent helps each person stay supported between sessions. You stay in control. The
            relationship stays human.
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
            Built for professionals. Not to replace them.
          </p>
        </section>

        {/* Section 2 — Problem */}
        <section className="container-x section-y rule-top">
          <p className="mono-cap text-ink-mute mb-6">The problem</p>
          <h2 className="display-m text-balance" style={{ maxWidth: "18ch" }}>
            The best professionals are limited by time.
          </h2>
          <div className="mt-8 space-y-2" data-testid="list-problem">
            {PROBLEM_LINES.map((line) => (
              <p key={line} className="body-l text-ink-2">{line}</p>
            ))}
          </div>
          <p className="mt-8 body-l text-ink-2" style={{ maxWidth: "60ch" }}>
            But most professionals are stuck doing everything manually: messages, check-ins, notes, updates,
            scheduling, progress tracking, and follow-up.
          </p>
          <p className="mt-6 quote-lead text-ink" style={{ maxWidth: "44ch" }}>
            The result is simple: you either stay small, or quality starts to thin.
          </p>
        </section>

        {/* Section 3 — Two-agent product section */}
        <section id="agents" className="container-x section-y rule-top" style={ANCHOR_OFFSET}>
          <p className="mono-cap text-ink-mute mb-6">The product</p>
          <h2 className="display-m text-balance" style={{ maxWidth: "20ch" }}>
            One agent for you. One agent for every client.
          </h2>

          {/* Connected-agents visual */}
          <div className="mt-12 agent-diagram" data-testid="visual-agents" role="img" aria-label="Two agents, one for the professional and one for the client or athlete, connected through xenios">
            <div className="agent-node card" data-testid="node-professional">
              <p className="mono-cap text-pulse mb-2">Professional agent</p>
              <p className="h3">Runs the work around your clients.</p>
            </div>

            <div className="agent-link" aria-hidden="true">
              <span className="agent-line" />
              <span className="agent-core">xenios</span>
              <span className="agent-line" />
            </div>

            <div className="agent-node card" data-testid="node-client">
              <p className="mono-cap text-pulse mb-2">Client or athlete agent</p>
              <p className="h3">Supports each person between sessions.</p>
            </div>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
            <div>
              <p className="mono-cap text-ink-mute mb-3">Professional agent</p>
              <p className="body-l text-ink-2">
                Your professional agent helps manage the work around your clients. It helps prepare check-ins,
                summarize progress, organize notes, surface what needs attention, and draft follow-ups in your voice.
                It gives you more leverage without taking away your judgment.
              </p>
            </div>
            <div>
              <p className="mono-cap text-ink-mute mb-3">Client or athlete agent</p>
              <p className="body-l text-ink-2">
                Your client agent supports each person between sessions. It helps them stay consistent, remember the
                plan, understand next steps, and feel supported when you are not physically with them. It is always
                connected back to the professional.
              </p>
            </div>
          </div>

          <p className="mt-12 quote-lead text-ink">The AI helps. The professional leads.</p>
        </section>

        {/* Section 4 — Who it is for */}
        <section id="who" className="container-x section-y rule-top" style={ANCHOR_OFFSET}>
          <p className="mono-cap text-ink-mute mb-6">Who it's for</p>
          <h2 className="display-m text-balance" style={{ maxWidth: "20ch" }}>
            Built for the people clients already trust.
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
                We are opening xenios to a small group of professionals and organizations helping shape the next layer
                of proactive health. Join if you want to support more people, reduce admin, keep your clients engaged
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
                  <p className="h3 mb-2">You are on the list.</p>
                  <p className="body-m text-ink-2">
                    Position #{success.position}. We will be in touch as cohorts open. Watch for a note from
                    team@xeniostechnology.com.
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
                            data-testid={`interest-${opt.replace(/\s+/g, "-").toLowerCase()}`}
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

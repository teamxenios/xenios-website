import { useEffect, useState, type FormEvent } from "react";
import SeoHead from "@/components/SeoHead";
import Footer from "@/components/Footer";
import Wordmark from "@/components/Wordmark";

const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "For Professionals", href: "#for-professionals" },
  { label: "For Teams", href: "#for-teams" },
  { label: "How It Works", href: "#how-it-works" },
];

const PROBLEM_TAGS = [
  "client check-ins",
  "program updates",
  "food logs",
  "wearable data",
  "missed messages",
  "scheduling",
  "billing",
  "follow-ups",
  "progress summaries",
  "clinical handoffs",
];

const SOLUTION_CARDS = [
  {
    eyebrow: "Xen",
    title: "The professional workspace.",
    body: "One inbox, one client record, one place to see what needs your attention.",
  },
  {
    eyebrow: "Athena",
    title: "The client companion.",
    body: "A proactive companion that supports your client between sessions, trained around your voice, standards, and methods, with you always in the loop.",
  },
  {
    eyebrow: "Record",
    title: "A connected health record.",
    body: "Messages, notes, programs, wearable data, labs, goals, and progress in one longitudinal view.",
  },
  {
    eyebrow: "Care",
    title: "Clinical support when needed.",
    body: "When a client reaches a medical edge, the workflow can route to a licensed clinician instead of leaving you to guess.",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Bring your clients in.",
    body: "Import clients, notes, programs, and history from your current tools.",
  },
  {
    num: "02",
    title: "Train your voice.",
    body: "xenios learns how you communicate, what you care about, and how you coach.",
  },
  {
    num: "03",
    title: "Review what matters.",
    body: "The AI drafts check-ins, summaries, nudges, and follow-ups. You approve before anything important goes out.",
  },
  {
    num: "04",
    title: "Support more people.",
    body: "Your clients get more continuity. You get more time back. The relationship stays human.",
  },
];

const SURFACES = [
  {
    id: "for-professionals",
    eyebrow: "For the professional",
    title: "A command center.",
    body: "Messages, check-ins, programs, client status, scheduling, and decisions, all in one place.",
  },
  {
    id: "for-client",
    eyebrow: "For the client",
    title: "A steady companion.",
    body: "Helps them stay consistent between sessions, while keeping the named professional in the loop.",
  },
  {
    id: "for-teams",
    eyebrow: "For organizations",
    title: "A shared system.",
    body: "For gyms, clinics, teams, and wellness groups that need consistent client support across many professionals.",
  },
];

const DIFFERENCE_POINTS = [
  "One workspace for the professional",
  "One AI companion for the client",
  "One longitudinal health record",
  "Human approval built in",
  "Clinical escalation when needed",
  "Built for proactive health, not reactive care",
];

const REVIEW_QUEUE = [
  { client: "Maya R.", draft: "Drafted weekly check-in. Adherence is up, sleep dipped midweek." },
  { client: "James T.", draft: "Drafted program update. Suggests lighter load after the travel week." },
  { client: "Priya S.", draft: "Drafted follow-up. Flags a question that may need clinical review." },
];

const ROLE_OPTIONS = [
  "Personal trainer or strength coach",
  "Online fitness coach",
  "Nutrition coach or dietitian",
  "Health coach",
  "Longevity clinician",
  "Physical therapist",
  "Sports performance coach",
  "Gym or studio owner",
  "Clinic or practice lead",
  "Investor or partner",
  "Other",
];

const BUSINESS_TYPES = [
  "Solo professional",
  "Studio or gym",
  "Clinic",
  "Performance team",
  "Wellness organization",
  "Other",
];

const CLIENT_COUNTS = [
  "Just getting started",
  "1 to 25",
  "26 to 100",
  "101 to 300",
  "300 plus",
];

const INTERESTS = [
  "Professional workspace",
  "Client companion",
  "Clinic or team platform",
  "Partnership",
  "Investment",
];

interface FormState {
  name: string;
  email: string;
  role: string;
  businessType: string;
  numberOfClients: string;
  currentTools: string;
  bottleneck: string;
  interestedIn: string[];
  website: string;
}

const EMPTY: FormState = {
  name: "",
  email: "",
  role: "",
  businessType: "",
  numberOfClients: "",
  currentTools: "",
  bottleneck: "",
  interestedIn: [],
  website: "",
};

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
          businessType: form.businessType,
          numberOfClients: form.numberOfClients,
          currentTools: form.currentTools.trim(),
          bottleneck: form.bottleneck.trim(),
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
        title="xenios, an AI workspace for health and performance professionals"
        description="xenios helps coaches, clinicians, and performance professionals manage more clients through one AI-powered workspace that drafts the busywork, keeps every client record connected, and preserves the human relationship."
        path="/"
      />

      {/* Header (anchor nav) */}
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
                  data-testid={`link-nav-${item.label.replace(/\s+/g, "-").toLowerCase()}`}
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
            The AI drafts. The professional approves.
          </p>
          <h1 className="display-xl text-balance" style={{ maxWidth: "18ch" }} data-testid="text-headline">
            Serve more clients without becoming less human.
          </h1>
          <p className="mt-8 body-l text-ink-2" style={{ maxWidth: "62ch" }}>
            xenios gives coaches, clinicians, trainers, nutritionists, gyms, clinics, and performance teams one
            workspace to manage clients, messages, check-ins, programs, health data, and follow-ups. The AI drafts
            the busywork in your voice. You review, approve, and stay in control.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
            <a href="#waitlist" className="btn btn-primary" data-testid="button-hero-waitlist">
              Join the waitlist
            </a>
            <a href="#how-it-works" className="btn btn-ghost" data-testid="button-hero-how">
              See how it works
            </a>
          </div>
          <p className="mt-8 mono-cap text-ink-mute" style={{ maxWidth: "60ch", lineHeight: 1.6 }}>
            Built for proactive health professionals. Always human-approved. Never replacing the professional.
          </p>
        </section>

        {/* Section 2 — The problem */}
        <section className="container-x section-y rule-top">
          <p className="mono-cap text-ink-mute mb-6">The problem</p>
          <h2 className="display-m text-balance" style={{ maxWidth: "20ch" }}>
            The best professionals are capped by manual work.
          </h2>
          <p className="mt-8 body-l text-ink-2" style={{ maxWidth: "62ch" }}>
            Every week, coaches and practitioners are buried in the same tasks. The work matters, but it does not
            scale. As the roster grows, quality thins, clients feel less supported, and the professional becomes the
            bottleneck.
          </p>
          <div className="chip-strip mt-10" data-testid="list-problem-tags">
            {PROBLEM_TAGS.map((t) => (
              <span key={t} className="chip" data-testid={`chip-${t.replace(/\s+/g, "-")}`}>
                {t}
              </span>
            ))}
          </div>
          <p className="mt-8 body-s text-ink-mute" style={{ maxWidth: "62ch" }}>
            Weekly check-ins drop from about 15 minutes per client to about 2 minutes, while the professional stays
            in control.
          </p>
        </section>

        {/* Section 3 — The solution */}
        <section id="product" className="container-x section-y rule-top" style={ANCHOR_OFFSET}>
          <p className="mono-cap text-ink-mute mb-6">The solution</p>
          <h2 className="display-m text-balance" style={{ maxWidth: "22ch" }}>
            One workspace for the people who keep humans healthy.
          </h2>
          <p className="mt-6 quote-lead text-ink-2" style={{ maxWidth: "48ch" }}>
            xenios is the operating layer between the professional, the client, and the protocol.
          </p>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {SOLUTION_CARDS.map((c) => (
              <article key={c.eyebrow} className="card" data-testid={`card-solution-${c.eyebrow.toLowerCase()}`}>
                <p className="mono-cap text-pulse mb-3">{c.eyebrow}</p>
                <h3 className="h3 mb-3">{c.title}</h3>
                <p className="body-m text-ink-2">{c.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Section 4 — How it works */}
        <section id="how-it-works" className="container-x section-y rule-top" style={ANCHOR_OFFSET}>
          <p className="mono-cap text-ink-mute mb-6">How it works</p>
          <h2 className="display-m">How xenios works</h2>
          <div className="mt-12 space-y-10">
            {STEPS.map((s) => (
              <div
                key={s.num}
                className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-4 md:gap-12 rule-bottom pb-10"
                data-testid={`step-${s.num}`}
              >
                <p className="mono-cap text-pulse text-2xl font-800">{s.num}</p>
                <div>
                  <h3 className="display-s mb-3">{s.title}</h3>
                  <p className="body-l text-ink-2" style={{ maxWidth: "58ch" }}>
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Review queue placeholder — reinforces the draft-and-approve motif */}
          <div className="mt-16 card" role="img" aria-label="Example daily review queue showing AI-drafted messages with an approve action" data-testid="mockup-review-queue">
            <div className="flex items-center justify-between rule-bottom pb-4 mb-4">
              <p className="mono-cap text-ink-mute">Today's review queue</p>
              <p className="mono-cap text-pulse">{REVIEW_QUEUE.length} to review</p>
            </div>
            <ul className="space-y-4">
              {REVIEW_QUEUE.map((r) => (
                <li key={r.client} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div style={{ maxWidth: "52ch" }}>
                    <p className="mono-label text-ink-mute mb-1">{r.client}</p>
                    <p className="body-m text-ink-2">{r.draft}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0" aria-hidden="true">
                    <span className="chip" style={{ height: 36, fontSize: 13 }}>Edit</span>
                    <span className="btn btn-primary" style={{ height: 36, padding: "0 16px", fontSize: 13 }}>Approve</span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mono-cap text-ink-mute mt-6">The AI drafts. The professional approves.</p>
          </div>
        </section>

        {/* Section 5 — Product surfaces */}
        <section id="surfaces" className="container-x section-y rule-top" style={ANCHOR_OFFSET}>
          <p className="mono-cap text-ink-mute mb-6">Product surfaces</p>
          <h2 className="display-m">One platform. Three surfaces.</h2>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {SURFACES.map((s) => (
              <article
                key={s.id}
                id={s.id}
                className="card"
                style={ANCHOR_OFFSET}
                data-testid={`card-surface-${s.id}`}
              >
                <p className="mono-cap text-pulse mb-3">{s.eyebrow}</p>
                <h3 className="h3 mb-3">{s.title}</h3>
                <p className="body-m text-ink-2">{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Section 6 — Why xenios is different */}
        <section className="container-x section-y rule-top">
          <p className="mono-cap text-ink-mute mb-6">Why xenios is different</p>
          <h2 className="display-m text-balance" style={{ maxWidth: "24ch" }}>
            Not another app in the stack. The layer underneath it.
          </h2>
          <p className="mt-8 body-l text-ink-2" style={{ maxWidth: "64ch" }}>
            Most tools solve one slice of the job. Workouts live in one place, messages live somewhere else, and
            payments, notes, labs, wearables, and check-ins all sit apart. xenios brings the relationship, the data,
            and the workflow into one system.
          </p>
          <ul className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-4">
            {DIFFERENCE_POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3 body-l" data-testid={`point-${p.replace(/\s+/g, "-").toLowerCase()}`}>
                <span aria-hidden="true" className="bg-orange-fire shrink-0" style={{ width: 7, height: 7, borderRadius: 9999, marginTop: 12 }} />
                <span className="text-ink-2">{p}</span>
              </li>
            ))}
          </ul>
          <p className="mt-12 quote-lead text-ink" style={{ maxWidth: "44ch" }}>
            Over time, xenios becomes the operating system for proactive health.
          </p>
        </section>

        {/* Section 7 — Waitlist */}
        <section id="waitlist" className="container-x section-y rule-top" style={ANCHOR_OFFSET}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-20 items-start">
            <div>
              <p className="mono-cap text-ink-mute mb-6">Waitlist</p>
              <h2 className="display-m">Join the founding waitlist</h2>
              <p className="mt-8 body-l text-ink-2" style={{ maxWidth: "52ch" }}>
                We are opening xenios first to a small group of coaches, practitioners, clinics, gyms, and teams who
                want to help shape the future of proactive health. Tell us who you serve, what tools you use today,
                and what part of your week you most want back.
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
                      {errors.name && <p className="body-s mt-2" style={{ color: "var(--error)" }} data-testid="error-name">{errors.name}</p>}
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
                      {errors.email && <p className="body-s mt-2" style={{ color: "var(--error)" }} data-testid="error-email">{errors.email}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
                    <div>
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
                      {errors.role && <p className="body-s mt-2" style={{ color: "var(--error)" }} data-testid="error-role">{errors.role}</p>}
                    </div>
                    <div>
                      <label htmlFor="f-business" className="form-label">Business type</label>
                      <select
                        id="f-business"
                        value={form.businessType}
                        onChange={(e) => update("businessType", e.target.value)}
                        className="input-field"
                        disabled={submitting}
                        data-testid="select-business"
                      >
                        <option value="">Optional</option>
                        {BUSINESS_TYPES.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
                    <div>
                      <label htmlFor="f-clients" className="form-label">Number of clients</label>
                      <select
                        id="f-clients"
                        value={form.numberOfClients}
                        onChange={(e) => update("numberOfClients", e.target.value)}
                        className="input-field"
                        disabled={submitting}
                        data-testid="select-clients"
                      >
                        <option value="">Optional</option>
                        {CLIENT_COUNTS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="f-tools" className="form-label">Current tools used</label>
                      <input
                        id="f-tools"
                        type="text"
                        maxLength={200}
                        placeholder="Trainerize, spreadsheets, WhatsApp"
                        value={form.currentTools}
                        onChange={(e) => update("currentTools", e.target.value)}
                        className="input-field"
                        disabled={submitting}
                        data-testid="input-tools"
                      />
                    </div>
                  </div>

                  <div className="mt-5">
                    <label htmlFor="f-bottleneck" className="form-label">Biggest weekly bottleneck</label>
                    <textarea
                      id="f-bottleneck"
                      maxLength={600}
                      rows={3}
                      placeholder="The part of your week you most want back"
                      value={form.bottleneck}
                      onChange={(e) => update("bottleneck", e.target.value)}
                      className="input-field textarea-field"
                      disabled={submitting}
                      data-testid="textarea-bottleneck"
                    />
                  </div>

                  <fieldset className="mt-6" data-testid="group-interests">
                    <legend className="form-label" style={{ marginBottom: 12 }}>Interested in</legend>
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

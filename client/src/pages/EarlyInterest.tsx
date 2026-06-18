import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import PageShell from "@/components/PageShell";
import SeoHead from "@/components/SeoHead";
import { getConfig } from "@/lib/config";
import { getAttribution } from "@/lib/attribution";
import { trackCompleteRegistration } from "@/lib/tracking";

const ROLE_OPTIONS = [
  "Personal trainers",
  "Strength and performance coaches",
  "Health and longevity coaches",
  "Nutritionists and dietitians",
  "Physical therapists",
  "Performance gyms",
  "Wellness and longevity clinics",
  "Sports teams",
  "Corporate wellness teams",
  "Other",
];

const CLIENT_COUNT_OPTIONS = [
  "Just me / under 10",
  "10 to 25",
  "25 to 50",
  "50 to 100",
  "100 to 250",
  "250+",
];

interface FormState {
  name: string;
  email: string;
  phone: string;
  business_name: string;
  role: string;
  url_or_handle: string;
  client_count: string;
  why_interested: string;
  nonbinding_ack: boolean;
  website: string;
}

const EMPTY: FormState = {
  name: "",
  email: "",
  phone: "",
  business_name: "",
  role: "",
  url_or_handle: "",
  client_count: "",
  why_interested: "",
  nonbinding_ack: false,
  website: "",
};

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

export default function EarlyInterest() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const renderedRef = useRef(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  useEffect(() => {
    let cancelled = false;
    getConfig().then((cfg) => {
      if (cancelled) return;
      if (cfg.turnstileSiteKey) {
        setSiteKey(cfg.turnstileSiteKey);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!siteKey) return;

    function renderWidget() {
      if (renderedRef.current || !widgetRef.current || !window.turnstile) return;
      renderedRef.current = true;
      window.turnstile.render(widgetRef.current, {
        sitekey: siteKey,
        callback: (token: string) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => setTurnstileToken(""),
      });
    }

    if (window.turnstile) {
      renderWidget();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", renderWidget);
      return () => existing.removeEventListener("load", renderWidget);
    }

    const script = document.createElement("script");
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", renderWidget);
    document.head.appendChild(script);
    return () => script.removeEventListener("load", renderWidget);
  }, [siteKey]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!form.email.trim()) {
      setError("Please enter your email.");
      return;
    }
    if (!form.role) {
      setError("Please select your role.");
      return;
    }
    if (!form.client_count) {
      setError("Please select your number of clients.");
      return;
    }
    if (!form.nonbinding_ack) {
      setError("Please confirm you understand this is a non-binding indication of interest.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/early-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          business_name: form.business_name.trim(),
          role: form.role,
          url_or_handle: form.url_or_handle.trim(),
          client_count: form.client_count,
          why_interested: form.why_interested.trim(),
          nonbinding_ack: form.nonbinding_ack,
          website: form.website,
          turnstileToken,
          ...getAttribution(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Something went wrong. Please try again.");
      }
      trackCompleteRegistration();
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      if (siteKey && window.turnstile) {
        window.turnstile.reset();
        setTurnstileToken("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell>
      <SeoHead
        title="Early interest in xenios"
        description="Share your interest in the founding group of coaches."
        path="/early-interest"
      />
      <section className="container-x pt-24 md:pt-36 pb-16">
        <p className="mono-cap text-ink-mute mb-6">EARLY INTEREST</p>
        <h1 className="display-xl text-balance" style={{ maxWidth: "18ch" }}>Early interest</h1>
        <p className="mt-8 body-l text-ink-2 max-w-[60ch]">
          This is a non-binding way to tell us you would like to be part of the founding group of coaches. Share a few details and the xenios team will follow up.
        </p>
      </section>

      <section className="container-x py-16 rule-top">
        {success ? (
          <div className="max-w-[60ch] space-y-6" data-testid="text-early-interest-success">
            <h2 className="display-l">Thank you</h2>
            <p className="body-l text-ink-2">
              We received your interest. This is non-binding. The xenios team will follow up.
            </p>
            <Link href="/book" className="btn btn-primary" data-testid="link-book-call">
              Book a call
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 max-w-[60ch]" data-testid="form-early-interest" noValidate>
            {/* Honeypot */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "auto", height: 1, width: 1, overflow: "hidden" }}>
              <label htmlFor="ei-website">Leave this field empty</label>
              <input id="ei-website" tabIndex={-1} autoComplete="off" type="text" value={form.website} onChange={(e) => update("website", e.target.value)} />
            </div>

            <div>
              <label htmlFor="ei-name" className="form-label">Name</label>
              <input id="ei-name" type="text" required maxLength={120} value={form.name} onChange={(e) => update("name", e.target.value)} className="input-field" data-testid="input-name" />
            </div>

            <div>
              <label htmlFor="ei-email" className="form-label">Email</label>
              <input id="ei-email" type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} className="input-field" data-testid="input-email" />
            </div>

            <div>
              <label htmlFor="ei-phone" className="form-label">Phone (optional)</label>
              <input id="ei-phone" type="tel" maxLength={40} value={form.phone} onChange={(e) => update("phone", e.target.value)} className="input-field" data-testid="input-phone" />
            </div>

            <div>
              <label htmlFor="ei-business" className="form-label">Business name (optional)</label>
              <input id="ei-business" type="text" maxLength={160} value={form.business_name} onChange={(e) => update("business_name", e.target.value)} className="input-field" data-testid="input-business-name" />
            </div>

            <div>
              <label htmlFor="ei-role" className="form-label">Role</label>
              <select id="ei-role" required value={form.role} onChange={(e) => update("role", e.target.value)} className="input-field" data-testid="select-role">
                <option value="">Select your role</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ei-handle" className="form-label">Website or Instagram (optional)</label>
              <input id="ei-handle" type="text" maxLength={200} value={form.url_or_handle} onChange={(e) => update("url_or_handle", e.target.value)} className="input-field" data-testid="input-url-or-handle" />
            </div>

            <div>
              <label htmlFor="ei-clients" className="form-label">Number of clients</label>
              <select id="ei-clients" required value={form.client_count} onChange={(e) => update("client_count", e.target.value)} className="input-field" data-testid="select-client-count">
                <option value="">Select a range</option>
                {CLIENT_COUNT_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ei-why" className="form-label">Why interested in xenios (optional)</label>
              <textarea id="ei-why" maxLength={1000} rows={4} value={form.why_interested} onChange={(e) => update("why_interested", e.target.value)} className="input-field textarea-field" data-testid="textarea-why-interested" />
            </div>

            <label className="flex items-start gap-3 cursor-pointer text-ink-2">
              <input type="checkbox" required checked={form.nonbinding_ack} onChange={(e) => update("nonbinding_ack", e.target.checked)} className="mt-1 w-4 h-4 accent-[var(--accent-pulse)]" data-testid="checkbox-nonbinding-ack" />
              <span className="body-s">I understand this is a non-binding indication of interest.</span>
            </label>

            {siteKey && (
              <div ref={widgetRef} data-testid="widget-turnstile" />
            )}

            {error && (
              <div className="border border-[color:var(--error)] text-[color:var(--error)] px-4 py-3 rounded body-s" data-testid="text-error">
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn btn-primary w-full md:w-auto" data-testid="button-submit">
              {submitting ? "Sending" : "Share your interest"}
            </button>
          </form>
        )}
      </section>
    </PageShell>
  );
}

import { useCallback, useState } from "react";
import { content, CLIENT_COUNT_OPTIONS } from "@/lib/content";
import { getAttribution } from "@/lib/attribution";
import { trackCompleteRegistration } from "@/lib/tracking";
import Turnstile from "@/components/Turnstile";

const F = content.waitlistForm;
const WL = content.waitlistPage;

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

interface FormState {
  name: string;
  email: string;
  role: string;
  clientCount: string;
  phone: string;
  company: string;
  city: string;
  handleOrUrl: string;
  interest: string;
  consent: boolean;
  website: string; // honeypot
}

const EMPTY: FormState = {
  name: "",
  email: "",
  role: "",
  clientCount: "",
  phone: "",
  company: "",
  city: "",
  handleOrUrl: "",
  interest: "",
  consent: false,
  website: "",
};

interface Props {
  onSuccess?: (info: { count: number; name: string }) => void;
  onDark?: boolean;
}

type FieldErrors = Partial<Record<"name" | "email" | "role" | "clientCount" | "consent", string>>;

export default function WaitlistForm({ onSuccess, onDark = false }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const onTurnstileToken = useCallback((t: string) => setTurnstileToken(t), []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!form.name.trim()) next.name = "Please enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = "Please enter a valid email address.";
    if (!form.role) next.role = "Please choose the role that fits best.";
    if (!form.clientCount) next.clientCount = "Please choose how many clients you work with.";
    if (!form.consent) next.consent = F.consentRequired;
    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const next = validate();
    setErrors(next);
    setError(null);
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
          phone: form.phone.trim(),
          company: form.company.trim(),
          city: form.city.trim(),
          handleOrUrl: form.handleOrUrl.trim(),
          interest: form.interest.trim(),
          consent: form.consent,
          turnstileToken,
          website: form.website,
          ...getAttribution(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        setError(data.message || F.errorGeneric);
        return;
      }
      trackCompleteRegistration();
      onSuccess?.({ count: data.count ?? 0, name: form.name.trim() });
    } catch {
      setError(F.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = `input-field ${onDark ? "dark" : ""}`;
  const labelCls = `form-label ${onDark ? "dark" : ""}`;
  const helperCls = onDark ? "text-paper/70" : "text-ink-mute";
  const errStyle = { color: "var(--error)" } as const;

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-testid="form-waitlist-full" noValidate>
      {/* Honeypot */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "auto", height: 1, width: 1, overflow: "hidden" }}>
        <label htmlFor="wl-website">Leave this field empty</label>
        <input id="wl-website" tabIndex={-1} autoComplete="off" type="text" value={form.website} onChange={(e) => update("website", e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="wl-name" className={labelCls}>Name</label>
          <input id="wl-name" type="text" maxLength={160} placeholder="Full name" value={form.name} onChange={(e) => update("name", e.target.value)} className={inputCls} aria-invalid={!!errors.name} data-testid="input-name" />
          {errors.name && <p className="body-s mt-2" role="alert" style={errStyle} data-testid="error-name">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="wl-email" className={labelCls}>Email</label>
          <input id="wl-email" type="email" placeholder="you@yourpractice.com" value={form.email} onChange={(e) => update("email", e.target.value)} className={inputCls} aria-invalid={!!errors.email} data-testid="input-email" />
          {errors.email && <p className="body-s mt-2" role="alert" style={errStyle} data-testid="error-email">{errors.email}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="wl-role" className={labelCls}>Role</label>
          <select id="wl-role" value={form.role} onChange={(e) => update("role", e.target.value)} className={inputCls} aria-invalid={!!errors.role} data-testid="select-role">
            <option value="">Pick the closest fit</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {errors.role && <p className="body-s mt-2" role="alert" style={errStyle} data-testid="error-role">{errors.role}</p>}
        </div>
        <div>
          <label htmlFor="wl-clientcount" className={labelCls}>Number of clients</label>
          <select id="wl-clientcount" value={form.clientCount} onChange={(e) => update("clientCount", e.target.value)} className={inputCls} aria-invalid={!!errors.clientCount} data-testid="select-client-count">
            <option value="">Select a range</option>
            {CLIENT_COUNT_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {errors.clientCount && <p className="body-s mt-2" role="alert" style={errStyle} data-testid="error-client-count">{errors.clientCount}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="wl-phone" className={labelCls}>Phone (optional)</label>
          <input id="wl-phone" type="tel" maxLength={40} placeholder="Optional" value={form.phone} onChange={(e) => update("phone", e.target.value)} className={inputCls} data-testid="input-phone" />
        </div>
        <div>
          <label htmlFor="wl-company" className={labelCls}>Company (optional)</label>
          <input id="wl-company" type="text" maxLength={120} placeholder="Optional" value={form.company} onChange={(e) => update("company", e.target.value)} className={inputCls} data-testid="input-company" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="wl-city" className={labelCls}>City (optional)</label>
          <input id="wl-city" type="text" maxLength={120} placeholder="Optional" value={form.city} onChange={(e) => update("city", e.target.value)} className={inputCls} data-testid="input-city" />
        </div>
        <div>
          <label htmlFor="wl-handle" className={labelCls}>Instagram or website (optional)</label>
          <input id="wl-handle" type="text" maxLength={200} placeholder="Optional" value={form.handleOrUrl} onChange={(e) => update("handleOrUrl", e.target.value)} className={inputCls} data-testid="input-handle" />
        </div>
      </div>

      <div>
        <label htmlFor="wl-interest" className={labelCls}>What would you want xenios to do first? (optional)</label>
        <textarea id="wl-interest" maxLength={800} placeholder="Optional" value={form.interest} onChange={(e) => update("interest", e.target.value)} className={`${inputCls} textarea-field`} rows={3} data-testid="textarea-interest" />
      </div>

      <div>
        <label className={`flex items-start gap-3 cursor-pointer ${onDark ? "text-paper" : "text-ink-2"}`} data-testid="label-consent">
          <input type="checkbox" checked={form.consent} onChange={(e) => update("consent", e.target.checked)} className="mt-1 w-4 h-4 accent-[var(--pulse)]" aria-invalid={!!errors.consent} data-testid="checkbox-consent" />
          <span className="body-s">{F.fields.consent.label}</span>
        </label>
        {errors.consent && <p className="body-s mt-2" role="alert" style={errStyle} data-testid="error-consent">{errors.consent}</p>}
      </div>

      <Turnstile onToken={onTurnstileToken} onDark={onDark} />

      {error && (
        <div className="border border-[color:var(--error)] text-[color:var(--error)] px-4 py-3 rounded body-s" data-testid="text-error">
          {error}
        </div>
      )}

      <button type="submit" disabled={submitting} className={`btn btn-primary ${onDark ? "btn-on-dark" : ""} w-full md:w-auto`} data-testid="button-submit">
        {submitting ? F.submitting : F.submit}
      </button>

      <p className={`body-s ${helperCls}`}>
        {WL.trustBlock[2]}
      </p>
    </form>
  );
}

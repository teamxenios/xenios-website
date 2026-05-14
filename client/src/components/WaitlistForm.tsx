import { useState } from "react";
import { content, PRACTITIONER_TILES } from "@/lib/content";
import { waitlistService } from "@/lib/waitlist-service";
import type { PRACTITIONER_TYPE_VALUES } from "@shared/schema";

const F = content.waitlistForm;
const WL = content.waitlistPage;

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  practitionerType: string;
  city: string;
  country: string;
  freeText: string;
  howHeard: string;
  consent: boolean;
  website: string; // honeypot
}

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  practitionerType: "",
  city: "",
  country: "",
  freeText: "",
  howHeard: "",
  consent: false,
  website: "",
};

interface Props {
  onSuccess?: (info: { position: number; count: number; email: string; firstName: string; duplicate?: boolean }) => void;
  onDark?: boolean;
}

export default function WaitlistForm({ onSuccess, onDark = false }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.consent) {
      setError(F.consentRequired);
      return;
    }
    setSubmitting(true);
    try {
      const res = await waitlistService.submit({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        practitionerType: form.practitionerType as typeof PRACTITIONER_TYPE_VALUES[number],
        city: form.city.trim(),
        country: form.country.trim(),
        freeText: form.freeText.trim() || null,
        howHeard: form.howHeard.trim() || null,
        website: form.website,
      });
      onSuccess?.({
        position: res.position ?? 0,
        count: res.count ?? 0,
        email: form.email.trim().toLowerCase(),
        firstName: form.firstName.trim(),
        duplicate: res.duplicate,
      });
    } catch (err: any) {
      setError(err?.message || F.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = `input-field ${onDark ? "dark" : ""}`;
  const labelCls = `form-label ${onDark ? "dark" : ""}`;
  const helperCls = onDark ? "text-paper/70" : "text-ink-mute";

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-testid="form-waitlist-full" noValidate>
      {/* Honeypot */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "auto", height: 1, width: 1, overflow: "hidden" }}>
        <label htmlFor="wl-website">Leave this field empty</label>
        <input id="wl-website" tabIndex={-1} autoComplete="off" type="text" value={form.website} onChange={(e) => update("website", e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="wl-first" className={labelCls}>{F.fields.firstName.label}</label>
          <input id="wl-first" type="text" required maxLength={80} placeholder={F.fields.firstName.placeholder} value={form.firstName} onChange={(e) => update("firstName", e.target.value)} className={inputCls} data-testid="input-first-name" />
        </div>
        <div>
          <label htmlFor="wl-last" className={labelCls}>{F.fields.lastName.label}</label>
          <input id="wl-last" type="text" required maxLength={80} placeholder={F.fields.lastName.placeholder} value={form.lastName} onChange={(e) => update("lastName", e.target.value)} className={inputCls} data-testid="input-last-name" />
        </div>
      </div>

      <div>
        <label htmlFor="wl-email" className={labelCls}>{F.fields.email.label}</label>
        <input id="wl-email" type="email" required placeholder={F.fields.email.placeholder} value={form.email} onChange={(e) => update("email", e.target.value)} className={inputCls} data-testid="input-email" />
      </div>

      <div>
        <label htmlFor="wl-ptype" className={labelCls}>{F.fields.practitionerType.label}</label>
        <select id="wl-ptype" required value={form.practitionerType} onChange={(e) => update("practitionerType", e.target.value)} className={inputCls} data-testid="select-practitioner-type">
          <option value="">{F.fields.practitionerType.placeholder}</option>
          {PRACTITIONER_TILES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
          <option value="other">Other / something we missed</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="wl-city" className={labelCls}>{F.fields.city.label}</label>
          <input id="wl-city" type="text" required maxLength={120} placeholder={F.fields.city.placeholder} value={form.city} onChange={(e) => update("city", e.target.value)} className={inputCls} data-testid="input-city" />
        </div>
        <div>
          <label htmlFor="wl-country" className={labelCls}>{F.fields.country.label}</label>
          <input id="wl-country" type="text" required maxLength={80} placeholder={F.fields.country.placeholder} value={form.country} onChange={(e) => update("country", e.target.value)} className={inputCls} data-testid="input-country" />
        </div>
      </div>

      <div>
        <label htmlFor="wl-freetext" className={labelCls}>{F.fields.freeText.label}</label>
        <textarea id="wl-freetext" maxLength={800} placeholder={F.fields.freeText.placeholder} value={form.freeText} onChange={(e) => update("freeText", e.target.value)} className={`${inputCls} textarea-field`} rows={3} data-testid="textarea-free-text" />
      </div>

      <div>
        <label htmlFor="wl-howheard" className={labelCls}>{F.fields.howHeard.label}</label>
        <input id="wl-howheard" type="text" maxLength={160} placeholder={F.fields.howHeard.placeholder} value={form.howHeard} onChange={(e) => update("howHeard", e.target.value)} className={inputCls} data-testid="input-how-heard" />
      </div>

      <label className={`flex items-start gap-3 cursor-pointer ${onDark ? "text-paper" : "text-ink-2"}`}>
        <input type="checkbox" required checked={form.consent} onChange={(e) => update("consent", e.target.checked)} className="mt-1 w-4 h-4 accent-[var(--accent-pulse)]" data-testid="checkbox-consent" />
        <span className="body-s">{F.fields.consent.label}</span>
      </label>

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

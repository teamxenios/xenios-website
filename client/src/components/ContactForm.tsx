import { useState } from "react";
import { CONTACT_PAGE } from "@/lib/content";
import {
  contactService,
  isHealthContactContext,
  type ContactSubmission,
} from "@/lib/waitlist-service";

const C = CONTACT_PAGE;

interface Props {
  onSuccess?: () => void;
}

// Only these two fields carry real client-side validation today (persona is
// required, message has a minimum length); the rest rely on native `required`
// as a semantic hint plus server-side checks. The error pattern below only
// standardizes accessibility for validation that actually exists, it does
// not add new business rules.
type FieldErrors = Partial<Record<"persona" | "message", string>>;
const FIELD_ORDER: Array<keyof FieldErrors> = ["persona", "message"];
const FIELD_IDS: Record<keyof FieldErrors, string> = {
  persona: "cf-persona",
  message: "cf-message",
};

export default function ContactForm({ onSuccess }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [persona, setPersona] = useState<ContactSubmission["persona"] | "">("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handlePersona(value: ContactSubmission["persona"]) {
    setPersona(value);
    const opt = C.personaOptions.find((o) => o.value === value);
    if (opt) {
      const stripped = subject.replace(/^\[[^\]]+\]\s*/, "");
      setSubject(`${opt.prefix} ${stripped}`.trim());
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const next: FieldErrors = {};
    if (!persona) next.persona = "Please tell us who you are.";
    if (message.trim().length < 20) next.message = "Message must be at least 20 characters.";
    setFieldErrors(next);
    if (Object.keys(next).length > 0) {
      const firstInvalid = FIELD_ORDER.find((key) => next[key]);
      if (firstInvalid) {
        (document.getElementById(FIELD_IDS[firstInvalid]) as HTMLElement | null)?.focus();
      }
      return;
    }
    // Unreachable at runtime (next.persona above already caught an empty
    // persona), but it narrows `persona` for the type checker so the submit
    // call below does not need an `as` cast.
    if (!persona) return;
    setSubmitting(true);
    try {
      const submit =
        typeof window !== "undefined" && isHealthContactContext(window.location.search)
          ? contactService.submitHealth
          : contactService.submit;
      await submit({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        persona,
        subject: subject.trim(),
        message: message.trim(),
        website,
      });
      setDone(true);
      onSuccess?.();
    } catch (err: any) {
      setError(err?.message || "Something broke on our side.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3" data-testid="contact-success">
        <h3 className="display-s">{C.successTitle}</h3>
        <p className="body-l text-ink-2">{C.successBody}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-testid="form-contact" noValidate>
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 1, width: 1, overflow: "hidden" }}>
        <label htmlFor="cf-website">Leave empty</label>
        <input id="cf-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      {/* Error summary: one role="alert" so the failure is announced once,
          not once per field. Each invalid field still carries aria-invalid
          and an inline message wired via aria-describedby. */}
      {Object.keys(fieldErrors).length > 0 && (
        <div className="border border-[color:var(--error)] text-[color:var(--error)] px-4 py-3 rounded body-s" role="alert" data-testid="text-contact-validation-summary">
          <p className="font-700">Please fix the following:</p>
          <ul className="mt-1 pl-5" style={{ listStyleType: "disc" }}>
            {FIELD_ORDER.filter((key) => fieldErrors[key]).map((key) => (
              <li key={key}>{fieldErrors[key]}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="cf-name" className="form-label">Name</label>
          <input id="cf-name" type="text" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="input-field" data-testid="input-contact-name" />
        </div>
        <div>
          <label htmlFor="cf-email" className="form-label">Email</label>
          <input id="cf-email" type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" data-testid="input-contact-email" />
        </div>
      </div>

      <div>
        <label htmlFor="cf-persona" className="form-label">I am a</label>
        <select id="cf-persona" required value={persona} onChange={(e) => handlePersona(e.target.value as ContactSubmission["persona"])} className="input-field" aria-invalid={!!fieldErrors.persona} aria-describedby={fieldErrors.persona ? "cf-persona-error" : undefined} data-testid="select-contact-persona">
          <option value="">Choose one</option>
          {C.personaOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {fieldErrors.persona && <p id="cf-persona-error" className="body-s mt-2" style={{ color: "var(--error)" }} data-testid="error-contact-persona">{fieldErrors.persona}</p>}
      </div>

      <div>
        <label htmlFor="cf-subject" className="form-label">Subject</label>
        <input id="cf-subject" type="text" required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} className="input-field" placeholder="Auto-prefixed when you choose above" data-testid="input-contact-subject" />
      </div>

      <div>
        <label htmlFor="cf-message" className="form-label">Message</label>
        <textarea id="cf-message" required minLength={20} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} className="input-field textarea-field" rows={6} aria-invalid={!!fieldErrors.message} aria-describedby={fieldErrors.message ? "cf-message-error" : undefined} data-testid="textarea-contact-message" />
        {fieldErrors.message && <p id="cf-message-error" className="body-s mt-2" style={{ color: "var(--error)" }} data-testid="error-contact-message">{fieldErrors.message}</p>}
      </div>

      {error && (
        <div className="border border-[color:var(--error)] text-[color:var(--error)] px-4 py-3 rounded body-s" role="alert" data-testid="text-contact-error">
          {error}
        </div>
      )}

      <button type="submit" disabled={submitting} className="btn btn-primary" data-testid="button-contact-submit">
        {submitting ? "sending..." : "send"}
      </button>
    </form>
  );
}

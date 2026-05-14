import { useState } from "react";
import { CONTACT_PAGE } from "@/lib/content";
import { contactService, type ContactSubmission } from "@/lib/waitlist-service";

const C = CONTACT_PAGE;

interface Props {
  onSuccess?: () => void;
}

export default function ContactForm({ onSuccess }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [persona, setPersona] = useState<ContactSubmission["persona"] | "">("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
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
    if (!persona) {
      setError("Please tell us who you are.");
      return;
    }
    if (message.trim().length < 20) {
      setError("Message must be at least 20 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await contactService.submit({
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
        <select id="cf-persona" required value={persona} onChange={(e) => handlePersona(e.target.value as ContactSubmission["persona"])} className="input-field" data-testid="select-contact-persona">
          <option value="">Choose one</option>
          {C.personaOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="cf-subject" className="form-label">Subject</label>
        <input id="cf-subject" type="text" required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} className="input-field" placeholder="Auto-prefixed when you choose above" data-testid="input-contact-subject" />
      </div>

      <div>
        <label htmlFor="cf-message" className="form-label">Message</label>
        <textarea id="cf-message" required minLength={20} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} className="input-field textarea-field" rows={6} data-testid="textarea-contact-message" />
      </div>

      {error && (
        <div className="border border-[color:var(--error)] text-[color:var(--error)] px-4 py-3 rounded body-s" data-testid="text-contact-error">
          {error}
        </div>
      )}

      <button type="submit" disabled={submitting} className="btn btn-primary" data-testid="button-contact-submit">
        {submitting ? "sending..." : "send"}
      </button>
    </form>
  );
}

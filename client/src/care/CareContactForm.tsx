import { useState } from "react";

const CARE_CONTACT_PATH = "/api/care/contact";

export default function CareContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(CARE_CONTACT_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          persona: "other",
          subject: subject.trim(),
          message: message.trim(),
          website,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Failed to submit");
      }
      setDone(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Something broke on our side.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-3" data-testid="care-contact-success" role="status">
        <h3 className="h3">Your message is with the Xenios Health team.</h3>
        <p className="body-m text-ink-2">
          We will reply through the contact information you provided. Do not send medical information by email.
        </p>
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit} data-testid="care-contact-form">
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="care-contact-website">Leave empty</label>
        <input
          id="care-contact-website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <label htmlFor="care-contact-name" className="form-label">Name</label>
          <input
            id="care-contact-name"
            className="input-field"
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid="care-contact-name"
          />
        </div>
        <div>
          <label htmlFor="care-contact-email" className="form-label">Email</label>
          <input
            id="care-contact-email"
            className="input-field"
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            data-testid="care-contact-email"
          />
        </div>
      </div>

      <div>
        <label htmlFor="care-contact-subject" className="form-label">Subject</label>
        <input
          id="care-contact-subject"
          className="input-field"
          required
          maxLength={200}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          data-testid="care-contact-subject"
        />
      </div>

      <div>
        <label htmlFor="care-contact-message" className="form-label">Message</label>
        <textarea
          id="care-contact-message"
          className="input-field textarea-field"
          required
          minLength={20}
          maxLength={4000}
          rows={6}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          data-testid="care-contact-message"
        />
        <p className="body-s text-ink-mute mt-2">
          Website and operational support only. Do not include symptoms, diagnoses, medications, medical records, or other clinical information.
        </p>
      </div>

      {error && (
        <p className="body-s text-[color:var(--error)]" role="alert" data-testid="care-contact-error">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting} className="btn btn-primary min-h-11">
        {submitting ? "Sending…" : "Send to Xenios Health"}
      </button>
    </form>
  );
}
